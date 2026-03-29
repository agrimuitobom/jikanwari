import { useState } from 'react'
import type { Room, CreateInput, DayOfWeek, Period, TimeSlot } from '../../types'
import { ErrorAlert } from '../common/ErrorAlert'
import { DAYS, DAY_LABELS, PERIODS } from '../../utils/constants'

interface FormState {
  name: string
  category: string
  availableDays: DayOfWeek[]
  excludedSlots: TimeSlot[]
  memo: string
}

interface RoomFormProps {
  initialValues?: Room
  onSubmit: (data: CreateInput<Room>) => Promise<void>
  onCancel: () => void
}

// ============================================================
// 除外コマグリッド（サブコンポーネント）
// ============================================================

interface SlotGridProps {
  value: TimeSlot[]
  availableDays: DayOfWeek[]
  onChange: (slots: TimeSlot[]) => void
}

function ExcludedSlotGrid({ value, availableDays, onChange }: SlotGridProps) {
  const isExcluded = (day: DayOfWeek, period: Period) =>
    value.some((s) => s.day === day && s.period === period)

  const toggle = (day: DayOfWeek, period: Period) => {
    if (!availableDays.includes(day)) return
    onChange(
      isExcluded(day, period)
        ? value.filter((s) => !(s.day === day && s.period === period))
        : [...value, { day, period }],
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="select-none text-center text-sm">
        <thead>
          <tr>
            <th className="w-10 pb-2" />
            {DAYS.map((day) => (
              <th
                key={day}
                className={`w-11 pb-2 text-sm font-semibold ${
                  availableDays.includes(day) ? 'text-gray-700' : 'text-gray-300'
                }`}
              >
                {DAY_LABELS[day]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PERIODS.map((period) => (
            <tr key={period}>
              <td className="pr-2 text-right text-xs text-gray-400">{period}限</td>
              {DAYS.map((day) => {
                const working = availableDays.includes(day)
                const excluded = isExcluded(day, period)
                return (
                  <td key={day} className="p-0.5">
                    <button
                      type="button"
                      disabled={!working}
                      onClick={() => toggle(day, period)}
                      title={
                        !working
                          ? `${DAY_LABELS[day]}曜日は利用不可`
                          : `${DAY_LABELS[day]}曜${period}限 ${excluded ? '（除外中 — クリックで解除）' : '（クリックで除外）'}`
                      }
                      className={[
                        'flex h-9 w-10 items-center justify-center rounded text-sm font-medium transition-all',
                        !working
                          ? 'cursor-not-allowed bg-gray-100 text-gray-300'
                          : excluded
                            ? 'border border-red-300 bg-red-100 text-red-600 hover:bg-red-200'
                            : 'border border-gray-200 bg-white text-gray-300 hover:border-primary-300 hover:bg-primary-50 hover:text-primary-500',
                      ].join(' ')}
                    >
                      {!working ? '—' : excluded ? '✕' : ''}
                    </button>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {value.length > 0 && (
        <p className="mt-2 text-xs text-red-500">
          {value.length}コマを除外設定中
          <button
            type="button"
            onClick={() => onChange([])}
            className="ml-2 underline hover:text-red-700"
          >
            すべてクリア
          </button>
        </p>
      )}
    </div>
  )
}

// ============================================================
// RoomForm
// ============================================================

export function RoomForm({ initialValues, onSubmit, onCancel }: RoomFormProps) {
  const isEditMode = !!initialValues

  const [form, setForm] = useState<FormState>({
    name: initialValues?.name ?? '',
    category: initialValues?.category ?? '',
    availableDays: initialValues?.availableDays ?? [
      'monday', 'tuesday', 'wednesday', 'thursday', 'friday',
    ],
    excludedSlots: initialValues?.excludedSlots ?? [],
    memo: initialValues?.memo ?? '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const handleDayToggle = (day: DayOfWeek) => {
    setForm((prev) => {
      const newDays = prev.availableDays.includes(day)
        ? prev.availableDays.filter((d) => d !== day)
        : [...prev.availableDays, day]
      return {
        ...prev,
        availableDays: newDays,
        excludedSlots: prev.excludedSlots.filter((s) => newDays.includes(s.day)),
      }
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)

    if (!form.name.trim()) {
      setFormError('施設名を入力してください')
      return
    }
    if (form.availableDays.length === 0) {
      setFormError('利用可能日を1日以上選択してください')
      return
    }

    setSubmitting(true)
    try {
      await onSubmit({
        name: form.name.trim(),
        ...(form.category.trim() ? { category: form.category.trim() } : {}),
        availableDays: form.availableDays,
        excludedSlots: form.excludedSlots,
        ...(form.memo.trim() ? { memo: form.memo.trim() } : {}),
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
          {isEditMode ? '教室・施設を編集' : '教室・施設を新規登録'}
        </h2>
      </div>

      {formError && <ErrorAlert message={formError} onDismiss={() => setFormError(null)} />}

      {/* ── セクション 1: 基本情報 ── */}
      <section className="space-y-4">
        <h3 className="section-heading">基本情報</h3>
        <div>
          <label htmlFor="room-name" className="form-label">
            施設名 <span className="text-red-500">*</span>
          </label>
          <input
            id="room-name"
            type="text"
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            className="form-input"
            placeholder="例：第1農場、調理実習室、PC教室"
            required
          />
        </div>
        <div>
          <label htmlFor="room-category" className="form-label">
            種別
          </label>
          <input
            id="room-category"
            type="text"
            value={form.category}
            onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
            className="form-input"
            placeholder="例：農場、実習室、体育施設、教室"
          />
        </div>
        <div>
          <label htmlFor="room-memo" className="form-label">
            メモ
          </label>
          <textarea
            id="room-memo"
            value={form.memo}
            onChange={(e) => setForm((p) => ({ ...p, memo: e.target.value }))}
            className="form-input min-h-[72px] resize-y"
            placeholder="備考・特記事項など"
          />
        </div>
      </section>

      {/* ── セクション 2: 利用可能日 ── */}
      <section>
        <h3 className="section-heading">利用可能日</h3>
        <div className="flex gap-3">
          {DAYS.map((day) => {
            const checked = form.availableDays.includes(day)
            return (
              <label key={day} className="cursor-pointer">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => handleDayToggle(day)}
                  className="sr-only"
                />
                <div
                  className={[
                    'flex h-11 w-11 items-center justify-center rounded-full text-sm font-bold transition-all',
                    checked
                      ? 'bg-primary-600 text-white shadow-sm ring-2 ring-primary-200'
                      : 'bg-gray-100 text-gray-400 hover:bg-gray-200',
                  ].join(' ')}
                >
                  {DAY_LABELS[day]}
                </div>
              </label>
            )
          })}
        </div>
        {form.availableDays.length === 0 && (
          <p className="mt-2 text-xs text-red-500">1日以上選択してください</p>
        )}
      </section>

      {/* ── セクション 3: 除外コマ ── */}
      <section>
        <div className="mb-3 flex items-baseline gap-2">
          <h3 className="section-heading mb-0">利用不可コマ</h3>
          <span className="text-xs text-gray-400">利用できないコマをクリックして選択</span>
        </div>
        <ExcludedSlotGrid
          value={form.excludedSlots}
          availableDays={form.availableDays}
          onChange={(slots) => setForm((p) => ({ ...p, excludedSlots: slots }))}
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
