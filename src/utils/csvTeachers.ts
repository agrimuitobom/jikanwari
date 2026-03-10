import type { CreateInput, Teacher, SubjectCategory, DayOfWeek } from '../types'
import { SUBJECT_CATEGORIES } from './constants'

// ============================================================
// CSV テンプレートダウンロード
// ============================================================

const CSV_HEADER = '教員名,所属教科,勤務可能日（月火水木金）,メモ'
const CSV_EXAMPLE_ROWS = [
  '山田太郎,数学,月火水木金,',
  '佐藤花子,国語,月火水木金,副担任',
  '野田一郎,農業,月水金,非常勤講師',
]

export function downloadTeacherCsvTemplate() {
  const bom = '\uFEFF'
  const content = bom + [CSV_HEADER, ...CSV_EXAMPLE_ROWS].join('\n') + '\n'
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = '教員一括登録テンプレート.csv'
  a.click()
  URL.revokeObjectURL(url)
}

// ============================================================
// CSV パース
// ============================================================

const VALID_CATEGORIES = new Set<string>(SUBJECT_CATEGORIES)

const DAY_CHAR_MAP: Record<string, DayOfWeek> = {
  '月': 'monday',
  '火': 'tuesday',
  '水': 'wednesday',
  '木': 'thursday',
  '金': 'friday',
}

interface ParseResult {
  teachers: CreateInput<Teacher>[]
  errors: string[]
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"'
        i++
      } else if (ch === '"') {
        inQuotes = false
      } else {
        current += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === ',') {
        fields.push(current.trim())
        current = ''
      } else {
        current += ch
      }
    }
  }
  fields.push(current.trim())
  return fields
}

function parseDays(str: string): { days: DayOfWeek[]; invalid: string[] } {
  const days: DayOfWeek[] = []
  const invalid: string[] = []
  const seen = new Set<DayOfWeek>()

  for (const ch of str) {
    if (ch === ' ' || ch === '　' || ch === '・' || ch === ',') continue
    const mapped = DAY_CHAR_MAP[ch]
    if (mapped) {
      if (!seen.has(mapped)) {
        days.push(mapped)
        seen.add(mapped)
      }
    } else {
      invalid.push(ch)
    }
  }
  return { days, invalid }
}

export function parseTeacherCsv(text: string): ParseResult {
  const lines = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter((l) => l.trim().length > 0)

  if (lines.length < 2) {
    return { teachers: [], errors: ['CSVにデータ行がありません（ヘッダー行＋1行以上必要）'] }
  }

  const teachers: CreateInput<Teacher>[] = []
  const errors: string[] = []

  for (let i = 1; i < lines.length; i++) {
    const rowNum = i + 1
    const cols = parseCsvLine(lines[i])

    // 教員名 (required)
    const name = cols[0]?.trim()
    if (!name) {
      errors.push(`${rowNum}行目: 教員名が空です`)
      continue
    }

    // 所属教科 (optional)
    const deptStr = cols[1]?.trim()
    let department: SubjectCategory | undefined
    if (deptStr) {
      if (!VALID_CATEGORIES.has(deptStr)) {
        errors.push(`${rowNum}行目: 所属教科が不正です（値: "${deptStr}"）。有効な値: ${SUBJECT_CATEGORIES.join(', ')}`)
        continue
      }
      department = deptStr as SubjectCategory
    }

    // 勤務可能日 (optional, default=月〜金)
    const daysStr = cols[2]?.trim()
    let availableDays: DayOfWeek[]
    if (daysStr) {
      const { days, invalid } = parseDays(daysStr)
      if (invalid.length > 0) {
        errors.push(`${rowNum}行目: 勤務可能日に不正な文字があります（"${invalid.join('')}"）。月火水木金で指定してください`)
        continue
      }
      if (days.length === 0) {
        errors.push(`${rowNum}行目: 勤務可能日を1日以上指定してください`)
        continue
      }
      availableDays = days
    } else {
      availableDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']
    }

    // メモ (optional)
    const memo = cols[3]?.trim()

    teachers.push({
      name,
      ...(department !== undefined ? { department } : {}),
      subjectIds: [],
      availableDays,
      excludedSlots: [],
      ...(memo ? { memo } : {}),
    })
  }

  return { teachers, errors }
}
