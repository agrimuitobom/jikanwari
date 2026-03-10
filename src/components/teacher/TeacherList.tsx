import { useState, useMemo } from 'react'
import type { Teacher, Subject } from '../../types'
import { DAY_LABELS, DAYS, SUBJECT_CATEGORIES } from '../../utils/constants'

interface TeacherListProps {
  teachers: Teacher[]
  subjects: Subject[]
  onEdit: (teacher: Teacher) => void
  onDelete: (id: string) => void
}

export function TeacherList({ teachers, subjects, onEdit, onDelete }: TeacherListProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const subjectMap = Object.fromEntries(subjects.map((s) => [s.id, s]))

  // 教科順 → 名前順にソート
  const sorted = useMemo(() => {
    const deptOrder = new Map(SUBJECT_CATEGORIES.map((c, i) => [c, i]))
    return [...teachers].sort((a, b) => {
      const dA = a.department ? (deptOrder.get(a.department) ?? 98) : 99
      const dB = b.department ? (deptOrder.get(b.department) ?? 98) : 99
      if (dA !== dB) return dA - dB
      return a.name.localeCompare(b.name)
    })
  }, [teachers])

  const handleDeleteClick = (id: string) => {
    setDeletingId(id)
  }

  const handleDeleteConfirm = async (id: string) => {
    await onDelete(id)
    setDeletingId(null)
  }

  if (teachers.length === 0) {
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
            d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
          />
        </svg>
        <p className="text-sm">教員が登録されていません</p>
      </div>
    )
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {sorted.map((teacher) => {
        const isDeleting = deletingId === teacher.id
        const teacherSubjects = teacher.subjectIds
          .map((id) => subjectMap[id])
          .filter(Boolean)
        const MAX_SUBJECTS = 4

        return (
          <div key={teacher.id} className="card flex flex-col gap-4 p-5">
            {/* 名前・教科 */}
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-base font-semibold text-gray-900">{teacher.name}</p>
                  {teacher.department && (
                    <span className="badge bg-gray-100 text-gray-600 text-xs">
                      {teacher.department}
                    </span>
                  )}
                </div>
                {teacher.memo && (
                  <p className="mt-0.5 line-clamp-1 text-xs text-gray-400">{teacher.memo}</p>
                )}
              </div>
              {/* アクションボタン */}
              <div className="flex shrink-0 gap-1">
                <button
                  type="button"
                  onClick={() => onEdit(teacher)}
                  className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                  title="編集"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 16 16"
                    fill="currentColor"
                    className="h-4 w-4"
                  >
                    <path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L6.75 6.774a2.75 2.75 0 0 0-.596.892l-.79 2.291a.75.75 0 0 0 .918.968l2.332-.737a2.75 2.75 0 0 0 .915-.586l4.263-4.263a1.75 1.75 0 0 0 0-2.475Z" />
                    <path d="M4.75 3.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h6.5c.69 0 1.25-.56 1.25-1.25V9a.75.75 0 0 1 1.5 0v2.25A2.75 2.75 0 0 1 11.25 14h-6.5A2.75 2.75 0 0 1 2 11.25v-6.5A2.75 2.75 0 0 1 4.75 2H7a.75.75 0 0 1 0 1.5H4.75Z" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteClick(teacher.id)}
                  className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500"
                  title="削除"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 16 16"
                    fill="currentColor"
                    className="h-4 w-4"
                  >
                    <path
                      fillRule="evenodd"
                      d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5ZM6.05 6a.75.75 0 0 1 .787.713l.275 5.5a.75.75 0 0 1-1.498.075l-.275-5.5A.75.75 0 0 1 6.05 6Zm3.9 0a.75.75 0 0 1 .712.787l-.275 5.5a.75.75 0 0 1-1.498-.075l.275-5.5a.75.75 0 0 1 .786-.711Z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              </div>
            </div>

            {/* 勤務可能日 */}
            <div>
              <p className="mb-1.5 text-xs font-medium text-gray-500">勤務可能日</p>
              <div className="flex gap-1.5">
                {DAYS.map((day) => {
                  const available = teacher.availableDays.includes(day)
                  return (
                    <span
                      key={day}
                      className={[
                        'flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold',
                        available
                          ? 'bg-primary-100 text-primary-700'
                          : 'bg-gray-100 text-gray-300',
                      ].join(' ')}
                    >
                      {DAY_LABELS[day]}
                    </span>
                  )
                })}
                {teacher.excludedSlots.length > 0 && (
                  <span className="ml-1 self-center text-xs text-red-400">
                    （{teacher.excludedSlots.length}コマ除外）
                  </span>
                )}
              </div>
            </div>

            {/* 担当可能科目 */}
            <div>
              <p className="mb-1.5 text-xs font-medium text-gray-500">担当可能科目</p>
              {teacherSubjects.length === 0 ? (
                <span className="text-xs text-gray-400">未設定</span>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {teacherSubjects.slice(0, MAX_SUBJECTS).map((subject) => (
                    <span
                      key={subject.id}
                      className="badge border border-gray-200 bg-gray-50 text-gray-700"
                      style={subject.color ? { borderColor: subject.color + '55', backgroundColor: subject.color + '18', color: subject.color } : {}}
                    >
                      {subject.name}
                    </span>
                  ))}
                  {teacherSubjects.length > MAX_SUBJECTS && (
                    <span className="badge bg-gray-100 text-gray-500">
                      +{teacherSubjects.length - MAX_SUBJECTS}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* 削除確認 */}
            {isDeleting && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                <p className="mb-2 text-xs font-medium text-red-700">
                  「{teacher.name}」を削除しますか？
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setDeletingId(null)}
                    className="btn-secondary flex-1 py-1 text-xs"
                  >
                    キャンセル
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteConfirm(teacher.id)}
                    className="btn-danger flex-1 py-1 text-xs"
                  >
                    削除する
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
