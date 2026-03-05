import { useState, useEffect, useCallback } from 'react'
import { type Assignment, type CreateInput, type UpdateInput } from '../types'
import {
  subscribeToAssignments,
  subscribeToAssignmentsByClass,
  subscribeToAssignmentsByTeacher,
  addAssignment as fbAdd,
  updateAssignment as fbUpdate,
  deleteAssignment as fbDelete,
} from '../firebase/assignments'

interface UseAssignmentsReturn {
  assignments: Assignment[]
  loading: boolean
  error: Error | null
  clearError: () => void
  addAssignment: (input: CreateInput<Assignment>) => Promise<void>
  updateAssignment: (id: string, input: UpdateInput<Assignment>) => Promise<void>
  deleteAssignment: (id: string) => Promise<void>
}

interface UseAssignmentsOptions {
  /**
   * 指定した場合、該当クラスの授業割当のみを購読する。
   * 未指定の場合は全授業割当を購読する。
   */
  classId?: string
  /**
   * 指定した場合、該当教員が含まれる授業割当のみを購読する。
   * classId と同時指定した場合は classId が優先される。
   */
  teacherId?: string
}

/**
 * 授業割当データのリアルタイム同期とCRUD操作を提供するカスタムフック。
 *
 * オプションでクラスまたは教員を指定してフィルタリングできる。
 * TT（チームティーチング）の整合性チェックはFirebaseレイヤーで実施済み。
 *
 * @example
 * // 全授業割当
 * const { assignments } = useAssignments()
 *
 * // クラス単位でフィルタリング
 * const { assignments } = useAssignments({ classId: 'class_1A' })
 *
 * // 教員単位でフィルタリング
 * const { assignments } = useAssignments({ teacherId: 'teacher_abc' })
 */
export function useAssignments(options: UseAssignmentsOptions = {}): UseAssignmentsReturn {
  const { classId, teacherId } = options

  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    const onData = (data: Assignment[]) => {
      setAssignments(data)
      setLoading(false)
    }
    const onError = (err: Error) => {
      setError(err)
      setLoading(false)
    }

    let unsubscribe: () => void

    if (classId) {
      unsubscribe = subscribeToAssignmentsByClass(classId, onData, onError)
    } else if (teacherId) {
      unsubscribe = subscribeToAssignmentsByTeacher(teacherId, onData, onError)
    } else {
      unsubscribe = subscribeToAssignments(onData, onError)
    }

    return unsubscribe
  // classId / teacherId が変化したら購読をリセットする
  }, [classId, teacherId])

  const clearError = useCallback(() => setError(null), [])

  const addAssignment = useCallback(async (input: CreateInput<Assignment>) => {
    setError(null)
    try {
      await fbAdd(input)
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err))
      setError(e)
      throw e
    }
  }, [])

  const updateAssignment = useCallback(async (id: string, input: UpdateInput<Assignment>) => {
    setError(null)
    try {
      await fbUpdate(id, input)
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err))
      setError(e)
      throw e
    }
  }, [])

  const deleteAssignment = useCallback(async (id: string) => {
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
    assignments,
    loading,
    error,
    clearError,
    addAssignment,
    updateAssignment,
    deleteAssignment,
  }
}
