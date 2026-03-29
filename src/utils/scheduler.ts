import type {
  Teacher,
  Subject,
  Assignment,
  Room,
  ScheduleEntry,
  DayOfWeek,
  Period,
  TimeSlot,
} from '../types'
import { DAYS, PERIODS, DAY_LABELS, getClassLabel } from './constants'

// ============================================================
// 公開インターフェース
// ============================================================

/** スケジューラの進捗情報 */
export interface SchedulerProgress {
  /** 配置済みタスク数 */
  placed: number
  /** 総タスク数 */
  total: number
  /** 現在のベストスコア */
  bestScore: number
  /** 探索した分岐数 */
  iterations: number
  /** ランダムリスタート回数 */
  restarts: number
}

/** スケジューラの実行結果 */
export interface SchedulerResult {
  /** 生成されたスケジュールエントリ（IDは仮値） */
  entries: ScheduleEntry[]
  /** スコア（高いほど良い。全配置完了 + 推奨時限一致で加点） */
  score: number
  /** 全タスクが配置完了したか */
  isComplete: boolean
  /** 配置できなかったタスクの情報 */
  unplacedTasks: UnplacedTask[]
}

/** 配置できなかったタスクの情報 */
export interface UnplacedTask {
  assignmentId: string
  classId: string
  subjectId: string
  reason: string
  /** 配置可能にするための具体的な提案 */
  suggestions?: string[]
}

// ============================================================
// 内部型
// ============================================================

/** 配置対象の1単位（1コマ or 連続2コマのペア） */
interface ScheduleTask {
  /** このタスクに含まれる割当（通常は1つ、同時開講グループの場合は複数） */
  assignments: Assignment[]
  /** 各割当の科目（assignments と同じ順序） */
  subjects: Subject[]
  /** 各割当ごとの担当教員（assignments と同じ順序） */
  teacherGroups: Teacher[][]
  /** 各割当ごとの使用施設（assignments と同じ順序、未指定ならundefined） */
  rooms: (Room | undefined)[]
  /** 連続授業か */
  isConsecutive: boolean
  /** タスクの優先度スコア（低いほど先に配置 = 制約が厳しい） */
  priority: number
  /** 同時開講グループID（グループタスクの場合） */
  simultaneousGroupId?: string
  /** 固定配置スロット（指定時は自動配置せずここに配置） */
  fixedSlot?: Slot
  /** タスク生成時のオリジナルインデックス（識別用） */
  originalIndex: number
}

/** 曜日×時限のスロット */
interface Slot {
  day: DayOfWeek
  period: Period
}

/** 教員の1日あたり最大コマ数（ソフト制約）のデフォルト値 */
const DEFAULT_MAX_TEACHER_PERIODS_PER_DAY = 5

/** スケジューラのオプション設定 */
export interface SchedulerOptions {
  maxTeacherPeriodsPerDay?: number
  maxIterations?: number
  /** ランダムリスタート回数（0=リスタートなし） */
  maxRestarts?: number
  /** 固定する既存エントリ（部分再生成時に使用） */
  lockedEntries?: ScheduleEntry[]
}

/** 配置状態の管理 */
interface BoardState {
  /** [day][period][classId] => assignmentId */
  classGrid: Map<string, string>
  /** [day][period][teacherId] => assignmentId */
  teacherGrid: Map<string, string>
  /** [day][period][roomId] => assignmentId（施設の重複検出用） */
  roomGrid: Map<string, string>
  /** 配置済みエントリ */
  entries: ScheduleEntry[]
  /** assignmentId => 配置済みコマ数（weeklyCount超過を防止） */
  assignmentPlacedCount: Map<string, number>
  /** [day:classId:subjectId] => 配置数（同日同科目の重複検出用） */
  classDaySubjectCount: Map<string, number>
  /** [day:teacherId] => 配置コマ数（教員の日別負荷管理用） */
  teacherDayCount: Map<string, number>
}

/** 配置記録（修復フェーズでの追跡用） */
interface PlacementRecord {
  task: ScheduleTask
  entries: ScheduleEntry[]
  day: DayOfWeek
  startPeriod: Period
}

// ============================================================
// ユーティリティ
// ============================================================

function cellKey(day: DayOfWeek, period: Period, id: string): string {
  return `${day}:${period}:${id}`
}

/** 連続授業ペアの開始時限候補（1-2, 3-4, 5-6） */
const CONSECUTIVE_STARTS: Period[] = [1, 3, 5]

/**
 * 連続ペアの固定スロット処理: ペアの開始時限を取得した後、
 * fixedSlots内に同日の(startPeriod+1)が存在するならスキップする。
 * （ユーザーが5限と6限の両方をfixedSlotsに登録しているケースへの対応）
 *
 * @param fixedSlots 固定スロット配列
 * @param currentIdx 現在のfixedIdxの値（開始時限を消費した直後）
 * @param startSlot 連続ペアの開始スロット
 * @returns スキップした場合は1、しなかった場合は0
 */
function skipConsecutiveSecondHalf(
  fixedSlots: { day: DayOfWeek; period: Period }[],
  currentIdx: number,
  startSlot: Slot,
): number {
  if (currentIdx < fixedSlots.length) {
    const next = fixedSlots[currentIdx]
    if (next.day === startSlot.day && next.period === ((startSlot.period + 1) as Period)) {
      return 1 // このスロットをスキップ
    }
  }
  return 0
}

/**
 * 同時開講グループの全assignmentからfixedSlotsをマージし、重複を排除する。
 * ユーザーがグループ内のどのassignmentにfixedSlotsを設定しても反映される。
 */
function mergeFixedSlots(groupAssignments: Assignment[]): { day: DayOfWeek; period: Period }[] {
  const seen = new Set<string>()
  const merged: { day: DayOfWeek; period: Period }[] = []
  for (const a of groupAssignments) {
    for (const slot of a.fixedSlots ?? []) {
      const key = `${slot.day}:${slot.period}`
      if (!seen.has(key)) {
        seen.add(key)
        merged.push({ day: slot.day, period: slot.period })
      }
    }
  }
  return merged
}

/**
 * 連続ペア用の固定スロットを正規化する。
 * ユーザーがペアの後半時限（2, 4, 6限）を固定スロットとして登録した場合、
 * 開始時限（1, 3, 5限）に補正する。
 * 例: 6限 → 5限（5-6限ペアの開始）、4限 → 3限
 */
function normalizeConsecutiveFixedSlot(slot: Slot): Slot {
  if (CONSECUTIVE_STARTS.includes(slot.period)) {
    return slot // 既に有効な開始時限
  }
  // 後半時限の場合、1つ前の時限をペア開始とする
  const startPeriod = (slot.period - 1) as Period
  if (CONSECUTIVE_STARTS.includes(startPeriod)) {
    return { day: slot.day, period: startPeriod }
  }
  return slot // 該当しない場合はそのまま返す
}

/**
 * fixedSlotsを時限順にソートし、連続ペアの重複を除去した配列を返す。
 * 例: [{火,6},{火,5}] → [{火,5},{火,6}]（ソート）
 */
function sortFixedSlots(
  slots: { day: DayOfWeek; period: Period }[],
): { day: DayOfWeek; period: Period }[] {
  return [...slots].sort((a, b) => {
    const dayOrder = DAYS.indexOf(a.day) - DAYS.indexOf(b.day)
    if (dayOrder !== 0) return dayOrder
    return a.period - b.period
  })
}

function isTeacherAvailable(teacher: Teacher, day: DayOfWeek, period: Period): boolean {
  if (!teacher.availableDays.includes(day)) return false
  if (teacher.excludedSlots.some((s: TimeSlot) => s.day === day && s.period === period))
    return false
  return true
}

function isSlotFreeForClass(state: BoardState, day: DayOfWeek, period: Period, classId: string): boolean {
  return !state.classGrid.has(cellKey(day, period, classId))
}

function isSlotFreeForTeacher(state: BoardState, day: DayOfWeek, period: Period, teacherId: string): boolean {
  return !state.teacherGrid.has(cellKey(day, period, teacherId))
}

function isSlotFreeForRoom(state: BoardState, day: DayOfWeek, period: Period, roomId: string): boolean {
  return !state.roomGrid.has(cellKey(day, period, roomId))
}

function isRoomAvailable(room: Room, day: DayOfWeek, period: Period): boolean {
  if (room.availableDays && !room.availableDays.includes(day)) return false
  if (room.excludedSlots?.some((s: TimeSlot) => s.day === day && s.period === period)) return false
  return true
}

function classDaySubjectKey(day: DayOfWeek, classId: string, subjectId: string): string {
  return `${day}:${classId}:${subjectId}`
}

function teacherDayKey(day: DayOfWeek, teacherId: string): string {
  return `${day}:${teacherId}`
}

/** 推奨時限に合致しているかチェック */
function isInPreferredPeriod(subject: Subject, period: Period): boolean {
  if (!subject.preferredPeriods) return true
  return period >= subject.preferredPeriods.from && period <= subject.preferredPeriods.to
}

/** 科目の配置不可時限かチェック（ハード制約） */
function isExcludedPeriodForSubject(subject: Subject, period: Period): boolean {
  if (!subject.excludedPeriods || subject.excludedPeriods.length === 0) return false
  return subject.excludedPeriods.includes(period)
}

/** 連続配置禁止: 隣接スロットに同じ科目が既に配置されていないかチェック */
function hasAdjacentSameSubject(
  state: BoardState,
  day: DayOfWeek,
  period: Period,
  classId: string,
  assignmentId: string,
): boolean {
  // 前の時限をチェック
  if (period > 1) {
    const prevKey = cellKey(day, (period - 1) as Period, classId)
    const prevAssignment = state.classGrid.get(prevKey)
    if (prevAssignment === assignmentId) return true
  }
  // 次の時限をチェック
  if (period < 6) {
    const nextKey = cellKey(day, (period + 1) as Period, classId)
    const nextAssignment = state.classGrid.get(nextKey)
    if (nextAssignment === assignmentId) return true
  }
  return false
}

/** タスク内の全割当に対して、全教員をフラットに取得（重複排除） */
function getAllTeachersFlat(task: ScheduleTask): Teacher[] {
  const seen = new Set<string>()
  const result: Teacher[] = []
  for (const group of task.teacherGroups) {
    for (const teacher of group) {
      if (!seen.has(teacher.id)) {
        seen.add(teacher.id)
        result.push(teacher)
      }
    }
  }
  return result
}

/** 簡易乱数生成（Web Worker 内で Math.random が使えるのでそのまま利用） */
function shuffleArray<T>(arr: T[]): T[] {
  const shuffled = [...arr]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

/** 空のボード状態を作成 */
function createEmptyState(): BoardState {
  return {
    classGrid: new Map(),
    teacherGrid: new Map(),
    roomGrid: new Map(),
    entries: [],
    assignmentPlacedCount: new Map(),
    classDaySubjectCount: new Map(),
    teacherDayCount: new Map(),
  }
}

// ============================================================
// タスク生成・優先度計算
// ============================================================

function buildTasks(
  assignments: Assignment[],
  subjectMap: Map<string, Subject>,
  teacherMap: Map<string, Teacher>,
  roomMap: Map<string, Room>,
): ScheduleTask[] {
  const tasks: ScheduleTask[] = []
  let taskIndex = 0

  // 同時開講グループ・講座グループごとに割当を集約
  // courseGroupId は simultaneousGroupId と同じ「同時配置」の仕組みで処理する
  // （講座グループ内のタスクは全て同じ曜日・時限に配置される）
  const simultaneousGroups = new Map<string, Assignment[]>()
  const standaloneAssignments: Assignment[] = []

  for (const assignment of assignments) {
    const groupId = assignment.simultaneousGroupId ?? assignment.courseGroupId
    if (groupId) {
      const group = simultaneousGroups.get(groupId)
      if (group) {
        group.push(assignment)
      } else {
        simultaneousGroups.set(groupId, [assignment])
      }
    } else {
      standaloneAssignments.push(assignment)
    }
  }

  // 通常の（非同時開講）タスクを生成
  for (const assignment of standaloneAssignments) {
    const subject = subjectMap.get(assignment.subjectId)
    if (!subject) continue

    const teachers = assignment.teacherIds
      .map((id) => teacherMap.get(id))
      .filter((t): t is Teacher => t !== undefined)
    if (teachers.length === 0) continue

    const room = assignment.roomId ? roomMap.get(assignment.roomId) : undefined
    const consecutivePairs = subject.consecutivePairs
    const consecutiveSlots = consecutivePairs * 2
    const singleSlots = assignment.weeklyCount - consecutiveSlots
    const fixedSlots = sortFixedSlots(assignment.fixedSlots ?? [])
    let fixedIdx = 0

    // 連続ペアタスクを生成
    for (let i = 0; i < consecutivePairs; i++) {
      let fixedSlot = fixedIdx < fixedSlots.length
        ? { day: fixedSlots[fixedIdx].day, period: fixedSlots[fixedIdx].period }
        : undefined
      if (fixedSlot) {
        // 後半時限（2,4,6限）が指定された場合、開始時限に正規化
        fixedSlot = normalizeConsecutiveFixedSlot(fixedSlot)
        fixedIdx++
        // 連続ペアの後半時限（startPeriod+1）もfixedSlotsにある場合はスキップ
        fixedIdx += skipConsecutiveSecondHalf(fixedSlots, fixedIdx, fixedSlot)
      }
      const priority = fixedSlot ? -1000 : calculatePriority(subject, teachers)

      tasks.push({
        assignments: [assignment],
        subjects: [subject],
        teacherGroups: [teachers],
        rooms: [room],
        isConsecutive: true,
        priority: priority - 100, // 連続タスクは制約が厳しいので優先
        fixedSlot,
        originalIndex: taskIndex++,
      })
    }

    // 単独タスクを生成
    for (let i = 0; i < singleSlots; i++) {
      const fixedSlot = fixedIdx < fixedSlots.length
        ? { day: fixedSlots[fixedIdx].day, period: fixedSlots[fixedIdx].period }
        : undefined
      if (fixedSlot) fixedIdx++
      const priority = fixedSlot ? -1000 : calculatePriority(subject, teachers)

      tasks.push({
        assignments: [assignment],
        subjects: [subject],
        teacherGroups: [teachers],
        rooms: [room],
        isConsecutive: false,
        priority,
        fixedSlot,
        originalIndex: taskIndex++,
      })
    }
  }

  // 同時開講グループのタスクを生成
  for (const [groupId, groupAssignments] of simultaneousGroups) {
    const groupSubjects: Subject[] = []
    const groupTeacherGroups: Teacher[][] = []
    const groupRooms: (Room | undefined)[] = []
    let weeklyCount = 0
    // 同時開講グループの連続ペア数は最大のものを採用
    let maxConsecutivePairs = 0

    let valid = true
    for (const assignment of groupAssignments) {
      const subject = subjectMap.get(assignment.subjectId)
      if (!subject) { valid = false; break }

      const teachers = assignment.teacherIds
        .map((id) => teacherMap.get(id))
        .filter((t): t is Teacher => t !== undefined)
      if (teachers.length === 0) { valid = false; break }

      groupSubjects.push(subject)
      groupTeacherGroups.push(teachers)
      groupRooms.push(assignment.roomId ? roomMap.get(assignment.roomId) : undefined)
      if (subject.consecutivePairs > maxConsecutivePairs) maxConsecutivePairs = subject.consecutivePairs
      weeklyCount = Math.max(weeklyCount, assignment.weeklyCount)
    }
    if (!valid) continue

    const consecutiveSlots = maxConsecutivePairs * 2
    const singleSlots = weeklyCount - consecutiveSlots
    // 同時開講グループの固定スロットは全assignmentからマージ（重複排除・ソート済み）
    const groupFixedSlots = sortFixedSlots(mergeFixedSlots(groupAssignments))
    let fixedIdx = 0

    // 連続ペアタスク
    for (let i = 0; i < maxConsecutivePairs; i++) {
      let fixedSlot = fixedIdx < groupFixedSlots.length
        ? { day: groupFixedSlots[fixedIdx].day, period: groupFixedSlots[fixedIdx].period }
        : undefined
      if (fixedSlot) {
        // 後半時限（2,4,6限）が指定された場合、開始時限に正規化
        fixedSlot = normalizeConsecutiveFixedSlot(fixedSlot)
        fixedIdx++
        // 連続ペアの後半時限もfixedSlotsにある場合はスキップ
        fixedIdx += skipConsecutiveSecondHalf(groupFixedSlots, fixedIdx, fixedSlot)
      }

      if (fixedSlot) {
        tasks.push({
          assignments: groupAssignments,
          subjects: groupSubjects,
          teacherGroups: groupTeacherGroups,
          rooms: groupRooms,
          isConsecutive: true,
          priority: -1500,
          simultaneousGroupId: groupId,
          fixedSlot,
          originalIndex: taskIndex++,
        })
      } else {
        let priority = -200
        const allTeachers = getAllTeachersFlat({ assignments: groupAssignments, subjects: groupSubjects, teacherGroups: groupTeacherGroups, rooms: groupRooms, isConsecutive: true, priority: 0, originalIndex: 0 })
        priority -= allTeachers.length * 20
        priority -= 100 // 連続タスクボーナス
        priority -= groupAssignments.length * 30

        // 教科カテゴリ優先度（グループ内の最優先カテゴリを適用）
        const catBonus = Math.min(...groupSubjects.map((s) => getCategoryPriorityBonus(s.category)))
        priority += catBonus

        const minAvailDays = Math.min(...allTeachers.map((t) => t.availableDays.length))
        priority -= (5 - minAvailDays) * 10

        // TT教員が多い場合（4人以上）は制約が非常に厳しいため追加優先
        if (allTeachers.length >= 4) {
          priority -= (allTeachers.length - 3) * 50
        }

        tasks.push({
          assignments: groupAssignments,
          subjects: groupSubjects,
          teacherGroups: groupTeacherGroups,
          rooms: groupRooms,
          isConsecutive: true,
          priority,
          simultaneousGroupId: groupId,
          originalIndex: taskIndex++,
        })
      }
    }

    // 単独タスク
    for (let i = 0; i < singleSlots; i++) {
      const fixedSlot = fixedIdx < groupFixedSlots.length
        ? { day: groupFixedSlots[fixedIdx].day, period: groupFixedSlots[fixedIdx].period }
        : undefined
      if (fixedSlot) fixedIdx++

      if (fixedSlot) {
        tasks.push({
          assignments: groupAssignments,
          subjects: groupSubjects,
          teacherGroups: groupTeacherGroups,
          rooms: groupRooms,
          isConsecutive: false,
          priority: -1500,
          simultaneousGroupId: groupId,
          fixedSlot,
          originalIndex: taskIndex++,
        })
      } else {
        let priority = -200
        const allTeachers = getAllTeachersFlat({ assignments: groupAssignments, subjects: groupSubjects, teacherGroups: groupTeacherGroups, rooms: groupRooms, isConsecutive: false, priority: 0, originalIndex: 0 })
        priority -= allTeachers.length * 20
        priority -= groupAssignments.length * 30

        // 教科カテゴリ優先度（グループ内の最優先カテゴリを適用）
        const catBonus = Math.min(...groupSubjects.map((s) => getCategoryPriorityBonus(s.category)))
        priority += catBonus

        const minAvailDays = Math.min(...allTeachers.map((t) => t.availableDays.length))
        priority -= (5 - minAvailDays) * 10

        // TT教員が多い場合（4人以上）は制約が非常に厳しいため追加優先
        if (allTeachers.length >= 4) {
          priority -= (allTeachers.length - 3) * 50
        }

        tasks.push({
          assignments: groupAssignments,
          subjects: groupSubjects,
          teacherGroups: groupTeacherGroups,
          rooms: groupRooms,
          isConsecutive: false,
          priority,
          simultaneousGroupId: groupId,
          originalIndex: taskIndex++,
        })
      }
    }
  }

  // 制約が厳しい（priorityが低い）ものを先に
  tasks.sort((a, b) => a.priority - b.priority)
  return tasks
}

/**
 * 教科カテゴリに基づく優先度ボーナス。
 * 農業科目は配置が最も複雑なため最優先、次に家庭科を優先する。
 */
function getCategoryPriorityBonus(category: string): number {
  switch (category) {
    case '農業': return -500   // 最優先
    case '家庭科': return -300  // 次に優先
    default: return 0
  }
}

function calculatePriority(subject: Subject, teachers: Teacher[]): number {
  let priority = 0

  // 教科カテゴリ優先度: 農業 → 家庭科 → その他
  priority += getCategoryPriorityBonus(subject.category)

  // 連続授業は配置先が限定される → 最優先（calculatePriority自体は科目レベル）
  if (subject.consecutivePairs > 0) priority -= 100

  // TT はより制約が厳しい
  priority -= teachers.length * 20

  // 教員の空き日数が少ないほど制約が厳しい
  const minAvailDays = Math.min(...teachers.map((t) => t.availableDays.length))
  priority -= (5 - minAvailDays) * 10

  // preferredPeriods があると枠が限定される
  if (subject.preferredPeriods) {
    const range = subject.preferredPeriods.to - subject.preferredPeriods.from + 1
    priority -= (6 - range) * 5
  }

  // excludedPeriods があると使える枠が減る
  if (subject.excludedPeriods && subject.excludedPeriods.length > 0) {
    priority -= subject.excludedPeriods.length * 5
  }

  // 連続配置禁止は候補が制限される
  if (subject.noConsecutive) priority -= 30

  return priority
}

// ============================================================
// 候補スロット列挙
// ============================================================

function getCandidateSlots(
  task: ScheduleTask,
  state: BoardState,
): Slot[] {
  // 固定スロットの場合はそのスロットのみを候補にする
  if (task.fixedSlot) {
    const { day, period } = task.fixedSlot
    if (task.isConsecutive) {
      if (canPlaceTask(task, state, day, period) && canPlaceTask(task, state, day, (period + 1) as Period)) {
        return [{ day, period }]
      }
    } else {
      if (canPlaceTask(task, state, day, period)) {
        return [{ day, period }]
      }
    }
    return []
  }

  const candidates: Slot[] = []

  for (const day of DAYS) {
    if (task.isConsecutive) {
      // 連続授業: 1-2, 3-4, 5-6 のペアから候補を探す
      for (const startPeriod of CONSECUTIVE_STARTS) {
        const endPeriod = (startPeriod + 1) as Period
        if (canPlaceTask(task, state, day, startPeriod) && canPlaceTask(task, state, day, endPeriod)) {
          candidates.push({ day, period: startPeriod })
        }
      }
    } else {
      for (const period of PERIODS) {
        if (canPlaceTask(task, state, day, period)) {
          candidates.push({ day, period })
        }
      }
    }
  }

  return candidates
}

/**
 * タスク（複数割当を含む可能性あり）を特定スロットに配置可能かチェック。
 * 同時開講グループの場合は全割当に対して検証する。
 */
function canPlaceTask(
  task: ScheduleTask,
  state: BoardState,
  day: DayOfWeek,
  period: Period,
): boolean {
  for (let i = 0; i < task.assignments.length; i++) {
    const assignment = task.assignments[i]
    const subject = task.subjects[i]
    const teachers = task.teacherGroups[i]
    const room = task.rooms[i]

    if (!canPlaceSingle(assignment, subject, teachers, state, day, period, room)) {
      return false
    }
  }
  return true
}

/** 単一割当のスロット配置チェック（ハード制約） */
function canPlaceSingle(
  assignment: Assignment,
  subject: Subject,
  teachers: Teacher[],
  state: BoardState,
  day: DayOfWeek,
  period: Period,
  room?: Room,
): boolean {
  const classId = assignment.classId

  // 割当の週コマ数上限チェック（最重要: weeklyCountを超えて配置しない）
  const placedCount = state.assignmentPlacedCount.get(assignment.id) ?? 0
  if (placedCount >= assignment.weeklyCount) return false

  // 科目の配置不可時限チェック
  if (isExcludedPeriodForSubject(subject, period)) return false

  // 連続配置禁止チェック（ハード制約）
  if (subject.noConsecutive) {
    if (hasAdjacentSameSubject(state, day, period, classId, assignment.id)) return false
  }

  // クラス重複チェック
  if (!isSlotFreeForClass(state, day, period, classId)) return false

  // 同日同科目禁止: 同じクラスで同じ日に同じ科目は配置不可
  // 連続授業は同日2コマが前提なのでスキップ。ただし spreadDays の場合は
  // 連続授業でも同日に複数ペア配置しない（例: 家庭基礎4単位を2コマ×別日に分散）
  if (subject.consecutivePairs === 0 || subject.spreadDays) {
    const cdsKey = classDaySubjectKey(day, classId, subject.id)
    if ((state.classDaySubjectCount.get(cdsKey) ?? 0) > 0) return false
  }

  // 教員の空き・重複チェック（TT対応: 全教員を確認）
  for (const teacher of teachers) {
    if (!isTeacherAvailable(teacher, day, period)) return false
    if (!isSlotFreeForTeacher(state, day, period, teacher.id)) return false
  }

  // 施設の利用可能・重複チェック
  if (room) {
    if (!isRoomAvailable(room, day, period)) return false
    if (!isSlotFreeForRoom(state, day, period, room.id)) return false
  }

  return true
}

/** 候補スロットをスコア順にソート（高スコア優先） */
function scoreCandidateSlot(task: ScheduleTask, slot: Slot, state: BoardState, maxTeacherPerDay: number): number {
  let score = 0

  for (let i = 0; i < task.assignments.length; i++) {
    const assignment = task.assignments[i]
    const subject = task.subjects[i]
    const teachers = task.teacherGroups[i]

    // 推奨時限に合致すれば加点
    if (subject.preferredPeriods) {
      if (isInPreferredPeriod(subject, slot.period)) {
        score += 10
      }
      if (task.isConsecutive) {
        const secondPeriod = (slot.period + 1) as Period
        if (isInPreferredPeriod(subject, secondPeriod)) {
          score += 10
        }
      }
    }

    // noConsecutive の場合: 隣接に同科目があるスロットは大幅減点
    if (subject.noConsecutive) {
      if (hasAdjacentSameSubject(state, slot.day, slot.period, assignment.classId, assignment.id)) {
        score -= 100
      }
    }

    // ソフト制約: spreadDays — 隣接曜日に同科目がある場合は減点
    if (subject.spreadDays) {
      const dayIdx = DAYS.indexOf(slot.day)
      for (const adjDay of [DAYS[dayIdx - 1], DAYS[dayIdx + 1]]) {
        if (!adjDay) continue
        const adjCdsKey = classDaySubjectKey(adjDay, assignment.classId, subject.id)
        if ((state.classDaySubjectCount.get(adjCdsKey) ?? 0) > 0) {
          score -= 15
        }
      }
    }

    // ソフト制約: 教員の1日あたりコマ数がMAXを超えそうなら減点
    const slotsUsed = task.isConsecutive ? 2 : 1
    for (const teacher of teachers) {
      const tdKey = teacherDayKey(slot.day, teacher.id)
      const currentLoad = state.teacherDayCount.get(tdKey) ?? 0
      if (currentLoad + slotsUsed > maxTeacherPerDay) {
        score -= 20
      }
    }
  }

  return score
}

/**
 * LCV（最小制約値）ヒューリスティック付きスロットスコアリング。
 * 他の未配置タスクへの影響を考慮し、選択肢を最も残すスロットを優先する。
 */
/**
 * LCV付きスコアリング（軽量版）。
 * getCandidateSlots呼び出しを廃止し、スロット競合の密度で推定する。
 */
function scoreCandidateSlotWithLCV(
  task: ScheduleTask,
  slot: Slot,
  state: BoardState,
  maxTeacherPerDay: number,
  otherTasks: ScheduleTask[],
): number {
  // 基本スコア
  let score = scoreCandidateSlot(task, slot, state, maxTeacherPerDay)

  // 軽量LCV: このスロット（day, period）に何個の他タスクが影響を受けるか数えるだけ
  // getCandidateSlotsは呼ばず、直接的な競合数をペナルティにする
  const taskClassIds = new Set(task.assignments.map((a) => a.classId))
  const taskTeacherIds = new Set<string>()
  for (const tg of task.teacherGroups) {
    for (const t of tg) taskTeacherIds.add(t.id)
  }

  let affectedCount = 0
  for (const otherTask of otherTasks) {
    if (otherTask === task) continue

    let affected = false
    for (let i = 0; i < otherTask.assignments.length && !affected; i++) {
      if (taskClassIds.has(otherTask.assignments[i].classId)) {
        affected = true
      }
      if (!affected) {
        for (const t of otherTask.teacherGroups[i]) {
          if (taskTeacherIds.has(t.id)) { affected = true; break }
        }
      }
    }
    if (affected) affectedCount++
  }

  // 競合する他タスクが多いスロットはペナルティ（getCandidateSlots不要）
  score -= affectedCount * 3

  return score
}

// ============================================================
// MRV（最小残余値）ヒューリスティック
// ============================================================

/**
 * 未配置タスクの中から、候補スロット数が最も少ないタスクのインデックスを返す。
 * 固定スロットのタスクは最優先で返す。
 */
/**
 * MRVヒューリスティック（サンプリング上限付き）。
 * 大規模データ時に全タスクの候補数を計算するコストを抑制するため、
 * 先頭の最大 MRV_SAMPLE_LIMIT 件 + 固定スロットタスクのみを評価する。
 */
const MRV_SAMPLE_LIMIT = 30

function selectNextTaskMRV(
  remainingTasks: ScheduleTask[],
  state: BoardState,
): { index: number; candidates: Slot[] } {
  let bestIndex = 0
  let bestCandidates: Slot[] | null = null
  let bestCount = Infinity

  const limit = Math.min(remainingTasks.length, MRV_SAMPLE_LIMIT)

  for (let i = 0; i < remainingTasks.length; i++) {
    const task = remainingTasks[i]

    // 固定スロットタスクは最優先（常にチェック）
    if (task.fixedSlot) {
      const candidates = getCandidateSlots(task, state)
      return { index: i, candidates }
    }

    // サンプリング上限を超えたら打ち切り
    if (i >= limit) continue

    const candidates = getCandidateSlots(task, state)
    if (candidates.length < bestCount) {
      bestCount = candidates.length
      bestIndex = i
      bestCandidates = candidates
      // 候補が0なら即座に返す
      if (bestCount === 0) break
    }
  }

  return { index: bestIndex, candidates: bestCandidates ?? [] }
}

// ============================================================
// 配置・解除
// ============================================================

function placeTask(
  task: ScheduleTask,
  state: BoardState,
  day: DayOfWeek,
  period: Period,
): ScheduleEntry[] {
  const newEntries: ScheduleEntry[] = []

  const periods: Period[] = task.isConsecutive
    ? [period, (period + 1) as Period]
    : [period]

  // 同時開講グループで同じ教員が複数割当にまたがる場合、
  // teacherGrid/teacherDayCountの重複登録を防ぐ。
  // 実際は同じ時間に同時に教えるので、教員のコマ数は1回だけカウントする。
  const teacherRegistered = new Set<string>() // "day:period:teacherId" で追跡

  for (let i = 0; i < task.assignments.length; i++) {
    const assignment = task.assignments[i]
    const subject = task.subjects[i]
    const teachers = task.teacherGroups[i]
    const room = task.rooms[i]
    const classId = assignment.classId

    for (let j = 0; j < periods.length; j++) {
      const p = periods[j]
      const entry: ScheduleEntry = {
        id: `temp-${day}-${p}-${classId}`,
        day,
        period: p,
        classId,
        assignmentId: assignment.id,
        isConsecutiveSecond: j === 1 ? true : undefined,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      // グリッドに登録
      state.classGrid.set(cellKey(day, p, classId), assignment.id)
      for (const teacher of teachers) {
        const teacherCellKey = cellKey(day, p, teacher.id)
        state.teacherGrid.set(teacherCellKey, assignment.id)

        // 同時開講グループ内で同じ教員が既に登録済みなら、teacherDayCountは加算しない
        if (!teacherRegistered.has(teacherCellKey)) {
          teacherRegistered.add(teacherCellKey)
          const tdKey = teacherDayKey(day, teacher.id)
          state.teacherDayCount.set(tdKey, (state.teacherDayCount.get(tdKey) ?? 0) + 1)
        }
      }

      // 施設グリッドに登録
      if (room) {
        state.roomGrid.set(cellKey(day, p, room.id), assignment.id)
      }

      // 同日同科目カウントを加算
      const cdsKey = classDaySubjectKey(day, classId, subject.id)
      state.classDaySubjectCount.set(cdsKey, (state.classDaySubjectCount.get(cdsKey) ?? 0) + 1)

      // 割当ごとの配置コマ数を加算
      state.assignmentPlacedCount.set(
        assignment.id,
        (state.assignmentPlacedCount.get(assignment.id) ?? 0) + 1,
      )

      state.entries.push(entry)
      newEntries.push(entry)
    }
  }

  return newEntries
}

function removeEntries(
  task: ScheduleTask,
  state: BoardState,
  entries: ScheduleEntry[],
): void {
  // 同時開講グループで同じ教員が複数エントリにまたがる場合、
  // teacherDayCountの重複減算を防ぐ
  const teacherDeregistered = new Set<string>() // "day:period:teacherId" で追跡

  for (const entry of entries) {
    state.classGrid.delete(cellKey(entry.day, entry.period, entry.classId))

    // エントリのassignmentIdに対応するteachers/room/subjectを見つける
    const assignmentIdx = task.assignments.findIndex((a) => a.id === entry.assignmentId)
    const teachers = assignmentIdx >= 0 ? task.teacherGroups[assignmentIdx] : getAllTeachersFlat(task)
    const subject = assignmentIdx >= 0 ? task.subjects[assignmentIdx] : task.subjects[0]
    const room = assignmentIdx >= 0 ? task.rooms[assignmentIdx] : undefined

    for (const teacher of teachers) {
      state.teacherGrid.delete(cellKey(entry.day, entry.period, teacher.id))

      // 同時開講グループ内で同じ教員が既に減算済みなら、teacherDayCountは減算しない
      const teacherCellKey = cellKey(entry.day, entry.period, teacher.id)
      if (!teacherDeregistered.has(teacherCellKey)) {
        teacherDeregistered.add(teacherCellKey)
        const tdKey = teacherDayKey(entry.day, teacher.id)
        const current = state.teacherDayCount.get(tdKey) ?? 0
        if (current <= 1) {
          state.teacherDayCount.delete(tdKey)
        } else {
          state.teacherDayCount.set(tdKey, current - 1)
        }
      }
    }

    // 施設グリッドから除去
    if (room) {
      state.roomGrid.delete(cellKey(entry.day, entry.period, room.id))
    }

    // 同日同科目カウントを減算
    const cdsKey = classDaySubjectKey(entry.day, entry.classId, subject.id)
    const cdsCount = state.classDaySubjectCount.get(cdsKey) ?? 0
    if (cdsCount <= 1) {
      state.classDaySubjectCount.delete(cdsKey)
    } else {
      state.classDaySubjectCount.set(cdsKey, cdsCount - 1)
    }

    // 割当ごとの配置コマ数を減算
    const apc = state.assignmentPlacedCount.get(entry.assignmentId) ?? 0
    if (apc <= 1) {
      state.assignmentPlacedCount.delete(entry.assignmentId)
    } else {
      state.assignmentPlacedCount.set(entry.assignmentId, apc - 1)
    }

    const idx = state.entries.indexOf(entry)
    if (idx !== -1) state.entries.splice(idx, 1)
  }
}

// ============================================================
// スコアリング
// ============================================================

function calculateScore(
  entries: ScheduleEntry[],
  tasks: ScheduleTask[],
  totalTasks: number,
  subjectMap: Map<string, Subject>,
  assignmentMap: Map<string, Assignment>,
  teacherMap: Map<string, Teacher>,
  maxTeacherPerDay: number,
): number {
  // 基本スコア: 配置率（1000点満点）
  const placedTasks = totalTasks - tasks.length
  let score = (placedTasks / Math.max(totalTasks, 1)) * 1000

  // 推奨時限ボーナス（最大200点）
  let preferredHits = 0
  let preferredTotal = 0

  for (const entry of entries) {
    if (entry.isConsecutiveSecond) continue
    const assignment = assignmentMap.get(entry.assignmentId)
    if (!assignment) continue
    const subject = subjectMap.get(assignment.subjectId)
    if (!subject?.preferredPeriods) continue

    preferredTotal++
    if (isInPreferredPeriod(subject, entry.period)) {
      preferredHits++
    }
  }

  if (preferredTotal > 0) {
    score += (preferredHits / preferredTotal) * 200
  }

  // ソフト制約ペナルティ: 教員1日あたりの過剰コマ数（最大 -100点）
  const teacherDayCounts = new Map<string, number>()
  for (const entry of entries) {
    const assignment = assignmentMap.get(entry.assignmentId)
    if (!assignment) continue
    for (const tid of assignment.teacherIds) {
      if (!teacherMap.has(tid)) continue
      const key = teacherDayKey(entry.day, tid)
      teacherDayCounts.set(key, (teacherDayCounts.get(key) ?? 0) + 1)
    }
  }
  let overload = 0
  for (const count of teacherDayCounts.values()) {
    if (count > maxTeacherPerDay) {
      overload += count - maxTeacherPerDay
    }
  }
  score -= Math.min(overload * 20, 100)

  // ソフト制約ペナルティ: spreadDays違反（最大 -50点）
  // 隣接曜日に同科目が配置されている場合に減点
  let spreadViolations = 0
  const classDaySubjects = new Map<string, Set<string>>()
  for (const entry of entries) {
    if (entry.isConsecutiveSecond) continue
    const assignment = assignmentMap.get(entry.assignmentId)
    if (!assignment) continue
    const subject = subjectMap.get(assignment.subjectId)
    if (!subject?.spreadDays) continue
    const key = `${entry.classId}:${subject.id}`
    if (!classDaySubjects.has(key)) classDaySubjects.set(key, new Set())
    classDaySubjects.get(key)!.add(entry.day)
  }
  for (const days of classDaySubjects.values()) {
    const dayIndices = [...days].map((d) => DAYS.indexOf(d as DayOfWeek)).sort((a, b) => a - b)
    for (let i = 1; i < dayIndices.length; i++) {
      if (dayIndices[i] - dayIndices[i - 1] === 1) {
        spreadViolations++
      }
    }
  }
  score -= Math.min(spreadViolations * 10, 50)

  return Math.round(score)
}

// ============================================================
// 未配置理由の詳細診断
// ============================================================

function diagnoseUnplaced(task: ScheduleTask, state: BoardState): UnplacedTask[] {
  const results: UnplacedTask[] = []

  for (let i = 0; i < task.assignments.length; i++) {
    const assignment = task.assignments[i]
    const teachers = task.teacherGroups[i]
    const isConsecutive = task.isConsecutive
    const reasons: string[] = []

    if (task.simultaneousGroupId) {
      reasons.push(`同時開講グループ（${task.assignments.length}クラス合同）`)
    }

    // 固定スロットの場合、その固定先で何がブロックしているかを具体的に診断
    if (task.fixedSlot) {
      const { day, period } = task.fixedSlot
      const dayLabel = DAY_LABELS[day]
      const fixedBlockReasons: string[] = []
      const checkPeriods: Period[] = isConsecutive
        ? [period, (period + 1) as Period]
        : [period]

      for (const p of checkPeriods) {
        if (!isSlotFreeForClass(state, day, p, assignment.classId)) {
          fixedBlockReasons.push(`${dayLabel}${p}限にクラスの別授業あり`)
        }
        for (const teacher of teachers) {
          if (!isTeacherAvailable(teacher, day, p)) {
            fixedBlockReasons.push(`${teacher.name}が${dayLabel}${p}限に勤務不可`)
          } else if (!isSlotFreeForTeacher(state, day, p, teacher.id)) {
            fixedBlockReasons.push(`${teacher.name}の${dayLabel}${p}限に別授業あり`)
          }
        }
      }

      if (fixedBlockReasons.length > 0) {
        reasons.push(`固定先（${dayLabel}${period}限）のブロック: ${fixedBlockReasons.join('、')}`)
      } else {
        // 同時開講グループ内の他の割当がブロックされている可能性
        reasons.push(`固定先（${dayLabel}${period}限）で同時開講グループの他クラスが競合`)
      }

      results.push({
        assignmentId: assignment.id,
        classId: assignment.classId,
        subjectId: assignment.subjectId,
        reason: reasons.join('／'),
      })
      continue
    }

    // 各曜日×時限ごとにブロック要因を集計
    let totalSlots = 0
    let classConflicts = 0
    let teacherUnavailable = 0
    let teacherConflicts = 0
    const unavailableTeachers = new Set<string>()
    const conflictingTeachers = new Set<string>()

    for (const day of DAYS) {
      const periods = isConsecutive ? CONSECUTIVE_STARTS : PERIODS
      for (const period of periods) {
        const checkPeriods: Period[] = isConsecutive
          ? [period, (period + 1) as Period]
          : [period]
        totalSlots++

        let blockedByClass = false
        let blockedByTeacherAvail = false
        let blockedByTeacherConflict = false

        for (const p of checkPeriods) {
          if (!isSlotFreeForClass(state, day, p, assignment.classId)) {
            blockedByClass = true
          }
          for (const teacher of teachers) {
            if (!isTeacherAvailable(teacher, day, p)) {
              blockedByTeacherAvail = true
              unavailableTeachers.add(teacher.name)
            } else if (!isSlotFreeForTeacher(state, day, p, teacher.id)) {
              blockedByTeacherConflict = true
              conflictingTeachers.add(teacher.name)
            }
          }
        }

        if (blockedByClass) classConflicts++
        if (blockedByTeacherAvail) teacherUnavailable++
        if (blockedByTeacherConflict) teacherConflicts++
      }
    }

    if (classConflicts === totalSlots) {
      reasons.push('全コマでクラスの授業が重複')
    } else if (classConflicts > 0) {
      reasons.push(`${classConflicts}/${totalSlots}コマでクラス重複`)
    }

    if (teacherUnavailable > 0) {
      const names = Array.from(unavailableTeachers).join('・')
      reasons.push(`${names}の勤務日外・除外コマにより${teacherUnavailable}/${totalSlots}コマ不可`)
    }

    if (teacherConflicts > 0) {
      const names = Array.from(conflictingTeachers).join('・')
      reasons.push(`${names}の他授業との重複で${teacherConflicts}/${totalSlots}コマ不可`)
    }

    if (isConsecutive) {
      reasons.push('連続2コマの空きペアが必要')
    }

    if (reasons.length === 0) {
      reasons.push('他の授業との組み合わせにより配置不可')
    }

    results.push({
      assignmentId: assignment.id,
      classId: assignment.classId,
      subjectId: assignment.subjectId,
      reason: reasons.join('／'),
    })
  }

  return results
}

// ============================================================
// 貪欲配置（Greedy Placement）
// ============================================================

/**
 * タスクを順番に貪欲配置する。
 * MRV使用時は、残りタスクの中から候補スロットが最も少ないものを動的に選択する。
 * @param randomTopK - 候補スロットの上位N件からランダムに選択（1=常にベスト、>1=ランダム性あり）
 * @returns 配置できなかったタスクの配列
 */
/**
 * 固定スロットの事前確保フェーズ。
 * 固定タスクを制約の厳しい順に配置し、ブロッカーを積極的にチェーン置換で排除する。
 * これにより、非固定タスクが固定スロットを占有する問題を防止する。
 */
function preReserveFixedSlots(
  fixedTasks: ScheduleTask[],
  state: BoardState,
  assignmentMap: Map<string, Assignment>,
  maxTeacherPerDay: number,
  placementMap: Map<string, PlacementRecord>,
): ScheduleTask[] {
  if (fixedTasks.length === 0) return []

  const unplaced: ScheduleTask[] = []

  // 制約が厳しいものから配置（同時開講・TT教員数が多いものを優先）
  const sorted = [...fixedTasks].sort((a, b) => {
    const aComplexity = a.assignments.length * 10 + getAllTeachersFlat(a).length * 5 + (a.isConsecutive ? 5 : 0)
    const bComplexity = b.assignments.length * 10 + getAllTeachersFlat(b).length * 5 + (b.isConsecutive ? 5 : 0)
    return bComplexity - aComplexity
  })

  for (const task of sorted) {
    const candidates = getCandidateSlots(task, state)
    if (candidates.length > 0) {
      // 直接配置可能
      candidates.sort((a, b) =>
        scoreCandidateSlot(task, b, state, maxTeacherPerDay) -
        scoreCandidateSlot(task, a, state, maxTeacherPerDay)
      )
      const best = candidates[0]
      const entries = placeTask(task, state, best.day, best.period)
      const record: PlacementRecord = { task, entries, day: best.day, startPeriod: best.period }
      for (const e of entries) {
        placementMap.set(cellKey(e.day, e.period, e.classId), record)
      }
    } else {
      // 固定タスクは少数なので深度・試行回数を十分に確保（深度5, 試行200）
      if (tryRelocateTask(task, state, assignmentMap, maxTeacherPerDay, placementMap, 5, new Set(), { count: 0 })) {
        // チェーン置換成功
      } else {
        unplaced.push(task)
      }
    }
  }

  return unplaced
}

/**
 * 固定タスクを強制配置する。固定スロットを占拠する非固定タスクを排除して配置する。
 * 固定タスク同士の競合は排除しない（データ不整合として扱う）。
 *
 * @returns { success, evictedTasks } - success: 配置成功したか, evictedTasks: 排除されたタスク
 */
function forceFixedTaskPlacement(
  task: ScheduleTask,
  state: BoardState,
  placementMap: Map<string, PlacementRecord>,
): { success: boolean; evictedTasks: ScheduleTask[] } {
  if (!task.fixedSlot) return { success: false, evictedTasks: [] }

  const { day, period } = task.fixedSlot
  const checkPeriods: Period[] = task.isConsecutive
    ? [period, (period + 1) as Period]
    : [period]

  // ブロッカーを収集（非固定タスクのみ排除対象）
  const blockersToEvict = new Set<PlacementRecord>()

  for (let i = 0; i < task.assignments.length; i++) {
    const a = task.assignments[i]
    const ts = task.teacherGroups[i]
    const room = task.rooms[i]

    for (const p of checkPeriods) {
      // クラス競合
      if (!isSlotFreeForClass(state, day, p, a.classId)) {
        const rec = placementMap.get(cellKey(day, p, a.classId))
        if (rec) {
          if (rec.task.fixedSlot) return { success: false, evictedTasks: [] } // 固定タスク同士の競合は強制排除しない
          blockersToEvict.add(rec)
        }
      }
      // 教員競合
      for (const t of ts) {
        if (!isSlotFreeForTeacher(state, day, p, t.id)) {
          const blockAId = state.teacherGrid.get(cellKey(day, p, t.id))
          if (blockAId) {
            // blockAIdはassignmentIdなので、そのassignmentのclassIdでplacementMapを引く
            // 全エントリを探す
            for (const [, rec] of placementMap) {
              if (rec.entries.some((e) => e.assignmentId === blockAId && e.day === day && e.period === p)) {
                if (rec.task.fixedSlot) return { success: false, evictedTasks: [] } // 固定タスク同士は排除しない
                blockersToEvict.add(rec)
                break
              }
            }
          }
        }
      }
      // 施設競合
      if (room && !isSlotFreeForRoom(state, day, p, room.id)) {
        const blockAId = state.roomGrid.get(cellKey(day, p, room.id))
        if (blockAId) {
          for (const [, rec] of placementMap) {
            if (rec.entries.some((e) => e.assignmentId === blockAId && e.day === day && e.period === p)) {
              if (rec.task.fixedSlot) return { success: false, evictedTasks: [] }
              blockersToEvict.add(rec)
              break
            }
          }
        }
      }
      // 教員の勤務可能チェック（これは排除では解決できない）
      for (const t of ts) {
        if (!isTeacherAvailable(t, day, p)) return { success: false, evictedTasks: [] } // ハード制約
      }
      // 科目の除外時限チェック
      if (isExcludedPeriodForSubject(task.subjects[i], p)) return { success: false, evictedTasks: [] }
      // 施設の利用不可チェック（ハード制約）
      if (room && !isRoomAvailable(room, day, p)) return { success: false, evictedTasks: [] }
    }
  }

  if (blockersToEvict.size === 0) {
    // ブロッカーなし＝直接配置可能（通常はここに来ないはず）
    const candidates = getCandidateSlots(task, state)
    if (candidates.length > 0) {
      const entries = placeTask(task, state, day, period)
      const record: PlacementRecord = { task, entries, day, startPeriod: period }
      for (const e of entries) {
        placementMap.set(cellKey(e.day, e.period, e.classId), record)
      }
      return { success: true, evictedTasks: [] }
    }
    return { success: false, evictedTasks: [] }
  }

  // 非固定ブロッカーを全て排除
  const evictedTasks: ScheduleTask[] = []
  for (const rec of blockersToEvict) {
    removeEntries(rec.task, state, rec.entries)
    for (const e of rec.entries) {
      placementMap.delete(cellKey(e.day, e.period, e.classId))
    }
    evictedTasks.push(rec.task)
  }

  // 固定タスクを配置
  if (task.isConsecutive
    ? canPlaceTask(task, state, day, period) && canPlaceTask(task, state, day, (period + 1) as Period)
    : canPlaceTask(task, state, day, period)
  ) {
    const entries = placeTask(task, state, day, period)
    const record: PlacementRecord = { task, entries, day, startPeriod: period }
    for (const e of entries) {
      placementMap.set(cellKey(e.day, e.period, e.classId), record)
    }
    return { success: true, evictedTasks }
  }

  // 配置に失敗した場合、排除したタスクを再配置に回す（ロストさせない）
  return { success: false, evictedTasks }
}

/**
 * フォワードチェッキング（軽量版）: 配置後に残りタスクのいずれかが候補0になっていないか検査。
 * 候補0のタスクが見つかった場合は false を返す（この配置はデッドエンドに至る）。
 * パフォーマンスのため、影響を受けるタスクの中から最大 FC_CHECK_LIMIT 件のみ検査する。
 */
const FC_CHECK_LIMIT = 15

function forwardCheck(
  placedTask: ScheduleTask,
  _slot: Slot,
  remainingTasks: ScheduleTask[],
  state: BoardState,
): boolean {
  const placedClassIds = new Set(placedTask.assignments.map((a) => a.classId))
  const placedTeacherIds = new Set<string>()
  for (const tg of placedTask.teacherGroups) {
    for (const t of tg) placedTeacherIds.add(t.id)
  }

  let checked = 0
  for (const other of remainingTasks) {
    if (checked >= FC_CHECK_LIMIT) break

    let couldBeAffected = false
    for (const a of other.assignments) {
      if (placedClassIds.has(a.classId)) { couldBeAffected = true; break }
    }
    if (!couldBeAffected) {
      for (const tg of other.teacherGroups) {
        for (const t of tg) {
          if (placedTeacherIds.has(t.id)) { couldBeAffected = true; break }
        }
        if (couldBeAffected) break
      }
    }
    if (!couldBeAffected) continue

    checked++
    const otherCandidates = getCandidateSlots(other, state)
    if (otherCandidates.length === 0) {
      return false // デッドエンド検出
    }
  }

  return true
}

function greedyPlace(
  tasks: ScheduleTask[],
  state: BoardState,
  maxTeacherPerDay: number,
  useMRV: boolean,
  placementMap: Map<string, PlacementRecord>,
  randomTopK: number = 1,
  useForwardCheck: boolean = false,
  useLCV: boolean = false,
): ScheduleTask[] {
  const unplaced: ScheduleTask[] = []

  if (useMRV && tasks.length > 1) {
    const remaining = [...tasks]
    while (remaining.length > 0) {
      const { index, candidates } = selectNextTaskMRV(remaining, state)
      const task = remaining.splice(index, 1)[0]

      if (candidates.length > 0) {
        // LCV使用時は他タスクへの影響を考慮したスコアリング
        if (useLCV && remaining.length > 0) {
          candidates.sort((a, b) =>
            scoreCandidateSlotWithLCV(task, b, state, maxTeacherPerDay, remaining) -
            scoreCandidateSlotWithLCV(task, a, state, maxTeacherPerDay, remaining)
          )
        } else {
          candidates.sort((a, b) =>
            scoreCandidateSlot(task, b, state, maxTeacherPerDay) -
            scoreCandidateSlot(task, a, state, maxTeacherPerDay)
          )
        }

        // フォワードチェッキング: 上位候補を順に試し、デッドエンドを回避
        let placed = false
        const topN = Math.min(candidates.length, useForwardCheck ? Math.max(randomTopK, 5) : randomTopK)

        if (useForwardCheck && remaining.length > 0) {
          for (let ci = 0; ci < topN; ci++) {
            const candidate = candidates[ci]
            const entries = placeTask(task, state, candidate.day, candidate.period)
            if (forwardCheck(task, candidate, remaining, state)) {
              const record: PlacementRecord = { task, entries, day: candidate.day, startPeriod: candidate.period }
              for (const e of entries) {
                placementMap.set(cellKey(e.day, e.period, e.classId), record)
              }
              placed = true
              break
            } else {
              // デッドエンド: この配置を撤回して次の候補を試す
              removeEntries(task, state, entries)
            }
          }
          if (!placed) {
            // フォワードチェッキングで全候補がデッドエンドだった場合、
            // ベストスコアのスロットに配置（完全な失敗よりマシ）
            const best = candidates[0]
            const entries = placeTask(task, state, best.day, best.period)
            const record: PlacementRecord = { task, entries, day: best.day, startPeriod: best.period }
            for (const e of entries) {
              placementMap.set(cellKey(e.day, e.period, e.classId), record)
            }
          }
        } else {
          const choiceN = Math.min(candidates.length, randomTopK)
          const chosen = candidates[Math.floor(Math.random() * choiceN)]
          const entries = placeTask(task, state, chosen.day, chosen.period)
          const record: PlacementRecord = { task, entries, day: chosen.day, startPeriod: chosen.period }
          for (const e of entries) {
            placementMap.set(cellKey(e.day, e.period, e.classId), record)
          }
        }
      } else {
        unplaced.push(task)
      }
    }
  } else {
    for (const task of tasks) {
      const candidates = getCandidateSlots(task, state)
      if (candidates.length > 0) {
        candidates.sort((a, b) =>
          scoreCandidateSlot(task, b, state, maxTeacherPerDay) -
          scoreCandidateSlot(task, a, state, maxTeacherPerDay)
        )
        const topN = Math.min(candidates.length, randomTopK)
        const chosen = candidates[Math.floor(Math.random() * topN)]
        const entries = placeTask(task, state, chosen.day, chosen.period)
        const record: PlacementRecord = { task, entries, day: chosen.day, startPeriod: chosen.period }
        for (const e of entries) {
          placementMap.set(cellKey(e.day, e.period, e.classId), record)
        }
      } else {
        unplaced.push(task)
      }
    }
  }

  return unplaced
}

// ============================================================
// ローカル修復（Local Repair by Chain Displacement）
// ============================================================

/** ボード状態のスナップショットを保存（チェーン置換のロールバック用） */
function saveState(
  state: BoardState,
  placementMap: Map<string, PlacementRecord>,
) {
  return {
    classGrid: new Map(state.classGrid),
    teacherGrid: new Map(state.teacherGrid),
    roomGrid: new Map(state.roomGrid),
    entries: [...state.entries],
    assignmentPlacedCount: new Map(state.assignmentPlacedCount),
    classDaySubjectCount: new Map(state.classDaySubjectCount),
    teacherDayCount: new Map(state.teacherDayCount),
    pm: new Map(placementMap),
  }
}

/** スナップショットからボード状態を復元 */
function loadState(
  state: BoardState,
  placementMap: Map<string, PlacementRecord>,
  saved: ReturnType<typeof saveState>,
): void {
  state.classGrid = saved.classGrid
  state.teacherGrid = saved.teacherGrid
  state.roomGrid = saved.roomGrid
  state.entries = saved.entries
  state.assignmentPlacedCount = saved.assignmentPlacedCount
  state.classDaySubjectCount = saved.classDaySubjectCount
  state.teacherDayCount = saved.teacherDayCount
  placementMap.clear()
  for (const [k, v] of saved.pm) {
    placementMap.set(k, v)
  }
}

/**
 * 未配置タスクを1つずつ修復する。
 * チェーン置換（最大2段階の玉突き移動）で配置先を確保する。
 */
function repairPhase(
  unplacedTasks: ScheduleTask[],
  state: BoardState,
  assignmentMap: Map<string, Assignment>,
  maxTeacherPerDay: number,
  placementMap: Map<string, PlacementRecord>,
): ScheduleTask[] {
  const stillUnplaced: ScheduleTask[] = []

  for (const task of unplacedTasks) {
    // チェーン置換の深度（パフォーマンス重視で制限）
    // 深すぎる再帰は指数爆発するため、最大3に制限
    const depth = task.simultaneousGroupId ? 3 : 2
    if (tryRelocateTask(task, state, assignmentMap, maxTeacherPerDay, placementMap, depth, new Set())) {
      // 修復成功
    } else {
      stillUnplaced.push(task)
    }
  }

  return stillUnplaced
}

/**
 * 固定タスクがその固定スロットで指定の曜日・時限をカバーするかチェック。
 * 連続ペアの場合、fixedSlot.period と fixedSlot.period+1 の両方がカバー範囲。
 */
function taskFixedSlotCovers(task: ScheduleTask, day: DayOfWeek, period: Period): boolean {
  if (!task.fixedSlot) return false
  if (task.fixedSlot.day !== day) return false
  if (task.fixedSlot.period === period) return true
  // 連続ペアの場合、fixedSlot.period+1 もカバー
  if (task.isConsecutive && (task.fixedSlot.period + 1) === period) return true
  return false
}

/**
 * タスクの配置先を探す（再帰的チェーン置換対応）。
 * 1. 直接配置可能ならそこに配置
 * 2. 各スロットでブロッカーを移動（maxDepth段階まで玉突き）して空きを作る
 *
 * 成功時: state が変更された状態で true を返す
 * 失敗時: state は呼び出し前と同じ状態で false を返す
 *
 * @param maxDepth - 残り置換深度（0=直接配置のみ）
 * @param excludedTasks - 置換対象外のタスク（循環防止）
 * @param attempts - 試行カウンタ（参照渡しで共有し、上限に達したら打ち切り）
 */
const MAX_RELOCATE_ATTEMPTS = 100

function tryRelocateTask(
  task: ScheduleTask,
  state: BoardState,
  assignmentMap: Map<string, Assignment>,
  maxTeacherPerDay: number,
  placementMap: Map<string, PlacementRecord>,
  maxDepth: number,
  excludedTasks: Set<ScheduleTask>,
  attempts: { count: number } = { count: 0 },
): boolean {
  // 直接配置を試みる（スナップショット不要）
  const candidates = getCandidateSlots(task, state)
  if (candidates.length > 0) {
    candidates.sort((a, b) =>
      scoreCandidateSlot(task, b, state, maxTeacherPerDay) -
      scoreCandidateSlot(task, a, state, maxTeacherPerDay)
    )
    const best = candidates[0]
    const entries = placeTask(task, state, best.day, best.period)
    const record: PlacementRecord = { task, entries, day: best.day, startPeriod: best.period }
    for (const e of entries) {
      placementMap.set(cellKey(e.day, e.period, e.classId), record)
    }
    return true
  }

  // 深度0なら打ち切り
  if (maxDepth <= 0) return false
  // 試行回数超過なら打ち切り（固定タスクの初回呼び出しはcountが小さいので問題なし）
  if (attempts.count >= MAX_RELOCATE_ATTEMPTS) return false

  // 固定スロットタスクは指定スロットのみでチェーン置換を試みる
  // （別の曜日・時限に配置されるのを防ぐ）
  const days = task.fixedSlot ? [task.fixedSlot.day] : shuffleArray([...DAYS])
  const periods = task.fixedSlot
    ? [task.fixedSlot.period]
    : task.isConsecutive ? shuffleArray([...CONSECUTIVE_STARTS]) : shuffleArray([...PERIODS])

  for (const day of days) {
    for (const period of periods) {
      attempts.count++
      if (attempts.count >= MAX_RELOCATE_ATTEMPTS) return false

      const checkPeriods: Period[] = task.isConsecutive
        ? [period, (period + 1) as Period]
        : [period]

      // 置換不可能なハード制約チェック
      let hardBlock = false
      for (let i = 0; i < task.assignments.length && !hardBlock; i++) {
        const a = task.assignments[i]
        const s = task.subjects[i]
        const ts = task.teacherGroups[i]

        const pc = state.assignmentPlacedCount.get(a.id) ?? 0
        if (pc >= a.weeklyCount) { hardBlock = true; break }

        for (const p of checkPeriods) {
          if (isExcludedPeriodForSubject(s, p)) { hardBlock = true; break }
          for (const t of ts) {
            if (!isTeacherAvailable(t, day, p)) { hardBlock = true; break }
          }
          if (hardBlock) break
        }
      }
      if (hardBlock) continue

      // ブロッカー収集
      const blockerRecords = new Set<PlacementRecord>()
      let blockerHardBlock = false

      for (let i = 0; i < task.assignments.length && !blockerHardBlock; i++) {
        const a = task.assignments[i]
        const ts = task.teacherGroups[i]

        for (const p of checkPeriods) {
          // クラス競合
          if (!isSlotFreeForClass(state, day, p, a.classId)) {
            const rec = placementMap.get(cellKey(day, p, a.classId))
            if (rec) {
              if (excludedTasks.has(rec.task)) {
                blockerHardBlock = true; break
              }
              // 固定スロットのブロッカー: 自タスクも同じスロットに固定されている場合は
              // ブロッカーの固定を解除して再配置を試みる（より制約の厳しいタスクを優先）
              if (rec.task.fixedSlot) {
                if (task.fixedSlot && taskFixedSlotCovers(task, day, p)) {
                  // 自タスクが同じ固定スロットを持つ → ブロッカーを非固定として再配置を試みる
                  blockerRecords.add(rec)
                } else {
                  blockerHardBlock = true; break
                }
              } else {
                blockerRecords.add(rec)
              }
            }
          }
          // 教員競合
          for (const t of ts) {
            if (!isSlotFreeForTeacher(state, day, p, t.id)) {
              const blockAId = state.teacherGrid.get(cellKey(day, p, t.id))
              if (blockAId) {
                const blockAssignment = assignmentMap.get(blockAId)
                if (blockAssignment) {
                  const rec = placementMap.get(cellKey(day, p, blockAssignment.classId))
                  if (rec) {
                    if (excludedTasks.has(rec.task)) {
                      blockerHardBlock = true; break
                    }
                    if (rec.task.fixedSlot) {
                      if (task.fixedSlot && taskFixedSlotCovers(task, day, p)) {
                        blockerRecords.add(rec)
                      } else {
                        blockerHardBlock = true; break
                      }
                    } else {
                      blockerRecords.add(rec)
                    }
                  }
                }
              }
            }
          }
          if (blockerHardBlock) break
        }
      }

      // ブロッカーが多すぎると再帰爆発するため上限を制限
      // 固定タスク（特にTT科目）は教員が多いのでやや緩めに設定
      const maxBlockers = task.fixedSlot ? 5 : 3
      if (blockerHardBlock || blockerRecords.size === 0 || blockerRecords.size > maxBlockers) continue

      // スナップショットを保存してから状態を変更
      const saved = saveState(state, placementMap)
      const blockerList = [...blockerRecords]

      // ブロッカーを除去
      for (const rec of blockerList) {
        removeEntries(rec.task, state, rec.entries)
        for (const e of rec.entries) {
          placementMap.delete(cellKey(e.day, e.period, e.classId))
        }
      }

      // タスク配置チェック
      const canNow = task.isConsecutive
        ? canPlaceTask(task, state, day, period) && canPlaceTask(task, state, day, (period + 1) as Period)
        : canPlaceTask(task, state, day, period)

      if (canNow) {
        const ourEntries = placeTask(task, state, day, period)
        const ourRecord: PlacementRecord = { task, entries: ourEntries, day, startPeriod: period }
        for (const e of ourEntries) {
          placementMap.set(cellKey(e.day, e.period, e.classId), ourRecord)
        }

        // ブロッカーを再帰的に再配置（循環防止: 自タスク + 兄弟ブロッカーを除外）
        const newExcluded = new Set([...excludedTasks, task])
        for (const rec of blockerList) {
          newExcluded.add(rec.task)
        }

        let allRelocated = true
        for (const rec of blockerList) {
          // 固定スロットのブロッカーが別の固定タスクに追い出された場合、
          // 固定制約を一時的に解除して全スロットで再配置を試みる
          const originalFixedSlot = rec.task.fixedSlot
          if (originalFixedSlot) {
            rec.task.fixedSlot = undefined
          }
          const relocated = tryRelocateTask(rec.task, state, assignmentMap, maxTeacherPerDay, placementMap, maxDepth - 1, newExcluded, attempts)
          if (!relocated) {
            // 復元: fixedSlotを元に戻す
            if (originalFixedSlot) {
              rec.task.fixedSlot = originalFixedSlot
            }
            allRelocated = false
            break
          }
        }

        if (allRelocated) {
          return true // チェーン置換成功！
        }
      }

      // 失敗: スナップショットから完全復元
      loadState(state, placementMap, saved)
    }
  }

  return false
}

// ============================================================
// ロック済みエントリの事前配置（部分再生成用）
// ============================================================

/** 既存エントリをボード状態に事前配置する */
function prePlaceLockedEntries(
  lockedEntries: ScheduleEntry[],
  state: BoardState,
  assignmentMap: Map<string, Assignment>,
  subjectMap: Map<string, Subject>,
  teacherMap: Map<string, Teacher>,
): void {
  for (const entry of lockedEntries) {
    const assignment = assignmentMap.get(entry.assignmentId)
    if (!assignment) continue
    const subject = subjectMap.get(assignment.subjectId)

    state.classGrid.set(cellKey(entry.day, entry.period, entry.classId), entry.assignmentId)

    for (const teacherId of assignment.teacherIds) {
      const teacher = teacherMap.get(teacherId)
      if (!teacher) continue
      state.teacherGrid.set(cellKey(entry.day, entry.period, teacherId), entry.assignmentId)
      const tdKey = teacherDayKey(entry.day, teacherId)
      state.teacherDayCount.set(tdKey, (state.teacherDayCount.get(tdKey) ?? 0) + 1)
    }

    state.assignmentPlacedCount.set(
      entry.assignmentId,
      (state.assignmentPlacedCount.get(entry.assignmentId) ?? 0) + 1,
    )

    if (subject) {
      const cdsKey = classDaySubjectKey(entry.day, entry.classId, subject.id)
      state.classDaySubjectCount.set(cdsKey, (state.classDaySubjectCount.get(cdsKey) ?? 0) + 1)
    }

    state.entries.push({ ...entry })
  }
}

// ============================================================
// 配置提案の生成（未配置タスクに対する具体的な解決策）
// ============================================================

/** 未配置タスクに対して「何を変えれば配置できるか」を分析する */
function generatePlacementSuggestions(
  task: ScheduleTask,
  state: BoardState,
  assignmentMap: Map<string, Assignment>,
  subjectMap: Map<string, Subject>,
): string[] {
  const suggestions: string[] = []

  // 固定スロットタスクの場合、まず固定先のブロッカーを優先的に提案
  if (task.fixedSlot) {
    const fixedSuggestions = generateFixedSlotSuggestions(task, state, assignmentMap, subjectMap)
    suggestions.push(...fixedSuggestions)
    if (suggestions.length >= 3) return suggestions.slice(0, 3)
  }

  for (let ai = 0; ai < task.assignments.length; ai++) {
    const assignment = task.assignments[ai]
    const subject = task.subjects[ai]
    const teachers = task.teacherGroups[ai]

    const pc = state.assignmentPlacedCount.get(assignment.id) ?? 0
    if (pc >= assignment.weeklyCount) continue

    const analyses: { blockers: string[]; isFixedSlot: boolean }[] = []

    for (const day of DAYS) {
      const periodsToCheck = task.isConsecutive ? CONSECUTIVE_STARTS : PERIODS
      for (const period of periodsToCheck) {
        const checkPeriods: Period[] = task.isConsecutive
          ? [period, (period + 1) as Period]
          : [period]

        const blockers: string[] = []
        let hardBlocked = false

        for (const p of checkPeriods) {
          if (isExcludedPeriodForSubject(subject, p)) { hardBlocked = true; break }

          if (!isSlotFreeForClass(state, day, p, assignment.classId)) {
            const blockAid = state.classGrid.get(cellKey(day, p, assignment.classId))
            if (blockAid) {
              const blockA = assignmentMap.get(blockAid)
              const blockS = blockA ? subjectMap.get(blockA.subjectId) : null
              blockers.push(`${getClassLabel(assignment.classId)}の${DAY_LABELS[day]}${p}限（${blockS?.name ?? '授業'}）を移動`)
            }
          }

          for (const teacher of teachers) {
            if (!teacher.availableDays.includes(day)) {
              blockers.push(`${teacher.name}の${DAY_LABELS[day]}曜を勤務可能に変更`)
            } else if (teacher.excludedSlots.some((s: TimeSlot) => s.day === day && s.period === p)) {
              blockers.push(`${teacher.name}の${DAY_LABELS[day]}${p}限の除外を解除`)
            } else if (!isSlotFreeForTeacher(state, day, p, teacher.id)) {
              const blockAid = state.teacherGrid.get(cellKey(day, p, teacher.id))
              if (blockAid) {
                const blockA = assignmentMap.get(blockAid)
                const blockS = blockA ? subjectMap.get(blockA.subjectId) : null
                const classLabel = blockA ? getClassLabel(blockA.classId) : ''
                blockers.push(`${teacher.name}の${DAY_LABELS[day]}${p}限（${classLabel} ${blockS?.name ?? ''}）を移動`)
              }
            }
          }

          if (subject.noConsecutive && hasAdjacentSameSubject(state, day, p, assignment.classId, assignment.id)) {
            hardBlocked = true; break
          }
          if (subject.consecutivePairs === 0 || subject.spreadDays) {
            const cdsKey = classDaySubjectKey(day, assignment.classId, subject.id)
            if ((state.classDaySubjectCount.get(cdsKey) ?? 0) > 0) { hardBlocked = true; break }
          }
        }

        if (!hardBlocked && blockers.length > 0 && blockers.length <= 3) {
          analyses.push({ blockers: [...new Set(blockers)], isFixedSlot: false })
        }
      }
    }

    analyses.sort((a, b) => a.blockers.length - b.blockers.length)

    const seen = new Set<string>(suggestions)
    for (const analysis of analyses) {
      const text = analysis.blockers.join(' かつ ')
      if (!seen.has(text)) {
        seen.add(text)
        suggestions.push(text)
      }
      if (suggestions.length >= 3) break
    }
  }

  return suggestions.slice(0, 3)
}

/**
 * 固定スロットタスク専用の提案生成。
 * 固定先スロットで何がブロックしているかを具体的に分析し、
 * そのブロッカーの移動先候補も含めて提案する。
 */
function generateFixedSlotSuggestions(
  task: ScheduleTask,
  state: BoardState,
  assignmentMap: Map<string, Assignment>,
  subjectMap: Map<string, Subject>,
): string[] {
  if (!task.fixedSlot) return []

  const { day, period } = task.fixedSlot
  const dayLabel = DAY_LABELS[day]
  const suggestions: string[] = []
  const checkPeriods: Period[] = task.isConsecutive
    ? [period, (period + 1) as Period]
    : [period]

  for (let ai = 0; ai < task.assignments.length; ai++) {
    const assignment = task.assignments[ai]
    const teachers = task.teacherGroups[ai]

    for (const p of checkPeriods) {
      // クラス競合: 固定先にある別の授業を特定
      if (!isSlotFreeForClass(state, day, p, assignment.classId)) {
        const blockAid = state.classGrid.get(cellKey(day, p, assignment.classId))
        if (blockAid) {
          const blockA = assignmentMap.get(blockAid)
          const blockS = blockA ? subjectMap.get(blockA.subjectId) : null
          const subjectName = blockS?.name ?? '授業'

          // ブロッカーの移動先候補を探す
          const moveTarget = findMoveTargetForBlocker(blockAid, state, assignmentMap, subjectMap)
          if (moveTarget) {
            suggestions.push(
              `${getClassLabel(assignment.classId)}の${dayLabel}${p}限（${subjectName}）を${moveTarget}に移動`
            )
          } else {
            suggestions.push(
              `${getClassLabel(assignment.classId)}の${dayLabel}${p}限（${subjectName}）を移動`
            )
          }
        }
      }

      // 教員競合: 固定先で教員をブロックしている授業を特定
      for (const teacher of teachers) {
        if (!isSlotFreeForTeacher(state, day, p, teacher.id) && isTeacherAvailable(teacher, day, p)) {
          const blockAid = state.teacherGrid.get(cellKey(day, p, teacher.id))
          if (blockAid) {
            const blockA = assignmentMap.get(blockAid)
            const blockS = blockA ? subjectMap.get(blockA.subjectId) : null
            const classLabel = blockA ? getClassLabel(blockA.classId) : ''

            const moveTarget = findMoveTargetForBlocker(blockAid, state, assignmentMap, subjectMap)
            if (moveTarget) {
              suggestions.push(
                `${teacher.name}の${dayLabel}${p}限（${classLabel} ${blockS?.name ?? ''}）を${moveTarget}に移動`
              )
            } else {
              suggestions.push(
                `${teacher.name}の${dayLabel}${p}限（${classLabel} ${blockS?.name ?? ''}）を移動`
              )
            }
          }
        }
      }
    }
  }

  return suggestions
}

/**
 * ブロッカーの移動先候補を1つ探す。
 * ブロッカーが配置可能な別のスロットがあれば「火3限」のように返す。
 */
function findMoveTargetForBlocker(
  blockerAssignmentId: string,
  state: BoardState,
  assignmentMap: Map<string, Assignment>,
  subjectMap: Map<string, Subject>,
): string | null {
  const assignment = assignmentMap.get(blockerAssignmentId)
  if (!assignment) return null
  const subject = subjectMap.get(assignment.subjectId)
  if (!subject) return null

  // ブロッカーの全教員を取得（簡略版: assignmentから直接）
  // 注: ここではBoardState上の教員情報は使わず、割当の教員IDのみ使用
  for (const day of DAYS) {
    for (const period of PERIODS) {
      if (subject.excludedPeriods?.includes(period)) continue

      // クラスが空いているか
      if (!isSlotFreeForClass(state, day, period, assignment.classId)) continue

      // 同日同科目チェック
      const cdsKey = classDaySubjectKey(day, assignment.classId, subject.id)
      if ((state.classDaySubjectCount.get(cdsKey) ?? 0) > 0) continue

      const dayLabel = DAY_LABELS[day]
      return `${dayLabel}${period}限`
    }
  }

  return null
}

// ============================================================
// メイン: 貪欲配置 + ローカル修復スケジューラ（ジェネレータ）
// ============================================================

/** ジェネレータベースのスケジューラ。yield で進捗を返す。 */
export function* generateSchedule(
  teachers: Teacher[],
  subjects: Subject[],
  assignments: Assignment[],
  options?: SchedulerOptions,
  rooms?: Room[],
): Generator<SchedulerProgress, SchedulerResult, undefined> {
  const maxTeacherPerDay = options?.maxTeacherPeriodsPerDay ?? DEFAULT_MAX_TEACHER_PERIODS_PER_DAY
  const maxIter = options?.maxIterations ?? 200_000
  const maxRestarts = options?.maxRestarts ?? 10

  // マップ構築
  const teacherMap = new Map(teachers.map((t) => [t.id, t]))
  const subjectMap = new Map(subjects.map((s) => [s.id, s]))
  const assignmentMap = new Map(assignments.map((a) => [a.id, a]))
  const roomMap = new Map((rooms ?? []).map((r) => [r.id, r]))

  // ロック済みエントリの処理（部分再生成用）
  const lockedEntries = options?.lockedEntries ?? []
  let effectiveAssignments = assignments

  if (lockedEntries.length > 0) {
    // ロック済みエントリから各割当の配置済みコマ数をカウント
    const lockedCountByAssignment = new Map<string, number>()
    for (const entry of lockedEntries) {
      lockedCountByAssignment.set(
        entry.assignmentId,
        (lockedCountByAssignment.get(entry.assignmentId) ?? 0) + 1,
      )
    }

    // weeklyCount を減算し、配置済みの fixedSlots を除外
    effectiveAssignments = assignments
      .map((a) => {
        const lockedCount = lockedCountByAssignment.get(a.id) ?? 0
        if (lockedCount <= 0) return a
        const remainingWeekly = Math.max(0, a.weeklyCount - lockedCount)
        const lockedSlots = lockedEntries.filter((e) => e.assignmentId === a.id)
        const remainingFixed = (a.fixedSlots ?? []).filter(
          (fs) => !lockedSlots.some((le) => le.day === fs.day && le.period === fs.period),
        )
        return {
          ...a,
          weeklyCount: remainingWeekly,
          fixedSlots: remainingFixed.length > 0 ? remainingFixed : undefined,
        }
      })
      .filter((a) => a.weeklyCount > 0)
  }

  // タスク生成（ロック済み分を除外した残りのみ）
  const allTasks = buildTasks(effectiveAssignments, subjectMap, teacherMap, roomMap)
  const totalTasks = allTasks.length

  if (totalTasks === 0) {
    return {
      entries: [],
      score: 0,
      isComplete: true,
      unplacedTasks: [],
    }
  }

  // パス数を決定: maxIterations から換算（各パスは O(totalTasks^2) 程度の仕事量）
  const workPerPass = Math.max(totalTasks * 2, 10)
  const totalPasses = Math.min(
    3000,
    Math.max(1 + maxRestarts, Math.floor(maxIter / workPerPass)),
  )

  // 固定/非固定タスクを分離
  const fixedTasks = allTasks.filter((t) => t.fixedSlot)
  const nonFixedTasks = allTasks.filter((t) => !t.fixedSlot)

  let bestResult: SchedulerResult = {
    entries: [],
    score: -1,
    isComplete: false,
    unplacedTasks: [],
  }

  // 前パスで未配置だったタスクを追跡（優先リスタート用）
  let previousUnplacedTasks: ScheduleTask[] = []

  // 実際のスロット数に基づくタスク優先度を事前計算
  // （静的な優先度だけでなく、実際の利用可能スロット数も考慮）
  const taskAvailability = new Map<ScheduleTask, number>()
  {
    const tempState = createEmptyState()
    if (lockedEntries.length > 0) {
      prePlaceLockedEntries(lockedEntries, tempState, assignmentMap, subjectMap, teacherMap)
    }
    for (const task of allTasks) {
      if (task.fixedSlot) {
        taskAvailability.set(task, 1) // 固定タスクは候補1
      } else {
        const candidates = getCandidateSlots(task, tempState)
        taskAvailability.set(task, candidates.length)
      }
    }
  }

  // 実際のスロット数に基づいて全タスクの優先度を補正
  for (const task of allTasks) {
    const avail = taskAvailability.get(task) ?? 30
    if (avail <= 3) {
      task.priority -= 50 // 候補が非常に少ないタスクを最優先
    } else if (avail <= 8) {
      task.priority -= 20
    }
  }
  allTasks.sort((a, b) => a.priority - b.priority)

  // 教科カテゴリで非固定タスクを分類: 農業 → 家庭科 → その他
  // 全リスタート戦略で この順序を保証する
  const agricultureTasks: ScheduleTask[] = []
  const homeEcTasks: ScheduleTask[] = []
  const otherCategoryTasks: ScheduleTask[] = []
  for (const task of nonFixedTasks) {
    const categories = task.subjects.map((s) => s.category)
    if (categories.includes('農業')) {
      agricultureTasks.push(task)
    } else if (categories.includes('家庭科')) {
      homeEcTasks.push(task)
    } else {
      otherCategoryTasks.push(task)
    }
  }

  /**
   * 教科カテゴリ順序を保証してタスク配列を構築する。
   * 各カテゴリ内の順序は orderFn で制御する。
   */
  function buildCategoryOrderedTasks(
    orderFn: (tasks: ScheduleTask[]) => ScheduleTask[],
  ): ScheduleTask[] {
    return [
      ...fixedTasks,
      ...orderFn(agricultureTasks),
      ...orderFn(homeEcTasks),
      ...orderFn(otherCategoryTasks),
    ]
  }

  // クラスごとのタスク分類（クラスベース順序戦略用）
  const tasksByClass = new Map<string, ScheduleTask[]>()
  for (const task of nonFixedTasks) {
    const classId = task.assignments[0]?.classId ?? ''
    if (!tasksByClass.has(classId)) tasksByClass.set(classId, [])
    tasksByClass.get(classId)!.push(task)
  }

  // 全体の時間制限（15秒）- 多くのパスを素早く回す方が解の質が上がる
  const schedulerStartTime = Date.now()
  const MAX_SCHEDULER_MS = 15_000

  for (let pass = 0; pass < totalPasses; pass++) {
    // 完全解が見つかっていれば終了
    if (bestResult.isComplete) break

    // 全体の時間制限チェック
    if (Date.now() - schedulerStartTime > MAX_SCHEDULER_MS) break

    // ボード状態を初期化
    const state = createEmptyState()
    const placementMap = new Map<string, PlacementRecord>()

    // ロック済みエントリを事前配置
    if (lockedEntries.length > 0) {
      prePlaceLockedEntries(lockedEntries, state, assignmentMap, subjectMap, teacherMap)
    }

    // --- 多様なリスタート戦略 ---
    // 全戦略で配置順序を保証: 固定 → 農業 → 家庭科 → その他
    let tasks: ScheduleTask[]
    const strategy = pass % 7 // 7種類の戦略をローテーション

    if (pass === 0) {
      // 初回: 教科カテゴリ順 × 静的優先度順（制約が厳しいものから）
      tasks = buildCategoryOrderedTasks((t) => [...t].sort((a, b) => a.priority - b.priority))
    } else if (strategy === 1 && previousUnplacedTasks.length > 0) {
      // 前パスの未配置タスクを最優先で配置し、残りをシャッフル
      // ただし教科カテゴリ順は維持: 未配置の農業→未配置の家庭科→未配置のその他→残り
      const unplacedSet = new Set(previousUnplacedTasks)
      const unplacedAgri = previousUnplacedTasks.filter((t) => t.subjects.some((s) => s.category === '農業'))
      const unplacedHome = previousUnplacedTasks.filter((t) => !t.subjects.some((s) => s.category === '農業') && t.subjects.some((s) => s.category === '家庭科'))
      const unplacedOther = previousUnplacedTasks.filter((t) => !t.subjects.some((s) => s.category === '農業') && !t.subjects.some((s) => s.category === '家庭科'))
      const remainAgri = agricultureTasks.filter((t) => !unplacedSet.has(t))
      const remainHome = homeEcTasks.filter((t) => !unplacedSet.has(t))
      const remainOther = otherCategoryTasks.filter((t) => !unplacedSet.has(t))
      tasks = [
        ...fixedTasks,
        ...unplacedAgri, ...shuffleArray(remainAgri),
        ...unplacedHome, ...shuffleArray(remainHome),
        ...unplacedOther, ...shuffleArray(remainOther),
      ]
    } else if (strategy === 2) {
      // クラスベース順序: 各カテゴリ内でクラスごとにまとめて配置
      tasks = buildCategoryOrderedTasks((catTasks) => {
        const byClass = new Map<string, ScheduleTask[]>()
        for (const t of catTasks) {
          const cid = t.assignments[0]?.classId ?? ''
          if (!byClass.has(cid)) byClass.set(cid, [])
          byClass.get(cid)!.push(t)
        }
        const result: ScheduleTask[] = []
        for (const cid of shuffleArray([...byClass.keys()])) {
          result.push(...shuffleArray(byClass.get(cid)!))
        }
        return result
      })
    } else if (strategy === 3) {
      // 逆優先度順（各カテゴリ内で）: 制約の緩いタスクから配置
      tasks = buildCategoryOrderedTasks((t) => [...t].sort((a, b) => b.priority - a.priority))
    } else if (strategy === 4) {
      // 実際の候補数順（動的MRV風）: 各カテゴリ内で候補が少ないものから
      tasks = buildCategoryOrderedTasks((t) => [...t].sort((a, b) => {
        const aAvail = taskAvailability.get(a) ?? 30
        const bAvail = taskAvailability.get(b) ?? 30
        return aAvail - bAvail
      }))
    } else if (strategy === 5 && previousUnplacedTasks.length > 0) {
      // 未配置タスクとその関連タスクを最優先（カテゴリ順維持）
      const unplacedSet = new Set(previousUnplacedTasks)
      const relatedTeacherIds = new Set<string>()
      const relatedClassIds = new Set<string>()
      for (const t of previousUnplacedTasks) {
        for (const a of t.assignments) relatedClassIds.add(a.classId)
        for (const tg of t.teacherGroups) {
          for (const teacher of tg) relatedTeacherIds.add(teacher.id)
        }
      }
      // 各カテゴリ内で「未配置→関連→その他」の順
      tasks = buildCategoryOrderedTasks((catTasks) => {
        const unplaced: ScheduleTask[] = []
        const related: ScheduleTask[] = []
        const rest: ScheduleTask[] = []
        for (const t of catTasks) {
          if (unplacedSet.has(t)) { unplaced.push(t); continue }
          let isRelated = false
          for (const a of t.assignments) {
            if (relatedClassIds.has(a.classId)) { isRelated = true; break }
          }
          if (!isRelated) {
            for (const tg of t.teacherGroups) {
              for (const teacher of tg) {
                if (relatedTeacherIds.has(teacher.id)) { isRelated = true; break }
              }
              if (isRelated) break
            }
          }
          if (isRelated) related.push(t)
          else rest.push(t)
        }
        return [...unplaced, ...shuffleArray(related), ...shuffleArray(rest)]
      })
    } else {
      // デフォルト: 教科カテゴリ順 × シャッフル
      tasks = buildCategoryOrderedTasks((t) => shuffleArray([...t]))
    }

    // ランダム性の制御: パスによって上位N件から選択
    const randomTopK = pass === 0 ? 1 : (strategy === 0 ? 1 : 3)

    // MRV方式は2回目以降で使用（初回は優先度順で安定した解を得る）
    const useMRV = pass > 0

    // フォワードチェッキングとLCVは少数のパスで使用（計算コスト抑制）
    // タスク数が多い場合はさらに制限（50超で無効化）
    const isSmallProblem = totalTasks <= 50
    const useForwardCheck = isSmallProblem && pass > 0 && (strategy === 4)
    const useLCV = isSmallProblem && pass > 0 && (strategy === 2)

    // フェーズ0: 固定スロットの事前確保（チェーン置換付き）
    // 固定タスクを制約の厳しい順に配置し、ブロッカーを積極的に排除する
    const fixedUnplaced = preReserveFixedSlots(fixedTasks, state, assignmentMap, maxTeacherPerDay, placementMap)
    // 既に配置された固定タスクを除外
    const placedFixedSet = new Set(fixedTasks.filter((t) => !fixedUnplaced.includes(t)))
    const remainingTasks = tasks.filter((t) => !placedFixedSet.has(t))

    // フェーズ1: 貪欲配置（フォワードチェッキング・LCV付き）
    const unplaced1 = greedyPlace(remainingTasks, state, maxTeacherPerDay, useMRV, placementMap, randomTopK, useForwardCheck, useLCV)

    // フェーズ1.5: 未配置の固定タスクを強制配置（非固定タスクを排除）
    // 固定タスクは絶対配置すべきなので、固定スロットを占拠する非固定タスクを強制排除
    const unplacedFixed = unplaced1.filter((t) => t.fixedSlot)
    const unplacedNonFixed = unplaced1.filter((t) => !t.fixedSlot)
    const forcedUnplacedFixed: ScheduleTask[] = []

    for (const task of unplacedFixed) {
      const result = forceFixedTaskPlacement(task, state, placementMap)
      if (result.evictedTasks.length > 0) {
        // 排除されたタスクを未配置リストに追加（配置成功・失敗に関わらず再配置に回す）
        unplacedNonFixed.push(...result.evictedTasks)
      }
      if (!result.success) {
        // 固定タスクの配置に失敗
        forcedUnplacedFixed.push(task)
      }
    }

    const unplacedAfterForce = [...forcedUnplacedFixed, ...unplacedNonFixed]

    // フェーズ2: 未配置タスクを再度MRVで配置試行（排除されたタスクも含む）
    const unplaced2 = greedyPlace(unplacedAfterForce, state, maxTeacherPerDay, true, placementMap, 1, false, false)

    // フェーズ3: ローカル修復（チェーン置換）を複数ラウンド実行
    let repairInput = unplaced2
    const MAX_REPAIR_ROUNDS = 3
    for (let round = 0; round < MAX_REPAIR_ROUNDS && repairInput.length > 0; round++) {
      const result = repairPhase(repairInput, state, assignmentMap, maxTeacherPerDay, placementMap)
      if (result.length === repairInput.length) break // 改善なし → 打ち切り
      repairInput = result
    }
    const finalUnplaced = repairInput

    // スコア計算
    const score = calculateScore(
      state.entries, finalUnplaced, totalTasks,
      subjectMap, assignmentMap, teacherMap, maxTeacherPerDay,
    )

    // ベスト解の更新（配置数優先、同数ならスコア比較）
    const placedCount = state.entries.filter((e) => !e.isConsecutiveSecond).length
    const bestPlacedCount = bestResult.entries.filter((e) => !e.isConsecutiveSecond).length

    // 未配置タスクを次パス用に記録
    previousUnplacedTasks = finalUnplaced

    if (placedCount > bestPlacedCount || (placedCount === bestPlacedCount && score > bestResult.score)) {
      bestResult = {
        entries: [...state.entries],
        score,
        isComplete: finalUnplaced.length === 0,
        unplacedTasks: finalUnplaced.flatMap((t) => {
          const diagnosed = diagnoseUnplaced(t, state)
          const sug = generatePlacementSuggestions(t, state, assignmentMap, subjectMap)
          return diagnosed.map((ut) => ({ ...ut, suggestions: sug.length > 0 ? sug : undefined }))
        }),
      }
    }

    // 進捗を定期的に yield（5パスごと or 最終パス）
    if (pass % 5 === 0 || pass === totalPasses - 1) {
      yield {
        placed: bestResult.entries.filter((e) => !e.isConsecutiveSecond).length,
        total: totalTasks,
        bestScore: bestResult.score,
        iterations: pass + 1,
        restarts: pass,
      }
    }
  }

  // 結果検証: weeklyCount を超過したエントリを除去（安全策）
  bestResult.entries = validateAndFixEntries(bestResult.entries, assignmentMap)

  // 最終進捗
  yield {
    placed: bestResult.entries.filter((e) => !e.isConsecutiveSecond).length,
    total: totalTasks,
    bestScore: bestResult.score,
    iterations: totalPasses,
    restarts: totalPasses - 1,
  }

  return bestResult
}

/**
 * 各割当の weeklyCount を超過したエントリを除去する。
 * スケジューラ内部のバグで超過が発生した場合の安全策。
 */
function validateAndFixEntries(
  entries: ScheduleEntry[],
  assignmentMap: Map<string, Assignment>,
): ScheduleEntry[] {
  const countByAssignment = new Map<string, number>()
  const validEntries: ScheduleEntry[] = []

  for (const entry of entries) {
    const assignment = assignmentMap.get(entry.assignmentId)
    if (!assignment) {
      validEntries.push(entry)
      continue
    }

    const current = countByAssignment.get(entry.assignmentId) ?? 0
    if (current < assignment.weeklyCount) {
      countByAssignment.set(entry.assignmentId, current + 1)
      validEntries.push(entry)
    }
    // weeklyCount を超えたエントリは静かに除去
  }

  return validEntries
}

// ============================================================
// 非同期ラッパー（UI向け）
// ============================================================

/**
 * スケジューラを非同期で実行し、コールバックで進捗を通知する。
 * メインスレッドをブロックしないよう、一定間隔で制御を返す。
 */
export async function runScheduler(
  teachers: Teacher[],
  subjects: Subject[],
  assignments: Assignment[],
  onProgress?: (progress: SchedulerProgress) => void,
): Promise<SchedulerResult> {
  const gen = generateSchedule(teachers, subjects, assignments)
  let result = gen.next()

  while (!result.done) {
    if (onProgress) {
      onProgress(result.value as SchedulerProgress)
    }
    // メインスレッドに制御を返す
    await new Promise((resolve) => setTimeout(resolve, 0))
    result = gen.next()
  }

  return result.value as SchedulerResult
}
