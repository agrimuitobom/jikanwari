import { useState, useEffect } from 'react'
import { onAuthStateChanged, signInAnonymously, type User } from 'firebase/auth'
import { auth } from '../firebase/config'

interface UseAuthReturn {
  user: User | null
  loading: boolean
  error: Error | null
}

const MAX_RETRIES = 3
const RETRY_DELAY_MS = 2000

/**
 * Firebase Anonymous Auth を使用した認証フック。
 * 匿名サインインを試み、失敗時は最大3回リトライする。
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
        setError(null)
        setLoading(false)
      } else {
        // 未認証 → 匿名サインインをリトライ付きで試行
        let attempt = 0
        const trySignIn = () => {
          attempt++
          signInAnonymously(auth)
            .then((cred) => {
              setUser(cred.user)
              setError(null)
              setLoading(false)
            })
            .catch((err) => {
              if (attempt < MAX_RETRIES) {
                console.warn(`匿名認証に失敗（${attempt}/${MAX_RETRIES}回目）。${RETRY_DELAY_MS}ms後にリトライします:`, err)
                setTimeout(trySignIn, RETRY_DELAY_MS)
              } else {
                console.error(`匿名認証に${MAX_RETRIES}回失敗しました。認証なしで続行します:`, err)
                setError(err instanceof Error ? err : new Error(String(err)))
                setLoading(false)
              }
            })
        }
        trySignIn()
      }
    })
    return unsubscribe
  }, [])

  return { user, loading, error }
}
