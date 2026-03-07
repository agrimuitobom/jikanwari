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
  assignment: Assignment
  subject: Subject
  teachers: Teacher[]
  /** 連続授業か */
  isConsecutive: boolean
  /** タスクの優先度スコア（低いほど先に配置 = 制約が厳しい） */
  priority: number
}

/** 曜日×時限のスロット */
interface Slot {
  day: DayOfWeek
  period: Period
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

/** 推奨時限に合致しているかチェック */
function isInPreferredPeriod(subject: Subject, period: Period): boolean {
  if (!subject.preferredPeriods) return true
  return period >= subject.preferredPeriods.from && period <= subject.preferredPeriods.to
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

  for (const assignment of assignments) {
    const subject = subjectMap.get(assignment.subjectId)
    if (!subject) continue

    const teachers = assignment.teacherIds
      .map((id) => teacherMap.get(id))
      .filter((t): t is Teacher => t !== undefined)
    if (teachers.length === 0) continue

    // weeklyCount をタスク単位に分解
    // 連続授業の場合は2コマで1タスク
    const slotsPerTask = subject.isConsecutive ? 2 : 1
    const taskCount = Math.ceil(assignment.weeklyCount / slotsPerTask)

    for (let i = 0; i < taskCount; i++) {
      // 優先度計算（低い = 先に配置）
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

      tasks.push({
        assignment,
        subject,
        teachers,
        isConsecutive: subject.isConsecutive,
        priority,
      })
    }
  }

  // 制約が厳しい（priorityが低い）ものを先に
  tasks.sort((a, b) => a.priority - b.priority)
  return tasks
}

// ============================================================
// 候補スロット列挙
// ============================================================

function getCandidateSlots(
  task: ScheduleTask,
  state: BoardState,
): Slot[] {
  const candidates: Slot[] = []

  for (const day of DAYS) {
    if (task.isConsecutive) {
      // 連続授業: 1-2, 3-4, 5-6 のペアから候補を探す
      for (const startPeriod of CONSECUTIVE_STARTS) {
        const endPeriod = (startPeriod + 1) as Period
        if (canPlace(task, state, day, startPeriod) && canPlace(task, state, day, endPeriod)) {
          candidates.push({ day, period: startPeriod })
        }
      }
    } else {
      for (const period of PERIODS) {
        if (canPlace(task, state, day, period)) {
          candidates.push({ day, period })
        }
      }
    }
  }

  return candidates
}

/** 単一スロットに配置可能か（ハード制約チェック） */
function canPlace(
  task: ScheduleTask,
  state: BoardState,
  day: DayOfWeek,
  period: Period,
): boolean {
  const classId = task.assignment.classId

  // クラス重複チェック
  if (!isSlotFreeForClass(state, day, period, classId)) return false

  // 教員の空き・重複チェック（TT対応: 全教員を確認）
  for (const teacher of task.teachers) {
    if (!isTeacherAvailable(teacher, day, period)) return false
    if (!isSlotFreeForTeacher(state, day, period, teacher.id)) return false
  }

  return true
}

/** 候補スロットをスコア順にソート（高スコア優先） */
function scoreCandidateSlot(task: ScheduleTask, slot: Slot): number {
  let score = 0

  // 推奨時限に合致すれば加点
  if (task.subject.preferredPeriods) {
    if (isInPreferredPeriod(task.subject, slot.period)) {
      score += 10
    }
    if (task.isConsecutive) {
      const secondPeriod = (slot.period + 1) as Period
      if (isInPreferredPeriod(task.subject, secondPeriod)) {
        score += 10
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
  const classId = task.assignment.classId
  const periods: Period[] = task.isConsecutive
    ? [period, (period + 1) as Period]
    : [period]

  for (let i = 0; i < periods.length; i++) {
    const p = periods[i]
    const entry: ScheduleEntry = {
      id: `temp-${day}-${p}-${classId}`,
      day,
      period: p,
      classId,
      assignmentId: task.assignment.id,
      isConsecutiveSecond: i === 1 ? true : undefined,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    // グリッドに登録
    state.classGrid.set(cellKey(day, p, classId), task.assignment.id)
    for (const teacher of task.teachers) {
      state.teacherGrid.set(cellKey(day, p, teacher.id), task.assignment.id)
    }

    state.entries.push(entry)
    newEntries.push(entry)
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
    for (const teacher of task.teachers) {
      state.teacherGrid.delete(cellKey(entry.day, entry.period, teacher.id))
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
): number {
  // 基本スコア: 配置率（1000点満点）
  const placedTasks = totalTasks - tasks.length
  let score = (placedTasks / Math.max(totalTasks, 1)) * 1000

  // 推奨時限ボーナス（最大200点）
  let preferredHits = 0
  let preferredTotal = 0

  for (const entry of entries) {
    if (entry.isConsecutiveSecond) continue // ペアの1コマ目のみ評価
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

  return Math.round(score)
}

// ============================================================
// 未配置理由の詳細診断
// ============================================================

function diagnoseUnplaced(task: ScheduleTask, state: BoardState): UnplacedTask {
  const { assignment, teachers, isConsecutive } = task
  const reasons: string[] = []

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

  // 理由を具体的に構築
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

  return {
    assignmentId: assignment.id,
    classId: assignment.classId,
    subjectId: assignment.subjectId,
    reason: reasons.join('／'),
  }
}

// ============================================================
// メイン: バックトラッキングスケジューラ（ジェネレータ）
// ============================================================

/** ジェネレータベースのスケジューラ。yield で進捗を返す。 */
export function* generateSchedule(
  teachers: Teacher[],
  subjects: Subject[],
  assignments: Assignment[],
): Generator<SchedulerProgress, SchedulerResult, undefined> {
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
  }

  // ベスト解の追跡
  let bestResult: SchedulerResult = {
    entries: [],
    score: 0,
    isComplete: false,
    unplacedTasks: [],
  }
  let iterations = 0
  const MAX_ITERATIONS = 100_000

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
    if (iterations >= MAX_ITERATIONS) break

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
      const score = calculateScore(state.entries, [], totalTasks, subjectMap, assignmentMap)
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
      raw.sort((a, b) => scoreCandidateSlot(task, b) - scoreCandidateSlot(task, a))
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
      )
      if (partialScore > bestResult.score) {
        const unplaced = allTasks.slice(frame.taskIndex).map((t) =>
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
      ? canPlace(task, state, slot.day, slot.period) &&
        canPlace(task, state, slot.day, (slot.period + 1) as Period)
      : canPlace(task, state, slot.day, slot.period)

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
