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
    consecutivePairs: 0,
    noConsecutive: false,
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
        consecutivePairs: 1,
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
        consecutivePairs: 1,
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

  describe('ハード制約: 同日同科目禁止', () => {
    it('1日しか勤務日がない教員に複数コマは1コマしか配置できない', () => {
      // 月曜のみ勤務の教員に3コマ → 同日同科目禁止により1コマしか配置不可
      const teacher = makeTeacher({
        availableDays: ['monday'] as DayOfWeek[],
      })
      const subject = makeSubject({ weeklyFrequency: 3 })
      const assignment = makeAssignment({
        subjectId: subject.id,
        teacherIds: [teacher.id],
        weeklyCount: 3,
      })

      const result = runGenerator([teacher], [subject], [assignment])
      expect(result.isComplete).toBe(false)
      expect(result.unplacedTasks.length).toBeGreaterThan(0)
    })

    it('勤務日数が足りれば全コマ配置でき高スコアになる', () => {
      // 5日勤務の教員に5コマ → 各日1コマずつ配置可能
      const teacher = makeTeacher({
        availableDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'] as DayOfWeek[],
      })
      const subject = makeSubject({ weeklyFrequency: 5 })
      const assignment = makeAssignment({
        subjectId: subject.id,
        teacherIds: [teacher.id],
        weeklyCount: 5,
      })

      const result = runGenerator([teacher], [subject], [assignment])
      expect(result.isComplete).toBe(true)
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

  describe('weeklyCount超過防止', () => {
    it('同じ割当のエントリがweeklyCountを超えない', () => {
      // 同じ教員が3クラス × 週2コマ = 6タスク（競合しやすい構成）
      const teacher = makeTeacher({
        availableDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'] as DayOfWeek[],
      })
      const subject = makeSubject({ weeklyFrequency: 2 })

      const a1 = makeAssignment({
        classId: 'grade1-class1',
        subjectId: subject.id,
        teacherIds: [teacher.id],
        weeklyCount: 2,
      })
      const a2 = makeAssignment({
        classId: 'grade1-class2',
        subjectId: subject.id,
        teacherIds: [teacher.id],
        weeklyCount: 2,
      })
      const a3 = makeAssignment({
        classId: 'grade1-class3',
        subjectId: subject.id,
        teacherIds: [teacher.id],
        weeklyCount: 2,
      })

      const result = runGenerator([teacher], [subject], [a1, a2, a3])

      // 各割当のエントリ数がweeklyCountを超えていないことを確認
      for (const assignment of [a1, a2, a3]) {
        const count = result.entries.filter((e) => e.assignmentId === assignment.id).length
        expect(count).toBeLessThanOrEqual(assignment.weeklyCount)
      }
    })

    it('大規模ケースでもweeklyCount超過が発生しない', () => {
      const classIds = [
        'grade1-class1', 'grade1-class2', 'grade1-class3',
        'grade2-class1', 'grade2-class2', 'grade2-class3',
      ]

      const teachers: Teacher[] = []
      const subjects: Subject[] = []
      const assignments: Assignment[] = []

      // 3教科、各教科1名の教員（競合が発生しやすい構成）
      const categories = ['数学', '英語', '国語'] as const
      for (const cat of categories) {
        const subj = makeSubject({ name: cat, category: cat, weeklyFrequency: 3 })
        subjects.push(subj)
        const t = makeTeacher({ name: `${cat}教員`, subjectIds: [subj.id] })
        teachers.push(t)
      }

      // 各クラスに各科目を割当（同じ教員が6クラス担当 → 競合多発）
      for (const classId of classIds) {
        for (let si = 0; si < subjects.length; si++) {
          assignments.push(
            makeAssignment({
              classId,
              subjectId: subjects[si].id,
              teacherIds: [teachers[si].id],
              weeklyCount: 3,
            }),
          )
        }
      }

      const result = runGenerator(teachers, subjects, assignments)

      // 全割当についてweeklyCount超過がないことを確認
      for (const assignment of assignments) {
        const count = result.entries.filter((e) => e.assignmentId === assignment.id).length
        expect(count).toBeLessThanOrEqual(assignment.weeklyCount)
      }
    })
  })

  describe('固定スロット（fixedSlots）', () => {
    it('連続2コマの固定スロットが複数クラスで正しく火曜5-6限に配置される', () => {
      // 課題研究: 3クラス分、各クラス別の教員、火曜5-6限固定
      const teacher1 = makeTeacher({ name: '教員1' })
      const teacher2 = makeTeacher({ name: '教員2' })
      const teacher3 = makeTeacher({ name: '教員3' })

      const subject = makeSubject({
        name: '課題研究',
        grade: 3,
        category: 'その他',
        credits: 2,
        weeklyFrequency: 2,
        consecutivePairs: 1,
      })

      // 3クラス分の割当、全て火曜5限固定（連続なので5-6限になる）
      const a1 = makeAssignment({
        classId: 'grade3-class1',
        subjectId: subject.id,
        teacherIds: [teacher1.id],
        weeklyCount: 2,
        fixedSlots: [{ day: 'tuesday' as DayOfWeek, period: 5 as Period }],
      })
      const a2 = makeAssignment({
        classId: 'grade3-class2',
        subjectId: subject.id,
        teacherIds: [teacher2.id],
        weeklyCount: 2,
        fixedSlots: [{ day: 'tuesday' as DayOfWeek, period: 5 as Period }],
      })
      const a3 = makeAssignment({
        classId: 'grade3-class3',
        subjectId: subject.id,
        teacherIds: [teacher3.id],
        weeklyCount: 2,
        fixedSlots: [{ day: 'tuesday' as DayOfWeek, period: 5 as Period }],
      })

      // 他の科目も入れて競合状況を作る
      const otherSubject = makeSubject({
        name: '数学III',
        grade: 3,
        credits: 4,
        weeklyFrequency: 4,
        consecutivePairs: 0,
      })
      const otherAssignments = [
        makeAssignment({ classId: 'grade3-class1', subjectId: otherSubject.id, teacherIds: [teacher1.id], weeklyCount: 4 }),
        makeAssignment({ classId: 'grade3-class2', subjectId: otherSubject.id, teacherIds: [teacher2.id], weeklyCount: 4 }),
        makeAssignment({ classId: 'grade3-class3', subjectId: otherSubject.id, teacherIds: [teacher3.id], weeklyCount: 4 }),
      ]

      const result = runGenerator(
        [teacher1, teacher2, teacher3],
        [subject, otherSubject],
        [a1, a2, a3, ...otherAssignments],
      )

      // 課題研究の全エントリが火曜日であることを確認
      for (const a of [a1, a2, a3]) {
        const entries = result.entries.filter((e) => e.assignmentId === a.id)
        expect(entries.length).toBe(2) // 連続2コマ
        for (const entry of entries) {
          expect(entry.day).toBe('tuesday')
          expect([5, 6]).toContain(entry.period)
        }
      }
    })

    it('連続2コマの固定スロットで開始・終了両方がfixedSlotsにある場合でも正しく配置される', () => {
      // バグ再現: ユーザーが火曜5限と6限の両方をfixedSlotsに登録
      // 連続ペアとして5-6限を占有し、6限が余分な単独タスクにならないことを確認
      const t1 = makeTeacher({ name: '教員1' })
      const t2 = makeTeacher({ name: '教員2' })

      const subject = makeSubject({
        name: '課題研究E',
        grade: 3,
        category: '農業',
        credits: 2,
        weeklyFrequency: 2,
        consecutivePairs: 1,
      })

      // fixedSlotsに5限と6限の両方を登録（ユーザーがよくやるパターン）
      const a1 = makeAssignment({
        classId: 'grade3-class1',
        subjectId: subject.id,
        teacherIds: [t1.id, t2.id],
        weeklyCount: 2,
        fixedSlots: [
          { day: 'tuesday' as DayOfWeek, period: 5 as Period },
          { day: 'tuesday' as DayOfWeek, period: 6 as Period },
        ],
      })

      const result = runGenerator([t1, t2], [subject], [a1])

      // 全2コマが配置されること（未配置なし）
      expect(result.isComplete).toBe(true)
      const entries = result.entries.filter((e) => e.assignmentId === a1.id)
      expect(entries.length).toBe(2)
      // 火曜5-6限に配置されること
      for (const entry of entries) {
        expect(entry.day).toBe('tuesday')
        expect([5, 6]).toContain(entry.period)
      }
      // 未配置タスクがないこと
      expect(result.unplacedTasks.length).toBe(0)
    })

    it('同時開講グループの連続2コマで開始・終了両方がfixedSlotsにある場合でも正しく配置される', () => {
      const t1 = makeTeacher({ name: '教員1' })
      const t2 = makeTeacher({ name: '教員2' })
      const t3 = makeTeacher({ name: '教員3' })

      const subject = makeSubject({
        name: '課題研究',
        grade: 3,
        category: '農業',
        credits: 2,
        weeklyFrequency: 2,
        consecutivePairs: 1,
      })

      // 2クラス同時開講、fixedSlotsに5限と6限の両方
      const a1 = makeAssignment({
        classId: 'grade3-class1',
        subjectId: subject.id,
        teacherIds: [t1.id, t2.id],
        weeklyCount: 2,
        fixedSlots: [
          { day: 'tuesday' as DayOfWeek, period: 5 as Period },
          { day: 'tuesday' as DayOfWeek, period: 6 as Period },
        ],
        simultaneousGroupId: 'kadai-e',
      })
      const a2 = makeAssignment({
        classId: 'grade3-class2',
        subjectId: subject.id,
        teacherIds: [t1.id, t3.id],
        weeklyCount: 2,
        fixedSlots: [
          { day: 'tuesday' as DayOfWeek, period: 5 as Period },
          { day: 'tuesday' as DayOfWeek, period: 6 as Period },
        ],
        simultaneousGroupId: 'kadai-e',
      })

      const result = runGenerator([t1, t2, t3], [subject], [a1, a2])

      expect(result.isComplete).toBe(true)
      // 各割当が2コマずつ配置
      for (const a of [a1, a2]) {
        const entries = result.entries.filter((e) => e.assignmentId === a.id)
        expect(entries.length).toBe(2)
        for (const entry of entries) {
          expect(entry.day).toBe('tuesday')
          expect([5, 6]).toContain(entry.period)
        }
      }
      expect(result.unplacedTasks.length).toBe(0)
    })

    it('連続2コマの固定スロットで後半時限(6限)だけが登録されている場合も開始時限に正規化される', () => {
      // バグ再現: fixedSlots=[{火,6}]のみ → 連続ペアは5-6限に正規化されるべき
      const t = makeTeacher({ name: '教員1' })
      const subject = makeSubject({
        name: '課題研究S',
        grade: 3,
        category: '農業',
        credits: 2,
        weeklyFrequency: 2,
        consecutivePairs: 1,
      })
      const a = makeAssignment({
        classId: 'grade3-class1',
        subjectId: subject.id,
        teacherIds: [t.id],
        weeklyCount: 2,
        fixedSlots: [{ day: 'tuesday' as DayOfWeek, period: 6 as Period }],
      })
      const result = runGenerator([t], [subject], [a])
      expect(result.isComplete).toBe(true)
      const entries = result.entries.filter((e) => e.assignmentId === a.id)
      expect(entries.length).toBe(2)
      for (const entry of entries) {
        expect(entry.day).toBe('tuesday')
        expect([5, 6]).toContain(entry.period)
      }
    })

    it('連続2コマの固定スロットが逆順[{6},{5}]で登録されていても正しく配置される', () => {
      const t = makeTeacher({ name: '教員1' })
      const subject = makeSubject({
        name: '課題研究E',
        grade: 3,
        credits: 2,
        weeklyFrequency: 2,
        consecutivePairs: 1,
      })
      const a = makeAssignment({
        classId: 'grade3-class2',
        subjectId: subject.id,
        teacherIds: [t.id],
        weeklyCount: 2,
        fixedSlots: [
          { day: 'tuesday' as DayOfWeek, period: 6 as Period },
          { day: 'tuesday' as DayOfWeek, period: 5 as Period },
        ],
      })
      const result = runGenerator([t], [subject], [a])
      expect(result.isComplete).toBe(true)
      const entries = result.entries.filter((e) => e.assignmentId === a.id)
      expect(entries.length).toBe(2)
      for (const entry of entries) {
        expect(entry.day).toBe('tuesday')
        expect([5, 6]).toContain(entry.period)
      }
    })

    it('固定スロットのタスクが修復フェーズで別の場所に移動されない', () => {
      // 多くの割当で競合が発生する状況を作り、固定タスクが別の場所に行かないことを確認
      const teachers = Array.from({ length: 3 }, (_, i) => makeTeacher({ name: `教員${i + 1}` }))

      const fixedSubject = makeSubject({
        name: 'HR',
        grade: 1,
        credits: 1,
        weeklyFrequency: 1,
        consecutivePairs: 0,
      })

      // 木曜6限固定
      const fixedAssignments = ['grade1-class1', 'grade1-class2', 'grade1-class3'].map((classId, i) =>
        makeAssignment({
          classId,
          subjectId: fixedSubject.id,
          teacherIds: [teachers[i].id],
          weeklyCount: 1,
          fixedSlots: [{ day: 'thursday' as DayOfWeek, period: 6 as Period }],
        }),
      )

      // 他の科目をたくさん追加して枠を圧迫
      const otherSubjects = Array.from({ length: 5 }, (_, i) =>
        makeSubject({ name: `科目${i}`, grade: 1, credits: 3, weeklyFrequency: 3 }),
      )
      const otherAssignments: Assignment[] = []
      for (const classId of ['grade1-class1', 'grade1-class2', 'grade1-class3']) {
        for (const sub of otherSubjects) {
          otherAssignments.push(
            makeAssignment({
              classId,
              subjectId: sub.id,
              teacherIds: [teachers[Math.floor(Math.random() * 3)].id],
              weeklyCount: 3,
            }),
          )
        }
      }

      const result = runGenerator(
        teachers,
        [fixedSubject, ...otherSubjects],
        [...fixedAssignments, ...otherAssignments],
      )

      // 固定タスクが木曜6限にあることを確認
      for (const a of fixedAssignments) {
        const entries = result.entries.filter((e) => e.assignmentId === a.id)
        if (entries.length > 0) {
          for (const entry of entries) {
            expect(entry.day).toBe('thursday')
            expect(entry.period).toBe(6)
          }
        }
      }
    })

    it('同時開講グループで2番目以降のassignmentにfixedSlotsを設定しても正しく配置される', () => {
      // バグ再現: groupAssignments[0]にfixedSlotsがなく、[1]にある場合に無視されていた
      const t1 = makeTeacher({ name: '教員1' })
      const t2 = makeTeacher({ name: '教員2' })
      const subject = makeSubject({
        name: '課題研究E',
        grade: 3,
        category: '農業',
        credits: 2,
        weeklyFrequency: 2,
        consecutivePairs: 1,
      })
      // 1番目のassignmentにはfixedSlotsなし
      const a1 = makeAssignment({
        classId: 'grade3-class1',
        subjectId: subject.id,
        teacherIds: [t1.id],
        weeklyCount: 2,
        simultaneousGroupId: 'kadai-e',
      })
      // 2番目のassignmentにfixedSlotsあり
      const a2 = makeAssignment({
        classId: 'grade3-class2',
        subjectId: subject.id,
        teacherIds: [t2.id],
        weeklyCount: 2,
        fixedSlots: [
          { day: 'tuesday' as DayOfWeek, period: 5 as Period },
          { day: 'tuesday' as DayOfWeek, period: 6 as Period },
        ],
        simultaneousGroupId: 'kadai-e',
      })

      const result = runGenerator([t1, t2], [subject], [a1, a2])
      expect(result.isComplete).toBe(true)
      // 両方が火曜5-6限に配置
      for (const a of [a1, a2]) {
        const entries = result.entries.filter((e) => e.assignmentId === a.id)
        expect(entries.length).toBe(2)
        for (const entry of entries) {
          expect(entry.day).toBe('tuesday')
          expect([5, 6]).toContain(entry.period)
        }
      }
    })
  })
})
