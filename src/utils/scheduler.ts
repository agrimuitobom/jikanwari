import type {
  Teacher,
  Subject,
  Assignment,
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
): ScheduleTask[] {
  const tasks: ScheduleTask[] = []
  let taskIndex = 0

  // 同時開講グループごとに割当を集約
  const simultaneousGroups = new Map<string, Assignment[]>()
  const standaloneAssignments: Assignment[] = []

  for (const assignment of assignments) {
    if (assignment.simultaneousGroupId) {
      const group = simultaneousGroups.get(assignment.simultaneousGroupId)
      if (group) {
        group.push(assignment)
      } else {
        simultaneousGroups.set(assignment.simultaneousGroupId, [assignment])
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

    const consecutivePairs = subject.consecutivePairs
    const consecutiveSlots = consecutivePairs * 2
    const singleSlots = assignment.weeklyCount - consecutiveSlots
    const fixedSlots = assignment.fixedSlots ?? []
    let fixedIdx = 0

    // 連続ペアタスクを生成
    for (let i = 0; i < consecutivePairs; i++) {
      const fixedSlot = fixedIdx < fixedSlots.length
        ? { day: fixedSlots[fixedIdx].day, period: fixedSlots[fixedIdx].period }
        : undefined
      if (fixedSlot) fixedIdx++
      const priority = fixedSlot ? -1000 : calculatePriority(subject, teachers)

      tasks.push({
        assignments: [assignment],
        subjects: [subject],
        teacherGroups: [teachers],
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
      if (subject.consecutivePairs > maxConsecutivePairs) maxConsecutivePairs = subject.consecutivePairs
      weeklyCount = Math.max(weeklyCount, assignment.weeklyCount)
    }
    if (!valid) continue

    const consecutiveSlots = maxConsecutivePairs * 2
    const singleSlots = weeklyCount - consecutiveSlots
    // 同時開講グループの固定スロットは最初のassignmentから取得
    const groupFixedSlots = groupAssignments[0]?.fixedSlots ?? []
    let fixedIdx = 0

    // 連続ペアタスク
    for (let i = 0; i < maxConsecutivePairs; i++) {
      const fixedSlot = fixedIdx < groupFixedSlots.length
        ? { day: groupFixedSlots[fixedIdx].day, period: groupFixedSlots[fixedIdx].period }
        : undefined
      if (fixedSlot) fixedIdx++

      if (fixedSlot) {
        tasks.push({
          assignments: groupAssignments,
          subjects: groupSubjects,
          teacherGroups: groupTeacherGroups,
          isConsecutive: true,
          priority: -1500,
          simultaneousGroupId: groupId,
          fixedSlot,
          originalIndex: taskIndex++,
        })
      } else {
        let priority = -200
        const allTeachers = getAllTeachersFlat({ assignments: groupAssignments, subjects: groupSubjects, teacherGroups: groupTeacherGroups, isConsecutive: true, priority: 0, originalIndex: 0 })
        priority -= allTeachers.length * 20
        priority -= 100 // 連続タスクボーナス
        priority -= groupAssignments.length * 30

        const minAvailDays = Math.min(...allTeachers.map((t) => t.availableDays.length))
        priority -= (5 - minAvailDays) * 10

        tasks.push({
          assignments: groupAssignments,
          subjects: groupSubjects,
          teacherGroups: groupTeacherGroups,
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
          isConsecutive: false,
          priority: -1500,
          simultaneousGroupId: groupId,
          fixedSlot,
          originalIndex: taskIndex++,
        })
      } else {
        let priority = -200
        const allTeachers = getAllTeachersFlat({ assignments: groupAssignments, subjects: groupSubjects, teacherGroups: groupTeacherGroups, isConsecutive: false, priority: 0, originalIndex: 0 })
        priority -= allTeachers.length * 20
        priority -= groupAssignments.length * 30

        const minAvailDays = Math.min(...allTeachers.map((t) => t.availableDays.length))
        priority -= (5 - minAvailDays) * 10

        tasks.push({
          assignments: groupAssignments,
          subjects: groupSubjects,
          teacherGroups: groupTeacherGroups,
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

function calculatePriority(subject: Subject, teachers: Teacher[]): number {
  let priority = 0

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

    if (!canPlaceSingle(assignment, subject, teachers, state, day, period)) {
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

// ============================================================
// MRV（最小残余値）ヒューリスティック
// ============================================================

/**
 * 未配置タスクの中から、候補スロット数が最も少ないタスクのインデックスを返す。
 * 固定スロットのタスクは最優先で返す。
 */
function selectNextTaskMRV(
  remainingTasks: ScheduleTask[],
  state: BoardState,
): { index: number; candidates: Slot[] } {
  let bestIndex = 0
  let bestCandidates: Slot[] | null = null
  let bestCount = Infinity

  for (let i = 0; i < remainingTasks.length; i++) {
    const task = remainingTasks[i]

    // 固定スロットタスクは最優先
    if (task.fixedSlot) {
      const candidates = getCandidateSlots(task, state)
      return { index: i, candidates }
    }

    const candidates = getCandidateSlots(task, state)
    if (candidates.length < bestCount) {
      bestCount = candidates.length
      bestIndex = i
      bestCandidates = candidates
      // 候補が0なら即座に返す（これ以上良い選択はない）
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

  for (let i = 0; i < task.assignments.length; i++) {
    const assignment = task.assignments[i]
    const subject = task.subjects[i]
    const teachers = task.teacherGroups[i]
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
        state.teacherGrid.set(cellKey(day, p, teacher.id), assignment.id)
        // 教員日別コマ数を加算
        const tdKey = teacherDayKey(day, teacher.id)
        state.teacherDayCount.set(tdKey, (state.teacherDayCount.get(tdKey) ?? 0) + 1)
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
  for (const entry of entries) {
    state.classGrid.delete(cellKey(entry.day, entry.period, entry.classId))

    // エントリのassignmentIdに対応するteachersを見つける
    const assignmentIdx = task.assignments.findIndex((a) => a.id === entry.assignmentId)
    const teachers = assignmentIdx >= 0 ? task.teacherGroups[assignmentIdx] : getAllTeachersFlat(task)
    const subject = assignmentIdx >= 0 ? task.subjects[assignmentIdx] : task.subjects[0]

    for (const teacher of teachers) {
      state.teacherGrid.delete(cellKey(entry.day, entry.period, teacher.id))
      // 教員日別コマ数を減算
      const tdKey = teacherDayKey(entry.day, teacher.id)
      const current = state.teacherDayCount.get(tdKey) ?? 0
      if (current <= 1) {
        state.teacherDayCount.delete(tdKey)
      } else {
        state.teacherDayCount.set(tdKey, current - 1)
      }
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
function greedyPlace(
  tasks: ScheduleTask[],
  state: BoardState,
  maxTeacherPerDay: number,
  useMRV: boolean,
  placementMap: Map<string, PlacementRecord>,
  randomTopK: number = 1,
): ScheduleTask[] {
  const unplaced: ScheduleTask[] = []

  if (useMRV && tasks.length > 1) {
    const remaining = [...tasks]
    while (remaining.length > 0) {
      const { index, candidates } = selectNextTaskMRV(remaining, state)
      const task = remaining.splice(index, 1)[0]

      if (candidates.length > 0) {
        // スコア順にソートし、上位からランダムに選択
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
    if (tryRelocateTask(task, state, assignmentMap, maxTeacherPerDay, placementMap, 2, new Set())) {
      // 修復成功
    } else {
      stillUnplaced.push(task)
    }
  }

  return stillUnplaced
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
 */
function tryRelocateTask(
  task: ScheduleTask,
  state: BoardState,
  assignmentMap: Map<string, Assignment>,
  maxTeacherPerDay: number,
  placementMap: Map<string, PlacementRecord>,
  maxDepth: number,
  excludedTasks: Set<ScheduleTask>,
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

  // 深度0なら直接配置のみ
  if (maxDepth <= 0) return false

  // 各スロットでチェーン置換を試みる
  const days = shuffleArray([...DAYS])
  const periods = task.isConsecutive ? shuffleArray([...CONSECUTIVE_STARTS]) : shuffleArray([...PERIODS])

  for (const day of days) {
    for (const period of periods) {
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
              if (rec.task.fixedSlot || excludedTasks.has(rec.task)) {
                blockerHardBlock = true; break
              }
              blockerRecords.add(rec)
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
                    if (rec.task.fixedSlot || excludedTasks.has(rec.task)) {
                      blockerHardBlock = true; break
                    }
                    blockerRecords.add(rec)
                  }
                }
              }
            }
          }
          if (blockerHardBlock) break
        }
      }

      if (blockerHardBlock || blockerRecords.size === 0 || blockerRecords.size > 3) continue

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
          if (!tryRelocateTask(rec.task, state, assignmentMap, maxTeacherPerDay, placementMap, maxDepth - 1, newExcluded)) {
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

  for (let ai = 0; ai < task.assignments.length; ai++) {
    const assignment = task.assignments[ai]
    const subject = task.subjects[ai]
    const teachers = task.teacherGroups[ai]

    const pc = state.assignmentPlacedCount.get(assignment.id) ?? 0
    if (pc >= assignment.weeklyCount) continue

    const analyses: { blockers: string[] }[] = []

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
          analyses.push({ blockers: [...new Set(blockers)] })
        }
      }
    }

    analyses.sort((a, b) => a.blockers.length - b.blockers.length)

    const seen = new Set<string>()
    for (const analysis of analyses) {
      const text = analysis.blockers.join(' かつ ')
      if (!seen.has(text)) {
        seen.add(text)
        suggestions.push(text)
      }
      if (suggestions.length >= 3) break
    }
  }

  return suggestions
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
): Generator<SchedulerProgress, SchedulerResult, undefined> {
  const maxTeacherPerDay = options?.maxTeacherPeriodsPerDay ?? DEFAULT_MAX_TEACHER_PERIODS_PER_DAY
  const maxIter = options?.maxIterations ?? 200_000
  const maxRestarts = options?.maxRestarts ?? 10

  // マップ構築
  const teacherMap = new Map(teachers.map((t) => [t.id, t]))
  const subjectMap = new Map(subjects.map((s) => [s.id, s]))
  const assignmentMap = new Map(assignments.map((a) => [a.id, a]))

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
  const allTasks = buildTasks(effectiveAssignments, subjectMap, teacherMap)
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

  for (let pass = 0; pass < totalPasses; pass++) {
    // 完全解が見つかっていれば終了
    if (bestResult.isComplete) break

    // ボード状態を初期化
    const state = createEmptyState()
    const placementMap = new Map<string, PlacementRecord>()

    // ロック済みエントリを事前配置
    if (lockedEntries.length > 0) {
      prePlaceLockedEntries(lockedEntries, state, assignmentMap, subjectMap, teacherMap)
    }

    // タスク順序の決定
    let tasks: ScheduleTask[]
    if (pass === 0) {
      // 初回: 優先度順（制約が厳しいものから）
      tasks = [...allTasks]
    } else if (pass % 3 === 1 && previousUnplacedTasks.length > 0) {
      // 3パスに1回: 前パスの未配置タスクを最優先で配置し、残りをシャッフル
      const unplacedSet = new Set(previousUnplacedTasks)
      const otherNonFixed = nonFixedTasks.filter((t) => !unplacedSet.has(t))
      tasks = [...fixedTasks, ...previousUnplacedTasks, ...shuffleArray(otherNonFixed)]
    } else {
      // リスタート: 固定スロットを先頭に保ち、残りをシャッフル
      tasks = [...fixedTasks, ...shuffleArray(nonFixedTasks)]
    }

    // ランダム性の制御: パスによって上位N件から選択
    const randomTopK = pass === 0 ? 1 : (pass % 3 === 0 ? 1 : 3)

    // MRV方式は2回目以降で使用（初回は優先度順で安定した解を得る）
    const useMRV = pass > 0

    // フェーズ1: 貪欲配置
    const unplaced1 = greedyPlace(tasks, state, maxTeacherPerDay, useMRV, placementMap, randomTopK)

    // フェーズ2: 未配置タスクを再度MRVで配置試行（他のタスクのスキップで空きができた可能性）
    const unplaced2 = greedyPlace(unplaced1, state, maxTeacherPerDay, true, placementMap, 1)

    // フェーズ3: ローカル修復（チェーン置換）を複数ラウンド実行
    // 1回の修復成功で空きが連鎖的に増え、次のラウンドで別のタスクも配置可能になる
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

    // 進捗を定期的に yield
    if (pass % 20 === 0 || pass === totalPasses - 1) {
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
