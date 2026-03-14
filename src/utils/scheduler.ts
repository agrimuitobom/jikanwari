import type {
  Teacher,
  Subject,
  Assignment,
  ScheduleEntry,
  DayOfWeek,
  Period,
  TimeSlot,
} from '../types'
import { DAYS, PERIODS } from './constants'

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
}

/** 配置状態の管理 */
interface BoardState {
  /** [day][period][classId] => assignmentId */
  classGrid: Map<string, string>
  /** [day][period][teacherId] => assignmentId */
  teacherGrid: Map<string, string>
  /** 配置済みエントリ */
  entries: ScheduleEntry[]
  /** 各 assignment の残り配置コマ数 */
  remainingCounts: Map<string, number>
  /** [day:classId:subjectId] => 配置数（同日同科目の重複検出用） */
  classDaySubjectCount: Map<string, number>
  /** [day:teacherId] => 配置コマ数（教員の日別負荷管理用） */
  teacherDayCount: Map<string, number>
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

// ============================================================
// タスク生成・優先度計算
// ============================================================

function buildTasks(
  assignments: Assignment[],
  subjectMap: Map<string, Subject>,
  teacherMap: Map<string, Teacher>,
): ScheduleTask[] {
  const tasks: ScheduleTask[] = []

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

    const slotsPerTask = subject.isConsecutive ? 2 : 1
    const taskCount = Math.ceil(assignment.weeklyCount / slotsPerTask)
    const fixedSlots = assignment.fixedSlots ?? []

    for (let i = 0; i < taskCount; i++) {
      const fixedSlot = i < fixedSlots.length
        ? { day: fixedSlots[i].day, period: fixedSlots[i].period }
        : undefined
      // 固定スロットは最優先（priority = -1000）
      const priority = fixedSlot ? -1000 : calculatePriority(subject, teachers)

      tasks.push({
        assignments: [assignment],
        subjects: [subject],
        teacherGroups: [teachers],
        isConsecutive: subject.isConsecutive,
        priority,
        fixedSlot,
      })
    }
  }

  // 同時開講グループのタスクを生成
  for (const [groupId, groupAssignments] of simultaneousGroups) {
    const groupSubjects: Subject[] = []
    const groupTeacherGroups: Teacher[][] = []
    let isConsecutive = false
    let weeklyCount = 0

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
      if (subject.isConsecutive) isConsecutive = true
      weeklyCount = Math.max(weeklyCount, assignment.weeklyCount)
    }
    if (!valid) continue

    const slotsPerTask = isConsecutive ? 2 : 1
    const taskCount = Math.ceil(weeklyCount / slotsPerTask)
    // 同時開講グループの固定スロットは最初のassignmentから取得
    const groupFixedSlots = groupAssignments[0]?.fixedSlots ?? []

    for (let i = 0; i < taskCount; i++) {
      const fixedSlot = i < groupFixedSlots.length
        ? { day: groupFixedSlots[i].day, period: groupFixedSlots[i].period }
        : undefined

      if (fixedSlot) {
        // 固定スロットの同時開講は最最優先
        tasks.push({
          assignments: groupAssignments,
          subjects: groupSubjects,
          teacherGroups: groupTeacherGroups,
          isConsecutive,
          priority: -1500,
          simultaneousGroupId: groupId,
          fixedSlot,
        })
      } else {
        // 同時開講グループはより制約が厳しい（複数クラス＋複数教員を同時に配置）
        let priority = -200 // 最優先

        // 各割当の教員の制約を集約
        const allTeachers = getAllTeachersFlat({ assignments: groupAssignments, subjects: groupSubjects, teacherGroups: groupTeacherGroups, isConsecutive, priority: 0 })
        priority -= allTeachers.length * 20
        if (isConsecutive) priority -= 100
        priority -= groupAssignments.length * 30 // クラス数が多いほど制約が厳しい

        const minAvailDays = Math.min(...allTeachers.map((t) => t.availableDays.length))
        priority -= (5 - minAvailDays) * 10

        tasks.push({
          assignments: groupAssignments,
          subjects: groupSubjects,
          teacherGroups: groupTeacherGroups,
          isConsecutive,
          priority,
          simultaneousGroupId: groupId,
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

  // 連続授業は配置先が限定される → 最優先
  if (subject.isConsecutive) priority -= 100

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

  // 科目の配置不可時限チェック
  if (isExcludedPeriodForSubject(subject, period)) return false

  // 連続配置禁止チェック（ハード制約）
  if (subject.noConsecutive) {
    if (hasAdjacentSameSubject(state, day, period, classId, assignment.id)) return false
  }

  // クラス重複チェック
  if (!isSlotFreeForClass(state, day, period, classId)) return false

  // 同日同科目禁止（連続授業を除く）: 同じクラスで同じ日に同じ科目は配置不可
  if (!subject.isConsecutive) {
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
// メイン: バックトラッキングスケジューラ（ジェネレータ）
// ============================================================

/** ジェネレータベースのスケジューラ。yield で進捗を返す。 */
export function* generateSchedule(
  teachers: Teacher[],
  subjects: Subject[],
  assignments: Assignment[],
  options?: SchedulerOptions,
): Generator<SchedulerProgress, SchedulerResult, undefined> {
  const maxTeacherPerDay = options?.maxTeacherPeriodsPerDay ?? DEFAULT_MAX_TEACHER_PERIODS_PER_DAY
  const maxIter = options?.maxIterations ?? 100_000
  // マップ構築
  const teacherMap = new Map(teachers.map((t) => [t.id, t]))
  const subjectMap = new Map(subjects.map((s) => [s.id, s]))
  const assignmentMap = new Map(assignments.map((a) => [a.id, a]))

  // タスク生成
  const allTasks = buildTasks(assignments, subjectMap, teacherMap)
  const totalTasks = allTasks.length

  if (totalTasks === 0) {
    return {
      entries: [],
      score: 0,
      isComplete: true,
      unplacedTasks: [],
    }
  }

  // ボード初期化
  const state: BoardState = {
    classGrid: new Map(),
    teacherGrid: new Map(),
    entries: [],
    remainingCounts: new Map(),
    classDaySubjectCount: new Map(),
    teacherDayCount: new Map(),
  }

  // ベスト解の追跡
  let bestResult: SchedulerResult = {
    entries: [],
    score: 0,
    isComplete: false,
    unplacedTasks: [],
  }
  let iterations = 0

  // 再帰バックトラッキング（スタックベース + yield対応のためイテレータ化）
  type StackFrame = {
    taskIndex: number
    candidateIndex: number
    placedEntries: ScheduleEntry[] | null
  }

  const stack: StackFrame[] = [{ taskIndex: 0, candidateIndex: 0, placedEntries: null }]
  // 各タスクの候補スロットをキャッシュ
  const candidateCache: (Slot[] | null)[] = new Array(totalTasks).fill(null)

  while (stack.length > 0) {
    iterations++

    // 反復上限チェック
    if (iterations >= maxIter) break

    // 進捗を定期的に yield
    if (iterations % 500 === 0) {
      yield {
        placed: state.entries.filter((e) => !e.isConsecutiveSecond).length,
        total: totalTasks,
        bestScore: bestResult.score,
        iterations,
      }
    }

    const frame = stack[stack.length - 1]

    // 全タスク配置完了 → 解を記録
    if (frame.taskIndex >= totalTasks) {
      const score = calculateScore(state.entries, [], totalTasks, subjectMap, assignmentMap, teacherMap, maxTeacherPerDay)
      if (score > bestResult.score) {
        bestResult = {
          entries: [...state.entries],
          score,
          isComplete: true,
          unplacedTasks: [],
        }
      }
      // 完全解が見つかったので終了
      stack.pop()
      break
    }

    const task = allTasks[frame.taskIndex]

    // このタスクの候補スロットを取得（初回のみ計算）
    if (candidateCache[frame.taskIndex] === null) {
      const raw = getCandidateSlots(task, state)
      // スコア順にソート
      raw.sort((a, b) => scoreCandidateSlot(task, b, state, maxTeacherPerDay) - scoreCandidateSlot(task, a, state, maxTeacherPerDay))
      candidateCache[frame.taskIndex] = raw
    }
    const candidates = candidateCache[frame.taskIndex]!

    // 前回配置したエントリをバックトラック解除
    if (frame.placedEntries !== null) {
      removeEntries(task, state, frame.placedEntries)
      frame.placedEntries = null
    }

    // 次の候補を試す
    if (frame.candidateIndex >= candidates.length) {
      // 全候補を試し終わった → バックトラック
      candidateCache[frame.taskIndex] = null

      // 配置できなかった場合でも、中間結果を評価
      const partialScore = calculateScore(
        state.entries,
        allTasks.slice(frame.taskIndex),
        totalTasks,
        subjectMap,
        assignmentMap,
        teacherMap,
        maxTeacherPerDay,
      )
      if (partialScore > bestResult.score) {
        const unplaced = allTasks.slice(frame.taskIndex).flatMap((t) =>
          diagnoseUnplaced(t, state),
        )
        bestResult = {
          entries: [...state.entries],
          score: partialScore,
          isComplete: false,
          unplacedTasks: unplaced,
        }
      }

      stack.pop()
      continue
    }

    const slot = candidates[frame.candidateIndex]
    frame.candidateIndex++

    // 配置を試みる（候補取得後に状態が変わっている可能性があるため再チェック）
    const canPlaceNow = task.isConsecutive
      ? canPlaceTask(task, state, slot.day, slot.period) &&
        canPlaceTask(task, state, slot.day, (slot.period + 1) as Period)
      : canPlaceTask(task, state, slot.day, slot.period)

    if (!canPlaceNow) continue

    // 配置実行
    const placed = placeTask(task, state, slot.day, slot.period)
    frame.placedEntries = placed

    // 次のタスクへ
    stack.push({ taskIndex: frame.taskIndex + 1, candidateIndex: 0, placedEntries: null })
  }

  // 最終進捗を yield
  yield {
    placed: bestResult.entries.filter((e) => !e.isConsecutiveSecond).length,
    total: totalTasks,
    bestScore: bestResult.score,
    iterations,
  }

  return bestResult
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
