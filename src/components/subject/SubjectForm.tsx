import { useState, useMemo } from 'react'
import type { Subject, CreateInput, Period, Grade, SubjectCategory } from '../../types'
import { ErrorAlert } from '../common/ErrorAlert'
import { PERIODS, GRADES, GRADE_LABELS, SUBJECT_CATEGORIES, SUBJECT_COLORS } from '../../utils/constants'

interface FormState {
  name: string
  grade: Grade
  category: SubjectCategory
  credits: number
  weeklyFrequency: number
  consecutivePairs: number
  noConsecutive: boolean
  usePreferred: boolean
  preferredFrom: Period
  preferredTo: Period
  excludedPeriods: Period[]
  spreadDays: boolean
  tags: string[]
  tagInput: string
  color: string
}

interface SubjectFormProps {
  initialValues?: Subject
  /** 既存の全科目から収集したタグ一覧（候補表示用） */
  existingTags?: string[]
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
// TagInput（既存タグ候補 + 自由入力）
// ============================================================

function TagInput({
  value,
  onChange,
  existingTags,
  selectedTags,
  onAdd,
}: {
  value: string
  onChange: (v: string) => void
  existingTags: string[]
  selectedTags: string[]
  onAdd: (tag: string) => void
}) {
  const [showSuggestions, setShowSuggestions] = useState(false)

  // 未選択の既存タグから候補をフィルタ
  const suggestions = useMemo(() => {
    const available = existingTags.filter((t) => !selectedTags.includes(t))
    if (!value.trim()) return available
    return available.filter((t) => t.toLowerCase().includes(value.toLowerCase()))
  }, [existingTags, selectedTags, value])

  const addTag = (tag: string) => {
    const trimmed = tag.trim()
    if (trimmed && !selectedTags.includes(trimmed)) {
      onAdd(trimmed)
    }
    setShowSuggestions(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (value.trim()) addTag(value)
    }
  }

  // 未選択の既存タグがあるかどうか
  const hasUnselected = existingTags.some((t) => !selectedTags.includes(t))

  return (
    <div className="relative">
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => { onChange(e.target.value); setShowSuggestions(true) }}
          onFocus={() => setShowSuggestions(true)}
          onKeyDown={handleKeyDown}
          placeholder="タグを入力（Enterで追加）"
          className="form-input flex-1"
        />
        {value.trim() && (
          <button
            type="button"
            onClick={() => addTag(value)}
            className="btn-secondary shrink-0"
          >
            追加
          </button>
        )}
      </div>

      {/* 候補ドロップダウン */}
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute z-10 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg max-h-40 overflow-y-auto">
          {suggestions.map((tag) => (
            <button
              key={tag}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => addTag(tag)}
              className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-primary-50 hover:text-primary-700"
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      {/* 既存タグがある場合のクイック追加ボタン */}
      {!showSuggestions && hasUnselected && !value && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {existingTags
            .filter((t) => !selectedTags.includes(t))
            .map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => addTag(tag)}
                className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-xs text-gray-500 hover:border-primary-300 hover:bg-primary-50 hover:text-primary-600 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                  <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z" />
                </svg>
                {tag}
              </button>
            ))}
        </div>
      )}
    </div>
  )
}

// ============================================================
// SubjectForm
// ============================================================

export function SubjectForm({ initialValues, existingTags = [], onSubmit, onCancel }: SubjectFormProps) {
  const isEditMode = !!initialValues

  const [form, setForm] = useState<FormState>({
    name: initialValues?.name ?? '',
    grade: initialValues?.grade ?? 1,
    category: initialValues?.category ?? '国語',
    credits: initialValues?.credits ?? 2,
    weeklyFrequency: initialValues?.weeklyFrequency ?? 2,
    consecutivePairs: initialValues?.consecutivePairs ?? 0,
    noConsecutive: initialValues?.noConsecutive ?? false,
    usePreferred: !!initialValues?.preferredPeriods,
    preferredFrom: initialValues?.preferredPeriods?.from ?? 1,
    preferredTo: initialValues?.preferredPeriods?.to ?? 4,
    excludedPeriods: initialValues?.excludedPeriods ?? [],
    spreadDays: initialValues?.spreadDays ?? false,
    tags: initialValues?.tags ?? [],
    tagInput: '',
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
    if (form.consecutivePairs > 0 && form.consecutivePairs * 2 > form.weeklyFrequency) {
      setFormError('連続ペア数×2が週あたりコマ数を超えています')
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
        consecutivePairs: form.consecutivePairs,
        noConsecutive: form.noConsecutive,
        ...(form.usePreferred
          ? { preferredPeriods: { from: form.preferredFrom, to: form.preferredTo } }
          : {}),
        ...(form.excludedPeriods.length > 0
          ? { excludedPeriods: [...form.excludedPeriods].sort((a, b) => a - b) }
          : {}),
        ...(form.spreadDays ? { spreadDays: true } : {}),
        ...(form.tags.length > 0 ? { tags: form.tags } : {}),
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
            {form.consecutivePairs > 0 && form.consecutivePairs * 2 > form.weeklyFrequency && (
              <p className="mt-1 text-xs text-red-500">連続ペア数×2がコマ数を超えています</p>
            )}
          </div>
        </div>
      </section>

      {/* ── セクション 2: 授業形式 ── */}
      <section className="space-y-4">
        <h3 className="section-heading">授業形式</h3>

        {/* 連続授業ペア数 */}
        <div>
          <label htmlFor="consecutive-pairs" className="form-label">
            連続授業ペア数
          </label>
          <div className="flex items-center gap-3">
            <input
              id="consecutive-pairs"
              type="number"
              min={0}
              max={Math.floor(form.weeklyFrequency / 2)}
              value={form.consecutivePairs}
              onChange={(e) => {
                const v = Number(e.target.value)
                setForm((p) => ({
                  ...p,
                  consecutivePairs: v,
                  ...(v > 0 ? { noConsecutive: false } : {}),
                }))
              }}
              className="form-input w-20"
            />
            <span className="text-sm text-gray-500">
              ペア（{form.consecutivePairs * 2}コマ連続 + {form.weeklyFrequency - form.consecutivePairs * 2}コマ単独）
            </span>
          </div>
          {form.consecutivePairs > 0 && (
            <p className="mt-1 text-xs text-gray-400">
              実験・実習などで2コマ続けて配置する必要がある場合に設定。
              例: 週3コマ・1ペア → 連続2コマ×1回 + 単独1コマ
            </p>
          )}
          {form.consecutivePairs > 0 && form.consecutivePairs * 2 > form.weeklyFrequency && (
            <p className="mt-1 text-xs text-red-500">
              連続ペア数×2が週あたりコマ数を超えています
            </p>
          )}
        </div>

        <Toggle
          checked={form.noConsecutive}
          onChange={() => setForm((p) => ({ ...p, noConsecutive: !p.noConsecutive, ...(p.noConsecutive ? {} : { consecutivePairs: 0 }) }))}
          label="連続配置禁止（同日に連続コマに配置しない）"
        />
        {form.noConsecutive && (
          <p className="ml-14 -mt-2 text-xs text-gray-400">
            同じ日の連続する時限に配置されないよう制約します（例: 1限と2限に入れない）
          </p>
        )}

        <Toggle
          checked={form.spreadDays}
          onChange={() => setForm((p) => ({ ...p, spreadDays: !p.spreadDays }))}
          label="曜日分散（別の日に分けて配置）"
        />
        {form.spreadDays && (
          <p className="ml-14 -mt-2 text-xs text-gray-400">
            同じ科目を同日に複数回配置しません。また隣接曜日（月→火等）を避けて分散します。
            例: 体育を月・水に配置、家庭基礎4単位を2コマ×別日に配置
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

      {/* ── セクション 3: タグ ── */}
      <section className="space-y-3">
        <h3 className="section-heading">タグ</h3>
        <p className="text-xs text-gray-400">
          学科・コースなどの分類タグを設定すると、科目一覧や授業割当で絞り込みに使えます（任意）
        </p>

        {/* 追加済みタグ */}
        {form.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {form.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 rounded-full bg-primary-50 border border-primary-200 px-2.5 py-0.5 text-xs font-medium text-primary-700"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, tags: p.tags.filter((t) => t !== tag) }))}
                  className="ml-0.5 text-primary-400 hover:text-primary-600"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                    <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
                  </svg>
                </button>
              </span>
            ))}
          </div>
        )}

        {/* タグ入力 */}
        <TagInput
          value={form.tagInput}
          onChange={(v) => setForm((p) => ({ ...p, tagInput: v }))}
          existingTags={existingTags}
          selectedTags={form.tags}
          onAdd={(tag) => setForm((p) => ({
            ...p,
            tags: [...p.tags, tag],
            tagInput: '',
          }))}
        />
      </section>

      {/* ── セクション 4: 表示カラー ── */}
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
