import type { Teacher, Subject, Assignment, DayOfWeek, Period } from '../types'
import { DAYS, PERIODS, DAY_LABELS } from './constants'

// ============================================================
// 制約矛盾の事前検出
// ============================================================

/** 制約矛盾の警告 */
export interface ConstraintWarning {
  /** 警告の深刻度 */
  severity: 'error' | 'warning'
  /** 対象の割当ID */
  assignmentId: string
  /** 警告メッセージ */
  message: string
}

/** 連続授業ペアの開始時限候補（1-2, 3-4, 5-6） */
const CONSECUTIVE_STARTS: Period[] = [1, 3, 5]

/**
 * 割当データの制約矛盾を事前検出する。
 * スケジューラ実行前に呼び出し、配置不可能な割当を警告する。
 */
export function detectConstraintConflicts(
  teachers: Teacher[],
  subjects: Subject[],
  assignments: Assignment[],
): ConstraintWarning[] {
  const warnings: ConstraintWarning[] = []
  const teacherMap = new Map(teachers.map((t) => [t.id, t]))
  const subjectMap = new Map(subjects.map((s) => [s.id, s]))

  for (const assignment of assignments) {
    const subject = subjectMap.get(assignment.subjectId)
    if (!subject) {
      warnings.push({
        severity: 'error',
        assignmentId: assignment.id,
        message: '科目データが見つかりません',
      })
      continue
    }

    const assignTeachers = assignment.teacherIds
      .map((id) => teacherMap.get(id))
      .filter((t): t is Teacher => t !== undefined)

    if (assignTeachers.length === 0) {
      warnings.push({
        severity: 'error',
        assignmentId: assignment.id,
        message: '担当教員データが見つかりません',
      })
      continue
    }

    // 全教員が共通して勤務可能な曜日を求める
    const commonDays = DAYS.filter((day) =>
      assignTeachers.every((t) => t.availableDays.includes(day)),
    )

    if (commonDays.length === 0) {
      const names = assignTeachers.map((t) => t.name).join('・')
      warnings.push({
        severity: 'error',
        assignmentId: assignment.id,
        message: `${names}に共通の勤務可能日がありません`,
      })
      continue
    }

    // 各曜日で使える時限を計算（教員の除外コマ + 科目の除外時限を除く）
    const availableSlots = countAvailableSlots(
      commonDays,
      assignTeachers,
      subject,
    )

    // 連続授業の場合はペア単位でカウント
    const slotsPerTask = subject.isConsecutive ? 2 : 1
    const tasksNeeded = Math.ceil(assignment.weeklyCount / slotsPerTask)

    if (subject.isConsecutive) {
      // 連続授業: 使えるペア数をカウント
      const availablePairs = countConsecutivePairs(commonDays, assignTeachers, subject)
      if (availablePairs === 0) {
        warnings.push({
          severity: 'error',
          assignmentId: assignment.id,
          message: `連続2コマの空きペアがありません（${formatDays(commonDays)}の勤務日で利用可能なペアなし）`,
        })
      } else if (availablePairs < tasksNeeded) {
        warnings.push({
          severity: 'warning',
          assignmentId: assignment.id,
          message: `連続2コマのペアが${availablePairs}個しかなく、必要数${tasksNeeded}に不足する可能性があります`,
        })
      }
    } else {
      if (availableSlots === 0) {
        const names = assignTeachers.map((t) => t.name).join('・')
        warnings.push({
          severity: 'error',
          assignmentId: assignment.id,
          message: `${names}の勤務可能日・除外コマと科目の除外時限により、配置可能なコマが0です`,
        })
      } else if (availableSlots < tasksNeeded) {
        warnings.push({
          severity: 'warning',
          assignmentId: assignment.id,
          message: `配置可能コマ数(${availableSlots})が必要数(${tasksNeeded})に不足する可能性があります（他の割当との競合次第）`,
        })
      }
    }

    // 教員の勤務日が少ない場合の警告
    for (const teacher of assignTeachers) {
      if (teacher.availableDays.length <= 2) {
        warnings.push({
          severity: 'warning',
          assignmentId: assignment.id,
          message: `${teacher.name}の勤務日が${teacher.availableDays.length}日のみ（${formatDays(teacher.availableDays)}）のため、配置が困難になる可能性があります`,
        })
      }
    }
  }

  // 同一教員の総コマ数チェック
  const teacherTotalSlots = new Map<string, number>()
  for (const assignment of assignments) {
    for (const teacherId of assignment.teacherIds) {
      teacherTotalSlots.set(
        teacherId,
        (teacherTotalSlots.get(teacherId) ?? 0) + assignment.weeklyCount,
      )
    }
  }

  for (const [teacherId, total] of teacherTotalSlots) {
    const teacher = teacherMap.get(teacherId)
    if (!teacher) continue
    const maxSlots = teacher.availableDays.length * PERIODS.length
    // 除外コマ分を引く
    const excluded = teacher.excludedSlots.filter((s) =>
      teacher.availableDays.includes(s.day),
    ).length
    const effective = maxSlots - excluded

    if (total > effective) {
      warnings.push({
        severity: 'error',
        assignmentId: '', // 教員全体の問題
        message: `${teacher.name}の週コマ数(${total})が最大配置可能数(${effective})を超えています`,
      })
    } else if (total > effective * 0.9) {
      warnings.push({
        severity: 'warning',
        assignmentId: '',
        message: `${teacher.name}の週コマ数(${total})が最大配置可能数(${effective})の90%を超えています`,
      })
    }
  }

  return warnings
}

function countAvailableSlots(
  commonDays: DayOfWeek[],
  teachers: Teacher[],
  subject: Subject,
): number {
  let count = 0
  for (const day of commonDays) {
    for (const period of PERIODS) {
      if (subject.excludedPeriods?.includes(period)) continue
      const blocked = teachers.some((t) =>
        t.excludedSlots.some((s) => s.day === day && s.period === period),
      )
      if (!blocked) count++
    }
  }
  return count
}

function countConsecutivePairs(
  commonDays: DayOfWeek[],
  teachers: Teacher[],
  subject: Subject,
): number {
  let count = 0
  for (const day of commonDays) {
    for (const start of CONSECUTIVE_STARTS) {
      const end = (start + 1) as Period
      if (subject.excludedPeriods?.includes(start)) continue
      if (subject.excludedPeriods?.includes(end)) continue
      const blocked = teachers.some((t) =>
        t.excludedSlots.some(
          (s) => s.day === day && (s.period === start || s.period === end),
        ),
      )
      if (!blocked) count++
    }
  }
  return count
}

function formatDays(days: DayOfWeek[]): string {
  return days.map((d) => DAY_LABELS[d]).join('')
}
