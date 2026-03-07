import { useState, useEffect, useCallback } from 'react'
import type { ScheduleEntry } from '../types'
import type { SchedulerResult, UnplacedTask } from '../utils/scheduler'
import {
  type SavedSchedule,
  subscribeToSchedules,
  saveSchedule as fbSave,
  updateScheduleName as fbRename,
  updateScheduleEntries as fbUpdateEntries,
  deleteSavedSchedule as fbDelete,
} from '../firebase/schedules'

interface UseSchedulesReturn {
  schedules: SavedSchedule[]
  loading: boolean
  error: Error | null
  clearError: () => void
  saveSchedule: (name: string, result: SchedulerResult, unplacedTasks: UnplacedTask[]) => Promise<SavedSchedule>
  renameSchedule: (id: string, name: string) => Promise<void>
  updateEntries: (id: string, entries: ScheduleEntry[], unplacedTasks: UnplacedTask[]) => Promise<void>
  deleteSchedule: (id: string) => Promise<void>
}

export function useSchedules(): UseSchedulesReturn {
  const [schedules, setSchedules] = useState<SavedSchedule[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    const unsubscribe = subscribeToSchedules(
      (data) => {
        setSchedules(data)
        setLoading(false)
      },
      (err) => {
        setError(err)
        setLoading(false)
      },
    )
    return unsubscribe
  }, [])

  const clearError = useCallback(() => setError(null), [])

  const saveSchedule = useCallback(
    async (name: string, result: SchedulerResult, unplacedTasks: UnplacedTask[]) => {
      setError(null)
      try {
        return await fbSave(name, result, unplacedTasks)
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err))
        setError(e)
        throw e
      }
    },
    [],
  )

  const renameSchedule = useCallback(async (id: string, name: string) => {
    setError(null)
    try {
      await fbRename(id, name)
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err))
      setError(e)
      throw e
    }
  }, [])

  const updateEntries = useCallback(
    async (id: string, entries: ScheduleEntry[], unplacedTasks: UnplacedTask[]) => {
      setError(null)
      try {
        await fbUpdateEntries(id, entries, unplacedTasks)
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err))
        setError(e)
        throw e
      }
    },
    [],
  )

  const deleteSchedule = useCallback(async (id: string) => {
    setError(null)
    try {
      await fbDelete(id)
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err))
      setError(e)
      throw e
    }
  }, [])

  return {
    schedules,
    loading,
    error,
    clearError,
    saveSchedule,
    renameSchedule,
    updateEntries,
    deleteSchedule,
  }
}
