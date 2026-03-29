// ============================================================
// 基本列挙型
// ============================================================

/** 曜日（月〜金） */
export type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday'

/** 時限（1〜6限） */
export type Period = 1 | 2 | 3 | 4 | 5 | 6

/** 学年 */
export type Grade = 1 | 2 | 3

/** 教科（大分類） */
export type SubjectCategory =
  | '国語'
  | '数学'
  | '理科'
  | '地歴公民'
  | '英語'
  | '芸術'
  | '家庭科'
  | '保健体育'
  | '農業'
  | '商業'
  | 'その他'

/** クラス番号 */
export type ClassNumber = number

// ============================================================
// 除外コマ（特定の曜日・時限の組み合わせ）
// ============================================================

/**
 * 特定の授業コマを表す型。
 * 教員の「この曜日のこの時限は授業不可」を表現するために使用。
 */
export interface TimeSlot {
  day: DayOfWeek
  period: Period
}

// ============================================================
// 推奨時限の指定（科目レベルの制約）
// ============================================================

/**
 * 科目の推奨時限範囲。
 * 例: 3〜4限に配置してほしい場合は { from: 3, to: 4 }
 */
export interface PreferredPeriodRange {
  from: Period
  to: Period
}

// ============================================================
// Teacher（教員）
// ============================================================

/**
 * 教員エンティティ。
 *
 * - `availableDays`: 勤務可能な曜日の配列（例: 非常勤で月水金のみ出勤）
 * - `excludedSlots`: 担当不可の特定コマ（会議・専任業務など）
 */
export interface Teacher {
  id: string
  name: string
  /** 所属教科（大分類） */
  department?: SubjectCategory
  /** 担当可能な科目IDの配列 */
  subjectIds: string[]
  /** 勤務可能な曜日 */
  availableDays: DayOfWeek[]
  /** 担当不可の特定コマ（会議や専任業務などで埋まっているコマ） */
  excludedSlots: TimeSlot[]
  /** メモ・備考 */
  memo?: string
  createdAt: Date
  updatedAt: Date
}

// ============================================================
// Subject（科目）
// ============================================================

/**
 * 科目エンティティ。
 *
 * - `isConsecutive`: trueの場合、2コマ連続で配置する必要がある（実験・実習など）
 * - `preferredPeriods`: 配置を推奨する時限範囲（指定なしの場合はany）
 * - `weeklyFrequency`: 週あたりの授業コマ数（単位数に対応）
 */
export interface Subject {
  id: string
  name: string
  /** 履修学年 */
  grade: Grade
  /** 教科（大分類） */
  category: SubjectCategory
  /** 単位数 */
  credits: number
  /** 週あたりの授業コマ数（通常 credits と同値だが異なる場合もある） */
  weeklyFrequency: number
  /**
   * 連続授業ペア数。
   * 2コマ連続で配置するペアの数。0なら連続なし。
   * 例: weeklyFrequency=3, consecutivePairs=1 → 連続2コマ×1 + 単独1コマ
   * 例: weeklyFrequency=4, consecutivePairs=2 → 連続2コマ×2
   * 制約: consecutivePairs * 2 <= weeklyFrequency
   */
  consecutivePairs: number
  /** 連続配置禁止フラグ（同日に連続して配置しない） */
  noConsecutive: boolean
  /**
   * 推奨時限範囲。
   * 設定した場合、スケジューラはこの範囲内への配置を優先する。
   * 未設定（undefined）の場合は制約なし。
   */
  preferredPeriods?: PreferredPeriodRange
  /** 科目カラー（UI表示用 HEX or Tailwind color name） */
  color?: string
  /** 配置不可時限（この時限には絶対に配置しない） */
  excludedPeriods?: Period[]
  /**
   * 曜日分散フラグ。
   * trueの場合、同じ科目を同日に複数回配置しない（連続授業含む）。
   * また、隣接曜日への配置をソフト制約として回避する。
   * 例: 体育を月・水に分散、家庭基礎4単位を2コマ×別日に配置
   */
  spreadDays?: boolean
  /** タグ（学科・コース等の自由分類。絞り込みに使用） */
  tags?: string[]
  createdAt: Date
  updatedAt: Date
}

// ============================================================
// Room（教室・施設）
// ============================================================

/**
 * 教室・施設エンティティ。
 * 農業実習室、調理室、農場、体育館など施設制約を管理する。
 *
 * - 同じ時間帯に1つの施設を複数の授業が使用できない（ハード制約）
 * - 施設にも利用可能な曜日・時限の制約がありうる
 */
export interface Room {
  id: string
  /** 施設名（例: "第1農場", "調理実習室", "PC教室"） */
  name: string
  /** 施設の種別（絞り込み用） */
  category?: string
  /** 利用可能な曜日（未設定の場合は全曜日利用可能） */
  availableDays?: DayOfWeek[]
  /** 利用不可の特定コマ */
  excludedSlots?: TimeSlot[]
  /** メモ・備考 */
  memo?: string
  createdAt: Date
  updatedAt: Date
}

// ============================================================
// Class（クラス）
// ============================================================

/**
 * クラスエンティティ。
 * 高校1〜3年、各学年1〜3組の計9クラスを表現。
 *
 * 例: { grade: 2, classNumber: 3 } → 2年3組
 */
export interface SchoolClass {
  id: string
  /** 学年 (1〜3) */
  grade: Grade
  /** 組番号 (1〜3) */
  classNumber: ClassNumber
  /** 表示名（例: "1年A組"のような独自命名にも対応） */
  displayName: string
  /** 担任教員ID */
  homeRoomTeacherId?: string
  createdAt: Date
  updatedAt: Date
}

// ============================================================
// Assignment（授業割当：クラス × 科目 × 教員）
// ============================================================

/**
 * 授業割当エンティティ。
 * 「どのクラスで・どの科目を・誰が（複数可）担当するか」を定義する。
 *
 * TT（チームティーチング）対応のため `teacherIds` は配列。
 * - 通常授業: teacherIds = ['teacher_A']
 * - TT授業: teacherIds = ['teacher_A', 'teacher_B']
 */
export interface Assignment {
  id: string
  /** 対象クラスID */
  classId: string
  /** 対象科目ID */
  subjectId: string
  /**
   * 担当教員IDの配列。
   * TT（チームティーチング）の場合は複数の教員IDを含む。
   */
  teacherIds: string[]
  /**
   * 週あたりの配置コマ数。
   * Subject.weeklyFrequency をデフォルトとして使用するが、
   * クラス固有の事情で上書き可能（例: 選択科目で単位数が異なる場合）。
   */
  weeklyCount: number
  /**
   * 使用教室・施設ID。
   * 指定された場合、スケジューラは施設の重複を回避する（ハード制約）。
   * 未設定（undefined）の場合は施設制約なし。
   */
  roomId?: string
  /**
   * 同時開講グループID。
   * 同じグループIDを持つ割当は、時間割上で同じ曜日・同じ時限に配置される。
   *
   * 例1: 体育2年 → 2-1, 2-2, 2-3 を同時開講し4名の教員で担当
   * 例2: 英語C2（進学コース）→ 各クラスの別科目と同じ時限に配置
   *
   * 未設定（undefined）の場合は通常の個別配置。
   */
  simultaneousGroupId?: string
  /**
   * 講座グループID（選択科目のグループ管理用）。
   * 同じ講座グループIDを持つ割当は、同じ時間帯に配置される。
   * simultaneousGroupIdと似ているが、こちらはクラスを横断した
   * 選択科目（進学コース英語、就職コース農業実習など）のグループ化に使用する。
   *
   * simultaneousGroupIdとの違い:
   * - simultaneousGroupId: 同じ科目を複数クラスで同時実施（教員共有可能）
   * - courseGroupId: 異なる科目を同じ時間帯に配置（クラス内で生徒が分かれる）
   *
   * 例: 3年1組の進学英語と3年1組の農業実習を同時間帯に配置
   *     → 進学希望者は英語、就職希望者は農業実習を受講
   */
  courseGroupId?: string
  /**
   * 固定時間スロット。
   * 指定された曜日・時限に必ず配置される（スケジューラが自動配置しない）。
   *
   * 例: ホームルーム → [{ day: 'thursday', period: 6 }]
   *
   * 未設定（undefined）の場合はスケジューラが自動配置。
   */
  fixedSlots?: TimeSlot[]
  /**
   * 固定曜日。
   * 指定された曜日にのみ配置される（時限はスケジューラが自動決定）。
   * fixedSlotsより緩い制約で、曜日だけを固定したい場合に使用。
   *
   * 例: weeklyCount=3, fixedDays=['monday','wednesday','friday']
   *     → 月・水・金に1コマずつ配置（時限は自動）
   */
  fixedDays?: DayOfWeek[]
  /** 備考（特記事項など） */
  notes?: string
  createdAt: Date
  updatedAt: Date
}

// ============================================================
// Schedule（時間割：物理配置）
// ============================================================

/**
 * 時間割の1コマ分のエントリ。
 * 「いつ（曜日・時限）・どのクラスで・どの授業割当を実施するか」を表す。
 *
 * 連続授業（isConsecutive = true）の場合、
 * 同じ assignmentId で period と period+1 に2件のエントリが作成される。
 */
export interface ScheduleEntry {
  id: string
  /** 曜日 */
  day: DayOfWeek
  /** 時限 */
  period: Period
  /** 対象クラスID */
  classId: string
  /** 授業割当ID */
  assignmentId: string
  /**
   * 連続授業の2コマ目フラグ。
   * true の場合、このエントリは連続授業の後半コマを示す。
   */
  isConsecutiveSecond?: boolean
  createdAt: Date
  updatedAt: Date
}

/**
 * 1週間分の時間割（特定の年度・学期に対応）。
 * ScheduleEntry の集合をラップし、メタデータを付与する。
 */
export interface Schedule {
  id: string
  /** 年度（例: 2024） */
  academicYear: number
  /** 学期（1: 前期, 2: 後期, 3: 通年） */
  term: 1 | 2 | 3
  /** このスケジュールに含まれるエントリのID配列（Firestoreはサブコレクションで管理） */
  entryIds: string[]
  /** スケジュール確定フラグ */
  isFinalized: boolean
  /** 最終確定日時 */
  finalizedAt?: Date
  createdAt: Date
  updatedAt: Date
}

// ============================================================
// Firestore コレクションパス定数
// ============================================================

export const COLLECTION = {
  TEACHERS: 'teachers',
  SUBJECTS: 'subjects',
  CLASSES: 'classes',
  ASSIGNMENTS: 'assignments',
  ROOMS: 'rooms',
  SCHEDULES: 'schedules',
  SCHEDULE_ENTRIES: 'scheduleEntries',
} as const

// ============================================================
// ユーティリティ型
// ============================================================

/** Firestoreへの新規書き込み時にIDと日付フィールドを除外した型 */
export type CreateInput<T extends { id: string; createdAt: Date; updatedAt: Date }> = Omit<
  T,
  'id' | 'createdAt' | 'updatedAt'
>

/** Firestoreの更新時に使用する部分的な型（idは変更不可） */
export type UpdateInput<T extends { id: string; createdAt: Date; updatedAt: Date }> = Partial<
  Omit<T, 'id' | 'createdAt' | 'updatedAt'>
>
