import { useRef, useState } from 'react'
import type { CreateInput, Teacher } from '../../types'
import { downloadTeacherCsvTemplate, parseTeacherCsv } from '../../utils/csvTeachers'
import { ErrorAlert } from '../common/ErrorAlert'
import { SUBJECT_CATEGORIES } from '../../utils/constants'

const DAY_LABELS_SHORT: Record<string, string> = {
  monday: '月',
  tuesday: '火',
  wednesday: '水',
  thursday: '木',
  friday: '金',
}

interface TeacherCsvImportProps {
  onImport: (teachers: CreateInput<Teacher>[]) => Promise<void>
  onClose: () => void
}

export function TeacherCsvImport({ onImport, onClose }: TeacherCsvImportProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [parsed, setParsed] = useState<CreateInput<Teacher>[] | null>(null)
  const [parseErrors, setParseErrors] = useState<string[]>([])
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setParseErrors([])
    setParsed(null)
    setImportError(null)
    setDone(false)

    const reader = new FileReader()
    reader.onload = () => {
      const text = reader.result as string
      const { teachers, errors } = parseTeacherCsv(text)
      setParseErrors(errors)
      setParsed(teachers.length > 0 ? teachers : null)
    }
    reader.readAsText(file, 'UTF-8')
  }

  const handleImport = async () => {
    if (!parsed) return
    setImporting(true)
    setImportError(null)
    try {
      await onImport(parsed)
      setDone(true)
    } catch (err) {
      setImportError(err instanceof Error ? err.message : '登録に失敗しました')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="card p-6 sm:p-8 space-y-6">
      <div className="flex items-center justify-between border-b border-gray-200 pb-4">
        <h2 className="text-lg font-semibold text-gray-900">教員CSV一括登録</h2>
        <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
            <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
          </svg>
        </button>
      </div>

      {/* Step 1: テンプレートダウンロード */}
      <section className="space-y-2">
        <h3 className="section-heading">1. テンプレートをダウンロード</h3>
        <p className="text-sm text-gray-500">
          CSVファイルに教員情報を入力してください。勤務可能日は「月火水木金」のように記載します。
        </p>
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600 space-y-1">
          <p className="font-medium">CSVフォーマット:</p>
          <p>教員名, 所属教科, 勤務可能日, メモ</p>
          <p className="text-gray-400">所属教科: {SUBJECT_CATEGORIES.join(' / ')}</p>
          <p className="text-gray-400">勤務可能日: 月火水木金（省略時は全日）</p>
        </div>
        <button type="button" onClick={downloadTeacherCsvTemplate} className="btn-secondary">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
            <path d="M2.75 14A1.75 1.75 0 0 1 1 12.25v-2.5a.75.75 0 0 1 1.5 0v2.5c0 .138.112.25.25.25h10.5a.25.25 0 0 0 .25-.25v-2.5a.75.75 0 0 1 1.5 0v2.5A1.75 1.75 0 0 1 13.25 14H2.75Z" />
            <path d="M7.25 7.689V2a.75.75 0 0 1 1.5 0v5.689l1.97-1.969a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 6.78a.75.75 0 0 1 1.06-1.06l1.97 1.969Z" />
          </svg>
          テンプレートをダウンロード
        </button>
      </section>

      {/* Step 2: ファイルアップロード */}
      <section className="space-y-2">
        <h3 className="section-heading">2. CSVファイルをアップロード</h3>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          onChange={handleFile}
          className="block w-full text-sm text-gray-500 file:mr-4 file:rounded-lg file:border-0 file:bg-primary-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-primary-700 hover:file:bg-primary-100 file:cursor-pointer"
        />
      </section>

      {/* パースエラー表示 */}
      {parseErrors.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 space-y-1">
          <p className="text-sm font-medium text-red-700">以下のエラーがあります:</p>
          <ul className="list-disc list-inside space-y-0.5">
            {parseErrors.map((err, i) => (
              <li key={i} className="text-xs text-red-600">{err}</li>
            ))}
          </ul>
        </div>
      )}

      {/* プレビュー */}
      {parsed && !done && (
        <section className="space-y-3">
          <h3 className="section-heading">3. 内容を確認して登録</h3>
          <div className="max-h-64 overflow-auto rounded-lg border border-gray-200">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">教員名</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">所属教科</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">勤務可能日</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">メモ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {parsed.map((t, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-medium text-gray-900">{t.name}</td>
                    <td className="px-3 py-2 text-gray-600">{t.department ?? '-'}</td>
                    <td className="px-3 py-2 text-gray-600">
                      {t.availableDays.map((d) => DAY_LABELS_SHORT[d]).join('')}
                    </td>
                    <td className="px-3 py-2 text-gray-400">{t.memo ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-400">{parsed.length}名の教員を登録します</p>

          {importError && <ErrorAlert message={importError} onDismiss={() => setImportError(null)} />}

          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className="btn-secondary">
              キャンセル
            </button>
            <button type="button" onClick={handleImport} disabled={importing} className="btn-primary">
              {importing ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  登録中...
                </>
              ) : (
                <>一括登録する（{parsed.length}名）</>
              )}
            </button>
          </div>
        </section>
      )}

      {/* 完了メッセージ */}
      {done && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-center space-y-3">
          <p className="text-sm font-medium text-green-700">登録が完了しました</p>
          <button type="button" onClick={onClose} className="btn-primary">
            閉じる
          </button>
        </div>
      )}
    </div>
  )
}
