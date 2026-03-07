import { useState, useEffect } from 'react'
import { onAuthStateChanged, signInAnonymously, type User } from 'firebase/auth'
import { auth } from '../firebase/config'

interface UseAuthReturn {
  user: User | null
  loading: boolean
  error: Error | null
}

/**
 * Firebase Anonymous Auth を使用した最低限の認証フック。
 * マウント時に自動的に匿名サインインし、uidを取得する。
 * Firestoreルールでの認証チェック（request.auth != null）に対応。
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
        // 未認証 → 匿名サインイン
        signInAnonymously(auth)
          .then((cred) => {
            setUser(cred.user)
          })
          .catch((err) => {
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
