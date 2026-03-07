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
import { COLLECTION, type Subject, type CreateInput, type UpdateInput } from '../types'

// ============================================================
// バリデーション
// ============================================================

/**
 * 科目データの整合性チェック。
 *
 * - 科目名は空文字不可
 * - 単位数・週あたりコマ数は 1 以上
 * - preferredPeriods を指定する場合、from ≤ to であること
 * - isConsecutive = true の場合、weeklyFrequency は偶数（2コマ連続 × N回）
 */
export function validateSubject(input: CreateInput<Subject> | UpdateInput<Subject>): void {
  if ('name' in input && input.name !== undefined) {
    if (!input.name.trim()) {
      throw new Error('科目名は必須です')
    }
  }

  if ('credits' in input && input.credits !== undefined) {
    if (input.credits < 1) {
      throw new Error('単位数は1以上を設定してください')
    }
  }

  if ('weeklyFrequency' in input && input.weeklyFrequency !== undefined) {
    if (input.weeklyFrequency < 1) {
      throw new Error('週あたりコマ数は1以上を設定してください')
    }
  }

  if ('preferredPeriods' in input && input.preferredPeriods !== undefined) {
    const { from, to } = input.preferredPeriods
    if (from > to) {
      throw new Error('推奨時限の開始（from）は終了（to）以前に設定してください')
    }
    if (from < 1 || to > 6) {
      throw new Error('推奨時限は1〜6限の範囲で設定してください')
    }
  }

  // isConsecutive と weeklyFrequency の組み合わせチェック
  const isConsecutive = 'isConsecutive' in input ? input.isConsecutive : undefined
  const weeklyFrequency = 'weeklyFrequency' in input ? input.weeklyFrequency : undefined
  if (isConsecutive === true && weeklyFrequency !== undefined && weeklyFrequency % 2 !== 0) {
    throw new Error('連続授業（2コマ連続）の場合、週あたりコマ数は偶数にしてください')
  }
}

// ============================================================
// Firestore DocumentSnapshot → Subject 変換
// ============================================================

/**
 * Firestore のドキュメントを Subject 型に変換する。
 * - Timestamp → Date の変換
 * - preferredPeriods は Firestore 上ではプレーンオブジェクトとして保存されるため
 *   そのまま Subject['preferredPeriods'] として扱える
 */
function docToSubject(snap: QueryDocumentSnapshot): Subject {
  const d = snap.data()
  return {
    id: snap.id,
    name: d.name as string,
    grade: (d.grade as number ?? 1) as Subject['grade'],
    category: (d.category as string ?? '国語') as Subject['category'],
    credits: d.credits as number,
    weeklyFrequency: d.weeklyFrequency as number,
    isConsecutive: d.isConsecutive as boolean,
    // preferredPeriods は { from: number, to: number } のオブジェクト or undefined
    ...(d.preferredPeriods !== undefined && d.preferredPeriods !== null
      ? { preferredPeriods: d.preferredPeriods as Subject['preferredPeriods'] }
      : {}),
    ...(d.color !== undefined ? { color: d.color as string } : {}),
    createdAt: (d.createdAt as Timestamp).toDate(),
    updatedAt: (d.updatedAt as Timestamp).toDate(),
  }
}

function omitUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined),
  ) as Partial<T>
}

// ============================================================
// CRUD 関数
// ============================================================

const subjectsRef = collection(db, COLLECTION.SUBJECTS)

export async function addSubject(input: CreateInput<Subject>): Promise<Subject> {
  validateSubject(input)

  const docRef = await addDoc(subjectsRef, {
    name: input.name,
    grade: input.grade,
    category: input.category,
    credits: input.credits,
    weeklyFrequency: input.weeklyFrequency,
    isConsecutive: input.isConsecutive,
    // preferredPeriods が undefined の場合はフィールド自体を省略
    ...(input.preferredPeriods !== undefined ? { preferredPeriods: input.preferredPeriods } : {}),
    ...(input.color !== undefined ? { color: input.color } : {}),
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

export async function updateSubject(id: string, input: UpdateInput<Subject>): Promise<void> {
  validateSubject(input)

  const docRef = doc(db, COLLECTION.SUBJECTS, id)
  await updateDoc(docRef, {
    ...omitUndefined(input as Record<string, unknown>),
    updatedAt: serverTimestamp(),
  })
}

export async function deleteSubject(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION.SUBJECTS, id))
}

export function subscribeToSubjects(
  callback: (subjects: Subject[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    subjectsRef,
    (snap) => callback(snap.docs.map(docToSubject)),
    (err) => onError?.(err),
  )
}
