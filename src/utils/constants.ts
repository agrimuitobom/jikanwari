import type { DayOfWeek, Period, Grade, ClassNumber } from '../types'

export const DAYS: DayOfWeek[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
]

export const DAY_LABELS: Record<DayOfWeek, string> = {
  monday: '月',
  tuesday: '火',
  wednesday: '水',
  thursday: '木',
  friday: '金',
}

export const PERIODS: Period[] = [1, 2, 3, 4, 5, 6]

// ============================================================
// 科目カラー定義（UI表示用プリセット）
// ============================================================
export const SUBJECT_COLORS: { value: string; label: string }[] = [
  { value: '#3b82f6', label: '青' },
  { value: '#10b981', label: '緑' },
  { value: '#f59e0b', label: '黄' },
  { value: '#ef4444', label: '赤' },
  { value: '#8b5cf6', label: '紫' },
  { value: '#ec4899', label: 'ピンク' },
  { value: '#06b6d4', label: '水色' },
  { value: '#84cc16', label: '黄緑' },
  { value: '#f97316', label: 'オレンジ' },
  { value: '#64748b', label: 'グレー' },
]

// ============================================================
// 固定クラス一覧（高校1〜3年 × 各3組 = 9クラス）
// ============================================================
export interface ClassOption {
  id: string
  grade: Grade
  classNumber: ClassNumber
  displayName: string
}

export const CLASS_OPTIONS: ClassOption[] = [
  { id: 'grade1-class1', grade: 1, classNumber: 1, displayName: '1年1組' },
  { id: 'grade1-class2', grade: 1, classNumber: 2, displayName: '1年2組' },
  { id: 'grade1-class3', grade: 1, classNumber: 3, displayName: '1年3組' },
  { id: 'grade2-class1', grade: 2, classNumber: 1, displayName: '2年1組' },
  { id: 'grade2-class2', grade: 2, classNumber: 2, displayName: '2年2組' },
  { id: 'grade2-class3', grade: 2, classNumber: 3, displayName: '2年3組' },
  { id: 'grade3-class1', grade: 3, classNumber: 1, displayName: '3年1組' },
  { id: 'grade3-class2', grade: 3, classNumber: 2, displayName: '3年2組' },
  { id: 'grade3-class3', grade: 3, classNumber: 3, displayName: '3年3組' },
]

export function getClassLabel(classId: string): string {
  return CLASS_OPTIONS.find((c) => c.id === classId)?.displayName ?? classId
}
