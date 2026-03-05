import { useState } from 'react'
import type { Assignment, Teacher, Subject, CreateInput } from '../../types'
import { ErrorAlert } from '../common/ErrorAlert'
import { CLASS_OPTIONS } from '../../utils/constants'

interface FormState {
  classId: string
  subjectId: string
  teacherIds: string[]
  weeklyCount: number
  notes: string
}

interface AssignmentFormProps {
  initialValues?: Assignment
  teachers: Teacher[]
  subjects: Subject[]
  onSubmit: (data: CreateInput<Assignment>) => Promise<void>
  onCancel: () => void
}

// ============================================================
// AssignmentForm
// ============================================================

export function AssignmentForm({
  initialValues,
  teachers,
  subjects,
  onSubmit,
  onCancel,
}: AssignmentFormProps) {
  const isEditMode = !!initialValues

  const [form, setForm] = useState<FormState>({
    classId: initialValues?.classId ?? '',
    subjectId: initialValues?.subjectId ?? '',
    teacherIds: initialValues?.teacherIds ?? [],
    weeklyCount: initialValues?.weeklyCount ?? 2,
    notes: initialValues?.notes ?? '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // subjectId 変更時に weeklyCount を科目の週頻度に同期
  const handleSubjectChange = (subjectId: string) => {
    const subject = subjects.find((s) => s.id === subjectId)
    setForm((p) => ({
      ...p,
      subjectId,
      weeklyCount: subject?.weeklyFrequency ?? p.weeklyCount,
    }))
  }

  const toggleTeacher = (teacherId: string) => {
    setForm((p) => ({
      ...p,
      teacherIds: p.teacherIds.includes(teacherId)
        ? p.teacherIds.filter((id) => id !== teacherId)
        : [...p.teacherIds, teacherId],
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)

    if (!form.classId) {
      setFormError('クラスを選択してください')
      return
    }
    if (!form.subjectId) {
      setFormError('科目を選択してください')
      return
    }
    if (form.teacherIds.length === 0) {
      setFormError('担当教員を1名以上選択してください')
      return
    }

    setSubmitting(true)
    try {
      await onSubmit({
        classId: form.classId,
        subjectId: form.subjectId,
        teacherIds: form.teacherIds,
        weeklyCount: form.weeklyCount,
        ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
      })
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '保存に失敗しました')
    } finally {
      setSubmitting(false)
    }
  }

  const selectedSubject = subjects.find((s) => s.id === form.subjectId)
  const isTT = form.teacherIds.length > 1

  return (
    <form onSubmit={handleSubmit} className="space-y-8" noValidate>
      {/* ヘッダー */}
      <div className="flex items-center justify-between border-b border-gray-200 pb-4">
        <h2 className="text-lg font-semibold text-gray-900">
          {isEditMode ? '授業割当を編集' : '授業割当を新規登録'}
        </h2>
      </div>

      {formError && <ErrorAlert message={formError} onDismiss={() => setFormError(null)} />}

      {/* ── セクション 1: クラス × 科目 ── */}
      <section className="space-y-4">
        <h3 className="section-heading">クラスと科目</h3>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="assign-class" className="form-label">
              クラス <span className="text-red-500">*</span>
            </label>
            <select
              id="assign-class"
              value={form.classId}
              onChange={(e) => setForm((p) => ({ ...p, classId: e.target.value }))}
              className="form-select"
              required
            >
              <option value="">選択してください</option>
              {[1, 2, 3].map((grade) => (
                <optgroup key={grade} label={`${grade}年生`}>
                  {CLASS_OPTIONS.filter((c) => c.grade === grade).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.displayName}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="assign-subject" className="form-label">
              科目 <span className="text-red-500">*</span>
            </label>
            <select
              id="assign-subject"
              value={form.subjectId}
              onChange={(e) => handleSubjectChange(e.target.value)}
              className="form-select"
              required
            >
              <option value="">選択してください</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* 選択した科目の情報ヒント */}
        {selectedSubject && (
          <div className="flex flex-wrap gap-2 rounded-lg bg-gray-50 p-3">
            <span className="badge border border-gray-200 bg-white text-gray-600">
              {selectedSubject.credits}単位
            </span>
            {selectedSubject.isConsecutive && (
              <span className="badge border border-amber-200 bg-amber-50 text-amber-700">
                連続授業
              </span>
            )}
            {selectedSubject.preferredPeriods && (
              <span className="badge border border-blue-200 bg-blue-50 text-blue-700">
                {selectedSubject.preferredPeriods.from}〜{selectedSubject.preferredPeriods.to}限推奨
              </span>
            )}
          </div>
        )}

        <div className="w-36">
          <label htmlFor="assign-weekly" className="form-label">
            週あたりコマ数
          </label>
          <input
            id="assign-weekly"
            type="number"
            min={1}
            max={10}
            value={form.weeklyCount}
            onChange={(e) => setForm((p) => ({ ...p, weeklyCount: Number(e.target.value) }))}
            className="form-input"
          />
          {selectedSubject && form.weeklyCount !== selectedSubject.weeklyFrequency && (
            <p className="mt-1 text-xs text-amber-600">
              科目の標準（{selectedSubject.weeklyFrequency}コマ）と異なります
            </p>
          )}
        </div>
      </section>

      {/* ── セクション 2: 担当教員（TT対応マルチセレクト） ── */}
      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h3 className="section-heading mb-0">
            担当教員{' '}
            <span className="text-red-500">*</span>
          </h3>
          <div className="flex items-center gap-2">
            {isTT && (
              <span className="badge border border-indigo-200 bg-indigo-50 text-indigo-700">
                TT授業（{form.teacherIds.length}名）
              </span>
            )}
            {form.teacherIds.length > 0 && (
              <button
                type="button"
                onClick={() => setForm((p) => ({ ...p, teacherIds: [] }))}
                className="text-xs text-gray-400 underline hover:text-gray-600"
              >
                クリア
              </button>
            )}
          </div>
        </div>

        {teachers.length === 0 ? (
          <p className="text-sm text-gray-400">教員が登録されていません</p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {teachers.map((teacher) => {
              const selected = form.teacherIds.includes(teacher.id)
              // 選択中の科目が担当可能かチェック
              const canTeach =
                !form.subjectId || teacher.subjectIds.includes(form.subjectId)

              return (
                <label
                  key={teacher.id}
                  className={[
                    'flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-all',
                    selected
                      ? 'border-primary-300 bg-primary-50'
                      : canTeach
                        ? 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                        : 'border-gray-100 bg-gray-50 opacity-50',
                  ].join(' ')}
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => toggleTeacher(teacher.id)}
                    disabled={!canTeach && !selected}
                    className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <div className="min-w-0">
                    <p
                      className={`truncate text-sm font-medium ${
                        selected ? 'text-primary-800' : 'text-gray-800'
                      }`}
                    >
                      {teacher.name}
                    </p>
                    {!canTeach && (
                      <p className="text-xs text-gray-400">担当科目外</p>
                    )}
                  </div>
                </label>
              )
            })}
          </div>
        )}

        {form.teacherIds.length === 0 && (
          <p className="mt-2 text-xs text-red-500">担当教員を1名以上選択してください</p>
        )}
      </section>

      {/* ── セクション 3: 備考 ── */}
      <section>
        <h3 className="section-heading">備考</h3>
        <textarea
          value={form.notes}
          onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
          className="form-input min-h-[72px] resize-y"
          placeholder="特記事項など"
        />
      </section>

      {/* ── アクションボタン ── */}
      <div className="flex justify-end gap-3 border-t border-gray-200 pt-6">
        <button type="button" onClick={onCancel} className="btn-secondary">
          キャンセル
        </button>
        <button type="submit" disabled={submitting} className="btn-primary">
          {submitting ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              保存中...
            </>
          ) : isEditMode ? (
            '更新する'
          ) : (
            '登録する'
          )}
        </button>
      </div>
    </form>
  )
}
