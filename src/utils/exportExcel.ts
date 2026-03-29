import * as XLSX from 'xlsx'
import type { ScheduleEntry, Assignment, Subject, Teacher } from '../types'
import { DAYS, DAY_LABELS, PERIODS } from './constants'
import { getClassLabel } from './constants'

/**
 * 時間割をExcelファイルとして出力する。
 * - クラスごとにシートを作成（時間割グリッド形式）
 * - 教員一覧シートも追加
 */
export function exportToExcel(
  entries: ScheduleEntry[],
  assignments: Assignment[],
  subjects: Subject[],
  teachers: Teacher[],
) {
  const subjectMap = new Map(subjects.map((s) => [s.id, s]))
  const assignmentMap = new Map(assignments.map((a) => [a.id, a]))
  const teacherMap = new Map(teachers.map((t) => [t.id, t]))

  // クラス一覧を抽出（エントリに存在するもの）
  const classIds = [...new Set(entries.map((e) => e.classId))].sort()

  const wb = XLSX.utils.book_new()

  // --- 全体一覧シート ---
  {
    const header = ['曜日', '時限', 'クラス', '科目', '教員']
    const rows = entries
      .filter((e) => !e.isConsecutiveSecond)
      .map((e) => {
        const a = assignmentMap.get(e.assignmentId)
        const s = a ? subjectMap.get(a.subjectId) : undefined
        const tNames = a
          ? a.teacherIds.map((id) => teacherMap.get(id)?.name ?? '?').join(' / ')
          : ''
        return [DAY_LABELS[e.day], e.period, getClassLabel(e.classId), s?.name ?? '', tNames]
      })
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows])
    ws['!cols'] = [{ wch: 6 }, { wch: 6 }, { wch: 10 }, { wch: 18 }, { wch: 20 }]
    XLSX.utils.book_append_sheet(wb, ws, '全体一覧')
  }

  // --- クラスごとのシート（グリッド形式） ---
  for (const classId of classIds) {
    const classEntries = entries.filter((e) => e.classId === classId && !e.isConsecutiveSecond)
    const label = getClassLabel(classId)

    // ルックアップ: day:period → { subject, teachers }
    const cellMap = new Map<string, { subjectName: string; teacherNames: string }>()
    for (const e of classEntries) {
      const a = assignmentMap.get(e.assignmentId)
      const s = a ? subjectMap.get(a.subjectId) : undefined
      const tNames = a
        ? a.teacherIds.map((id) => teacherMap.get(id)?.name ?? '?').join('/')
        : ''
      const key = `${e.day}:${e.period}`
      cellMap.set(key, { subjectName: s?.name ?? '', teacherNames: tNames })
    }

    // ヘッダー行: [時限, 月, 火, 水, 木, 金]
    const header = ['時限', ...DAYS.map((d) => DAY_LABELS[d])]
    const rows: (string | number)[][] = []

    for (const period of PERIODS) {
      const row: (string | number)[] = [period]
      for (const day of DAYS) {
        const cell = cellMap.get(`${day}:${period}`)
        row.push(cell ? `${cell.subjectName}\n${cell.teacherNames}` : '')
      }
      rows.push(row)
    }

    const ws = XLSX.utils.aoa_to_sheet([header, ...rows])
    ws['!cols'] = [{ wch: 6 }, ...DAYS.map(() => ({ wch: 18 }))]
    // セルの折り返し設定
    for (let r = 1; r <= PERIODS.length; r++) {
      for (let c = 1; c <= DAYS.length; c++) {
        const addr = XLSX.utils.encode_cell({ r, c })
        if (ws[addr]) {
          ws[addr].s = { alignment: { wrapText: true } }
        }
      }
    }
    // 行の高さ
    ws['!rows'] = [{ hpt: 20 }, ...PERIODS.map(() => ({ hpt: 36 }))]

    XLSX.utils.book_append_sheet(wb, ws, label)
  }

  // --- 教員別シート ---
  for (const teacher of teachers) {
    const teacherEntries = entries.filter((e) => {
      const a = assignmentMap.get(e.assignmentId)
      return a?.teacherIds.includes(teacher.id) && !e.isConsecutiveSecond
    })
    if (teacherEntries.length === 0) continue

    const cellMap = new Map<string, { subjectName: string; className: string }>()
    for (const e of teacherEntries) {
      const a = assignmentMap.get(e.assignmentId)
      const s = a ? subjectMap.get(a.subjectId) : undefined
      const key = `${e.day}:${e.period}`
      cellMap.set(key, { subjectName: s?.name ?? '', className: getClassLabel(e.classId) })
    }

    const header = ['時限', ...DAYS.map((d) => DAY_LABELS[d])]
    const rows: (string | number)[][] = []
    for (const period of PERIODS) {
      const row: (string | number)[] = [period]
      for (const day of DAYS) {
        const cell = cellMap.get(`${day}:${period}`)
        row.push(cell ? `${cell.subjectName}\n${cell.className}` : '')
      }
      rows.push(row)
    }

    const ws = XLSX.utils.aoa_to_sheet([header, ...rows])
    ws['!cols'] = [{ wch: 6 }, ...DAYS.map(() => ({ wch: 18 }))]
    ws['!rows'] = [{ hpt: 20 }, ...PERIODS.map(() => ({ hpt: 36 }))]

    // シート名は31文字制限・重複回避
    let sheetName = teacher.name.slice(0, 28)
    const existingNames = new Set(wb.SheetNames)
    if (existingNames.has(sheetName)) {
      let suffix = 2
      while (existingNames.has(`${sheetName}_${suffix}`)) suffix++
      sheetName = `${sheetName}_${suffix}`
    }
    XLSX.utils.book_append_sheet(wb, ws, sheetName)
  }

  // ファイル出力
  const filename = `timetable_${new Date().toISOString().slice(0, 10)}.xlsx`
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  const blob = new Blob([wbout], { type: 'application/octet-stream' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
