import { useState } from 'react'
import type { ScheduleEntry, Teacher, Subject, Assignment } from '../../types'
import { DAYS, DAY_LABELS, PERIODS, getClassLabel } from '../../utils/constants'
import type { SavedSchedule } from '../../firebase/schedules'
import type { ClassOption } from '../../utils/constants'

// ============================================================
// Props
// ============================================================

interface ScheduleCompareProps {
  scheduleA: SavedSchedule
  scheduleB: SavedSchedule
  teachers: Teacher[]
  subjects: Subject[]
  assignments: Assignment[]
  classOptions: ClassOption[]
  onClose: () => void
}

// ============================================================
// ヘルパー
// ============================================================

interface CellInfo {
  subjectName: string
  teacherNames: string
  color: string
  isConsecutiveSecond?: boolean
}

function buildCompareMap(
  entries: ScheduleEntry[],
  assignments: Assignment[],
  subjects: Subject[],
  teachers: Teacher[],
  classId: string,
): Map<string, CellInfo> {
  const assignmentMap = new Map(assignments.map((a) => [a.id, a]))
  const subjectMap = new Map(subjects.map((s) => [s.id, s]))
  const teacherMap = new Map(teachers.map((t) => [t.id, t]))

  const map = new Map<string, CellInfo>()
  for (const entry of entries) {
    if (entry.classId !== classId) continue
    const a = assignmentMap.get(entry.assignmentId)
    if (!a) continue
    const s = subjectMap.get(a.subjectId)
    if (!s) continue
    const tNames = a.teacherIds.map((id) => teacherMap.get(id)?.name ?? '?').join(', ')
    map.set(`${entry.day}:${entry.period}`, {
      subjectName: s.name,
      teacherNames: tNames,
      color: s.color ?? '#3b82f6',
      isConsecutiveSecond: entry.isConsecutiveSecond,
    })
  }
  return map
}

type DiffType = 'same' | 'different' | 'only-a' | 'only-b'

function getDiffType(a: CellInfo | undefined, b: CellInfo | undefined): DiffType {
  if (!a && !b) return 'same'
  if (a && !b) return 'only-a'
  if (!a && b) return 'only-b'
  if (a!.subjectName === b!.subjectName && a!.teacherNames === b!.teacherNames) return 'same'
  return 'different'
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

// ============================================================
// 比較統計
// ============================================================

function computeStats(
  mapA: Map<string, CellInfo>,
  mapB: Map<string, CellInfo>,
) {
  const allKeys = new Set([...mapA.keys(), ...mapB.keys()])
  let same = 0, different = 0, onlyA = 0, onlyB = 0

  for (const key of allKeys) {
    const diff = getDiffType(mapA.get(key), mapB.get(key))
    if (diff === 'same') same++
    else if (diff === 'different') different++
    else if (diff === 'only-a') onlyA++
    else onlyB++
  }

  return { totalSlots: allKeys.size, same, different, onlyA, onlyB }
}

// ============================================================
// セルレンダリング
// ============================================================

function CompareCell({ cellA, cellB }: { cellA?: CellInfo; cellB?: CellInfo }) {
  const diff = getDiffType(cellA, cellB)

  const bgStyles: Record<DiffType, string> = {
    same: '',
    different: 'bg-amber-50',
    'only-a': 'bg-blue-50',
    'only-b': 'bg-green-50',
  }

  return (
    <td className={`border border-gray-200 p-0 align-top ${bgStyles[diff]}`}>
      <div className="flex divide-x divide-gray-200 min-h-[3.5rem]">
        {/* 案A */}
        <div className="flex-1 p-1">
          {cellA && (
            <div
              className="rounded px-1 py-0.5 text-[10px] leading-tight"
              style={{
                backgroundColor: hexToRgba(cellA.color, 0.15),
                borderLeft: `2px solid ${cellA.color}`,
              }}
            >
              <div className="font-semibold text-gray-800 truncate">{cellA.subjectName}</div>
              <div className="text-gray-500 truncate">{cellA.teacherNames}</div>
              {cellA.isConsecutiveSecond && <span className="text-gray-400">(続)</span>}
            </div>
          )}
        </div>
        {/* 案B */}
        <div className="flex-1 p-1">
          {cellB && (
            <div
              className="rounded px-1 py-0.5 text-[10px] leading-tight"
              style={{
                backgroundColor: hexToRgba(cellB.color, 0.15),
                borderLeft: `2px solid ${cellB.color}`,
              }}
            >
              <div className="font-semibold text-gray-800 truncate">{cellB.subjectName}</div>
              <div className="text-gray-500 truncate">{cellB.teacherNames}</div>
              {cellB.isConsecutiveSecond && <span className="text-gray-400">(続)</span>}
            </div>
          )}
        </div>
      </div>
    </td>
  )
}

// ============================================================
// メインコンポーネント
// ============================================================

export function ScheduleCompare({
  scheduleA,
  scheduleB,
  teachers,
  subjects,
  assignments,
  classOptions,
  onClose,
}: ScheduleCompareProps) {
  const [selectedClass, setSelectedClass] = useState(classOptions[0]?.id ?? '')

  const mapA = buildCompareMap(scheduleA.entries, assignments, subjects, teachers, selectedClass)
  const mapB = buildCompareMap(scheduleB.entries, assignments, subjects, teachers, selectedClass)
  const stats = computeStats(mapA, mapB)

  return (
    <div className="card p-4 space-y-4">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">
          時間割比較: {scheduleA.name} vs {scheduleB.name}
        </h3>
        <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
            <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
          </svg>
        </button>
      </div>

      {/* クラス選択 + 統計 */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={selectedClass}
          onChange={(e) => setSelectedClass(e.target.value)}
          className="form-select text-sm w-auto"
        >
          {classOptions.map((c) => (
            <option key={c.id} value={c.id}>{c.displayName}</option>
          ))}
        </select>
        <div className="flex gap-3 text-xs">
          <span className="text-gray-500">一致: {stats.same}</span>
          <span className="text-amber-600">差異: {stats.different}</span>
          <span className="text-blue-600">{scheduleA.name}のみ: {stats.onlyA}</span>
          <span className="text-green-600">{scheduleB.name}のみ: {stats.onlyB}</span>
        </div>
      </div>

      {/* 凡例 */}
      <div className="flex gap-4 text-[10px]">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 bg-amber-50 border border-gray-300 rounded-sm" />差異あり
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 bg-blue-50 border border-gray-300 rounded-sm" />{scheduleA.name}のみ
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 bg-green-50 border border-gray-300 rounded-sm" />{scheduleB.name}のみ
        </span>
      </div>

      {/* 比較グリッド */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[700px] border-collapse table-fixed text-xs">
          <colgroup>
            <col className="w-10" />
            {DAYS.map((d) => <col key={d} />)}
          </colgroup>
          <thead>
            <tr>
              <th className="border border-gray-200 bg-gray-100 px-1 py-2 text-xs text-gray-600">時限</th>
              {DAYS.map((day) => (
                <th key={day} className="border border-gray-200 bg-gray-100 px-1 py-2 text-xs text-gray-700">
                  <div>{DAY_LABELS[day]}</div>
                  <div className="flex text-[9px] text-gray-400 font-normal">
                    <span className="flex-1 text-center">{scheduleA.name}</span>
                    <span className="flex-1 text-center">{scheduleB.name}</span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERIODS.map((period) => (
              <tr key={period}>
                <th className="border border-gray-200 bg-gray-100 px-1 py-2 text-xs text-gray-600">{period}</th>
                {DAYS.map((day) => {
                  const key = `${day}:${period}`
                  return (
                    <CompareCell
                      key={key}
                      cellA={mapA.get(key)}
                      cellB={mapB.get(key)}
                    />
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 未配置比較 */}
      {(scheduleA.unplacedTasks.length > 0 || scheduleB.unplacedTasks.length > 0) && (
        <div className="grid grid-cols-2 gap-4 text-xs">
          <div>
            <h4 className="font-medium text-gray-600 mb-1">{scheduleA.name} 未配置 ({scheduleA.unplacedTasks.length})</h4>
            {scheduleA.unplacedTasks.length > 0 ? (
              <ul className="space-y-0.5 text-red-600">
                {scheduleA.unplacedTasks.map((t, i) => {
                  const s = subjects.find((s2) => s2.id === t.subjectId)
                  return <li key={i}>{getClassLabel(t.classId)} {s?.name ?? t.subjectId}</li>
                })}
              </ul>
            ) : <span className="text-green-600">なし</span>}
          </div>
          <div>
            <h4 className="font-medium text-gray-600 mb-1">{scheduleB.name} 未配置 ({scheduleB.unplacedTasks.length})</h4>
            {scheduleB.unplacedTasks.length > 0 ? (
              <ul className="space-y-0.5 text-red-600">
                {scheduleB.unplacedTasks.map((t, i) => {
                  const s = subjects.find((s2) => s2.id === t.subjectId)
                  return <li key={i}>{getClassLabel(t.classId)} {s?.name ?? t.subjectId}</li>
                })}
              </ul>
            ) : <span className="text-green-600">なし</span>}
          </div>
        </div>
      )}

      {/* スコア比較 */}
      <div className="flex gap-6 text-sm border-t pt-3">
        <div>
          <span className="text-gray-500">{scheduleA.name}: </span>
          <span className="font-semibold">{scheduleA.score}点</span>
          <span className={`ml-1 text-xs ${scheduleA.isComplete ? 'text-green-600' : 'text-yellow-600'}`}>
            {scheduleA.isComplete ? '全配置' : '一部未配置'}
          </span>
        </div>
        <div>
          <span className="text-gray-500">{scheduleB.name}: </span>
          <span className="font-semibold">{scheduleB.score}点</span>
          <span className={`ml-1 text-xs ${scheduleB.isComplete ? 'text-green-600' : 'text-yellow-600'}`}>
            {scheduleB.isComplete ? '全配置' : '一部未配置'}
          </span>
        </div>
      </div>
    </div>
  )
}
