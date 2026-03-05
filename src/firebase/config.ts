import { initializeApp, getApps, type FirebaseApp } from 'firebase/app'
import { getFirestore, type Firestore } from 'firebase/firestore'
import { getAuth, type Auth } from 'firebase/auth'

// ============================================================
// Firebase 設定
// ============================================================
// 環境変数は .env.local ファイルに設定してください。
// .env.example を参考に VITE_FIREBASE_* の値を埋めてください。
// ============================================================

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string,
}

// ============================================================
// シングルトン初期化（Hot Module Replacement での二重初期化を防止）
// ============================================================

const app: FirebaseApp =
  getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0]

const db: Firestore = getFirestore(app)
const auth: Auth = getAuth(app)

export { app, db, auth }
