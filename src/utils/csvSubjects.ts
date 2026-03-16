import type { CreateInput, Subject, Grade, SubjectCategory } from '../types'
import { SUBJECT_CATEGORIES } from './constants'

// ============================================================
// CSV テンプレートダウンロード
// ============================================================

const CSV_HEADER = '科目名,履修学年,教科,単位数,週あたりコマ数,連続ペア数,推奨時限開始,推奨時限終了,カラー'
const CSV_EXAMPLE_ROWS = [
  '数学Ⅱ,2,数学,3,3,0,,,#3b82f6',
  '化学基礎,1,理科,2,,,,,' ,
  '農業実習,2,農業,4,4,2,3,6,#f59e0b',
  '生物実験,2,理科,3,3,1,,,#10b981',
]

export function downloadCsvTemplate() {
  const bom = '\uFEFF'
  const content = bom + [CSV_HEADER, ...CSV_EXAMPLE_ROWS].join('\n') + '\n'
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = '科目一括登録テンプレート.csv'
  a.click()
  URL.revokeObjectURL(url)
}

// ============================================================
// CSV パース
// ============================================================

const VALID_GRADES = new Set([1, 2, 3])
const VALID_CATEGORIES = new Set<string>(SUBJECT_CATEGORIES)

interface ParseResult {
  subjects: CreateInput<Subject>[]
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

export function parseCsv(text: string): ParseResult {
  const lines = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter((l) => l.trim().length > 0)

  if (lines.length < 2) {
    return { subjects: [], errors: ['CSVにデータ行がありません（ヘッダー行＋1行以上必要）'] }
  }

  const subjects: CreateInput<Subject>[] = []
  const errors: string[] = []

  // Skip header row (index 0)
  for (let i = 1; i < lines.length; i++) {
    const rowNum = i + 1
    const cols = parseCsvLine(lines[i])

    // 科目名 (required)
    const name = cols[0]?.trim()
    if (!name) {
      errors.push(`${rowNum}行目: 科目名が空です`)
      continue
    }

    // 履修学年 (required)
    const gradeNum = Number(cols[1])
    if (!VALID_GRADES.has(gradeNum)) {
      errors.push(`${rowNum}行目: 履修学年は1,2,3のいずれかを指定してください（値: "${cols[1]}"）`)
      continue
    }
    const grade = gradeNum as Grade

    // 教科 (required)
    const category = cols[2]?.trim()
    if (!category || !VALID_CATEGORIES.has(category)) {
      errors.push(`${rowNum}行目: 教科が不正です（値: "${cols[2]}"）。有効な値: ${SUBJECT_CATEGORIES.join(', ')}`)
      continue
    }

    // 単位数 (required)
    const creditsStr = cols[3]?.trim()
    if (!creditsStr) {
      errors.push(`${rowNum}行目: 単位数が空です`)
      continue
    }
    const credits = Number(creditsStr)
    if (!Number.isInteger(credits) || credits < 1 || credits > 8) {
      errors.push(`${rowNum}行目: 単位数は1〜8の整数を指定してください（値: "${cols[3]}"）`)
      continue
    }

    // 週あたりコマ数（任意、デフォルト＝単位数）
    const freqStr = cols[4]?.trim()
    let weeklyFrequency = credits
    if (freqStr) {
      weeklyFrequency = Number(freqStr)
      if (!Number.isInteger(weeklyFrequency) || weeklyFrequency < 1 || weeklyFrequency > 10) {
        errors.push(`${rowNum}行目: 週あたりコマ数は1〜10の整数を指定してください（値: "${cols[4]}"）`)
        continue
      }
    }

    // 連続ペア数（任意、デフォルト＝0。後方互換: TRUE/はい→全ペア化）
    const pairsStr = (cols[5] ?? '').trim().toUpperCase()
    let consecutivePairs = 0
    if (pairsStr === 'TRUE' || pairsStr === 'はい') {
      // 旧形式の後方互換
      consecutivePairs = Math.floor(weeklyFrequency / 2)
    } else if (pairsStr && pairsStr !== 'FALSE' && pairsStr !== 'いいえ') {
      consecutivePairs = Number(pairsStr)
      if (!Number.isInteger(consecutivePairs) || consecutivePairs < 0) {
        errors.push(`${rowNum}行目: 連続ペア数は0以上の整数を指定してください（値: "${cols[5]}"）`)
        continue
      }
    }
    if (consecutivePairs * 2 > weeklyFrequency) {
      errors.push(`${rowNum}行目: 連続ペア数×2(${consecutivePairs * 2})が週あたりコマ数(${weeklyFrequency})を超えています`)
      continue
    }

    // 推奨時限（任意）
    const prefFromStr = cols[6]?.trim()
    const prefToStr = cols[7]?.trim()
    let preferredPeriods: { from: number; to: number } | undefined
    if (prefFromStr && prefToStr) {
      const from = Number(prefFromStr)
      const to = Number(prefToStr)
      if (from < 1 || from > 6 || to < 1 || to > 6 || from > to) {
        errors.push(`${rowNum}行目: 推奨時限は1〜6の範囲で開始≦終了にしてください`)
        continue
      }
      preferredPeriods = { from, to }
    }

    // カラー（任意、デフォルト＝青）
    const color = cols[8]?.trim() || '#3b82f6'

    subjects.push({
      name,
      grade,
      category: category as SubjectCategory,
      credits,
      weeklyFrequency,
      consecutivePairs,
      noConsecutive: false,
      ...(preferredPeriods ? { preferredPeriods: preferredPeriods as Subject['preferredPeriods'] } : {}),
      color,
    })
  }

  return { subjects, errors }
}
