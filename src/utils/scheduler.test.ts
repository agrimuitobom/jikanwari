import { describe, it, expect, beforeEach } from 'vitest'
import { generateSchedule } from './scheduler'
import type { Teacher, Subject, Assignment, DayOfWeek, Period } from '../types'

// ============================================================
// テストヘルパー
// ============================================================

let idCounter = 0
function uid(): string {
  return `test-${++idCounter}`
}

function makeTeacher(overrides: Partial<Teacher> = {}): Teacher {
  return {
    id: uid(),
    name: '教員A',
    subjectIds: [],
    availableDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
    excludedSlots: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

function makeSubject(overrides: Partial<Subject> = {}): Subject {
  return {
    id: uid(),
    name: '数学I',
    grade: 1,
    category: '数学',
    credits: 3,
    weeklyFrequency: 3,
    isConsecutive: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

function makeAssignment(overrides: Partial<Assignment> = {}): Assignment {
  return {
    id: uid(),
    classId: 'grade1-class1',
    subjectId: '',
    teacherIds: [],
    weeklyCount: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

/** ジェネレータを最後まで回して結果を返す */
function runGenerator(
  teachers: Teacher[],
  subjects: Subject[],
  assignments: Assignment[],
) {
  const gen = generateSchedule(teachers, subjects, assignments)
  let result = gen.next()
  while (!result.done) {
    result = gen.next()
  }
  return result.value
}

// ============================================================
// テストケース
// ============================================================

describe('scheduler', () => {
  beforeEach(() => {
    idCounter = 0
  })

  describe('空データ', () => {
    it('割当がない場合は空の完全解を返す', () => {
      const result = runGenerator([], [], [])
      expect(result.isComplete).toBe(true)
      expect(result.entries).toHaveLength(0)
      expect(result.unplacedTasks).toHaveLength(0)
    })
  })

  describe('基本配置', () => {
    it('1科目1コマを配置できる', () => {
      const teacher = makeTeacher()
      const subject = makeSubject({ weeklyFrequency: 1 })
      const assignment = makeAssignment({
        subjectId: subject.id,
        teacherIds: [teacher.id],
        weeklyCount: 1,
      })

      const result = runGenerator([teacher], [subject], [assignment])
      expect(result.isComplete).toBe(true)
      expect(result.entries).toHaveLength(1)
      expect(result.entries[0].assignmentId).toBe(assignment.id)
      expect(result.entries[0].classId).toBe('grade1-class1')
    })

    it('複数コマを異なるスロットに配置できる', () => {
      const teacher = makeTeacher()
      const subject = makeSubject({ weeklyFrequency: 3 })
      const assignment = makeAssignment({
        subjectId: subject.id,
        teacherIds: [teacher.id],
        weeklyCount: 3,
      })

      const result = runGenerator([teacher], [subject], [assignment])
      expect(result.isComplete).toBe(true)
      expect(result.entries).toHaveLength(3)

      // 全エントリが異なるスロットに配置されていること
      const slots = result.entries.map((e) => `${e.day}-${e.period}`)
      expect(new Set(slots).size).toBe(3)
    })
  })

  describe('連続授業', () => {
    it('連続2コマが正しいペアで配置される', () => {
      const teacher = makeTeacher()
      const subject = makeSubject({
        weeklyFrequency: 2,
        isConsecutive: true,
      })
      const assignment = makeAssignment({
        subjectId: subject.id,
        teacherIds: [teacher.id],
        weeklyCount: 2,
      })

      const result = runGenerator([teacher], [subject], [assignment])
      expect(result.isComplete).toBe(true)
      expect(result.entries).toHaveLength(2)

      // 連続ペアの確認: 同じ曜日で period と period+1
      const sorted = [...result.entries].sort((a, b) => a.period - b.period)
      expect(sorted[0].day).toBe(sorted[1].day)
      expect(sorted[1].period - sorted[0].period).toBe(1)
      expect(sorted[1].isConsecutiveSecond).toBe(true)
    })

    it('連続授業は1-2, 3-4, 5-6のペアで配置される', () => {
      const teacher = makeTeacher()
      const subject = makeSubject({
        weeklyFrequency: 2,
        isConsecutive: true,
      })
      const assignment = makeAssignment({
        subjectId: subject.id,
        teacherIds: [teacher.id],
        weeklyCount: 2,
      })

      const result = runGenerator([teacher], [subject], [assignment])
      const firstEntry = result.entries.find((e) => !e.isConsecutiveSecond)!
      expect([1, 3, 5]).toContain(firstEntry.period)
    })
  })

  describe('教員制約', () => {
    it('教員の勤務日外には配置しない', () => {
      const teacher = makeTeacher({
        availableDays: ['monday'] as DayOfWeek[],
      })
      const subject = makeSubject({ weeklyFrequency: 1 })
      const assignment = makeAssignment({
        subjectId: subject.id,
        teacherIds: [teacher.id],
        weeklyCount: 1,
      })

      const result = runGenerator([teacher], [subject], [assignment])
      expect(result.isComplete).toBe(true)
      expect(result.entries[0].day).toBe('monday')
    })

    it('教員の除外コマには配置しない', () => {
      const teacher = makeTeacher({
        availableDays: ['monday'] as DayOfWeek[],
        excludedSlots: [
          { day: 'monday' as DayOfWeek, period: 1 as Period },
          { day: 'monday' as DayOfWeek, period: 2 as Period },
          { day: 'monday' as DayOfWeek, period: 3 as Period },
          { day: 'monday' as DayOfWeek, period: 4 as Period },
          { day: 'monday' as DayOfWeek, period: 5 as Period },
        ],
      })
      const subject = makeSubject({ weeklyFrequency: 1 })
      const assignment = makeAssignment({
        subjectId: subject.id,
        teacherIds: [teacher.id],
        weeklyCount: 1,
      })

      const result = runGenerator([teacher], [subject], [assignment])
      expect(result.isComplete).toBe(true)
      expect(result.entries[0].period).toBe(6)
    })

    it('教員が同じ時限に2クラスに割り当てられない', () => {
      const teacher = makeTeacher({
        availableDays: ['monday'] as DayOfWeek[],
      })
      const subject = makeSubject({ weeklyFrequency: 1 })

      const a1 = makeAssignment({
        classId: 'grade1-class1',
        subjectId: subject.id,
        teacherIds: [teacher.id],
        weeklyCount: 6,
      })
      const a2 = makeAssignment({
        classId: 'grade1-class2',
        subjectId: subject.id,
        teacherIds: [teacher.id],
        weeklyCount: 6,
      })

      const result = runGenerator([teacher], [subject], [a1, a2])
      // 月曜のみ6コマ × 2クラスだが、教員は同時に1クラスしか担当できない
      // 最大6コマなので12コマは配置不可
      expect(result.entries.length).toBeLessThanOrEqual(6)

      // 教員が同じスロットに重複していないことを確認
      const teacherSlots = result.entries.map((e) => `${e.day}-${e.period}`)
      expect(new Set(teacherSlots).size).toBe(teacherSlots.length)
    })
  })

  describe('クラス制約', () => {
    it('同じクラスの同じスロットに2つの授業を配置しない', () => {
      const t1 = makeTeacher({ name: '教員A' })
      const t2 = makeTeacher({ name: '教員B' })
      const s1 = makeSubject({ name: '数学' })
      const s2 = makeSubject({ name: '英語' })

      const a1 = makeAssignment({
        classId: 'grade1-class1',
        subjectId: s1.id,
        teacherIds: [t1.id],
        weeklyCount: 5,
      })
      const a2 = makeAssignment({
        classId: 'grade1-class1',
        subjectId: s2.id,
        teacherIds: [t2.id],
        weeklyCount: 5,
      })

      const result = runGenerator([t1, t2], [s1, s2], [a1, a2])

      // 同クラス・同スロットが重複していないことを確認
      const classSlots = result.entries.map(
        (e) => `${e.classId}-${e.day}-${e.period}`,
      )
      expect(new Set(classSlots).size).toBe(classSlots.length)
    })
  })

  describe('TT（チームティーチング）', () => {
    it('TT授業の全教員が空いているスロットに配置される', () => {
      const t1 = makeTeacher({
        name: '教員A',
        availableDays: ['monday', 'tuesday'] as DayOfWeek[],
      })
      const t2 = makeTeacher({
        name: '教員B',
        availableDays: ['monday', 'wednesday'] as DayOfWeek[],
      })
      const subject = makeSubject({ weeklyFrequency: 1 })
      const assignment = makeAssignment({
        subjectId: subject.id,
        teacherIds: [t1.id, t2.id],
        weeklyCount: 1,
      })

      const result = runGenerator([t1, t2], [subject], [assignment])
      expect(result.isComplete).toBe(true)
      // 共通勤務日は月曜のみ
      expect(result.entries[0].day).toBe('monday')
    })
  })

  describe('推奨時限', () => {
    it('推奨時限内への配置でスコアが加点される', () => {
      const teacher = makeTeacher()
      const subjectWithPref = makeSubject({
        weeklyFrequency: 1,
        preferredPeriods: { from: 1 as Period, to: 2 as Period },
      })
      const assignment = makeAssignment({
        subjectId: subjectWithPref.id,
        teacherIds: [teacher.id],
        weeklyCount: 1,
      })

      const result = runGenerator([teacher], [subjectWithPref], [assignment])
      expect(result.isComplete).toBe(true)
      // スコアは基本1000 + 推奨ボーナス(最大200)
      expect(result.score).toBeGreaterThan(1000)
      // 推奨時限内に配置されていること
      expect(result.entries[0].period).toBeLessThanOrEqual(2)
    })
  })

  describe('配置不可ケース', () => {
    it('全コマが埋まる場合、未配置タスクの理由が返る', () => {
      // 月曜1コマのみ勤務の教員に2コマ配置を要求
      const teacher = makeTeacher({
        availableDays: ['monday'] as DayOfWeek[],
        excludedSlots: [
          { day: 'monday' as DayOfWeek, period: 2 as Period },
          { day: 'monday' as DayOfWeek, period: 3 as Period },
          { day: 'monday' as DayOfWeek, period: 4 as Period },
          { day: 'monday' as DayOfWeek, period: 5 as Period },
          { day: 'monday' as DayOfWeek, period: 6 as Period },
        ],
      })
      const subject = makeSubject({ weeklyFrequency: 2 })
      const assignment = makeAssignment({
        subjectId: subject.id,
        teacherIds: [teacher.id],
        weeklyCount: 2,
      })

      const result = runGenerator([teacher], [subject], [assignment])
      expect(result.isComplete).toBe(false)
      expect(result.unplacedTasks.length).toBeGreaterThan(0)
      expect(result.unplacedTasks[0].reason).toBeTruthy()
    })

    it('科目が見つからない場合はスキップされる', () => {
      const teacher = makeTeacher()
      const assignment = makeAssignment({
        subjectId: 'nonexistent',
        teacherIds: [teacher.id],
        weeklyCount: 1,
      })

      const result = runGenerator([teacher], [], [assignment])
      expect(result.isComplete).toBe(true)
      expect(result.entries).toHaveLength(0)
    })

    it('教員が見つからない場合はスキップされる', () => {
      const subject = makeSubject()
      const assignment = makeAssignment({
        subjectId: subject.id,
        teacherIds: ['nonexistent'],
        weeklyCount: 1,
      })

      const result = runGenerator([], [subject], [assignment])
      expect(result.isComplete).toBe(true)
      expect(result.entries).toHaveLength(0)
    })
  })

  describe('大規模ケース', () => {
    it('9クラス × 複数科目の時間割が生成できる', () => {
      const classIds = [
        'grade1-class1', 'grade1-class2', 'grade1-class3',
        'grade2-class1', 'grade2-class2', 'grade2-class3',
        'grade3-class1', 'grade3-class2', 'grade3-class3',
      ]

      const teachers: Teacher[] = []
      const subjects: Subject[] = []
      const assignments: Assignment[] = []

      // 5教科、各教科2名の教員
      const categories = ['数学', '英語', '国語', '理科', '地歴公民'] as const
      for (const cat of categories) {
        const subj = makeSubject({ name: cat, category: cat, weeklyFrequency: 2 })
        subjects.push(subj)

        for (let i = 0; i < 2; i++) {
          const t = makeTeacher({ name: `${cat}教員${i + 1}`, subjectIds: [subj.id] })
          teachers.push(t)
        }
      }

      // 各クラスに各科目を割当
      for (const classId of classIds) {
        for (let si = 0; si < subjects.length; si++) {
          const teacherIdx = si * 2 + (classIds.indexOf(classId) % 2)
          assignments.push(
            makeAssignment({
              classId,
              subjectId: subjects[si].id,
              teacherIds: [teachers[teacherIdx].id],
              weeklyCount: 2,
            }),
          )
        }
      }

      const result = runGenerator(teachers, subjects, assignments)
      // 全配置は困難かもしれないが、何らかの結果が返ること
      expect(result.entries.length).toBeGreaterThan(0)
      expect(result.score).toBeGreaterThan(0)
    })
  })

  describe('ソフト制約: 同日同科目回避', () => {
    it('同科目が異なる曜日に分散される', () => {
      const teacher = makeTeacher()
      const subject = makeSubject({ name: '数学', weeklyFrequency: 3 })
      const assignment = makeAssignment({
        subjectId: subject.id,
        teacherIds: [teacher.id],
        weeklyCount: 3,
      })

      const result = runGenerator([teacher], [subject], [assignment])
      expect(result.isComplete).toBe(true)

      // 3コマが全て異なる曜日に分散されていること
      const days = result.entries.map((e) => e.day)
      expect(new Set(days).size).toBe(3)
    })
  })

  describe('ソフト制約: 教員1日あたりの最大コマ数', () => {
    it('教員の1日のコマ数が5コマを超えるとスコアが下がる', () => {
      // 月曜のみ勤務の教員に6コマ配置（5コマ上限のソフト制約超過）
      const teacher = makeTeacher({
        availableDays: ['monday'] as DayOfWeek[],
      })
      const subject = makeSubject({ weeklyFrequency: 6 })
      const assignment = makeAssignment({
        subjectId: subject.id,
        teacherIds: [teacher.id],
        weeklyCount: 6,
      })

      const result = runGenerator([teacher], [subject], [assignment])
      expect(result.isComplete).toBe(true)
      // 6コマ全て配置されるが、スコアは最大1000未満（1コマ超過のペナルティ）
      expect(result.score).toBeLessThan(1000)
    })

    it('複数日に分散すれば高スコアになる', () => {
      const teacher = makeTeacher({
        availableDays: ['monday', 'tuesday', 'wednesday'] as DayOfWeek[],
      })
      const subject = makeSubject({ weeklyFrequency: 6 })
      const assignment = makeAssignment({
        subjectId: subject.id,
        teacherIds: [teacher.id],
        weeklyCount: 6,
      })

      const result = runGenerator([teacher], [subject], [assignment])
      expect(result.isComplete).toBe(true)
      // 分散可能なのでペナルティが軽いか0
      expect(result.score).toBeGreaterThanOrEqual(900)
    })
  })

  describe('ジェネレータ進捗', () => {
    it('進捗情報がyieldされる', () => {
      const teacher = makeTeacher()
      const subject = makeSubject({ weeklyFrequency: 1 })
      const assignment = makeAssignment({
        subjectId: subject.id,
        teacherIds: [teacher.id],
        weeklyCount: 1,
      })

      const gen = generateSchedule([teacher], [subject], [assignment])
      const progresses = []
      let result = gen.next()
      while (!result.done) {
        progresses.push(result.value)
        result = gen.next()
      }

      // 最低1回の進捗（最終進捗）が返る
      expect(progresses.length).toBeGreaterThanOrEqual(1)
      const last = progresses[progresses.length - 1]
      expect(last).toHaveProperty('placed')
      expect(last).toHaveProperty('total')
      expect(last).toHaveProperty('bestScore')
      expect(last).toHaveProperty('iterations')
    })
  })
})
