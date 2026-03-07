import type { SchedulerProgress, SchedulerResult } from './scheduler'
import type { Teacher, Subject, Assignment } from '../types'
import type { WorkerMessage, WorkerResponse } from './scheduler.worker'

/**
 * Web Worker でスケジューラを実行する。
 * メインスレッドをブロックしない。
 */
export function runSchedulerInWorker(
  teachers: Teacher[],
  subjects: Subject[],
  assignments: Assignment[],
  onProgress?: (progress: SchedulerProgress) => void,
): Promise<SchedulerResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL('./scheduler.worker.ts', import.meta.url),
      { type: 'module' },
    )

    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data
      switch (msg.type) {
        case 'progress':
          onProgress?.(msg.data)
          break
        case 'done':
          resolve(msg.data)
          worker.terminate()
          break
        case 'error':
          reject(new Error(msg.message))
          worker.terminate()
          break
      }
    }

    worker.onerror = (err) => {
      reject(new Error(err.message))
      worker.terminate()
    }

    const message: WorkerMessage = { type: 'start', teachers, subjects, assignments }
    worker.postMessage(message)
  })
}
