import { useState } from 'react'
import type { Assignment, Teacher, Subject, CreateInput, TimeSlot, DayOfWeek, Period } from '../../types'
import { ErrorAlert } from '../common/ErrorAlert'
import { CLASS_OPTIONS, SUBJECT_CATEGORIES, DAYS, DAY_LABELS, PERIODS } from '../../utils/constants'
import type { ClassOption } from '../../utils/constants'

interface FixedSlotEntry {
  day: DayOfWeek | ''
  period: Period | ''
}

interface FormState {
  classIds: string[]
  subjectId: string
  teacherIds: string[]
  weeklyCount: number
  isSimultaneous: boolean
  simultaneousGroupId: string
  fixedSlots: FixedSlotEntry[]
  notes: string
}

interface AssignmentFormProps {
  initialValues?: Assignment
  teachers: Teacher[]
  subjects: Subject[]
  existingAssignments?: Assignment[]
  onSubmit: (data: CreateInput<Assignment>[]) => Promise<void>
  onCancel: () => void
}

// ============================================================
// AssignmentForm
// ============================================================

export function AssignmentForm({
  initialValues,
  teachers,
  subjects,
  existingAssignments = [],
  onSubmit,
  onCancel,
}: AssignmentFormProps) {
  const isEditMode = !!initialValues

  const [form, setForm] = useState<FormState>({
    classIds: initialValues ? [initialValues.classId] : [],
    subjectId: initialValues?.subjectId ?? '',
    teacherIds: initialValues?.teacherIds ?? [],
    weeklyCount: initialValues?.weeklyCount ?? 2,
    isSimultaneous: !!initialValues?.simultaneousGroupId,
    simultaneousGroupId: initialValues?.simultaneousGroupId ?? '',
    fixedSlots: initialValues?.fixedSlots?.map((s) => ({ day: s.day, period: s.period })) ?? [],
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

  const toggleClass = (classId: string) => {
    setForm((p) => ({
      ...p,
      classIds: p.classIds.includes(classId)
        ? p.classIds.filter((id) => id !== classId)
        : [...p.classIds, classId],
    }))
  }

  const toggleGrade = (grade: number) => {
    const gradeClassIds = CLASS_OPTIONS.filter((c) => c.grade === grade).map((c) => c.id)
    setForm((p) => {
      const allSelected = gradeClassIds.every((id) => p.classIds.includes(id))
      if (allSelected) {
        return { ...p, classIds: p.classIds.filter((id) => !gradeClassIds.includes(id)) }
      } else {
        return { ...p, classIds: Array.from(new Set([...p.classIds, ...gradeClassIds])) }
      }
    })
  }

  const toggleTeacher = (teacherId: string) => {
    setForm((p) => ({
      ...p,
      teacherIds: p.teacherIds.includes(teacherId)
        ? p.teacherIds.filter((id) => id !== teacherId)
        : [...p.teacherIds, teacherId],
    }))
  }

  // 既存の同時開講グループ一覧（編集モードで既存グループに参加する場合に使用）
  const existingSimultaneousGroups = (() => {
    const groups = new Map<string, { groupId: string; subjectName: string; classNames: string[] }>()
    for (const a of existingAssignments) {
      if (!a.simultaneousGroupId) continue
      // 編集時は自分自身のグループは除外しない（同じグループに留まる選択肢として表示）
      const existing = groups.get(a.simultaneousGroupId)
      const subjectName = subjects.find((s) => s.id === a.subjectId)?.name ?? a.subjectId
      const className = CLASS_OPTIONS.find((c) => c.id === a.classId)?.displayName ?? a.classId
      if (existing) {
        existing.classNames.push(className)
      } else {
        groups.set(a.simultaneousGroupId, {
          groupId: a.simultaneousGroupId,
          subjectName,
          classNames: [className],
        })
      }
    }
    return Array.from(groups.values())
  })()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)

    if (form.classIds.length === 0) {
      setFormError('クラスを1つ以上選択してください')
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
      // 同時開講グループIDの決定
      let groupId: string | undefined
      if (form.isSimultaneous) {
        if (form.simultaneousGroupId) {
          // 既存グループに参加
          groupId = form.simultaneousGroupId
        } else {
          // 新規グループID生成
          groupId = `sim-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        }
      }

      // 有効な固定スロットを抽出
      const validFixedSlots: TimeSlot[] = form.fixedSlots
        .filter((s): s is { day: DayOfWeek; period: Period } => s.day !== '' && s.period !== '')

      const inputs: CreateInput<Assignment>[] = form.classIds.map((classId) => ({
        classId,
        subjectId: form.subjectId,
        teacherIds: form.teacherIds,
        weeklyCount: form.weeklyCount,
        ...(groupId ? { simultaneousGroupId: groupId } : {}),
        ...(validFixedSlots.length > 0 ? { fixedSlots: validFixedSlots } : {}),
        ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
      }))
      await onSubmit(inputs)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '保存に失敗しました')
    } finally {
      setSubmitting(false)
    }
  }

  const selectedSubject = subjects.find((s) => s.id === form.subjectId)
  const isTT = form.teacherIds.length > 1

  // 学年ごとのクラスグループ
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
    ...(() => {
      const unassigned = teachers
        .filter((t) => !t.department)
        .sort((a, b) => a.name.localeCompare(b.name, 'ja'))
      return unassigned.length > 0 ? [{ label: 'その他', teachers: unassigned }] : []
    })(),
  ]

  return (
    <form onSubmit={handleSubmit} className="space-y-8" noValidate>
      {/* ヘッダー */}
      <div className="flex items-center justify-between border-b border-gray-200 pb-4">
        <h2 className="text-lg font-semibold text-gray-900">
          {isEditMode ? '授業割当を編集' : '授業割当を新規登録'}
        </h2>
      </div>

      {formError && <ErrorAlert message={formError} onDismiss={() => setFormError(null)} />}

      {/* ── セクション 1: クラス ── */}
      <section className="space-y-4">
        <div className="flex items-baseline justify-between">
          <h3 className="section-heading mb-0">
            クラス <span className="text-red-500">*</span>
            {!isEditMode && form.classIds.length > 0 && (
              <span className="ml-2 text-xs font-normal text-gray-500">
                {form.classIds.length}クラス選択中
              </span>
            )}
          </h3>
          {!isEditMode && form.classIds.length > 0 && (
            <button
              type="button"
              onClick={() => setForm((p) => ({ ...p, classIds: [] }))}
              className="text-xs text-gray-400 underline hover:text-gray-600"
            >
              クリア
            </button>
          )}
        </div>

        {isEditMode ? (
          // 編集モード: 単一クラス表示（変更不可）
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
            {CLASS_OPTIONS.find((c) => c.id === form.classIds[0])?.displayName ?? form.classIds[0]}
          </div>
        ) : (
          // 新規モード: 学年ごとにチェックボックス
          <div className="space-y-3">
            {classGroups.map((group) => {
              const allSelected = group.classes.every((c) => form.classIds.includes(c.id))
              const someSelected = group.classes.some((c) => form.classIds.includes(c.id))
              return (
                <div key={group.grade}>
                  <label className="mb-1.5 flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected }}
                      onChange={() => toggleGrade(group.grade)}
                      className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-xs font-semibold text-gray-500">{group.grade}年生</span>
                  </label>
                  <div className="ml-6 flex flex-wrap gap-2">
                    {group.classes.map((c) => {
                      const checked = form.classIds.includes(c.id)
                      return (
                        <label
                          key={c.id}
                          className={[
                            'flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-all',
                            checked
                              ? 'border-primary-300 bg-primary-50 text-primary-700 shadow-sm'
                              : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50',
                          ].join(' ')}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleClass(c.id)}
                            className="h-3.5 w-3.5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                          />
                          {c.displayName}
                        </label>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* ── セクション 2: 科目 ── */}
      <section className="space-y-4">
        <h3 className="section-heading">
          科目 <span className="text-red-500">*</span>
        </h3>
        <select
          id="assign-subject"
          value={form.subjectId}
          onChange={(e) => handleSubjectChange(e.target.value)}
          className="form-select"
          required
        >
          <option value="">選択してください</option>
          {subjectGroups.map((g) => (
            <optgroup key={g.category} label={g.category}>
              {g.subjects.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </optgroup>
          ))}
        </select>

        {/* 選択した科目の情報ヒント */}
        {selectedSubject && (
          <div className="flex flex-wrap gap-2 rounded-lg bg-gray-50 p-3">
            <span className="badge border border-gray-200 bg-white text-gray-600">
              {selectedSubject.credits}単位
            </span>
            {selectedSubject.consecutivePairs > 0 && (
              <span className="badge border border-amber-200 bg-amber-50 text-amber-700">
                連続{selectedSubject.consecutivePairs}ペア
              </span>
            )}
            {selectedSubject.noConsecutive && (
              <span className="badge border border-orange-200 bg-orange-50 text-orange-700">
                連続配置禁止
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

      {/* ── セクション 3: 同時開講設定 ── */}
      {(form.classIds.length >= 2 || isEditMode) && (
        <section className="space-y-3">
          <h3 className="section-heading">同時開講</h3>

          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-gray-200 bg-white p-4 transition-all hover:border-gray-300">
            <input
              type="checkbox"
              checked={form.isSimultaneous}
              onChange={(e) =>
                setForm((p) => ({
                  ...p,
                  isSimultaneous: e.target.checked,
                  simultaneousGroupId: e.target.checked ? p.simultaneousGroupId : '',
                }))
              }
              className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <div>
              <p className="text-sm font-medium text-gray-800">
                同時開講にする
              </p>
              <p className="text-xs text-gray-500">
                選択したクラスを同じ曜日・同じ時限に配置します（例: 体育を全クラス合同で実施）
              </p>
            </div>
          </label>

          {form.isSimultaneous && (
            <div className="ml-7 space-y-3">
              {/* 新規グループ or 既存グループに参加 */}
              <div className="space-y-2">
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="radio"
                    name="simGroup"
                    checked={!form.simultaneousGroupId}
                    onChange={() => setForm((p) => ({ ...p, simultaneousGroupId: '' }))}
                    className="h-4 w-4 border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-sm text-gray-700">新しい同時開講グループを作成</span>
                </label>

                {existingSimultaneousGroups.length > 0 && (
                  <>
                    <p className="text-xs font-medium text-gray-500">または既存グループに参加:</p>
                    {existingSimultaneousGroups.map((g) => (
                      <label key={g.groupId} className="flex cursor-pointer items-center gap-2">
                        <input
                          type="radio"
                          name="simGroup"
                          checked={form.simultaneousGroupId === g.groupId}
                          onChange={() => setForm((p) => ({ ...p, simultaneousGroupId: g.groupId }))}
                          className="h-4 w-4 border-gray-300 text-primary-600 focus:ring-primary-500"
                        />
                        <span className="text-sm text-gray-700">
                          {g.subjectName}（{g.classNames.join('・')}）
                        </span>
                      </label>
                    ))}
                  </>
                )}
              </div>

              {/* 同時開講の説明 */}
              <div className="rounded-lg border border-teal-200 bg-teal-50 p-3 text-xs text-teal-800">
                <p className="font-medium">同時開講の仕組み:</p>
                <ul className="mt-1 list-inside list-disc space-y-0.5">
                  <li>同じグループの全授業が同じ曜日・時限に配置されます</li>
                  <li>教員は全クラスで共有（体育4人で3クラスを指導など）</li>
                  <li>
                    異なる科目を同時開講グループにすることもできます
                    （例: 進学コース英語C2と各クラスの専門科目）
                  </li>
                </ul>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ── セクション 4: 担当教員（TT対応マルチセレクト、教科グループ） ── */}
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
          <div className="space-y-4">
            {teacherGroups.map((group) => (
              <div key={group.label}>
                <p className="mb-1.5 text-xs font-semibold text-gray-500">{group.label}</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {group.teachers.map((teacher) => {
                    const selected = form.teacherIds.includes(teacher.id)
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
              </div>
            ))}
          </div>
        )}

        {form.teacherIds.length === 0 && (
          <p className="mt-2 text-xs text-red-500">担当教員を1名以上選択してください</p>
        )}
      </section>

      {/* ── セクション 5: 固定時間 ── */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h3 className="section-heading mb-0">固定時間</h3>
          <button
            type="button"
            onClick={() =>
              setForm((p) => ({
                ...p,
                fixedSlots: [...p.fixedSlots, { day: '', period: '' }],
              }))
            }
            className="text-xs text-primary-600 hover:text-primary-800"
          >
            + 追加
          </button>
        </div>

        <p className="text-xs text-gray-500">
          この曜日・時限に必ず配置する場合に指定してください（例: ホームルーム → 木曜6限）
        </p>

        {form.fixedSlots.length === 0 ? (
          <p className="text-xs text-gray-400">指定なし（スケジューラが自動配置）</p>
        ) : (
          <div className="space-y-2">
            {form.fixedSlots.map((slot, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <select
                  value={slot.day}
                  onChange={(e) =>
                    setForm((p) => {
                      const next = [...p.fixedSlots]
                      next[idx] = { ...next[idx], day: e.target.value as DayOfWeek | '' }
                      return { ...p, fixedSlots: next }
                    })
                  }
                  className="form-select w-28"
                >
                  <option value="">曜日</option>
                  {DAYS.map((d) => (
                    <option key={d} value={d}>{DAY_LABELS[d]}曜日</option>
                  ))}
                </select>

                <select
                  value={slot.period}
                  onChange={(e) =>
                    setForm((p) => {
                      const next = [...p.fixedSlots]
                      next[idx] = { ...next[idx], period: e.target.value === '' ? '' : (Number(e.target.value) as Period) }
                      return { ...p, fixedSlots: next }
                    })
                  }
                  className="form-select w-24"
                >
                  <option value="">時限</option>
                  {PERIODS.map((p) => (
                    <option key={p} value={p}>{p}限</option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={() =>
                    setForm((p) => ({
                      ...p,
                      fixedSlots: p.fixedSlots.filter((_, i) => i !== idx),
                    }))
                  }
                  className="text-gray-400 hover:text-red-500"
                  title="削除"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
                    <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}

        {form.fixedSlots.length > 0 && form.fixedSlots.length > form.weeklyCount && (
          <p className="text-xs text-amber-600">
            固定時間の数（{form.fixedSlots.length}）が週コマ数（{form.weeklyCount}）を超えています
          </p>
        )}
      </section>

      {/* ── セクション 6: 備考 ── */}
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
          ) : form.classIds.length > 1 ? (
            `${form.classIds.length}クラス分を${form.isSimultaneous ? '同時開講で' : ''}登録`
          ) : (
            '登録する'
          )}
        </button>
      </div>
    </form>
  )
}
