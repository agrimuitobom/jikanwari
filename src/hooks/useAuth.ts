import { useState, useEffect } from 'react'
import { onAuthStateChanged, signInAnonymously, type User } from 'firebase/auth'
import { auth } from '../firebase/config'

interface UseAuthReturn {
  user: User | null
  loading: boolean
  error: Error | null
}

/**
 * Firebase Anonymous Auth を使用した認証フック。
 * 匿名サインインを試み、失敗してもアプリ動作をブロックしない。
 * Firestoreルールが認証不要に設定されていれば未認証でもデータアクセス可。
 */
export function useAuth(): UseAuthReturn {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser)
        setLoading(false)
      } else {
        // 未認証 → 匿名サインインを試行（失敗しても続行）
        signInAnonymously(auth)
          .then((cred) => {
            setUser(cred.user)
          })
          .catch((err) => {
            console.warn('匿名認証に失敗しました。認証なしで続行します:', err)
            setError(err instanceof Error ? err : new Error(String(err)))
          })
          .finally(() => {
            setLoading(false)
          })
      }
    })
    return unsubscribe
  }, [])

  return { user, loading, error }
}
