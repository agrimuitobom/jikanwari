import { useState, useMemo } from 'react'
import type { Subject, Grade, SubjectCategory } from '../../types'
import { GRADES, GRADE_LABELS, SUBJECT_CATEGORIES } from '../../utils/constants'

interface SubjectListProps {
  subjects: Subject[]
  onEdit: (subject: Subject) => void
  onDelete: (id: string) => void
}

export function SubjectList({ subjects, onEdit, onDelete }: SubjectListProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [filterGrade, setFilterGrade] = useState<Grade | 'all'>('all')
  const [filterCategory, setFilterCategory] = useState<SubjectCategory | 'all'>('all')

  const filtered = useMemo(() => {
    let result = subjects
    if (filterGrade !== 'all') {
      result = result.filter((s) => s.grade === filterGrade)
    }
    if (filterCategory !== 'all') {
      result = result.filter((s) => s.category === filterCategory)
    }
    // Sort by grade, then category, then name
    return result.sort((a, b) => {
      if (a.grade !== b.grade) return a.grade - b.grade
      if (a.category !== b.category) return a.category.localeCompare(b.category)
      return a.name.localeCompare(b.name)
    })
  }, [subjects, filterGrade, filterCategory])

  // Gather categories actually in use for the dropdown
  const usedCategories = useMemo(() => {
    const cats = new Set(subjects.map((s) => s.category))
    return SUBJECT_CATEGORIES.filter((c) => cats.has(c))
  }, [subjects])

  if (subjects.length === 0) {
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
            d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"
          />
        </svg>
        <p className="text-sm">科目が登録されていません</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
        <span className="text-sm font-medium text-gray-600">絞り込み:</span>
        <select
          value={filterGrade}
          onChange={(e) => setFilterGrade(e.target.value === 'all' ? 'all' : (Number(e.target.value) as Grade))}
          className="form-select py-1.5 text-sm"
        >
          <option value="all">全学年</option>
          {GRADES.map((g) => (
            <option key={g} value={g}>
              {GRADE_LABELS[g]}
            </option>
          ))}
        </select>
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value === 'all' ? 'all' : (e.target.value as SubjectCategory))}
          className="form-select py-1.5 text-sm"
        >
          <option value="all">全教科</option>
          {usedCategories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <span className="ml-auto text-xs text-gray-400">
          {filtered.length} / {subjects.length} 件
        </span>
      </div>

      {/* Subject cards */}
      {filtered.length === 0 ? (
        <div className="py-12 text-center text-sm text-gray-400">
          該当する科目がありません
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((subject) => {
            const isDeleting = deletingId === subject.id

            return (
              <div key={subject.id} className="card flex flex-col gap-3 p-5">
                {/* 科目名 + アクション */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {subject.color && (
                      <span
                        className="h-4 w-4 shrink-0 rounded-full"
                        style={{ backgroundColor: subject.color }}
                      />
                    )}
                    <p className="text-base font-semibold text-gray-900">{subject.name}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => onEdit(subject)}
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
                      onClick={() => setDeletingId(subject.id)}
                      className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500"
                      title="削除"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
                        <path fillRule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5ZM6.05 6a.75.75 0 0 1 .787.713l.275 5.5a.75.75 0 0 1-1.498.075l-.275-5.5A.75.75 0 0 1 6.05 6Zm3.9 0a.75.75 0 0 1 .712.787l-.275 5.5a.75.75 0 0 1-1.498-.075l.275-5.5a.75.75 0 0 1 .786-.711Z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* 詳細情報 */}
                <div className="flex flex-wrap gap-2">
                  <span className="badge border border-indigo-200 bg-indigo-50 text-indigo-700">
                    {GRADE_LABELS[subject.grade]}
                  </span>
                  <span className="badge border border-teal-200 bg-teal-50 text-teal-700">
                    {subject.category}
                  </span>
                  <span className="badge border border-gray-200 bg-gray-50 text-gray-600">
                    {subject.credits}単位
                  </span>
                  <span className="badge border border-gray-200 bg-gray-50 text-gray-600">
                    週{subject.weeklyFrequency}コマ
                  </span>
                  {subject.isConsecutive && (
                    <span className="badge border border-amber-200 bg-amber-50 text-amber-700">
                      連続授業
                    </span>
                  )}
                  {subject.preferredPeriods && (
                    <span className="badge border border-blue-200 bg-blue-50 text-blue-700">
                      {subject.preferredPeriods.from}〜{subject.preferredPeriods.to}限推奨
                    </span>
                  )}
                </div>

                {/* 削除確認 */}
                {isDeleting && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                    <p className="mb-2 text-xs font-medium text-red-700">
                      「{subject.name}」を削除しますか？
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
                        onClick={() => { onDelete(subject.id); setDeletingId(null) }}
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
      )}
    </div>
  )
}
