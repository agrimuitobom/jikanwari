import { useState, useEffect, useCallback } from 'react'
import { type Teacher, type CreateInput, type UpdateInput } from '../types'
import {
  subscribeToTeachers,
  addTeacher as fbAdd,
  updateTeacher as fbUpdate,
  deleteTeacher as fbDelete,
} from '../firebase/teachers'

// ============================================================
// 戻り値の型
// ============================================================

interface UseTeachersReturn {
  /** Firestoreからリアルタイム同期された教員一覧 */
  teachers: Teacher[]
  /** 初回データ取得中フラグ */
  loading: boolean
  /**
   * 最後に発生したエラー。
   * 操作が成功すれば null にリセットされる。
   */
  error: Error | null
  /** エラーを手動でリセットする */
  clearError: () => void
  /** 教員を新規追加する */
  addTeacher: (input: CreateInput<Teacher>) => Promise<void>
  /** 教員情報を部分更新する */
  updateTeacher: (id: string, input: UpdateInput<Teacher>) => Promise<void>
  /** 教員を削除する */
  deleteTeacher: (id: string) => Promise<void>
}

// ============================================================
// useTeachers
// ============================================================

/**
 * 教員データのリアルタイム同期とCRUD操作を提供するカスタムフック。
 *
 * - onSnapshot による Firestore リアルタイム購読
 * - バリデーションエラーは error ステートに格納され、呼び出し元に再 throw される
 * - コンポーネントアンマウント時に購読が自動解除される
 *
 * @example
 * const { teachers, loading, error, addTeacher } = useTeachers()
 */
export function useTeachers(): UseTeachersReturn {
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  // Firestore のリアルタイム購読をセットアップ
  useEffect(() => {
    const unsubscribe = subscribeToTeachers(
      (data) => {
        setTeachers(data)
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

  const addTeacher = useCallback(async (input: CreateInput<Teacher>) => {
    setError(null)
    try {
      await fbAdd(input)
      // onSnapshot が自動的に teachers ステートを更新するため、手動更新不要
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err))
      setError(e)
      throw e
    }
  }, [])

  const updateTeacher = useCallback(async (id: string, input: UpdateInput<Teacher>) => {
    setError(null)
    try {
      await fbUpdate(id, input)
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err))
      setError(e)
      throw e
    }
  }, [])

  const deleteTeacher = useCallback(async (id: string) => {
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
    teachers,
    loading,
    error,
    clearError,
    addTeacher,
    updateTeacher,
    deleteTeacher,
  }
}
