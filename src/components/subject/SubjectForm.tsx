import { useState } from 'react'
import type { Subject, CreateInput, Period, Grade, SubjectCategory } from '../../types'
import { ErrorAlert } from '../common/ErrorAlert'
import { PERIODS, GRADES, GRADE_LABELS, SUBJECT_CATEGORIES, SUBJECT_COLORS } from '../../utils/constants'

interface FormState {
  name: string
  grade: Grade
  category: SubjectCategory
  credits: number
  weeklyFrequency: number
  isConsecutive: boolean
  noConsecutive: boolean
  usePreferred: boolean
  preferredFrom: Period
  preferredTo: Period
  excludedPeriods: Period[]
  color: string
}

interface SubjectFormProps {
  initialValues?: Subject
  onSubmit: (data: CreateInput<Subject>) => Promise<void>
  onCancel: () => void
}

// ============================================================
// Toggle Switch
// ============================================================

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={onChange}
        className={[
          'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1',
          checked ? 'bg-primary-600' : 'bg-gray-300',
        ].join(' ')}
      >
        <span
          className={[
            'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-6' : 'translate-x-1',
          ].join(' ')}
        />
      </button>
      <span className="text-sm text-gray-700">{label}</span>
    </label>
  )
}

// ============================================================
// SubjectForm
// ============================================================

export function SubjectForm({ initialValues, onSubmit, onCancel }: SubjectFormProps) {
  const isEditMode = !!initialValues

  const [form, setForm] = useState<FormState>({
    name: initialValues?.name ?? '',
    grade: initialValues?.grade ?? 1,
    category: initialValues?.category ?? '国語',
    credits: initialValues?.credits ?? 2,
    weeklyFrequency: initialValues?.weeklyFrequency ?? 2,
    isConsecutive: initialValues?.isConsecutive ?? false,
    noConsecutive: initialValues?.noConsecutive ?? false,
    usePreferred: !!initialValues?.preferredPeriods,
    preferredFrom: initialValues?.preferredPeriods?.from ?? 1,
    preferredTo: initialValues?.preferredPeriods?.to ?? 4,
    excludedPeriods: initialValues?.excludedPeriods ?? [],
    color: initialValues?.color ?? SUBJECT_COLORS[0].value,
  })
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // credits 変更時は weeklyFrequency も同期
  const handleCreditsChange = (credits: number) => {
    setForm((p) => ({
      ...p,
      credits,
      weeklyFrequency: credits,
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)

    if (!form.name.trim()) {
      setFormError('科目名を入力してください')
      return
    }
    if (form.isConsecutive && form.weeklyFrequency % 2 !== 0) {
      setFormError('連続授業の場合、週あたりコマ数は偶数にしてください')
      return
    }
    if (form.usePreferred && form.preferredFrom > form.preferredTo) {
      setFormError('推奨時限の開始は終了以前に設定してください')
      return
    }

    setSubmitting(true)
    try {
      await onSubmit({
        name: form.name.trim(),
        grade: form.grade,
        category: form.category,
        credits: form.credits,
        weeklyFrequency: form.weeklyFrequency,
        isConsecutive: form.isConsecutive,
        noConsecutive: form.noConsecutive,
        ...(form.usePreferred
          ? { preferredPeriods: { from: form.preferredFrom, to: form.preferredTo } }
          : {}),
        ...(form.excludedPeriods.length > 0
          ? { excludedPeriods: [...form.excludedPeriods].sort((a, b) => a - b) }
          : {}),
        color: form.color,
      })
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '保存に失敗しました')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8" noValidate>
      {/* ヘッダー */}
      <div className="flex items-center justify-between border-b border-gray-200 pb-4">
        <h2 className="text-lg font-semibold text-gray-900">
          {isEditMode ? '科目情報を編集' : '科目を新規登録'}
        </h2>
      </div>

      {formError && <ErrorAlert message={formError} onDismiss={() => setFormError(null)} />}

      {/* ── セクション 1: 基本情報 ── */}
      <section className="space-y-4">
        <h3 className="section-heading">基本情報</h3>

        <div>
          <label htmlFor="subject-name" className="form-label">
            科目名 <span className="text-red-500">*</span>
          </label>
          <input
            id="subject-name"
            type="text"
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            className="form-input"
            placeholder="例：数学Ⅱ"
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="subject-grade" className="form-label">
              履修学年 <span className="text-red-500">*</span>
            </label>
            <select
              id="subject-grade"
              value={form.grade}
              onChange={(e) => setForm((p) => ({ ...p, grade: Number(e.target.value) as Grade }))}
              className="form-select"
            >
              {GRADES.map((g) => (
                <option key={g} value={g}>
                  {GRADE_LABELS[g]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="subject-category" className="form-label">
              教科 <span className="text-red-500">*</span>
            </label>
            <select
              id="subject-category"
              value={form.category}
              onChange={(e) => setForm((p) => ({ ...p, category: e.target.value as SubjectCategory }))}
              className="form-select"
            >
              {SUBJECT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="subject-credits" className="form-label">
              単位数
            </label>
            <input
              id="subject-credits"
              type="number"
              min={1}
              max={8}
              value={form.credits}
              onChange={(e) => handleCreditsChange(Number(e.target.value))}
              className="form-input"
            />
          </div>
          <div>
            <label htmlFor="subject-freq" className="form-label">
              週あたりコマ数
            </label>
            <input
              id="subject-freq"
              type="number"
              min={1}
              max={10}
              value={form.weeklyFrequency}
              onChange={(e) => setForm((p) => ({ ...p, weeklyFrequency: Number(e.target.value) }))}
              className="form-input"
            />
            {form.isConsecutive && form.weeklyFrequency % 2 !== 0 && (
              <p className="mt-1 text-xs text-red-500">連続授業の場合は偶数にしてください</p>
            )}
          </div>
        </div>
      </section>

      {/* ── セクション 2: 授業形式 ── */}
      <section className="space-y-4">
        <h3 className="section-heading">授業形式</h3>

        <Toggle
          checked={form.isConsecutive}
          onChange={() => setForm((p) => ({ ...p, isConsecutive: !p.isConsecutive, ...(!p.isConsecutive ? { noConsecutive: false } : {}) }))}
          label="連続授業（2コマ連続で配置）"
        />
        {form.isConsecutive && (
          <p className="ml-14 -mt-2 text-xs text-gray-400">
            実験・実習などで2コマ続けて配置する必要がある科目に設定してください
          </p>
        )}

        <Toggle
          checked={form.noConsecutive}
          onChange={() => setForm((p) => ({ ...p, noConsecutive: !p.noConsecutive, ...(p.noConsecutive ? {} : { isConsecutive: false }) }))}
          label="連続配置禁止（同日に連続コマに配置しない）"
        />
        {form.noConsecutive && (
          <p className="ml-14 -mt-2 text-xs text-gray-400">
            同じ日の連続する時限に配置されないよう制約します（例: 1限と2限に入れない）
          </p>
        )}

        {/* 推奨時限 */}
        <div>
          <Toggle
            checked={form.usePreferred}
            onChange={() => setForm((p) => ({ ...p, usePreferred: !p.usePreferred }))}
            label="推奨時限を指定する"
          />
          {form.usePreferred && (
            <div className="mt-3 ml-14 flex items-center gap-3">
              <select
                value={form.preferredFrom}
                onChange={(e) =>
                  setForm((p) => ({ ...p, preferredFrom: Number(e.target.value) as Period }))
                }
                className="form-select w-20"
              >
                {PERIODS.map((p) => (
                  <option key={p} value={p}>
                    {p}限
                  </option>
                ))}
              </select>
              <span className="text-sm text-gray-500">〜</span>
              <select
                value={form.preferredTo}
                onChange={(e) =>
                  setForm((p) => ({ ...p, preferredTo: Number(e.target.value) as Period }))
                }
                className="form-select w-20"
              >
                {PERIODS.map((p) => (
                  <option key={p} value={p} disabled={p < form.preferredFrom}>
                    {p}限
                  </option>
                ))}
              </select>
              <span className="text-xs text-gray-400">に優先配置</span>
            </div>
          )}
        </div>

        {/* 配置不可時限 */}
        <div>
          <p className="mb-2 text-sm font-medium text-gray-700">
            配置不可時限
          </p>
          <p className="mb-3 text-xs text-gray-400">
            この科目を配置しない時限を選択（例: 体育を1限・5限に入れない）
          </p>
          <div className="flex gap-2">
            {PERIODS.map((p) => {
              const excluded = form.excludedPeriods.includes(p)
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      excludedPeriods: excluded
                        ? prev.excludedPeriods.filter((ep) => ep !== p)
                        : [...prev.excludedPeriods, p],
                    }))
                  }
                  className={[
                    'flex h-10 w-12 items-center justify-center rounded-lg text-sm font-bold transition-all',
                    excluded
                      ? 'border-2 border-red-300 bg-red-100 text-red-600'
                      : 'border border-gray-200 bg-white text-gray-400 hover:border-gray-300 hover:bg-gray-50',
                  ].join(' ')}
                >
                  {p}限
                </button>
              )
            })}
          </div>
          {form.excludedPeriods.length > 0 && (
            <p className="mt-2 text-xs text-red-500">
              {form.excludedPeriods.sort((a, b) => a - b).join('・')}限を配置不可に設定中
              <button
                type="button"
                onClick={() => setForm((p) => ({ ...p, excludedPeriods: [] }))}
                className="ml-2 underline hover:text-red-700"
              >
                クリア
              </button>
            </p>
          )}
        </div>
      </section>

      {/* ── セクション 3: 表示カラー ── */}
      <section>
        <h3 className="section-heading">表示カラー</h3>
        <div className="flex flex-wrap gap-2">
          {SUBJECT_COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => setForm((p) => ({ ...p, color: c.value }))}
              title={c.label}
              className={[
                'h-8 w-8 rounded-full transition-all',
                form.color === c.value ? 'ring-2 ring-gray-800 ring-offset-2 scale-110' : 'hover:scale-110',
              ].join(' ')}
              style={{ backgroundColor: c.value }}
            />
          ))}
        </div>
        {/* プレビュー */}
        <div className="mt-3 flex items-center gap-2">
          <span
            className="badge text-white"
            style={{ backgroundColor: form.color }}
          >
            {form.name || '科目名'}
          </span>
          <span className="text-xs text-gray-400">時間割上での表示イメージ</span>
        </div>
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
