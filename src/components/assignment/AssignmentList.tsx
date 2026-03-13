import { useMemo, useState } from 'react'
import type { Assignment, Teacher, Subject, SubjectCategory } from '../../types'
import { getClassLabel, CLASS_OPTIONS, SUBJECT_CATEGORIES } from '../../utils/constants'

type SortKey = 'class' | 'subject' | 'teacher'
type SortDir = 'asc' | 'desc'

interface AssignmentListProps {
  assignments: Assignment[]
  teachers: Teacher[]
  subjects: Subject[]
  onEdit: (assignment: Assignment) => void
  onDelete: (id: string) => void
}

export function AssignmentList({
  assignments,
  teachers,
  subjects,
  onEdit,
  onDelete,
}: AssignmentListProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('class')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [filterClass, setFilterClass] = useState('')
  const [filterCategory, setFilterCategory] = useState<SubjectCategory | ''>('')
  const [filterTeacher, setFilterTeacher] = useState('')

  const teacherMap = Object.fromEntries(teachers.map((t) => [t.id, t]))
  const subjectMap = Object.fromEntries(subjects.map((s) => [s.id, s]))

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const hasFilter = !!(filterClass || filterCategory || filterTeacher)

  const sortedAssignments = useMemo(() => {
    let filtered = assignments
    if (filterClass) {
      filtered = filtered.filter((a) => a.classId === filterClass)
    }
    if (filterCategory) {
      filtered = filtered.filter((a) => subjectMap[a.subjectId]?.category === filterCategory)
    }
    if (filterTeacher) {
      filtered = filtered.filter((a) => a.teacherIds.includes(filterTeacher))
    }
    const dir = sortDir === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case 'class':
          cmp = getClassLabel(a.classId).localeCompare(getClassLabel(b.classId), 'ja')
          break
        case 'subject': {
          const sA = subjectMap[a.subjectId]
          const sB = subjectMap[b.subjectId]
          // 教科カテゴリ → 科目名
          const catCmp = (sA?.category ?? '').localeCompare(sB?.category ?? '', 'ja')
          cmp = catCmp !== 0 ? catCmp : (sA?.name ?? '').localeCompare(sB?.name ?? '', 'ja')
          break
        }
        case 'teacher': {
          const tA = a.teacherIds.map((id) => teacherMap[id]?.name ?? '').sort().join(',')
          const tB = b.teacherIds.map((id) => teacherMap[id]?.name ?? '').sort().join(',')
          cmp = tA.localeCompare(tB, 'ja')
          break
        }
      }
      // 同値ならクラス順をフォールバック
      if (cmp === 0 && sortKey !== 'class') {
        cmp = getClassLabel(a.classId).localeCompare(getClassLabel(b.classId), 'ja')
      }
      return cmp * dir
    })
  }, [assignments, sortKey, sortDir, subjectMap, teacherMap, filterClass, filterCategory, filterTeacher])

  const SortIcon = ({ column }: { column: SortKey }) => {
    const active = sortKey === column
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 16 16"
        fill="currentColor"
        className={`ml-1 inline h-3.5 w-3.5 ${active ? 'text-primary-600' : 'text-gray-300'}`}
      >
        {active && sortDir === 'desc' ? (
          <path fillRule="evenodd" d="M8 2a.75.75 0 0 1 .75.75v8.69l2.22-2.22a.75.75 0 1 1 1.06 1.06l-3.5 3.5a.75.75 0 0 1-1.06 0l-3.5-3.5a.75.75 0 1 1 1.06-1.06l2.22 2.22V2.75A.75.75 0 0 1 8 2Z" clipRule="evenodd" />
        ) : (
          <path fillRule="evenodd" d="M8 14a.75.75 0 0 0 .75-.75V4.56l2.22 2.22a.75.75 0 1 0 1.06-1.06l-3.5-3.5a.75.75 0 0 0-1.06 0l-3.5 3.5a.75.75 0 0 0 1.06 1.06l2.22-2.22v8.69c0 .414.336.75.75.75Z" clipRule="evenodd" />
        )}
      </svg>
    )
  }

  if (assignments.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-gray-400">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          className="h-12 w-12 text-gray-300"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z"
          />
        </svg>
        <p className="text-sm">授業割当が登録されていません</p>
      </div>
    )
  }

  // クラス選択肢（学年グループ）
  const classGroups = [1, 2, 3].map((grade) => ({
    grade,
    classes: CLASS_OPTIONS.filter((c) => c.grade === grade),
  }))

  // 教科選択肢（使用中のもののみ）
  const usedCategories = useMemo(() => {
    const cats = new Set(assignments.map((a) => subjectMap[a.subjectId]?.category).filter(Boolean))
    return SUBJECT_CATEGORIES.filter((c) => cats.has(c))
  }, [assignments, subjectMap])

  // 教員選択肢（五十音順）
  const teacherOptions = useMemo(() => {
    const ids = new Set(assignments.flatMap((a) => a.teacherIds))
    return teachers
      .filter((t) => ids.has(t.id))
      .sort((a, b) => a.name.localeCompare(b.name, 'ja'))
  }, [assignments, teachers])

  return (
    <div className="space-y-3">
      {/* フィルタバー */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={filterClass}
          onChange={(e) => setFilterClass(e.target.value)}
          className="form-select rounded-lg border-gray-200 py-1.5 text-sm"
        >
          <option value="">全クラス</option>
          {classGroups.map((g) => (
            <optgroup key={g.grade} label={`${g.grade}年生`}>
              {g.classes.map((c) => (
                <option key={c.id} value={c.id}>{c.displayName}</option>
              ))}
            </optgroup>
          ))}
        </select>

        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value as SubjectCategory | '')}
          className="form-select rounded-lg border-gray-200 py-1.5 text-sm"
        >
          <option value="">全教科</option>
          {usedCategories.map((cat) => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>

        <select
          value={filterTeacher}
          onChange={(e) => setFilterTeacher(e.target.value)}
          className="form-select rounded-lg border-gray-200 py-1.5 text-sm"
        >
          <option value="">全教員</option>
          {teacherOptions.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>

        {hasFilter && (
          <button
            type="button"
            onClick={() => { setFilterClass(''); setFilterCategory(''); setFilterTeacher('') }}
            className="text-xs text-gray-500 hover:text-gray-700 underline"
          >
            フィルタ解除
          </button>
        )}

        <span className="ml-auto text-xs text-gray-400">
          {sortedAssignments.length}/{assignments.length}件
        </span>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
        <thead className="border-b border-gray-200 bg-gray-50">
          <tr>
            <th
              className="cursor-pointer select-none px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 hover:text-gray-700"
              onClick={() => toggleSort('class')}
            >
              クラス
              <SortIcon column="class" />
            </th>
            <th
              className="cursor-pointer select-none px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 hover:text-gray-700"
              onClick={() => toggleSort('subject')}
            >
              科目
              <SortIcon column="subject" />
            </th>
            <th
              className="cursor-pointer select-none px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 hover:text-gray-700"
              onClick={() => toggleSort('teacher')}
            >
              担当教員
              <SortIcon column="teacher" />
            </th>
            <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-500">
              週コマ数
            </th>
            <th className="w-20 px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {sortedAssignments.map((assignment) => {
            const subject = subjectMap[assignment.subjectId]
            const assignedTeachers = assignment.teacherIds
              .map((id) => teacherMap[id])
              .filter(Boolean)
            const isTT = assignment.teacherIds.length > 1
            const isDeleting = deletingId === assignment.id

            return (
              <>
                <tr
                  key={assignment.id}
                  className={isDeleting ? 'bg-red-50' : 'hover:bg-gray-50'}
                >
                  {/* クラス */}
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {getClassLabel(assignment.classId)}
                  </td>

                  {/* 科目 */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {subject?.color && (
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: subject.color }}
                        />
                      )}
                      <span className="text-gray-800">{subject?.name ?? assignment.subjectId}</span>
                      {subject?.isConsecutive && (
                        <span className="badge border border-amber-200 bg-amber-50 text-amber-600">
                          連続
                        </span>
                      )}
                    </div>
                  </td>

                  {/* 担当教員 */}
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {isTT && (
                        <span className="badge border border-indigo-200 bg-indigo-50 text-indigo-700">
                          TT
                        </span>
                      )}
                      {assignedTeachers.length > 0 ? (
                        assignedTeachers.map((t) => (
                          <span key={t.id} className="text-gray-700">
                            {t.name}
                          </span>
                        )).reduce((prev, curr, i) => (
                          i === 0 ? [curr] : [...prev, <span key={`sep-${i}`} className="text-gray-300">・</span>, curr]
                        ) as React.ReactNode[], [] as React.ReactNode[])
                      ) : (
                        <span className="text-gray-400">不明</span>
                      )}
                    </div>
                  </td>

                  {/* 週コマ数 */}
                  <td className="px-4 py-3 text-center text-gray-700">
                    {assignment.weeklyCount}
                  </td>

                  {/* アクション */}
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => onEdit(assignment)}
                        className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                        title="編集"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
                          <path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L6.75 6.774a2.75 2.75 0 0 0-.596.892l-.79 2.291a.75.75 0 0 0 .918.968l2.332-.737a2.75 2.75 0 0 0 .915-.586l4.263-4.263a1.75 1.75 0 0 0 0-2.475Z" />
                          <path d="M4.75 3.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h6.5c.69 0 1.25-.56 1.25-1.25V9a.75.75 0 0 1 1.5 0v2.25A2.75 2.75 0 0 1 11.25 14h-6.5A2.75 2.75 0 0 1 2 11.25v-6.5A2.75 2.75 0 0 1 4.75 2H7a.75.75 0 0 1 0 1.5H4.75Z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeletingId(assignment.id)}
                        className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500"
                        title="削除"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
                          <path fillRule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5ZM6.05 6a.75.75 0 0 1 .787.713l.275 5.5a.75.75 0 0 1-1.498.075l-.275-5.5A.75.75 0 0 1 6.05 6Zm3.9 0a.75.75 0 0 1 .712.787l-.275 5.5a.75.75 0 0 1-1.498-.075l.275-5.5a.75.75 0 0 1 .786-.711Z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>

                {/* 削除確認行 */}
                {isDeleting && (
                  <tr key={`${assignment.id}-confirm`} className="bg-red-50">
                    <td colSpan={5} className="px-4 py-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-red-700">
                          この授業割当を削除しますか？
                        </p>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setDeletingId(null)}
                            className="btn-secondary py-1 text-xs"
                          >
                            キャンセル
                          </button>
                          <button
                            type="button"
                            onClick={() => { onDelete(assignment.id); setDeletingId(null) }}
                            className="btn-danger py-1 text-xs"
                          >
                            削除する
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            )
          })}
        </tbody>
      </table>
      </div>
    </div>
  )
}
