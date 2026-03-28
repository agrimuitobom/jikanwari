import { describe, it, expect, beforeEach } from 'vitest'
import { detectConstraintConflicts, type ConstraintWarning } from './constraintChecker'
import type { Teacher, Subject, Assignment, Room, DayOfWeek } from '../types'

// ============================================================
// テストヘルパー
// ============================================================

let idCounter = 0
function uid(): string {
  return `cc-test-${++idCounter}`
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

function makeRoom(overrides: Partial<Room> = {}): Room {
  return {
    id: uid(),
    name: '教室A',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

/** 指定severity の警告を抽出 */
function errors(ws: ConstraintWarning[]): ConstraintWarning[] {
  return ws.filter((w) => w.severity === 'error')
}
function warnings(ws: ConstraintWarning[]): ConstraintWarning[] {
  return ws.filter((w) => w.severity === 'warning')
}

beforeEach(() => {
  idCounter = 0
})

// ============================================================
// 基本バリデーション
// ============================================================

describe('基本バリデーション', () => {
  it('空データでは警告なし', () => {
    const result = detectConstraintConflicts([], [], [])
    expect(result).toHaveLength(0)
  })

  it('科目データが見つからない場合エラー', () => {
    const t = makeTeacher()
    const a = makeAssignment({ subjectId: 'nonexistent', teacherIds: [t.id] })
    const result = detectConstraintConflicts([t], [], [a])
    expect(errors(result)).toHaveLength(1)
    expect(result[0].message).toContain('科目データが見つかりません')
  })

  it('教員データが見つからない場合エラー', () => {
    const s = makeSubject()
    const a = makeAssignment({ subjectId: s.id, teacherIds: ['nonexistent'] })
    const result = detectConstraintConflicts([], [s], [a])
    expect(errors(result)).toHaveLength(1)
    expect(result[0].message).toContain('担当教員データが見つかりません')
  })

  it('正常な割当では警告なし', () => {
    const t = makeTeacher()
    const s = makeSubject()
    const a = makeAssignment({ subjectId: s.id, teacherIds: [t.id], weeklyCount: 3 })
    const result = detectConstraintConflicts([t], [s], [a])
    expect(errors(result)).toHaveLength(0)
  })
})

// ============================================================
// 教員の勤務可能日制約
// ============================================================

describe('教員の勤務可能日制約', () => {
  it('TT教員間で共通勤務日がない場合エラー', () => {
    const t1 = makeTeacher({ name: '教員A', availableDays: ['monday', 'tuesday'] })
    const t2 = makeTeacher({ name: '教員B', availableDays: ['thursday', 'friday'] })
    const s = makeSubject()
    const a = makeAssignment({ subjectId: s.id, teacherIds: [t1.id, t2.id] })
    const result = detectConstraintConflicts([t1, t2], [s], [a])
    const errs = errors(result)
    expect(errs.some((w) => w.message.includes('共通の勤務可能日がありません'))).toBe(true)
  })

  it('勤務日が2日以下の教員には警告', () => {
    const t = makeTeacher({ name: '非常勤A', availableDays: ['monday', 'wednesday'] })
    const s = makeSubject()
    const a = makeAssignment({ subjectId: s.id, teacherIds: [t.id] })
    const result = detectConstraintConflicts([t], [s], [a])
    expect(warnings(result).some((w) => w.message.includes('勤務日が2日のみ'))).toBe(true)
  })

  it('教員の除外コマと科目の除外時限により配置可能コマ0の場合エラー', () => {
    const allSlots = (['monday'] as DayOfWeek[]).flatMap((day) =>
      ([1, 2, 3, 4, 5, 6] as const).map((period) => ({ day, period })),
    )
    const t = makeTeacher({
      name: '教員A',
      availableDays: ['monday'],
      excludedSlots: allSlots,
    })
    const s = makeSubject()
    const a = makeAssignment({ subjectId: s.id, teacherIds: [t.id], weeklyCount: 1 })
    const result = detectConstraintConflicts([t], [s], [a])
    expect(errors(result).some((w) => w.message.includes('配置可能なコマが0'))).toBe(true)
  })

  it('配置可能コマ数が必要数に不足する場合は警告', () => {
    // 勤務日1日（6コマ）に対して weeklyCount=5 → 配置可能コマ6 > 5 だが90%超え
    // 勤務日1日で5コマ除外 → 1コマ残り、weeklyCount=2
    const t = makeTeacher({
      availableDays: ['monday'],
      excludedSlots: [
        { day: 'monday', period: 1 },
        { day: 'monday', period: 2 },
        { day: 'monday', period: 3 },
        { day: 'monday', period: 4 },
        { day: 'monday', period: 5 },
      ],
    })
    const s = makeSubject()
    const a = makeAssignment({ subjectId: s.id, teacherIds: [t.id], weeklyCount: 2 })
    const result = detectConstraintConflicts([t], [s], [a])
    expect(warnings(result).some((w) => w.message.includes('不足する可能性'))).toBe(true)
  })
})

// ============================================================
// 連続授業チェック
// ============================================================

describe('連続授業チェック', () => {
  it('連続ペア枠がない場合エラー', () => {
    // 教員が月曜のみ勤務、1-2限を除外、3-4限を除外、5-6限を除外
    const t = makeTeacher({
      availableDays: ['monday'],
      excludedSlots: [
        { day: 'monday', period: 2 },
        { day: 'monday', period: 4 },
        { day: 'monday', period: 6 },
      ],
    })
    const s = makeSubject({ consecutivePairs: 1, weeklyFrequency: 2 })
    const a = makeAssignment({
      subjectId: s.id,
      teacherIds: [t.id],
      weeklyCount: 2,
    })
    const result = detectConstraintConflicts([t], [s], [a])
    expect(errors(result).some((w) => w.message.includes('連続2コマの空きペアがありません'))).toBe(true)
  })

  it('連続ペア数が不足する場合は警告', () => {
    // 月曜のみ勤務 → 連続ペア候補は 1-2, 3-4, 5-6 の3つ
    // 5限を除外 → 5-6ペアが使えない → 候補2つ
    // consecutivePairs=3 → 必要3 > 候補2
    const t = makeTeacher({
      availableDays: ['monday'],
      excludedSlots: [{ day: 'monday', period: 5 }],
    })
    const s = makeSubject({ consecutivePairs: 3, weeklyFrequency: 6 })
    const a = makeAssignment({
      subjectId: s.id,
      teacherIds: [t.id],
      weeklyCount: 6,
    })
    const result = detectConstraintConflicts([t], [s], [a])
    expect(warnings(result).some((w) => w.message.includes('ペアが2個しかなく'))).toBe(true)
  })
})

// ============================================================
// 同時開講グループ
// ============================================================

describe('同時開講グループ', () => {
  it('グループ内で週コマ数が不一致の場合エラー', () => {
    const t = makeTeacher()
    const s = makeSubject()
    const a1 = makeAssignment({
      subjectId: s.id,
      teacherIds: [t.id],
      classId: 'grade1-class1',
      weeklyCount: 2,
      simultaneousGroupId: 'g1',
    })
    const a2 = makeAssignment({
      subjectId: s.id,
      teacherIds: [t.id],
      classId: 'grade1-class2',
      weeklyCount: 3,
      simultaneousGroupId: 'g1',
    })
    const result = detectConstraintConflicts([t], [s], [a1, a2])
    expect(errors(result).some((w) => w.message.includes('週コマ数が一致しません'))).toBe(true)
  })

  it('グループ教員間で共通勤務日がない場合エラー', () => {
    const t1 = makeTeacher({ name: '教員A', availableDays: ['monday'] })
    const t2 = makeTeacher({ name: '教員B', availableDays: ['friday'] })
    const s = makeSubject()
    const a1 = makeAssignment({
      subjectId: s.id,
      teacherIds: [t1.id],
      classId: 'grade1-class1',
      weeklyCount: 2,
      simultaneousGroupId: 'g1',
    })
    const a2 = makeAssignment({
      subjectId: s.id,
      teacherIds: [t2.id],
      classId: 'grade1-class2',
      weeklyCount: 2,
      simultaneousGroupId: 'g1',
    })
    const result = detectConstraintConflicts([t1, t2], [s], [a1, a2])
    expect(errors(result).some((w) =>
      w.message.includes('同時開講グループの全教員') && w.message.includes('共通の勤務可能日がありません'),
    )).toBe(true)
  })

  it('連続授業の混在がある場合は警告', () => {
    const t = makeTeacher()
    const s1 = makeSubject({ consecutivePairs: 1, weeklyFrequency: 2 })
    const s2 = makeSubject({ consecutivePairs: 0, weeklyFrequency: 2 })
    const a1 = makeAssignment({
      subjectId: s1.id,
      teacherIds: [t.id],
      classId: 'grade1-class1',
      weeklyCount: 2,
      simultaneousGroupId: 'g1',
    })
    const a2 = makeAssignment({
      subjectId: s2.id,
      teacherIds: [t.id],
      classId: 'grade1-class2',
      weeklyCount: 2,
      simultaneousGroupId: 'g1',
    })
    const result = detectConstraintConflicts([t], [s1, s2], [a1, a2])
    expect(warnings(result).some((w) => w.message.includes('連続授業と通常授業が混在'))).toBe(true)
  })

  it('同時開講グループの教員コマ数は1回だけカウントされる（3クラス同時開講）', () => {
    // 教員1人が3クラスの同時開講（体育など）で weeklyCount=2
    // 実質の教員負荷は 2コマ（6ではない）
    const t = makeTeacher({ name: '体育教員', availableDays: ['monday'] })
    // 月曜のみ → 最大6コマ
    const s = makeSubject({ name: '体育' })
    const a1 = makeAssignment({
      subjectId: s.id,
      teacherIds: [t.id],
      classId: 'grade1-class1',
      weeklyCount: 2,
      simultaneousGroupId: 'pe-group',
    })
    const a2 = makeAssignment({
      subjectId: s.id,
      teacherIds: [t.id],
      classId: 'grade1-class2',
      weeklyCount: 2,
      simultaneousGroupId: 'pe-group',
    })
    const a3 = makeAssignment({
      subjectId: s.id,
      teacherIds: [t.id],
      classId: 'grade1-class3',
      weeklyCount: 2,
      simultaneousGroupId: 'pe-group',
    })
    const result = detectConstraintConflicts([t], [s], [a1, a2, a3])
    // 月曜のみ6コマ、実質2コマ → 超過しない → エラーなし（教員総コマ関連）
    const overloadErrors = errors(result).filter((w) => w.message.includes('週コマ数'))
    expect(overloadErrors).toHaveLength(0)
  })

  it('同時開講グループなしで3クラス×2コマ=6コマ → 月曜のみ教員は100%使用で警告', () => {
    const t = makeTeacher({ name: '体育教員', availableDays: ['monday'] })
    const s = makeSubject({ name: '体育' })
    // グループIDなし → 個別カウント → 6コマ
    const a1 = makeAssignment({
      subjectId: s.id,
      teacherIds: [t.id],
      classId: 'grade1-class1',
      weeklyCount: 2,
    })
    const a2 = makeAssignment({
      subjectId: s.id,
      teacherIds: [t.id],
      classId: 'grade1-class2',
      weeklyCount: 2,
    })
    const a3 = makeAssignment({
      subjectId: s.id,
      teacherIds: [t.id],
      classId: 'grade1-class3',
      weeklyCount: 2,
    })
    const result = detectConstraintConflicts([t], [s], [a1, a2, a3])
    // 月曜のみ6コマ、必要6コマ → 100% → 90%超え警告 or ちょうど
    const loadWarnings = result.filter((w) => w.message.includes('週コマ数'))
    expect(loadWarnings.length).toBeGreaterThan(0)
  })
})

// ============================================================
// 講座グループ（courseGroup）
// ============================================================

describe('講座グループ', () => {
  it('グループ内で週コマ数が不一致の場合エラー', () => {
    const t1 = makeTeacher({ name: '教員A' })
    const t2 = makeTeacher({ name: '教員B' })
    const s1 = makeSubject({ name: '進学英語' })
    const s2 = makeSubject({ name: '農業実習' })
    const a1 = makeAssignment({
      subjectId: s1.id,
      teacherIds: [t1.id],
      classId: 'grade3-class1',
      weeklyCount: 2,
      courseGroupId: 'cg1',
    })
    const a2 = makeAssignment({
      subjectId: s2.id,
      teacherIds: [t2.id],
      classId: 'grade3-class1',
      weeklyCount: 3,
      courseGroupId: 'cg1',
    })
    const result = detectConstraintConflicts([t1, t2], [s1, s2], [a1, a2])
    expect(errors(result).some((w) => w.message.includes('講座グループ内で週コマ数が一致しません'))).toBe(true)
  })

  it('講座グループ教員間で共通勤務日がない場合エラー', () => {
    const t1 = makeTeacher({ name: '教員A', availableDays: ['monday', 'tuesday'] })
    const t2 = makeTeacher({ name: '教員B', availableDays: ['thursday', 'friday'] })
    const s1 = makeSubject({ name: '進学英語' })
    const s2 = makeSubject({ name: '農業実習' })
    const a1 = makeAssignment({
      subjectId: s1.id,
      teacherIds: [t1.id],
      classId: 'grade3-class1',
      weeklyCount: 2,
      courseGroupId: 'cg1',
    })
    const a2 = makeAssignment({
      subjectId: s2.id,
      teacherIds: [t2.id],
      classId: 'grade3-class1',
      weeklyCount: 2,
      courseGroupId: 'cg1',
    })
    const result = detectConstraintConflicts([t1, t2], [s1, s2], [a1, a2])
    expect(errors(result).some((w) =>
      w.message.includes('講座グループの全教員') && w.message.includes('共通の勤務可能日がありません'),
    )).toBe(true)
  })

  it('講座グループの教員コマ数も1回だけカウントされる', () => {
    // 教員が2つの講座グループ割当に登場するが、同時実施なので1回分
    const t = makeTeacher({ name: '教員A', availableDays: ['monday'] })
    const s1 = makeSubject({ name: '進学英語' })
    const s2 = makeSubject({ name: '基礎英語' })
    const a1 = makeAssignment({
      subjectId: s1.id,
      teacherIds: [t.id],
      classId: 'grade3-class1',
      weeklyCount: 2,
      courseGroupId: 'cg1',
    })
    const a2 = makeAssignment({
      subjectId: s2.id,
      teacherIds: [t.id],
      classId: 'grade3-class1',
      weeklyCount: 2,
      courseGroupId: 'cg1',
    })
    const result = detectConstraintConflicts([t], [s1, s2], [a1, a2])
    // 月曜6コマ、実質2コマ → 超過しない
    const overloadErrors = errors(result).filter((w) => w.message.includes('最大配置可能数'))
    expect(overloadErrors).toHaveLength(0)
  })
})

// ============================================================
// 固定スロット競合
// ============================================================

describe('固定スロット競合', () => {
  it('同じクラスが同じ固定スロットに複数割当されている場合エラー', () => {
    const t1 = makeTeacher({ name: '教員A' })
    const t2 = makeTeacher({ name: '教員B' })
    const s1 = makeSubject({ name: '国語' })
    const s2 = makeSubject({ name: '数学' })
    const a1 = makeAssignment({
      subjectId: s1.id,
      teacherIds: [t1.id],
      classId: 'grade1-class1',
      weeklyCount: 1,
      fixedSlots: [{ day: 'monday', period: 1 }],
    })
    const a2 = makeAssignment({
      subjectId: s2.id,
      teacherIds: [t2.id],
      classId: 'grade1-class1',
      weeklyCount: 1,
      fixedSlots: [{ day: 'monday', period: 1 }],
    })
    const result = detectConstraintConflicts([t1, t2], [s1, s2], [a1, a2])
    expect(errors(result).some((w) => w.message.includes('同じクラスの複数授業が固定されています'))).toBe(true)
  })

  it('同じ教員が同じ固定スロットに複数割当（別クラス）の場合エラー', () => {
    const t = makeTeacher({ name: '教員A' })
    const s1 = makeSubject({ name: '国語' })
    const s2 = makeSubject({ name: '数学' })
    const a1 = makeAssignment({
      subjectId: s1.id,
      teacherIds: [t.id],
      classId: 'grade1-class1',
      weeklyCount: 1,
      fixedSlots: [{ day: 'monday', period: 1 }],
    })
    const a2 = makeAssignment({
      subjectId: s2.id,
      teacherIds: [t.id],
      classId: 'grade1-class2',
      weeklyCount: 1,
      fixedSlots: [{ day: 'monday', period: 1 }],
    })
    const result = detectConstraintConflicts([t], [s1, s2], [a1, a2])
    expect(errors(result).some((w) =>
      w.message.includes('教員A') && w.message.includes('両方に固定されています'),
    )).toBe(true)
  })

  it('同時開講グループ内の同じ固定スロットは正常扱い', () => {
    const t = makeTeacher({ name: '教員A' })
    const s = makeSubject({ name: '体育' })
    const a1 = makeAssignment({
      subjectId: s.id,
      teacherIds: [t.id],
      classId: 'grade1-class1',
      weeklyCount: 1,
      fixedSlots: [{ day: 'monday', period: 1 }],
      simultaneousGroupId: 'g1',
    })
    const a2 = makeAssignment({
      subjectId: s.id,
      teacherIds: [t.id],
      classId: 'grade1-class2',
      weeklyCount: 1,
      fixedSlots: [{ day: 'monday', period: 1 }],
      simultaneousGroupId: 'g1',
    })
    const result = detectConstraintConflicts([t], [s], [a1, a2])
    // 教員の固定スロット競合エラーは出ない（同時開講グループなので正常）
    const teacherConflicts = errors(result).filter((w) => w.message.includes('両方に固定'))
    expect(teacherConflicts).toHaveLength(0)
  })

  it('連続授業の固定スロットは次の時限もチェック', () => {
    const t1 = makeTeacher({ name: '教員A' })
    const t2 = makeTeacher({ name: '教員B' })
    const s1 = makeSubject({ name: '農業実習', consecutivePairs: 1, weeklyFrequency: 2 })
    const s2 = makeSubject({ name: '数学' })
    // s1は連続授業で月曜1限に固定 → 1-2限を占有
    // s2は月曜2限に固定 → 同じクラスで競合
    const a1 = makeAssignment({
      subjectId: s1.id,
      teacherIds: [t1.id],
      classId: 'grade1-class1',
      weeklyCount: 2,
      fixedSlots: [{ day: 'monday', period: 1 }],
    })
    const a2 = makeAssignment({
      subjectId: s2.id,
      teacherIds: [t2.id],
      classId: 'grade1-class1',
      weeklyCount: 1,
      fixedSlots: [{ day: 'monday', period: 2 }],
    })
    const result = detectConstraintConflicts([t1, t2], [s1, s2], [a1, a2])
    // 月曜2限で同じクラスの複数授業が固定されている
    expect(errors(result).some((w) => w.message.includes('同じクラスの複数授業が固定されています'))).toBe(true)
  })
})

// ============================================================
// 施設（教室）制約
// ============================================================

describe('施設（教室）制約', () => {
  it('存在しない施設IDが指定された場合エラー', () => {
    const t = makeTeacher()
    const s = makeSubject()
    const a = makeAssignment({
      subjectId: s.id,
      teacherIds: [t.id],
      roomId: 'nonexistent-room',
    })
    const result = detectConstraintConflicts([t], [s], [a], [])
    expect(errors(result).some((w) => w.message.includes('施設データが見つかりません'))).toBe(true)
  })

  it('施設の利用可能日と教員の勤務可能日に共通日がない場合エラー', () => {
    const t = makeTeacher({ name: '教員A', availableDays: ['monday', 'tuesday'] })
    const s = makeSubject()
    const room = makeRoom({
      name: '農場',
      availableDays: ['thursday', 'friday'],
    })
    const a = makeAssignment({
      subjectId: s.id,
      teacherIds: [t.id],
      roomId: room.id,
    })
    const result = detectConstraintConflicts([t], [s], [a], [room])
    expect(errors(result).some((w) =>
      w.message.includes('農場') && w.message.includes('共通日がありません'),
    )).toBe(true)
  })

  it('施設のavailableDaysが未設定の場合は全曜日利用可能（エラーなし）', () => {
    const t = makeTeacher({ availableDays: ['monday'] })
    const s = makeSubject()
    const room = makeRoom({ name: '教室B' }) // availableDays未設定
    const a = makeAssignment({
      subjectId: s.id,
      teacherIds: [t.id],
      roomId: room.id,
    })
    const result = detectConstraintConflicts([t], [s], [a], [room])
    const roomErrors = errors(result).filter((w) => w.message.includes('教室B'))
    expect(roomErrors).toHaveLength(0)
  })

  it('施設の利用可能日と教員の勤務日に重なりがある場合は正常', () => {
    const t = makeTeacher({ availableDays: ['monday', 'wednesday', 'friday'] })
    const s = makeSubject()
    const room = makeRoom({
      name: 'PC教室',
      availableDays: ['wednesday', 'thursday', 'friday'],
    })
    const a = makeAssignment({
      subjectId: s.id,
      teacherIds: [t.id],
      roomId: room.id,
    })
    const result = detectConstraintConflicts([t], [s], [a], [room])
    const roomErrors = errors(result).filter((w) => w.message.includes('PC教室'))
    expect(roomErrors).toHaveLength(0)
  })
})

// ============================================================
// 教員の総コマ数チェック
// ============================================================

describe('教員の総コマ数チェック', () => {
  it('教員の週コマ数が最大配置可能数を超える場合エラー', () => {
    // 月曜のみ → 最大6コマ
    const t = makeTeacher({ name: '過負荷教員', availableDays: ['monday'] })
    const s = makeSubject()
    // 7コマ必要 → 超過
    const a = makeAssignment({
      subjectId: s.id,
      teacherIds: [t.id],
      weeklyCount: 7,
    })
    const result = detectConstraintConflicts([t], [s], [a])
    expect(errors(result).some((w) =>
      w.message.includes('過負荷教員') && w.message.includes('最大配置可能数') && w.message.includes('超えています'),
    )).toBe(true)
  })

  it('教員の週コマ数が90%超の場合は警告', () => {
    // 5日×6コマ=30コマ、28コマ（93%）
    const t = makeTeacher({ name: '忙しい教員' })
    const s = makeSubject()
    const a = makeAssignment({
      subjectId: s.id,
      teacherIds: [t.id],
      weeklyCount: 28,
    })
    const result = detectConstraintConflicts([t], [s], [a])
    expect(warnings(result).some((w) =>
      w.message.includes('忙しい教員') && w.message.includes('90%'),
    )).toBe(true)
  })

  it('除外コマ分が考慮されている', () => {
    // 月曜のみ＋2コマ除外 → 最大4コマ
    const t = makeTeacher({
      name: '教員A',
      availableDays: ['monday'],
      excludedSlots: [
        { day: 'monday', period: 1 },
        { day: 'monday', period: 2 },
      ],
    })
    const s = makeSubject()
    const a = makeAssignment({
      subjectId: s.id,
      teacherIds: [t.id],
      weeklyCount: 5,
    })
    const result = detectConstraintConflicts([t], [s], [a])
    // 最大4コマに5コマ → 超過エラー
    expect(errors(result).some((w) => w.message.includes('最大配置可能数'))).toBe(true)
  })

  it('勤務日以外の除外コマはカウントしない', () => {
    // 月曜のみ勤務。火曜の除外コマは無関係
    const t = makeTeacher({
      name: '教員A',
      availableDays: ['monday'],
      excludedSlots: [
        { day: 'tuesday', period: 1 },
        { day: 'tuesday', period: 2 },
      ],
    })
    const s = makeSubject()
    const a = makeAssignment({
      subjectId: s.id,
      teacherIds: [t.id],
      weeklyCount: 6,
    })
    const result = detectConstraintConflicts([t], [s], [a])
    // 月曜6コマ全て使える → 6コマちょうど → 100%で警告が出る
    const overloadErrors = errors(result).filter((w) => w.message.includes('超えています'))
    expect(overloadErrors).toHaveLength(0)
  })

  it('複数割当の合計でチェックされる', () => {
    const t = makeTeacher({ name: '教員A', availableDays: ['monday'] })
    const s1 = makeSubject({ name: '国語' })
    const s2 = makeSubject({ name: '数学' })
    const a1 = makeAssignment({ subjectId: s1.id, teacherIds: [t.id], weeklyCount: 4 })
    const a2 = makeAssignment({ subjectId: s2.id, teacherIds: [t.id], weeklyCount: 4 })
    const result = detectConstraintConflicts([t], [s1, s2], [a1, a2])
    // 月曜6コマに8コマ → 超過エラー
    expect(errors(result).some((w) => w.message.includes('最大配置可能数'))).toBe(true)
  })
})

// ============================================================
// 複合テスト（実際の農業高校シナリオ）
// ============================================================

describe('複合テスト（農業高校シナリオ）', () => {
  it('3クラス同時開講の体育 + 施設制約が正しく検出される', () => {
    const t1 = makeTeacher({ name: '体育教員A' })
    const t2 = makeTeacher({ name: '体育教員B' })
    const s = makeSubject({ name: '体育', category: '保健体育' })
    const gym = makeRoom({
      name: '体育館',
      availableDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
    })

    const assignments = [1, 2, 3].map((cn) =>
      makeAssignment({
        subjectId: s.id,
        teacherIds: [t1.id, t2.id],
        classId: `grade1-class${cn}`,
        weeklyCount: 2,
        simultaneousGroupId: 'pe-1',
        roomId: gym.id,
      }),
    )

    const result = detectConstraintConflicts([t1, t2], [s], assignments, [gym])
    // 正常なシナリオ → 週コマ数超過エラーなし
    const overloadErrors = errors(result).filter((w) => w.message.includes('最大配置可能数'))
    expect(overloadErrors).toHaveLength(0)
  })

  it('選択科目の講座グループ + 施設制約', () => {
    const t1 = makeTeacher({ name: '英語教員', availableDays: ['monday', 'tuesday', 'wednesday'] })
    const t2 = makeTeacher({ name: '農業教員', availableDays: ['monday', 'wednesday', 'friday'] })
    const s1 = makeSubject({ name: '進学英語' })
    const s2 = makeSubject({ name: '農業実習' })
    const farm = makeRoom({
      name: '第1農場',
      availableDays: ['monday', 'wednesday', 'friday'],
    })

    const a1 = makeAssignment({
      subjectId: s1.id,
      teacherIds: [t1.id],
      classId: 'grade3-class1',
      weeklyCount: 2,
      courseGroupId: 'cg-elective',
    })
    const a2 = makeAssignment({
      subjectId: s2.id,
      teacherIds: [t2.id],
      classId: 'grade3-class1',
      weeklyCount: 2,
      courseGroupId: 'cg-elective',
      roomId: farm.id,
    })

    const result = detectConstraintConflicts([t1, t2], [s1, s2], [a1, a2], [farm])
    // 両教員の共通勤務日は月・水（t1=月火水, t2=月水金） → 共通あり → エラーなし
    const groupDayErrors = errors(result).filter((w) => w.message.includes('講座グループの全教員'))
    expect(groupDayErrors).toHaveLength(0)
  })
})
