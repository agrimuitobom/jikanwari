import { useState } from 'react'
import type { AppSettings } from '../../hooks/useSettings'

interface SettingsPanelProps {
  settings: AppSettings
  defaults: AppSettings
  onUpdate: (patch: Partial<AppSettings>) => void
  onReset: () => void
}

export function SettingsPanel({ settings, defaults, onUpdate, onReset }: SettingsPanelProps) {
  const [confirmReset, setConfirmReset] = useState(false)

  return (
    <div className="space-y-6">
      <div className="card p-6 sm:p-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-6">アプリ設定</h2>

        <div className="space-y-5">
          {/* 学年あたりのクラス数 */}
          <div>
            <label htmlFor="classesPerGrade" className="form-label">
              学年あたりのクラス数
            </label>
            <input
              id="classesPerGrade"
              type="number"
              min={1}
              max={10}
              value={settings.classesPerGrade}
              onChange={(e) => onUpdate({ classesPerGrade: Math.max(1, Math.min(10, Number(e.target.value))) })}
              className="form-input w-32"
            />
            <p className="mt-1 text-xs text-gray-400">
              デフォルト: {defaults.classesPerGrade}（変更後は科目・割当の再登録が必要な場合があります）
            </p>
          </div>

          {/* 教員最大コマ数/日 */}
          <div>
            <label htmlFor="maxTeacherPeriodsPerDay" className="form-label">
              教員の1日あたり最大コマ数（ソフト制約）
            </label>
            <input
              id="maxTeacherPeriodsPerDay"
              type="number"
              min={1}
              max={6}
              value={settings.maxTeacherPeriodsPerDay}
              onChange={(e) => onUpdate({ maxTeacherPeriodsPerDay: Math.max(1, Math.min(6, Number(e.target.value))) })}
              className="form-input w-32"
            />
            <p className="mt-1 text-xs text-gray-400">
              デフォルト: {defaults.maxTeacherPeriodsPerDay}（超過するとスコアが減点されます）
            </p>
          </div>

          {/* スケジューラ最大反復数 */}
          <div>
            <label htmlFor="maxIterations" className="form-label">
              スケジューラ最大探索回数
            </label>
            <input
              id="maxIterations"
              type="number"
              min={10000}
              max={10000000}
              step={10000}
              value={settings.maxIterations}
              onChange={(e) => onUpdate({ maxIterations: Math.max(10000, Math.min(10000000, Number(e.target.value))) })}
              className="form-input w-40"
            />
            <p className="mt-1 text-xs text-gray-400">
              デフォルト: {defaults.maxIterations.toLocaleString()}（大きいほど精度が上がりますが時間がかかります）
            </p>
          </div>

          {/* ランダムリスタート回数 */}
          <div>
            <label htmlFor="maxRestarts" className="form-label">
              ランダムリスタート回数
            </label>
            <input
              id="maxRestarts"
              type="number"
              min={0}
              max={50}
              value={settings.maxRestarts}
              onChange={(e) => onUpdate({ maxRestarts: Math.max(0, Math.min(50, Number(e.target.value))) })}
              className="form-input w-32"
            />
            <p className="mt-1 text-xs text-gray-400">
              デフォルト: {defaults.maxRestarts}（探索が行き詰まった場合に順序を変えてやり直す回数。0でリスタートなし）
            </p>
          </div>
        </div>

        {/* リセットボタン */}
        <div className="mt-8 border-t border-gray-200 pt-6">
          {confirmReset ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-600">設定をリセットしますか？</span>
              <button
                type="button"
                onClick={() => { onReset(); setConfirmReset(false) }}
                className="btn-danger text-xs"
              >
                リセット実行
              </button>
              <button
                type="button"
                onClick={() => setConfirmReset(false)}
                className="btn-secondary text-xs"
              >
                キャンセル
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmReset(true)}
              className="btn-secondary text-sm"
            >
              デフォルトに戻す
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
