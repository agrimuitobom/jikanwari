import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  onSnapshot,
  query,
  where,
  serverTimestamp,
  Timestamp,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore'
import { db } from './config'
import { COLLECTION, type Assignment, type CreateInput, type UpdateInput, type TimeSlot, type DayOfWeek } from '../types'

// ============================================================
// バリデーション
// ============================================================

/**
 * 授業割当データの整合性チェック。
 *
 * - classId, subjectId は空文字不可
 * - teacherIds は1件以上必須（TT含め、担当なしの授業割当は不正）
 * - weeklyCount は 1 以上
 */
export function validateAssignment(
  input: CreateInput<Assignment> | UpdateInput<Assignment>,
): void {
  if ('classId' in input && input.classId !== undefined) {
    if (!input.classId.trim()) {
      throw new Error('クラスを選択してください')
    }
  }

  if ('subjectId' in input && input.subjectId !== undefined) {
    if (!input.subjectId.trim()) {
      throw new Error('科目を選択してください')
    }
  }

  if ('teacherIds' in input && input.teacherIds !== undefined) {
    if (input.teacherIds.length === 0) {
      throw new Error('担当教員を1名以上設定してください（TT授業の場合は複数指定可）')
    }
    // 空文字の教員IDが混入していないか確認
    if (input.teacherIds.some((id) => !id.trim())) {
      throw new Error('教員IDに不正な値が含まれています')
    }
    // 重複する教員IDがないか確認
    const unique = new Set(input.teacherIds)
    if (unique.size !== input.teacherIds.length) {
      throw new Error('教員IDが重複しています')
    }
  }

  if ('weeklyCount' in input && input.weeklyCount !== undefined) {
    if (input.weeklyCount < 1) {
      throw new Error('週あたりコマ数は1以上を設定してください')
    }
  }
}

/**
 * teacherIds / subjectId が Firestore 上に実在するか検証する。
 * 存在しないIDがあれば Error をスローする。
 */
async function validateReferences(
  input: CreateInput<Assignment> | UpdateInput<Assignment>,
): Promise<void> {
  // subjectId の存在チェック
  if ('subjectId' in input && input.subjectId) {
    const subjectSnap = await getDoc(doc(db, COLLECTION.SUBJECTS, input.subjectId))
    if (!subjectSnap.exists()) {
      throw new Error('指定された科目が存在しません')
    }
  }

  // teacherIds の存在チェック
  if ('teacherIds' in input && input.teacherIds && input.teacherIds.length > 0) {
    const checks = await Promise.all(
      input.teacherIds.map(async (id) => {
        const snap = await getDoc(doc(db, COLLECTION.TEACHERS, id))
        return { id, exists: snap.exists() }
      }),
    )
    const missing = checks.filter((c) => !c.exists)
    if (missing.length > 0) {
      throw new Error(
        `指定された教員が存在しません（ID: ${missing.map((m) => m.id).join(', ')}）`,
      )
    }
  }
}

// ============================================================
// Firestore DocumentSnapshot → Assignment 変換
// ============================================================

function docToAssignment(snap: QueryDocumentSnapshot): Assignment {
  const d = snap.data()
  return {
    id: snap.id,
    classId: d.classId as string,
    subjectId: d.subjectId as string,
    // teacherIds は文字列配列として保存・復元
    teacherIds: (d.teacherIds ?? []) as string[],
    weeklyCount: d.weeklyCount as number,
    ...(d.simultaneousGroupId ? { simultaneousGroupId: d.simultaneousGroupId as string } : {}),
    ...(d.fixedSlots && Array.isArray(d.fixedSlots) && d.fixedSlots.length > 0
      ? { fixedSlots: d.fixedSlots as TimeSlot[] }
      : {}),
    ...(d.fixedDays && Array.isArray(d.fixedDays) && d.fixedDays.length > 0
      ? { fixedDays: d.fixedDays as DayOfWeek[] }
      : {}),
    ...(d.notes !== undefined ? { notes: d.notes as string } : {}),
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

const assignmentsRef = collection(db, COLLECTION.ASSIGNMENTS)

export async function addAssignment(input: CreateInput<Assignment>): Promise<Assignment> {
  validateAssignment(input)
  await validateReferences(input)

  const docRef = await addDoc(assignmentsRef, {
    classId: input.classId,
    subjectId: input.subjectId,
    teacherIds: input.teacherIds,
    weeklyCount: input.weeklyCount,
    ...(input.simultaneousGroupId ? { simultaneousGroupId: input.simultaneousGroupId } : {}),
    ...(input.fixedSlots && input.fixedSlots.length > 0 ? { fixedSlots: input.fixedSlots } : {}),
    ...(input.fixedDays && input.fixedDays.length > 0 ? { fixedDays: input.fixedDays } : {}),
    ...(input.notes !== undefined ? { notes: input.notes } : {}),
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

export async function updateAssignment(
  id: string,
  input: UpdateInput<Assignment>,
): Promise<void> {
  validateAssignment(input)
  await validateReferences(input)

  const docRef = doc(db, COLLECTION.ASSIGNMENTS, id)
  await updateDoc(docRef, {
    ...omitUndefined(input as Record<string, unknown>),
    updatedAt: serverTimestamp(),
  })
}

export async function deleteAssignment(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION.ASSIGNMENTS, id))
}

/**
 * 全授業割当をリアルタイム購読する。
 */
export function subscribeToAssignments(
  callback: (assignments: Assignment[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    assignmentsRef,
    (snap) => callback(snap.docs.map(docToAssignment)),
    (err) => onError?.(err),
  )
}

/**
 * 特定クラスの授業割当のみをリアルタイム購読する。
 * 時間割画面でクラス単位に絞り込む際に使用。
 */
export function subscribeToAssignmentsByClass(
  classId: string,
  callback: (assignments: Assignment[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const q = query(assignmentsRef, where('classId', '==', classId))
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map(docToAssignment)),
    (err) => onError?.(err),
  )
}

/**
 * 特定教員が関わる授業割当をリアルタイム購読する。
 * 教員の担当コマ確認・競合チェックに使用。
 */
export function subscribeToAssignmentsByTeacher(
  teacherId: string,
  callback: (assignments: Assignment[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  // Firestore の array-contains で teacherIds 配列内を検索
  const q = query(assignmentsRef, where('teacherIds', 'array-contains', teacherId))
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map(docToAssignment)),
    (err) => onError?.(err),
  )
}
