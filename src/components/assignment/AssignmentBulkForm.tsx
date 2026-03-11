import { useState } from 'react'
import type { Teacher, Subject, Assignment, CreateInput } from '../../types'
import { ErrorAlert } from '../common/ErrorAlert'
import { CLASS_OPTIONS, SUBJECT_CATEGORIES } from '../../utils/constants'
import type { ClassOption } from '../../utils/constants'

interface BulkRow {
  classId: string
  subjectId: string
  teacherIds: string[]
  weeklyCount: number
}

interface AssignmentBulkFormProps {
  teachers: Teacher[]
  subjects: Subject[]
  existingAssignments: Assignment[]
  onSubmit: (data: CreateInput<Assignment>[]) => Promise<void>
  onCancel: () => void
}

function emptyRow(): BulkRow {
  return { classId: '', subjectId: '', teacherIds: [], weeklyCount: 2 }
}

export function AssignmentBulkForm({
  teachers,
  subjects,
  existingAssignments,
  onSubmit,
  onCancel,
}: AssignmentBulkFormProps) {
  const [rows, setRows] = useState<BulkRow[]>([emptyRow()])
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const updateRow = (index: number, patch: Partial<BulkRow>) => {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  const handleSubjectChange = (index: number, subjectId: string) => {
    const subject = subjects.find((s) => s.id === subjectId)
    updateRow(index, {
      subjectId,
      weeklyCount: subject?.weeklyFrequency ?? rows[index].weeklyCount,
    })
  }

  const addRow = () => setRows((prev) => [...prev, emptyRow()])

  const removeRow = (index: number) => {
    setRows((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)

    const validRows = rows.filter((r) => r.classId && r.subjectId && r.teacherIds.length > 0 && r.weeklyCount >= 1)
    if (validRows.length === 0) {
      setFormError('有効な行が1つもありません。クラス・科目・教員を設定してください。')
      return
    }

    // 重複チェック
    const duplicates: string[] = []
    for (const row of validRows) {
      const exists = existingAssignments.some(
        (a) => a.classId === row.classId && a.subjectId === row.subjectId,
      )
      if (exists) {
        const cls = CLASS_OPTIONS.find((c) => c.id === row.classId)
        const subj = subjects.find((s) => s.id === row.subjectId)
        duplicates.push(`${cls?.displayName ?? row.classId} × ${subj?.name ?? row.subjectId}`)
      }
    }
    if (duplicates.length > 0) {
      setFormError(`以下の割当は既に登録されています: ${duplicates.join(', ')}`)
      return
    }

    setSubmitting(true)
    try {
      const inputs: CreateInput<Assignment>[] = validRows.map((r) => ({
        classId: r.classId,
        subjectId: r.subjectId,
        teacherIds: r.teacherIds,
        weeklyCount: r.weeklyCount,
      }))
      await onSubmit(inputs)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '保存に失敗しました')
    } finally {
      setSubmitting(false)
    }
  }

  // 学年ごとにクラスをグルーピング
  const classGroups: { grade: number; classes: ClassOption[] }[] = [1, 2, 3].map((grade) => ({
    grade,
    classes: CLASS_OPTIONS.filter((c) => c.grade === grade),
  }))

  // 教科カテゴリごとに科目をグルーピング（科目名でソート）
  const subjectGroups = SUBJECT_CATEGORIES
    .map((cat) => ({
      category: cat,
      subjects: subjects
        .filter((s) => s.category === cat)
        .sort((a, b) => a.name.localeCompare(b.name, 'ja')),
    }))
    .filter((g) => g.subjects.length > 0)

  // 所属教科ごとに教員をグルーピング（五十音順ソート）
  const teacherGroups = [
    ...SUBJECT_CATEGORIES
      .map((cat) => ({
        label: cat,
        teachers: teachers
          .filter((t) => t.department === cat)
          .sort((a, b) => a.name.localeCompare(b.name, 'ja')),
      }))
      .filter((g) => g.teachers.length > 0),
    // 所属教科未設定の教員
    ...(() => {
      const unassigned = teachers
        .filter((t) => !t.department)
        .sort((a, b) => a.name.localeCompare(b.name, 'ja'))
      return unassigned.length > 0 ? [{ label: 'その他', teachers: unassigned }] : []
    })(),
  ]

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      <div className="flex items-center justify-between border-b border-gray-200 pb-4">
        <h2 className="text-lg font-semibold text-gray-900">授業割当を一括登録</h2>
      </div>

      {formError && <ErrorAlert message={formError} onDismiss={() => setFormError(null)} />}

      <div className="space-y-3">
        {rows.map((row, idx) => (
          <div key={idx} className="flex flex-col sm:flex-row items-start gap-2 rounded-lg border border-gray-200 bg-white p-3">
            <div className="grid flex-1 w-full grid-cols-2 sm:grid-cols-4 gap-2">
              {/* クラス */}
              <label className="block">
                {idx === 0 && <span className="text-xs font-medium text-gray-500 mb-1 block">クラス</span>}
                <select
                  value={row.classId}
                  onChange={(e) => updateRow(idx, { classId: e.target.value })}
                  className="form-select text-sm w-full"
                >
                  <option value="">選択...</option>
                  {classGroups.map((g) => (
                    <optgroup key={g.grade} label={`${g.grade}年生`}>
                      {g.classes.map((c) => (
                        <option key={c.id} value={c.id}>{c.displayName}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>

              {/* 科目 */}
              <label className="block">
                {idx === 0 && <span className="text-xs font-medium text-gray-500 mb-1 block">科目</span>}
                <select
                  value={row.subjectId}
                  onChange={(e) => handleSubjectChange(idx, e.target.value)}
                  className="form-select text-sm w-full"
                >
                  <option value="">選択...</option>
                  {subjectGroups.map((g) => (
                    <optgroup key={g.category} label={g.category}>
                      {g.subjects.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>

              {/* 教員 */}
              <label className="block">
                {idx === 0 && <span className="text-xs font-medium text-gray-500 mb-1 block">教員</span>}
                <select
                  value={row.teacherIds[0] ?? ''}
                  onChange={(e) => updateRow(idx, {
                    teacherIds: e.target.value ? [e.target.value] : [],
                  })}
                  className="form-select text-sm w-full"
                >
                  <option value="">選択...</option>
                  {teacherGroups.map((g) => (
                    <optgroup key={g.label} label={g.label}>
                      {g.teachers.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>

              {/* 週コマ数 */}
              <label className="block">
                {idx === 0 && <span className="text-xs font-medium text-gray-500 mb-1 block">週コマ数</span>}
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={row.weeklyCount || ''}
                  onChange={(e) => updateRow(idx, { weeklyCount: Number(e.target.value) || 0 })}
                  className="form-input text-sm w-full"
                  placeholder="週コマ数"
                />
              </label>
            </div>

            {/* 削除ボタン */}
            {rows.length > 1 && (
              <button
                type="button"
                onClick={() => removeRow(idx)}
                className="mt-1 rounded p-1 text-gray-300 hover:bg-red-50 hover:text-red-500"
                title="行を削除"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
                  <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
                </svg>
              </button>
            )}
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addRow}
        className="text-sm text-primary-600 hover:text-primary-800"
      >
        + 行を追加
      </button>

      <div className="flex justify-end gap-3 border-t border-gray-200 pt-6">
        <button type="button" onClick={onCancel} className="btn-secondary">
          キャンセル
        </button>
        <button type="submit" disabled={submitting} className="btn-primary">
          {submitting ? '登録中...' : `${rows.filter((r) => r.classId && r.subjectId && r.teacherIds.length > 0 && r.weeklyCount >= 1).length}件を一括登録`}
        </button>
      </div>
    </form>
  )
}
