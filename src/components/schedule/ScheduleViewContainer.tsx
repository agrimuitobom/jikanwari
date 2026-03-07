import { useState, useCallback } from 'react'
import type { DayOfWeek, Period, Teacher, Subject, Assignment, ScheduleEntry, TimeSlot } from '../../types'
import { CLASS_OPTIONS } from '../../utils/constants'
import { runScheduler } from '../../utils/scheduler'
import type { SchedulerProgress, SchedulerResult, UnplacedTask } from '../../utils/scheduler'
import { TimetableGrid } from './TimetableGrid'
import type { ViewMode } from './TimetableGrid'
import { UnplacedSidebar } from './UnplacedSidebar'

// ============================================================
// スナップショット型
// ============================================================

interface ScheduleSnapshot {
  id: number
  name: string
  entries: ScheduleEntry[]
  unplacedTasks: UnplacedTask[]
  result: SchedulerResult
  createdAt: Date
}

// ============================================================
// Props
// ============================================================

export interface ScheduleViewContainerProps {
  teachers: Teacher[]
  subjects: Subject[]
  assignments: Assignment[]
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
}: ScheduleViewContainerProps) {
  // ---- State ----
  const [viewMode, setViewMode] = useState<ViewMode>('class')
  const [selectedTargetId, setSelectedTargetId] = useState<string>(
    CLASS_OPTIONS[0]?.id ?? '',
  )
  const [entries, setEntries] = useState<ScheduleEntry[]>([])
  const [unplacedTasks, setUnplacedTasks] = useState<UnplacedTask[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [progress, setProgress] = useState<SchedulerProgress | null>(null)
  const [result, setResult] = useState<SchedulerResult | null>(null)

  // ---- スナップショット ----
  const [snapshots, setSnapshots] = useState<ScheduleSnapshot[]>([])
  const [activeSnapshotId, setActiveSnapshotId] = useState<number | null>(null)
  const [nextSnapshotId, setNextSnapshotId] = useState(1)
  const [editingNameId, setEditingNameId] = useState<number | null>(null)
  const [editingNameValue, setEditingNameValue] = useState('')

  // ---- スケジューラ実行 ----
  const handleGenerate = useCallback(async () => {
    if (assignments.length === 0) return

    setIsRunning(true)
    setProgress(null)
    setResult(null)

    try {
      const res = await runScheduler(teachers, subjects, assignments, (p) => {
        setProgress(p)
      })
      setEntries(res.entries)
      setUnplacedTasks(res.unplacedTasks)
      setResult(res)
    } finally {
      setIsRunning(false)
    }
  }, [teachers, subjects, assignments])

  // ---- スナップショット操作 ----
  const handleSaveSnapshot = useCallback(() => {
    if (!result) return
    const id = nextSnapshotId
    const snap: ScheduleSnapshot = {
      id,
      name: `案${id}`,
      entries: [...entries],
      unplacedTasks: [...unplacedTasks],
      result: { ...result },
      createdAt: new Date(),
    }
    setSnapshots((prev) => [...prev, snap])
    setActiveSnapshotId(id)
    setNextSnapshotId((n) => n + 1)
  }, [result, entries, unplacedTasks, nextSnapshotId])

  const handleRestoreSnapshot = useCallback((snapId: number) => {
    const snap = snapshots.find((s) => s.id === snapId)
    if (!snap) return
    setEntries([...snap.entries])
    setUnplacedTasks([...snap.unplacedTasks])
    setResult({ ...snap.result })
    setActiveSnapshotId(snapId)
  }, [snapshots])

  const handleDeleteSnapshot = useCallback((snapId: number) => {
    setSnapshots((prev) => prev.filter((s) => s.id !== snapId))
    if (activeSnapshotId === snapId) setActiveSnapshotId(null)
  }, [activeSnapshotId])

  const handleRenameSnapshot = useCallback((snapId: number, newName: string) => {
    if (!newName.trim()) return
    setSnapshots((prev) =>
      prev.map((s) => (s.id === snapId ? { ...s, name: newName.trim() } : s)),
    )
    setEditingNameId(null)
  }, [])

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

      setEntries((prev) =>
        prev.map((e) =>
          e.id === entryId ? { ...e, day: toDay, period: toPeriod } : e,
        ),
      )
      return null
    },
    [entries, assignments, teachers],
  )

  // ---- DnD: 未配置アイテムのドロップ ----
  const handleDropUnplaced = useCallback(
    (assignmentId: string, day: DayOfWeek, period: Period): string | null => {
      const assignment = assignments.find((a) => a.id === assignmentId)
      if (!assignment) return '割当データが見つかりません'

      const error = validateMove(entries, assignments, teachers, assignmentId, day, period)
      if (error) return error

      const newEntry: ScheduleEntry = {
        id: `manual-${day}-${period}-${assignment.classId}-${Date.now()}`,
        day,
        period,
        classId: assignment.classId,
        assignmentId,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      setEntries((prev) => [...prev, newEntry])
      setUnplacedTasks((prev) =>
        prev.filter((t) => !(t.assignmentId === assignmentId && t.classId === assignment.classId)),
      )
      return null
    },
    [entries, assignments, teachers],
  )

  // ---- ビューモード切替時のターゲットリセット ----
  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode)
    if (mode === 'class') {
      setSelectedTargetId(CLASS_OPTIONS[0]?.id ?? '')
    } else {
      setSelectedTargetId(teachers[0]?.id ?? '')
    }
  }

  // ---- データ不足チェック ----
  const hasData = teachers.length > 0 && subjects.length > 0 && assignments.length > 0

  return (
    <div className="space-y-4">
      {/* ツールバー */}
      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-3">
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

          {/* 区切り線 */}
          <div className="h-8 w-px bg-gray-200" />

          {/* ビューモード切替 */}
          <div className="flex rounded-lg border border-gray-300 overflow-hidden">
            <button
              type="button"
              onClick={() => handleViewModeChange('class')}
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
          >
            {viewMode === 'class'
              ? CLASS_OPTIONS.map((c) => (
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

          {/* エクスポート */}
          {entries.length > 0 && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => exportToCsv(entries, assignments, subjects, teachers)}
                className="btn-secondary text-xs"
              >
                CSV出力
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
          <div className="mt-3">
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>
                配置中: {progress.placed} / {progress.total}
              </span>
              <span>探索: {progress.iterations.toLocaleString()} 回</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-gray-200">
              <div
                className="h-1.5 rounded-full bg-primary-500 transition-all duration-300"
                style={{
                  width: `${Math.round((progress.placed / Math.max(progress.total, 1)) * 100)}%`,
                }}
              />
            </div>
          </div>
        )}

        {/* 結果サマリー */}
        {result && !isRunning && (
          <div className="mt-3 flex items-center gap-3 text-sm">
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
            <button
              type="button"
              onClick={handleSaveSnapshot}
              className="btn-secondary text-xs"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                <path d="M3.75 2A1.75 1.75 0 0 0 2 3.75v8.5c0 .966.784 1.75 1.75 1.75h8.5A1.75 1.75 0 0 0 14 12.25v-5.5a.75.75 0 0 0-.22-.53l-4-4A.75.75 0 0 0 9.25 2H3.75Zm6.5 4a.75.75 0 0 1-.75-.75V3.56L11.94 6H10.25ZM5.75 9.5a.75.75 0 0 0 0 1.5h4.5a.75.75 0 0 0 0-1.5h-4.5Z" />
              </svg>
              この結果を保存
            </button>
          </div>
        )}
      </div>

      {/* スナップショット一覧 */}
      {snapshots.length > 0 && (
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-sm font-semibold text-gray-700">保存済みの時間割案</h3>
            <span className="badge bg-gray-100 text-gray-600">{snapshots.length}件</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {snapshots.map((snap) => {
              const isActive = activeSnapshotId === snap.id
              return (
                <div
                  key={snap.id}
                  className={[
                    'group relative flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors',
                    isActive
                      ? 'border-primary-300 bg-primary-50 ring-1 ring-primary-200'
                      : 'border-gray-200 bg-white hover:bg-gray-50',
                  ].join(' ')}
                >
                  {/* 名前（ダブルクリックで編集） */}
                  {editingNameId === snap.id ? (
                    <input
                      type="text"
                      value={editingNameValue}
                      onChange={(e) => setEditingNameValue(e.target.value)}
                      onBlur={() => handleRenameSnapshot(snap.id, editingNameValue)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRenameSnapshot(snap.id, editingNameValue)
                        if (e.key === 'Escape') setEditingNameId(null)
                      }}
                      className="w-20 rounded border border-gray-300 px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary-400"
                      autoFocus
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleRestoreSnapshot(snap.id)}
                      onDoubleClick={() => {
                        setEditingNameId(snap.id)
                        setEditingNameValue(snap.name)
                      }}
                      className="font-medium text-gray-800"
                      title="クリックで復元、ダブルクリックで名前変更"
                    >
                      {snap.name}
                    </button>
                  )}

                  {/* スコア */}
                  <span className={[
                    'text-xs',
                    snap.result.isComplete ? 'text-green-600' : 'text-yellow-600',
                  ].join(' ')}>
                    {snap.result.score}点
                  </span>

                  {/* 未配置数 */}
                  {snap.unplacedTasks.length > 0 && (
                    <span className="text-xs text-red-400">
                      残{snap.unplacedTasks.length}
                    </span>
                  )}

                  {/* 削除ボタン */}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleDeleteSnapshot(snap.id) }}
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
        <div className="flex gap-4">
          {/* グリッド */}
          <div className="flex-1 card p-4 print:shadow-none print:border-none">
            <TimetableGrid
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
            <div className="w-64 shrink-0 print:hidden">
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
