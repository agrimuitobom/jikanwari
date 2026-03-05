import { useState, useCallback } from 'react'
import type { DayOfWeek, Period, ScheduleEntry, Teacher, Subject, Assignment } from '../../types'
import { DAYS, DAY_LABELS, PERIODS } from '../../utils/constants'
import { getClassLabel } from '../../utils/constants'

// ============================================================
// 型定義
// ============================================================

export type ViewMode = 'class' | 'teacher'

export interface TimetableGridProps {
  entries: ScheduleEntry[]
  teachers: Teacher[]
  subjects: Subject[]
  assignments: Assignment[]
  viewMode: ViewMode
  /** class表示時の対象クラスID / teacher表示時の対象教員ID */
  targetId: string
  /** ドラッグ&ドロップでエントリを移動した際のコールバック */
  onMoveEntry?: (entryId: string, toDay: DayOfWeek, toPeriod: Period) => string | null
  /** 未配置アイテムをドロップした際のコールバック */
  onDropUnplaced?: (assignmentId: string, day: DayOfWeek, period: Period) => string | null
}

interface CellData {
  entry: ScheduleEntry
  assignment: Assignment
  subject: Subject
  teacherNames: string[]
  className: string
}

// ============================================================
// ヘルパー
// ============================================================

function buildCellMap(
  entries: ScheduleEntry[],
  assignments: Assignment[],
  subjects: Subject[],
  teachers: Teacher[],
  viewMode: ViewMode,
  targetId: string,
): Map<string, CellData[]> {
  const assignmentMap = new Map(assignments.map((a) => [a.id, a]))
  const subjectMap = new Map(subjects.map((s) => [s.id, s]))
  const teacherMap = new Map(teachers.map((t) => [t.id, t]))

  const cellMap = new Map<string, CellData[]>()

  for (const entry of entries) {
    const assignment = assignmentMap.get(entry.assignmentId)
    if (!assignment) continue
    const subject = subjectMap.get(assignment.subjectId)
    if (!subject) continue

    // フィルタリング
    if (viewMode === 'class' && entry.classId !== targetId) continue
    if (viewMode === 'teacher' && !assignment.teacherIds.includes(targetId)) continue

    const key = `${entry.day}:${entry.period}`
    const teacherNames = assignment.teacherIds
      .map((id) => teacherMap.get(id)?.name ?? '?')
    const className = getClassLabel(entry.classId)

    const cellData: CellData = { entry, assignment, subject, teacherNames, className }
    const existing = cellMap.get(key)
    if (existing) {
      existing.push(cellData)
    } else {
      cellMap.set(key, [cellData])
    }
  }

  return cellMap
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

// ============================================================
// セルコンポーネント
// ============================================================

function TimetableCell({
  day,
  period,
  cells,
  viewMode,
  onDragStart,
  onDragOver,
  onDrop,
  dropError,
  isDropTarget,
}: {
  day: DayOfWeek
  period: Period
  cells: CellData[]
  viewMode: ViewMode
  onDragStart: (e: React.DragEvent, entryId: string) => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent, day: DayOfWeek, period: Period) => void
  dropError: string | null
  isDropTarget: boolean
}) {
  if (cells.length === 0) {
    return (
      <td
        className={[
          'border border-gray-200 p-0 h-20 align-top transition-colors',
          isDropTarget ? 'bg-primary-50 ring-2 ring-inset ring-primary-300' : 'bg-gray-50/50',
        ].join(' ')}
        onDragOver={onDragOver}
        onDrop={(e) => onDrop(e, day, period)}
      >
        {dropError && (
          <div className="p-1 text-[10px] text-red-500 font-medium">{dropError}</div>
        )}
      </td>
    )
  }

  return (
    <td
      className={[
        'border border-gray-200 p-0 h-20 align-top',
        isDropTarget ? 'ring-2 ring-inset ring-primary-300' : '',
      ].join(' ')}
      onDragOver={onDragOver}
      onDrop={(e) => onDrop(e, day, period)}
    >
      {cells.map((cell) => {
        const bgColor = cell.subject.color
          ? hexToRgba(cell.subject.color, 0.15)
          : 'rgba(59, 130, 246, 0.08)'
        const borderColor = cell.subject.color ?? '#3b82f6'

        return (
          <div
            key={cell.entry.id}
            draggable
            onDragStart={(e) => onDragStart(e, cell.entry.id)}
            className="m-0.5 rounded-md p-1.5 cursor-grab active:cursor-grabbing select-none text-xs leading-tight"
            style={{
              backgroundColor: bgColor,
              borderLeft: `3px solid ${borderColor}`,
            }}
          >
            <div className="font-semibold text-gray-800 truncate">
              {cell.subject.name}
            </div>
            <div className="text-gray-500 truncate">
              {cell.teacherNames.join(', ')}
            </div>
            {viewMode === 'teacher' && (
              <div className="text-gray-400 truncate">{cell.className}</div>
            )}
            {cell.entry.isConsecutiveSecond && (
              <span className="text-[10px] text-gray-400">(続)</span>
            )}
          </div>
        )
      })}
      {dropError && (
        <div className="p-1 text-[10px] text-red-500 font-medium">{dropError}</div>
      )}
    </td>
  )
}

// ============================================================
// TimetableGrid メインコンポーネント
// ============================================================

export function TimetableGrid({
  entries,
  teachers,
  subjects,
  assignments,
  viewMode,
  targetId,
  onMoveEntry,
  onDropUnplaced,
}: TimetableGridProps) {
  const [dragOverSlot, setDragOverSlot] = useState<string | null>(null)
  const [dropErrors, setDropErrors] = useState<Map<string, string>>(new Map())

  const cellMap = buildCellMap(entries, assignments, subjects, teachers, viewMode, targetId)

  const handleDragStart = useCallback((e: React.DragEvent, entryId: string) => {
    e.dataTransfer.setData('text/entry-id', entryId)
    e.dataTransfer.effectAllowed = 'move'
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent, day: DayOfWeek, period: Period) => {
      e.preventDefault()
      setDragOverSlot(null)

      const slotKey = `${day}:${period}`
      const entryId = e.dataTransfer.getData('text/entry-id')
      const unplacedAssignmentId = e.dataTransfer.getData('text/unplaced-assignment-id')

      let error: string | null = null

      if (entryId && onMoveEntry) {
        error = onMoveEntry(entryId, day, period)
      } else if (unplacedAssignmentId && onDropUnplaced) {
        error = onDropUnplaced(unplacedAssignmentId, day, period)
      }

      if (error) {
        setDropErrors((prev) => new Map(prev).set(slotKey, error))
        setTimeout(() => {
          setDropErrors((prev) => {
            const next = new Map(prev)
            next.delete(slotKey)
            return next
          })
        }, 2000)
      }
    },
    [onMoveEntry, onDropUnplaced],
  )

  const handleDragEnter = useCallback((day: DayOfWeek, period: Period) => {
    setDragOverSlot(`${day}:${period}`)
  }, [])

  const handleDragLeave = useCallback(() => {
    setDragOverSlot(null)
  }, [])

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse table-fixed">
        <colgroup>
          <col className="w-12" />
          {DAYS.map((d) => (
            <col key={d} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th className="border border-gray-200 bg-gray-100 px-2 py-2.5 text-xs font-semibold text-gray-600">
              時限
            </th>
            {DAYS.map((day) => (
              <th
                key={day}
                className="border border-gray-200 bg-gray-100 px-2 py-2.5 text-sm font-semibold text-gray-700"
              >
                {DAY_LABELS[day]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PERIODS.map((period) => (
            <tr key={period}>
              <th className="border border-gray-200 bg-gray-100 px-2 py-2 text-sm font-semibold text-gray-600">
                {period}
              </th>
              {DAYS.map((day) => {
                const key = `${day}:${period}`
                return (
                  <TimetableCell
                    key={key}
                    day={day}
                    period={period}
                    cells={cellMap.get(key) ?? []}
                    viewMode={viewMode}
                    onDragStart={handleDragStart}
                    onDragOver={(e) => {
                      handleDragOver(e)
                      handleDragEnter(day, period)
                    }}
                    onDrop={handleDrop}
                    dropError={dropErrors.get(key) ?? null}
                    isDropTarget={dragOverSlot === key}
                  />
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div
        className="fixed inset-0 pointer-events-none"
        onDragLeave={handleDragLeave}
      />
    </div>
  )
}
