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
import { COLLECTION, type Room, type CreateInput, type UpdateInput } from '../types'

// ============================================================
// バリデーション
// ============================================================

export function validateRoom(input: CreateInput<Room> | UpdateInput<Room>): void {
  if ('name' in input && input.name !== undefined) {
    if (!input.name.trim()) {
      throw new Error('施設名は必須です')
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
// Firestore DocumentSnapshot → Room 変換
// ============================================================

function docToRoom(snap: QueryDocumentSnapshot): Room {
  const d = snap.data()
  return {
    id: snap.id,
    name: d.name as string,
    ...(d.category !== undefined ? { category: d.category as string } : {}),
    ...(d.availableDays !== undefined ? { availableDays: d.availableDays as Room['availableDays'] } : {}),
    ...(d.excludedSlots !== undefined ? { excludedSlots: d.excludedSlots as Room['excludedSlots'] } : {}),
    ...(d.memo !== undefined ? { memo: d.memo as string } : {}),
    createdAt: (d.createdAt as Timestamp).toDate(),
    updatedAt: (d.updatedAt as Timestamp).toDate(),
  }
}

// ============================================================
// ユーティリティ
// ============================================================

function omitUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined),
  ) as Partial<T>
}

// ============================================================
// CRUD 関数
// ============================================================

const roomsRef = collection(db, COLLECTION.ROOMS)

export async function addRoom(input: CreateInput<Room>): Promise<Room> {
  validateRoom(input)

  const docRef = await addDoc(roomsRef, {
    name: input.name,
    ...(input.category !== undefined ? { category: input.category } : {}),
    ...(input.availableDays !== undefined ? { availableDays: input.availableDays } : {}),
    ...(input.excludedSlots !== undefined ? { excludedSlots: input.excludedSlots } : {}),
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

export async function updateRoom(id: string, input: UpdateInput<Room>): Promise<void> {
  validateRoom(input)

  const docRef = doc(db, COLLECTION.ROOMS, id)
  await updateDoc(docRef, {
    ...omitUndefined(input as Record<string, unknown>),
    updatedAt: serverTimestamp(),
  })
}

export async function deleteRoom(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION.ROOMS, id))
}

export function subscribeToRooms(
  callback: (rooms: Room[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    roomsRef,
    (snap) => callback(snap.docs.map(docToRoom)),
    (err) => onError?.(err),
  )
}
