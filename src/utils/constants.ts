import type { DayOfWeek, Period, Grade, ClassNumber, SubjectCategory } from '../types'

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

export const GRADES: Grade[] = [1, 2, 3]

export const GRADE_LABELS: Record<Grade, string> = {
  1: '1年',
  2: '2年',
  3: '3年',
}

export const SUBJECT_CATEGORIES: SubjectCategory[] = [
  '国語',
  '数学',
  '理科',
  '地歴公民',
  '英語',
  '芸術',
  '家庭科',
  '保健体育',
  '農業',
  '商業',
  'その他',
]

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
  { value: '#6c3d37', label: '茶' },
  { value: '#64748b', label: 'グレー' },
]

/** 教科別デフォルトカラー */
export const CATEGORY_DEFAULT_COLOR: Record<SubjectCategory, string> = {
  '国語': '#ef4444',
  '数学': '#3b82f6',
  '理科': '#10b981',
  '地歴公民': '#f59e0b',
  '英語': '#8b5cf6',
  '芸術': '#ec4899',
  '家庭科': '#f97316',
  '保健体育': '#84cc16',
  '農業': '#06b6d4',
  '商業': '#64748b',
  'その他': '#6c3d37',
}

// ============================================================
// 固定クラス一覧（高校1〜3年 × 各3組 = 9クラス）
// ============================================================
export interface ClassOption {
  id: string
  grade: Grade
  classNumber: ClassNumber
  displayName: string
}

/** デフォルトの3組構成のクラス一覧 */
export const CLASS_OPTIONS: ClassOption[] = buildClassOptions(3)

/** 学年あたりのクラス数を指定してクラス一覧を動的生成する */
export function buildClassOptions(classesPerGrade: number): ClassOption[] {
  const options: ClassOption[] = []
  for (const grade of GRADES) {
    for (let cn = 1; cn <= classesPerGrade; cn++) {
      options.push({
        id: `grade${grade}-class${cn}`,
        grade,
        classNumber: cn as ClassNumber,
        displayName: `${grade}年${cn}組`,
      })
    }
  }
  return options
}

export function getClassLabel(classId: string): string {
  // idからフォールバック表示名を生成（grade1-class2 → "1年2組"）
  const match = classId.match(/^grade(\d+)-class(\d+)$/)
  if (match) return `${match[1]}年${match[2]}組`
  return classId
}
