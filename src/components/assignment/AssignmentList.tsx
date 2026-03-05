import { useState } from 'react'
import type { Assignment, Teacher, Subject } from '../../types'
import { getClassLabel } from '../../utils/constants'

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

  const teacherMap = Object.fromEntries(teachers.map((t) => [t.id, t]))
  const subjectMap = Object.fromEntries(subjects.map((s) => [s.id, s]))

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

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <table className="w-full text-sm">
        <thead className="border-b border-gray-200 bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              クラス
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              科目
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              担当教員
            </th>
            <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-500">
              週コマ数
            </th>
            <th className="w-20 px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {assignments.map((assignment) => {
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
  )
}
