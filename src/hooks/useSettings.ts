import { useState, useCallback } from 'react'

export interface AppSettings {
  /** 学年あたりのクラス数 (1-10) */
  classesPerGrade: number
  /** 教員の1日あたり最大コマ数 (1-6) */
  maxTeacherPeriodsPerDay: number
  /** スケジューラ最大探索回数 */
  maxIterations: number
}

const STORAGE_KEY = 'jikanwari-settings'

const DEFAULT_SETTINGS: AppSettings = {
  classesPerGrade: 3,
  maxTeacherPeriodsPerDay: 5,
  maxIterations: 50000,
}

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_SETTINGS
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function useSettings() {
  const [settings, setSettingsState] = useState<AppSettings>(loadSettings)

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettingsState((prev) => {
      const next = { ...prev, ...patch }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  const resetSettings = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    setSettingsState(DEFAULT_SETTINGS)
  }, [])

  return { settings, updateSettings, resetSettings, DEFAULT_SETTINGS }
}
