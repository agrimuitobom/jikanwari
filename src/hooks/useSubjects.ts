import { useState, useEffect, useCallback } from 'react'
import { type Subject, type CreateInput, type UpdateInput } from '../types'
import {
  subscribeToSubjects,
  addSubject as fbAdd,
  updateSubject as fbUpdate,
  deleteSubject as fbDelete,
} from '../firebase/subjects'

interface UseSubjectsReturn {
  subjects: Subject[]
  loading: boolean
  error: Error | null
  clearError: () => void
  addSubject: (input: CreateInput<Subject>) => Promise<void>
  updateSubject: (id: string, input: UpdateInput<Subject>) => Promise<void>
  deleteSubject: (id: string) => Promise<void>
}

/**
 * 科目データのリアルタイム同期とCRUD操作を提供するカスタムフック。
 *
 * @example
 * const { subjects, loading, error, addSubject } = useSubjects()
 */
export function useSubjects(): UseSubjectsReturn {
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    const unsubscribe = subscribeToSubjects(
      (data) => {
        setSubjects(data)
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

  const addSubject = useCallback(async (input: CreateInput<Subject>) => {
    setError(null)
    try {
      await fbAdd(input)
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err))
      setError(e)
      throw e
    }
  }, [])

  const updateSubject = useCallback(async (id: string, input: UpdateInput<Subject>) => {
    setError(null)
    try {
      await fbUpdate(id, input)
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err))
      setError(e)
      throw e
    }
  }, [])

  const deleteSubject = useCallback(async (id: string) => {
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
    subjects,
    loading,
    error,
    clearError,
    addSubject,
    updateSubject,
    deleteSubject,
  }
}
