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
import { COLLECTION, type ScheduleEntry } from '../types'
import type { SchedulerResult, UnplacedTask } from '../utils/scheduler'

// ============================================================
// 保存済みスケジュール型
// ============================================================

export interface SavedSchedule {
  id: string
  name: string
  entries: ScheduleEntry[]
  unplacedTasks: UnplacedTask[]
  score: number
  isComplete: boolean
  createdAt: Date
  updatedAt: Date
}

export type SavedScheduleInput = Omit<SavedSchedule, 'id' | 'createdAt' | 'updatedAt'>

// ============================================================
// Firestore DocumentSnapshot → SavedSchedule 変換
// ============================================================

function docToSavedSchedule(snap: QueryDocumentSnapshot): SavedSchedule {
  const d = snap.data()
  return {
    id: snap.id,
    name: d.name as string,
    entries: (d.entries ?? []) as ScheduleEntry[],
    unplacedTasks: (d.unplacedTasks ?? []) as UnplacedTask[],
    score: d.score as number,
    isComplete: d.isComplete as boolean,
    createdAt: (d.createdAt as Timestamp)?.toDate() ?? new Date(),
    updatedAt: (d.updatedAt as Timestamp)?.toDate() ?? new Date(),
  }
}

// ============================================================
// CRUD 関数
// ============================================================

const schedulesRef = collection(db, COLLECTION.SCHEDULES)

export async function saveSchedule(
  name: string,
  result: SchedulerResult,
  unplacedTasks: UnplacedTask[],
): Promise<SavedSchedule> {
  const docRef = await addDoc(schedulesRef, {
    name,
    entries: result.entries.map((e) => ({
      id: e.id,
      day: e.day,
      period: e.period,
      classId: e.classId,
      assignmentId: e.assignmentId,
      ...(e.isConsecutiveSecond ? { isConsecutiveSecond: true } : {}),
    })),
    unplacedTasks: unplacedTasks.map((t) => ({
      assignmentId: t.assignmentId,
      classId: t.classId,
      subjectId: t.subjectId,
      reason: t.reason,
    })),
    score: result.score,
    isComplete: result.isComplete,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  const now = new Date()
  return {
    id: docRef.id,
    name,
    entries: result.entries,
    unplacedTasks,
    score: result.score,
    isComplete: result.isComplete,
    createdAt: now,
    updatedAt: now,
  }
}

export async function updateScheduleName(id: string, name: string): Promise<void> {
  if (!name.trim()) throw new Error('名前を入力してください')
  const docRef = doc(db, COLLECTION.SCHEDULES, id)
  await updateDoc(docRef, { name: name.trim(), updatedAt: serverTimestamp() })
}

export async function updateScheduleEntries(
  id: string,
  entries: ScheduleEntry[],
  unplacedTasks: UnplacedTask[],
): Promise<void> {
  const docRef = doc(db, COLLECTION.SCHEDULES, id)
  await updateDoc(docRef, {
    entries: entries.map((e) => ({
      id: e.id,
      day: e.day,
      period: e.period,
      classId: e.classId,
      assignmentId: e.assignmentId,
      ...(e.isConsecutiveSecond ? { isConsecutiveSecond: true } : {}),
    })),
    unplacedTasks: unplacedTasks.map((t) => ({
      assignmentId: t.assignmentId,
      classId: t.classId,
      subjectId: t.subjectId,
      reason: t.reason,
    })),
    updatedAt: serverTimestamp(),
  })
}

export async function deleteSavedSchedule(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION.SCHEDULES, id))
}

export function subscribeToSchedules(
  callback: (schedules: SavedSchedule[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    schedulesRef,
    (snap) => callback(snap.docs.map(docToSavedSchedule)),
    (err) => onError?.(err),
  )
}
