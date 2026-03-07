import { generateSchedule } from './scheduler'
import type { SchedulerProgress, SchedulerResult } from './scheduler'
import type { Teacher, Subject, Assignment } from '../types'

export type WorkerMessage =
  | { type: 'start'; teachers: Teacher[]; subjects: Subject[]; assignments: Assignment[] }

export type WorkerResponse =
  | { type: 'progress'; data: SchedulerProgress }
  | { type: 'done'; data: SchedulerResult }
  | { type: 'error'; message: string }

self.onmessage = (e: MessageEvent<WorkerMessage>) => {
  if (e.data.type !== 'start') return

  try {
    const { teachers, subjects, assignments } = e.data
    const gen = generateSchedule(teachers, subjects, assignments)
    let result = gen.next()

    while (!result.done) {
      const response: WorkerResponse = { type: 'progress', data: result.value as SchedulerProgress }
      self.postMessage(response)
      result = gen.next()
    }

    const response: WorkerResponse = { type: 'done', data: result.value as SchedulerResult }
    self.postMessage(response)
  } catch (err) {
    const response: WorkerResponse = {
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
    }
    self.postMessage(response)
  }
}
