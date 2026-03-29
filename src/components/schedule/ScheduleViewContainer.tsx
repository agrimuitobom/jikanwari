import { useState, useCallback, useRef, useMemo, useEffect } from 'react'
import type { DayOfWeek, Period, Teacher, Subject, Assignment, ScheduleEntry, TimeSlot } from '../../types'
import { CLASS_OPTIONS } from '../../utils/constants'
import type { ClassOption } from '../../utils/constants'
import { runSchedulerInWorker } from '../../utils/runSchedulerWorker'
import type { SchedulerProgress, SchedulerResult, UnplacedTask, SchedulerOptions } from '../../utils/scheduler'
import { useSchedules } from '../../hooks/useSchedules'
import { detectConstraintConflicts } from '../../utils/constraintChecker'
import type { ConstraintWarning } from '../../utils/constraintChecker'
import { ErrorAlert } from '../common/ErrorAlert'
import { TimetableGrid } from './TimetableGrid'
import type { ViewMode } from './TimetableGrid'
import { UnplacedSidebar } from './UnplacedSidebar'
import { ScheduleCompare } from './ScheduleCompare'
import { exportToExcel } from '../../utils/exportExcel'

// ============================================================
// Props
// ============================================================

export interface ScheduleViewContainerProps {
  teachers: Teacher[]
  subjects: Subject[]
  assignments: Assignment[]
  classOptions?: ClassOption[]
  schedulerOptions?: SchedulerOptions
}

// ============================================================
// 制約バリデーション
// ============================================================

function validateMove(
  entries: ScheduleEntry[],
  assignments: Assignment[],
  teachers: Teacher[],
  assignmentId: string,
  targetDay: DayOfWeek,
  targetPeriod: Period,
  excludeEntryId?: string,
): string | null {
  const assignment = assignments.find((a) => a.id === assignmentId)
  if (!assignment) return '割当データが見つかりません'

  const classId = assignment.classId

  // クラス重複チェック
  const classConflict = entries.find(
    (e) =>
      e.id !== excludeEntryId &&
      e.day === targetDay &&
      e.period === targetPeriod &&
      e.classId === classId,
  )
  if (classConflict) return 'このクラスは同じ時限に既に授業があります'

  // 教員重複・空きチェック
  const teacherMap = new Map(teachers.map((t) => [t.id, t]))
  for (const teacherId of assignment.teacherIds) {
    const teacher = teacherMap.get(teacherId)
    if (!teacher) continue

    // availableDays チェック
    if (!teacher.availableDays.includes(targetDay)) {
      return `${teacher.name} は ${targetDay} に勤務不可です`
    }

    // excludedSlots チェック
    if (teacher.excludedSlots.some((s: TimeSlot) => s.day === targetDay && s.period === targetPeriod)) {
      return `${teacher.name} はこのコマが担当不可です`
    }

    // 教員重複チェック
    const teacherConflict = entries.find((e) => {
      if (e.id === excludeEntryId) return false
      if (e.day !== targetDay || e.period !== targetPeriod) return false
      const a = assignments.find((a2) => a2.id === e.assignmentId)
      return a?.teacherIds.includes(teacherId)
    })
    if (teacherConflict) {
      return `${teacher.name} は同じ時限に既に別の授業があります`
    }
  }

  return null
}

// ============================================================
// CSV/Print エクスポート雛形
// ============================================================

function exportToCsv(
  entries: ScheduleEntry[],
  assignments: Assignment[],
  subjects: Subject[],
  teachers: Teacher[],
) {
  const subjectMap = new Map(subjects.map((s) => [s.id, s]))
  const assignmentMap = new Map(assignments.map((a) => [a.id, a]))
  const teacherMap = new Map(teachers.map((t) => [t.id, t]))

  const header = '曜日,時限,クラス,科目,教員\n'
  const rows = entries
    .filter((e) => !e.isConsecutiveSecond)
    .map((e) => {
      const a = assignmentMap.get(e.assignmentId)
      const s = a ? subjectMap.get(a.subjectId) : undefined
      const tNames = a
        ? a.teacherIds.map((id) => teacherMap.get(id)?.name ?? '?').join(' / ')
        : ''
      return `${e.day},${e.period},${e.classId},${s?.name ?? ''},${tNames}`
    })
    .join('\n')

  const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `timetable_${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

function handlePrint() {
  window.print()
}

// ============================================================
// ScheduleViewContainer
// ============================================================

export function ScheduleViewContainer({
  teachers,
  subjects,
  assignments,
  classOptions = CLASS_OPTIONS,
  schedulerOptions,
}: ScheduleViewContainerProps) {
  // ---- State ----
  const [viewMode, setViewMode] = useState<ViewMode>('class')
  const [selectedTargetId, setSelectedTargetId] = useState<string>(
    classOptions[0]?.id ?? '',
  )
  const [entries, setEntries] = useState<ScheduleEntry[]>([])
  const [unplacedTasks, setUnplacedTasks] = useState<UnplacedTask[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [progress, setProgress] = useState<SchedulerProgress | null>(null)
  const [result, setResult] = useState<SchedulerResult | null>(null)

  // ---- Firestore永続化スケジュール ----
  const {
    schedules,
    error: schedulesError,
    clearError: clearSchedulesError,
    saveSchedule,
    renameSchedule,
    updateEntries: updateScheduleEntries,
    deleteSchedule,
  } = useSchedules()
  const [activeScheduleId, setActiveScheduleId] = useState<string | null>(null)
  const [editingNameId, setEditingNameId] = useState<string | null>(null)
  const [editingNameValue, setEditingNameValue] = useState('')

  // ---- 初回ロード時: 最新の保存済みスケジュールを自動復元 ----
  const initialRestoreDone = useRef(false)
  useEffect(() => {
    if (initialRestoreDone.current || schedules.length === 0 || entries.length > 0) return
    initialRestoreDone.current = true
    // 最新（updatedAt降順）のスケジュールを復元
    const latest = [...schedules].sort(
      (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
    )[0]
    if (latest) {
      setEntries([...latest.entries])
      setUnplacedTasks([...latest.unplacedTasks])
      setResult({
        entries: latest.entries,
        score: latest.score,
        isComplete: latest.isComplete,
        unplacedTasks: latest.unplacedTasks,
      })
      setActiveScheduleId(latest.id)
    }
  }, [schedules]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- 制約矛盾事前検出 ----
  const constraintWarnings = useMemo<ConstraintWarning[]>(
    () => (assignments.length > 0 ? detectConstraintConflicts(teachers, subjects, assignments) : []),
    [teachers, subjects, assignments],
  )
  const [warningsDismissed, setWarningsDismissed] = useState(false)

  // ---- スケジュール比較 ----
  const [compareIds, setCompareIds] = useState<[string, string] | null>(null)

  // ---- Undo履歴 ----
  type UndoState = { entries: ScheduleEntry[]; unplacedTasks: UnplacedTask[] }
  const undoStackRef = useRef<UndoState[]>([])
  const MAX_UNDO = 20

  const pushUndo = useCallback(() => {
    undoStackRef.current = [
      ...undoStackRef.current.slice(-(MAX_UNDO - 1)),
      { entries: [...entries], unplacedTasks: [...unplacedTasks] },
    ]
  }, [entries, unplacedTasks])

  const handleUndo = useCallback(() => {
    const stack = undoStackRef.current
    if (stack.length === 0) return
    const prev = stack[stack.length - 1]
    undoStackRef.current = stack.slice(0, -1)
    setEntries(prev.entries)
    setUnplacedTasks(prev.unplacedTasks)
    if (activeScheduleId) {
      updateScheduleEntries(activeScheduleId, prev.entries, prev.unplacedTasks)
    }
  }, [activeScheduleId, updateScheduleEntries])

  // ---- スケジューラ実行（Web Worker） ----
  const handleGenerate = useCallback(async () => {
    if (assignments.length === 0) return

    setIsRunning(true)
    setProgress(null)
    setResult(null)
    setActiveScheduleId(null)
    undoStackRef.current = []

    try {
      const res = await runSchedulerInWorker(teachers, subjects, assignments, (p) => {
        setProgress(p)
      }, schedulerOptions)
      setEntries(res.entries)
      setUnplacedTasks(res.unplacedTasks)
      setResult(res)

      // 生成結果を自動保存
      const maxNum = schedules.reduce((max, s) => {
        const m = s.name.match(/^案(\d+)/)
        return m ? Math.max(max, parseInt(m[1], 10)) : max
      }, 0)
      const name = `案${maxNum + 1}`
      const saved = await saveSchedule(name, res, res.unplacedTasks)
      setActiveScheduleId(saved.id)
    } finally {
      setIsRunning(false)
    }
  }, [teachers, subjects, assignments, schedulerOptions, schedules, saveSchedule])

  // ---- 部分再生成（手動配置済みを固定して残りだけ再生成） ----
  const handlePartialRegenerate = useCallback(async () => {
    if (assignments.length === 0 || entries.length === 0) return

    setIsRunning(true)
    setProgress(null)
    undoStackRef.current = []

    try {
      const res = await runSchedulerInWorker(teachers, subjects, assignments, (p) => {
        setProgress(p)
      }, { ...schedulerOptions, lockedEntries: entries })

      setEntries(res.entries)
      setUnplacedTasks(res.unplacedTasks)
      setResult(res)

      // 部分再生成結果を自動保存
      const maxNum = schedules.reduce((max, s) => {
        const m = s.name.match(/^案(\d+)/)
        return m ? Math.max(max, parseInt(m[1], 10)) : max
      }, 0)
      const name = `案${maxNum + 1}(部分再生成)`
      const saved = await saveSchedule(name, res, res.unplacedTasks)
      setActiveScheduleId(saved.id)
    } finally {
      setIsRunning(false)
    }
  }, [teachers, subjects, assignments, entries, schedulerOptions, schedules.length, saveSchedule])

  // ---- 保存済みスケジュールの復元 ----
  const handleRestoreSchedule = useCallback((scheduleId: string) => {
    const sched = schedules.find((s) => s.id === scheduleId)
    if (!sched) return
    setEntries([...sched.entries])
    setUnplacedTasks([...sched.unplacedTasks])
    setResult({
      entries: sched.entries,
      score: sched.score,
      isComplete: sched.isComplete,
      unplacedTasks: sched.unplacedTasks,
    })
    setActiveScheduleId(scheduleId)
  }, [schedules])

  // ---- 保存済みスケジュールの削除 ----
  const handleDeleteSchedule = useCallback(async (scheduleId: string) => {
    await deleteSchedule(scheduleId)
    if (activeScheduleId === scheduleId) setActiveScheduleId(null)
  }, [activeScheduleId, deleteSchedule])

  // ---- 名前変更 ----
  const handleRenameSchedule = useCallback(async (scheduleId: string, newName: string) => {
    if (!newName.trim()) return
    await renameSchedule(scheduleId, newName)
    setEditingNameId(null)
  }, [renameSchedule])

  // ---- DnD: 配置済みエントリの移動 ----
  const handleMoveEntry = useCallback(
    (entryId: string, toDay: DayOfWeek, toPeriod: Period): string | null => {
      const entry = entries.find((e) => e.id === entryId)
      if (!entry) return '対象のエントリが見つかりません'

      const error = validateMove(
        entries,
        assignments,
        teachers,
        entry.assignmentId,
        toDay,
        toPeriod,
        entryId,
      )
      if (error) return error

      pushUndo()
      const newEntries = entries.map((e) =>
        e.id === entryId ? { ...e, day: toDay, period: toPeriod } : e,
      )
      setEntries(newEntries)

      // アクティブなスケジュールがあればFirestoreも更新
      if (activeScheduleId) {
        updateScheduleEntries(activeScheduleId, newEntries, unplacedTasks)
      }

      return null
    },
    [entries, assignments, teachers, activeScheduleId, unplacedTasks, updateScheduleEntries, pushUndo],
  )

  // ---- DnD: 未配置アイテムのドロップ ----
  const handleDropUnplaced = useCallback(
    (assignmentId: string, day: DayOfWeek, period: Period): string | null => {
      const assignment = assignments.find((a) => a.id === assignmentId)
      if (!assignment) return '割当データが見つかりません'

      const error = validateMove(entries, assignments, teachers, assignmentId, day, period)
      if (error) return error

      pushUndo()
      const newEntry: ScheduleEntry = {
        id: `manual-${day}-${period}-${assignment.classId}-${Date.now()}`,
        day,
        period,
        classId: assignment.classId,
        assignmentId,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      const newEntries = [...entries, newEntry]
      const newUnplaced = unplacedTasks.filter(
        (t) => !(t.assignmentId === assignmentId && t.classId === assignment.classId),
      )
      setEntries(newEntries)
      setUnplacedTasks(newUnplaced)

      // アクティブなスケジュールがあればFirestoreも更新
      if (activeScheduleId) {
        updateScheduleEntries(activeScheduleId, newEntries, newUnplaced)
      }

      return null
    },
    [entries, assignments, teachers, unplacedTasks, activeScheduleId, updateScheduleEntries, pushUndo],
  )

  // ---- ビューモード切替時のターゲットリセット ----
  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode)
    if (mode === 'class') {
      setSelectedTargetId(classOptions[0]?.id ?? '')
    } else {
      setSelectedTargetId(teachers[0]?.id ?? '')
    }
  }

  // ---- データ不足チェック ----
  const hasData = teachers.length > 0 && subjects.length > 0 && assignments.length > 0

  // 比較モードの解決
  const compareSchedules = compareIds
    ? [schedules.find((s) => s.id === compareIds[0]), schedules.find((s) => s.id === compareIds[1])]
    : null

  return (
    <div className="space-y-4">
      {schedulesError && (
        <ErrorAlert message={schedulesError.message} onDismiss={clearSchedulesError} />
      )}

      {/* 制約矛盾の警告 */}
      {constraintWarnings.length > 0 && !warningsDismissed && (
        <div className="card p-4 border-amber-200 bg-amber-50">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 text-amber-500 shrink-0 mt-0.5">
                <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
              </svg>
              <div className="space-y-1">
                <p className="text-sm font-medium text-amber-800">制約矛盾の検出 ({constraintWarnings.length}件)</p>
                <ul className="space-y-0.5">
                  {constraintWarnings.map((w, i) => {
                    const assignment = assignments.find((a) => a.id === w.assignmentId)
                    const subject = assignment ? subjects.find((s) => s.id === assignment.subjectId) : null
                    const classLabel = assignment ? classOptions.find((c) => c.id === assignment.classId)?.displayName : null
                    const prefix = classLabel && subject ? `${classLabel} ${subject.name}: ` : ''
                    return (
                      <li key={i} className="text-xs flex items-start gap-1.5">
                        <span className={`shrink-0 mt-0.5 inline-block w-1.5 h-1.5 rounded-full ${w.severity === 'error' ? 'bg-red-500' : 'bg-amber-400'}`} />
                        <span className={w.severity === 'error' ? 'text-red-700' : 'text-amber-700'}>
                          {prefix}{w.message}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setWarningsDismissed(true)}
              className="text-amber-400 hover:text-amber-600 shrink-0"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* ツールバー */}
      <div className="card p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* 自動生成ボタン */}
          <button
            type="button"
            onClick={handleGenerate}
            disabled={isRunning || !hasData}
            className="btn-primary"
          >
            {isRunning ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                生成中...
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
                  <path fillRule="evenodd" d="M8 1.75a.75.75 0 0 1 .692.462l1.41 3.393 3.664.293a.75.75 0 0 1 .428 1.317l-2.791 2.39.853 3.577a.75.75 0 0 1-1.12.814L8 11.96l-3.134 1.837a.75.75 0 0 1-1.12-.814l.852-3.578-2.79-2.39a.75.75 0 0 1 .427-1.316l3.664-.293 1.41-3.393A.75.75 0 0 1 8 1.75Z" clipRule="evenodd" />
                </svg>
                自動生成
              </>
            )}
          </button>

          {/* 部分再生成ボタン */}
          {entries.length > 0 && unplacedTasks.length > 0 && (
            <button
              type="button"
              onClick={handlePartialRegenerate}
              disabled={isRunning}
              className="btn-secondary"
              title="配置済みのコマを固定したまま、未配置の授業だけを再生成します"
            >
              {isRunning ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  再生成中...
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
                    <path fillRule="evenodd" d="M13.836 2.477a.75.75 0 0 1 .75.75v3.182a.75.75 0 0 1-.75.75h-3.182a.75.75 0 0 1 0-1.5h1.37l-.84-.841a4.5 4.5 0 0 0-7.08.932.75.75 0 0 1-1.3-.75 6 6 0 0 1 9.44-1.242l.842.84V3.227a.75.75 0 0 1 .75-.75Zm-.911 7.5A.75.75 0 0 1 13.199 11a6 6 0 0 1-9.44 1.241l-.84-.84v1.371a.75.75 0 0 1-1.5 0V9.591a.75.75 0 0 1 .75-.75H5.35a.75.75 0 0 1 0 1.5H3.98l.841.841a4.5 4.5 0 0 0 7.08-.932.75.75 0 0 1 1.025-.273Z" clipRule="evenodd" />
                  </svg>
                  部分再生成
                </>
              )}
            </button>
          )}

          {/* 区切り線 */}
          <div className="h-8 w-px bg-gray-200" />

          {/* ビューモード切替 */}
          <div className="flex rounded-lg border border-gray-300 overflow-hidden" role="group" aria-label="表示モード切替">
            <button
              type="button"
              onClick={() => handleViewModeChange('class')}
              aria-pressed={viewMode === 'class'}
              className={[
                'px-3 py-1.5 text-xs font-medium transition-colors',
                viewMode === 'class'
                  ? 'bg-primary-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50',
              ].join(' ')}
            >
              クラス別
            </button>
            <button
              type="button"
              onClick={() => handleViewModeChange('teacher')}
              aria-pressed={viewMode === 'teacher'}
              className={[
                'px-3 py-1.5 text-xs font-medium transition-colors border-l border-gray-300',
                viewMode === 'teacher'
                  ? 'bg-primary-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50',
              ].join(' ')}
            >
              教員別
            </button>
          </div>

          {/* ターゲット選択 */}
          <select
            value={selectedTargetId}
            onChange={(e) => setSelectedTargetId(e.target.value)}
            className="form-select w-auto text-sm"
            aria-label={viewMode === 'class' ? 'クラス選択' : '教員選択'}
          >
            {viewMode === 'class'
              ? classOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.displayName}
                  </option>
                ))
              : teachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
          </select>

          {/* スペーサー */}
          <div className="flex-1" />

          {/* Undo + エクスポート */}
          {entries.length > 0 && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleUndo}
                disabled={undoStackRef.current.length === 0}
                className="btn-secondary text-xs"
                title="元に戻す (Undo)"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                  <path fillRule="evenodd" d="M2.22 4.22a.75.75 0 0 1 1.06 0L6 6.94l2.72-2.72a.75.75 0 1 1 1.06 1.06L7.06 8l2.72 2.72a.75.75 0 1 1-1.06 1.06L6 9.06l-2.72 2.72a.75.75 0 0 1-1.06-1.06L4.94 8 2.22 5.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                </svg>
                元に戻す
              </button>
              <button
                type="button"
                onClick={() => exportToCsv(entries, assignments, subjects, teachers)}
                className="btn-secondary text-xs"
              >
                CSV出力
              </button>
              <button
                type="button"
                onClick={() => exportToExcel(entries, assignments, subjects, teachers)}
                className="btn-secondary text-xs"
              >
                Excel出力
              </button>
              <button
                type="button"
                onClick={handlePrint}
                className="btn-secondary text-xs"
              >
                印刷
              </button>
            </div>
          )}
        </div>

        {/* 進捗バー */}
        {isRunning && progress && (
          <div className="mt-3" role="status" aria-live="polite" aria-label="生成進捗">
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>
                配置中: {progress.placed} / {progress.total}
              </span>
              <span>
                探索: {progress.iterations.toLocaleString()} 回
                {progress.restarts !== undefined && progress.restarts > 0 && (
                  <>（リスタート {progress.restarts} 回目）</>
                )}
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-gray-200 overflow-hidden" role="progressbar" aria-valuenow={progress.placed} aria-valuemin={0} aria-valuemax={progress.total}>
              <div
                className="h-1.5 rounded-full bg-primary-500 transition-all duration-300"
                style={{
                  width: `${Math.min(100, Math.round((progress.placed / Math.max(progress.total, 1)) * 100))}%`,
                }}
              />
            </div>
          </div>
        )}

        {/* 結果サマリー */}
        {result && !isRunning && (
          <div className="mt-3 flex items-center gap-3 text-sm" role="status" aria-live="polite">
            <span
              className={[
                'badge',
                result.isComplete
                  ? 'bg-green-100 text-green-700'
                  : 'bg-yellow-100 text-yellow-700',
              ].join(' ')}
            >
              {result.isComplete ? '全配置完了' : '一部未配置'}
            </span>
            <span className="text-gray-500">
              スコア: {result.score} / 1200
            </span>
            <span className="text-gray-400 text-xs">
              {result.entries.filter((e) => !e.isConsecutiveSecond).length} コマ配置
            </span>
            <div className="flex-1" />
            {activeScheduleId && (
              <span className="flex items-center gap-1 text-xs text-green-600">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                  <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd" />
                </svg>
                保存済み
              </span>
            )}
          </div>
        )}
      </div>

      {/* 保存済みスケジュール一覧（Firestore永続化） */}
      {schedules.length > 0 && (
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-sm font-semibold text-gray-700">保存済みの時間割案</h3>
            <span className="badge bg-gray-100 text-gray-600">{schedules.length}件</span>
            {/* 比較ボタン */}
            {schedules.length >= 2 && (
              <div className="flex items-center gap-1 ml-auto text-xs">
                <span className="text-gray-400">比較:</span>
                <select
                  className="form-select text-xs py-0.5 w-auto"
                  defaultValue=""
                  onChange={(e) => {
                    const val = e.target.value
                    if (!val) { setCompareIds(null); return }
                    const [a, b] = val.split(':')
                    setCompareIds([a, b])
                  }}
                >
                  <option value="">選択...</option>
                  {schedules.flatMap((a, i) =>
                    schedules.slice(i + 1).map((b) => (
                      <option key={`${a.id}:${b.id}`} value={`${a.id}:${b.id}`}>
                        {a.name} vs {b.name}
                      </option>
                    )),
                  )}
                </select>
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {schedules.map((sched) => {
              const isActive = activeScheduleId === sched.id
              return (
                <div
                  key={sched.id}
                  className={[
                    'group relative flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors',
                    isActive
                      ? 'border-primary-300 bg-primary-50 ring-1 ring-primary-200'
                      : 'border-gray-200 bg-white hover:bg-gray-50',
                  ].join(' ')}
                >
                  {/* 名前（ダブルクリックで編集） */}
                  {editingNameId === sched.id ? (
                    <input
                      type="text"
                      value={editingNameValue}
                      onChange={(e) => setEditingNameValue(e.target.value)}
                      onBlur={() => handleRenameSchedule(sched.id, editingNameValue)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRenameSchedule(sched.id, editingNameValue)
                        if (e.key === 'Escape') setEditingNameId(null)
                      }}
                      className="w-20 rounded border border-gray-300 px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary-400"
                      autoFocus
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleRestoreSchedule(sched.id)}
                      onDoubleClick={() => {
                        setEditingNameId(sched.id)
                        setEditingNameValue(sched.name)
                      }}
                      className="font-medium text-gray-800"
                      title="クリックで復元、ダブルクリックで名前変更"
                    >
                      {sched.name}
                    </button>
                  )}

                  {/* スコア */}
                  <span className={[
                    'text-xs',
                    sched.isComplete ? 'text-green-600' : 'text-yellow-600',
                  ].join(' ')}>
                    {sched.score}点
                  </span>

                  {/* 未配置数 */}
                  {sched.unplacedTasks.length > 0 && (
                    <span className="text-xs text-red-400">
                      残{sched.unplacedTasks.length}
                    </span>
                  )}

                  {/* 削除ボタン */}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleDeleteSchedule(sched.id) }}
                    className="ml-1 rounded p-0.5 text-gray-300 hover:bg-red-50 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="削除"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                      <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
                    </svg>
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* スケジュール比較ビュー */}
      {compareSchedules && compareSchedules[0] && compareSchedules[1] && (
        <ScheduleCompare
          scheduleA={compareSchedules[0]}
          scheduleB={compareSchedules[1]}
          teachers={teachers}
          subjects={subjects}
          assignments={assignments}
          classOptions={classOptions}
          onClose={() => setCompareIds(null)}
        />
      )}

      {/* データ不足メッセージ */}
      {!hasData && (
        <div className="card flex flex-col items-center gap-3 py-16 text-gray-400">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="h-12 w-12 text-gray-200"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
            />
          </svg>
          <p className="text-sm">
            時間割を生成するには、教員・科目・授業割当を先に登録してください。
          </p>
        </div>
      )}

      {/* メイングリッド + サイドバー */}
      {entries.length > 0 && (
        <div className="flex flex-col lg:flex-row gap-4">
          {/* グリッド */}
          <div className="flex-1 min-w-0 card p-2 sm:p-4 print:shadow-none print:border-none">
            <TimetableGrid
              key={`${viewMode}-${selectedTargetId}`}
              entries={entries}
              teachers={teachers}
              subjects={subjects}
              assignments={assignments}
              viewMode={viewMode}
              targetId={selectedTargetId}
              onMoveEntry={handleMoveEntry}
              onDropUnplaced={handleDropUnplaced}
            />
          </div>

          {/* 未配置サイドバー */}
          {unplacedTasks.length > 0 && (
            <div className="w-full lg:w-64 lg:shrink-0 print:hidden">
              <UnplacedSidebar
                unplacedTasks={unplacedTasks}
                assignments={assignments}
                subjects={subjects}
                teachers={teachers}
              />
            </div>
          )}
        </div>
      )}

      {/* 生成済みで全配置完了&未配置なし の場合のグリッド表示 */}
      {entries.length > 0 && unplacedTasks.length === 0 && result?.isComplete && (
        <div className="print:hidden">
          <UnplacedSidebar
            unplacedTasks={[]}
            assignments={assignments}
            subjects={subjects}
            teachers={teachers}
          />
        </div>
      )}
    </div>
  )
}
