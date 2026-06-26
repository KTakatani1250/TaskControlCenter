// 共有ドメイン型（main / renderer の両方で利用）

export type DeadlinePeriod = 'AM' | 'PM' | 'NONE'
export type Priority = 'HIGH' | 'MID' | 'LOW'
export type Status = 'TODO' | 'DOING' | 'DONE' | 'POSTPONED'
export type Recurrence = 'NONE' | 'WEEKLY' | 'MONTHLY'
/** タグ：仕事 / 私事 */
export type Category = 'WORK' | 'PRIVATE'

export interface Task {
  id: number
  title: string
  /** 締切日 YYYY-MM-DD（null = 締切なし） */
  deadlineDate: string | null
  deadlinePeriod: DeadlinePeriod
  /** 見込時間（分, null = 未入力） */
  estimateMin: number | null
  /** 実績時間（分, 累計） */
  actualMin: number
  priority: Priority
  category: Category
  memo: string
  status: Status
  /** 手動並び順（昇順） */
  sortOrder: number
  recurrence: Recurrence
  /** 次回繰り返し生成対象日 YYYY-MM-DD（null = 生成待ちなし） */
  recurrenceNextDate: string | null
  /** 進行中タイマー開始時刻 ISO（null = 計測停止中） */
  timerStartedAt: string | null
  createdAt: string
  updatedAt: string
}

/** 新規作成・編集の入力 */
export interface TaskInput {
  title: string
  deadlineDate: string | null
  deadlinePeriod: DeadlinePeriod
  estimateMin: number | null
  priority: Priority
  category: Category
  memo: string
  recurrence: Recurrence
}

/** エリア2「今日中」判定理由 */
export type TodayReason =
  | 'OVERDUE' // 締切超過
  | 'TODAY_AM' // 締切が本日AM
  | 'TODAY_PM' // 締切が本日中(PM)
  | 'TODAY' // 締切が本日中
  | 'TOMORROW_START' // 明日締切のため本日中に着手が必要
  | 'BACKCALC_START' // 作業時間を逆算すると本日開始が必要

export interface TodayTask {
  task: Task
  reason: TodayReason
}

/** 見込時間のAI推定結果 */
export interface EstimateResult {
  estimateMin: number
  rangeMinMin: number
  rangeMaxMin: number
  rationale: string
}

/** データ入出力（エクスポート/復元）の結果 */
export interface IoResult {
  ok: boolean
  canceled?: boolean
  path?: string
  count?: number
  error?: string
}

export interface AppSettings {
  hasApiKey: boolean
  model: string
  dailyCapacityMin: number
}

export const DAILY_CAPACITY_MIN = 300
// 時間推定は短く高頻度なタスクのため、既定は高速・低コストな Haiku 4.5。設定画面で変更可能。
export const DEFAULT_MODEL = 'claude-haiku-4-5'

export const PRIORITY_LABEL: Record<Priority, string> = {
  HIGH: '高',
  MID: '中',
  LOW: '低'
}

export const STATUS_LABEL: Record<Status, string> = {
  TODO: '未着手',
  DOING: '進行中',
  DONE: '完了',
  POSTPONED: '後回し'
}

export const CATEGORY_LABEL: Record<Category, string> = {
  WORK: '仕事',
  PRIVATE: '私事'
}

export const RECURRENCE_LABEL: Record<Recurrence, string> = {
  NONE: 'なし',
  WEEKLY: '毎週',
  MONTHLY: '毎月'
}

export const REASON_LABEL: Record<TodayReason, string> = {
  OVERDUE: '締切超過',
  TODAY_AM: '締切が本日AM',
  TODAY_PM: '締切が本日中',
  TODAY: '締切が本日中',
  TOMORROW_START: '明日締切のため本日中に着手が必要',
  BACKCALC_START: '作業時間を逆算すると本日開始が必要'
}
