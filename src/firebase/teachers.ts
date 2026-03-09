import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore'
import { db } from './config'
import { COLLECTION, type Teacher, type CreateInput, type UpdateInput } from '../types'

// ============================================================
// バリデーション
// ============================================================

/**
 * 教員データの整合性チェック。
 * 新規作成・更新の両方で使用するため、各フィールドの存在確認を行ってから検証する。
 */
export function validateTeacher(input: CreateInput<Teacher> | UpdateInput<Teacher>): void {
  if ('name' in input && input.name !== undefined) {
    if (!input.name.trim()) {
      throw new Error('教員名は必須です')
    }
  }

  if ('availableDays' in input && input.availableDays !== undefined) {
    if (input.availableDays.length === 0) {
      throw new Error('勤務可能日を1日以上設定してください')
    }
  }

  if ('excludedSlots' in input && input.excludedSlots !== undefined) {
    for (const slot of input.excludedSlots) {
      if (!slot.day || slot.period < 1 || slot.period > 6) {
        throw new Error('除外コマの曜日・時限が不正です')
      }
    }
  }
}

// ============================================================
// Firestore DocumentSnapshot → Teacher 変換
// ============================================================

/**
 * Firestore のドキュメントスナップショットを Teacher 型に変換する。
 * - Timestamp → Date の変換
 * - 配列フィールドの undefined フォールバック
 * - excludedSlots のオブジェクト配列をそのまま復元
 */
function docToTeacher(snap: QueryDocumentSnapshot): Teacher {
  const d = snap.data()
  return {
    id: snap.id,
    name: d.name as string,
    ...(d.department !== undefined ? { department: d.department as Teacher['department'] } : {}),
    subjectIds: (d.subjectIds ?? []) as string[],
    availableDays: (d.availableDays ?? []) as Teacher['availableDays'],
    excludedSlots: (d.excludedSlots ?? []) as Teacher['excludedSlots'],
    ...(d.memo !== undefined ? { memo: d.memo as string } : {}),
    createdAt: (d.createdAt as Timestamp).toDate(),
    updatedAt: (d.updatedAt as Timestamp).toDate(),
  }
}

// ============================================================
// Firestore 書き込み用データ整形
// ============================================================

/**
 * undefined 値を持つキーを除去する。
 * Firestore の updateDoc に undefined を渡すとエラーになるため必須。
 */
function omitUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined),
  ) as Partial<T>
}

// ============================================================
// CRUD 関数
// ============================================================

const teachersRef = collection(db, COLLECTION.TEACHERS)

/**
 * 教員を新規作成する。
 * バリデーション後、Firestore に追加。
 * serverTimestamp() は非同期解決のため、createdAt/updatedAt はクライアント時刻で即時返却する。
 */
export async function addTeacher(input: CreateInput<Teacher>): Promise<Teacher> {
  validateTeacher(input)

  const docRef = await addDoc(teachersRef, {
    name: input.name,
    ...(input.department !== undefined ? { department: input.department } : {}),
    subjectIds: input.subjectIds,
    availableDays: input.availableDays,
    // excludedSlots は {day, period} のオブジェクト配列として保存
    excludedSlots: input.excludedSlots,
    ...(input.memo !== undefined ? { memo: input.memo } : {}),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  const clientNow = new Date()
  return {
    id: docRef.id,
    ...input,
    createdAt: clientNow,
    updatedAt: clientNow,
  }
}

/**
 * 教員情報を部分更新する。
 * 指定されたフィールドのみ上書きし、updatedAt をサーバー時刻で更新する。
 */
export async function updateTeacher(id: string, input: UpdateInput<Teacher>): Promise<void> {
  validateTeacher(input)

  const docRef = doc(db, COLLECTION.TEACHERS, id)
  await updateDoc(docRef, {
    ...omitUndefined(input as Record<string, unknown>),
    updatedAt: serverTimestamp(),
  })
}

/**
 * 教員を削除する。
 * 関連するAssignmentの整合性チェックは呼び出し元で行うこと。
 */
export async function deleteTeacher(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION.TEACHERS, id))
}

/**
 * 全教員をリアルタイム購読する。
 * Firestore の onSnapshot を使用し、変更があるたびに callback を呼び出す。
 * @returns 購読解除関数（useEffect のクリーンアップで呼ぶこと）
 */
export function subscribeToTeachers(
  callback: (teachers: Teacher[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    teachersRef,
    (snap) => callback(snap.docs.map(docToTeacher)),
    (err) => onError?.(err),
  )
}
