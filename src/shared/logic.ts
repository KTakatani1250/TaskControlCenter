// 純粋ロジック（main / renderer 共通）。now を引数で受け取りテスト可能にする。
import dayjs from 'dayjs'
import {
  DAILY_CAPACITY_MIN,
  Priority,
  Recurrence,
  Task,
  TodayReason,
  TodayTask
} from './types'

const PRIORITY_RANK: Record<Priority, number> = { HIGH: 0, MID: 1, LOW: 2 }

/** 締切日時を内部表現で返す。AM=当日12:00 / PM=翌0:00(=24:00) / 指定なし=翌0:00。締切なしは null。 */
export function deadlineDateTime(task: Task): Date | null {
  if (!task.deadlineDate) return null
  const d = dayjs(task.deadlineDate)
  if (task.deadlinePeriod === 'AM') return d.hour(12).minute(0).second(0).millisecond(0).toDate()
  // PM / NONE は当日終端（翌日0:00）
  return d.add(1, 'day').hour(0).minute(0).second(0).millisecond(0).toDate()
}

/** 今日中判定・自動並び替えの対象（未完了かつ後回しでない） */
export function isActiveCandidate(task: Task): boolean {
  return task.status !== 'DONE' && task.status !== 'POSTPONED'
}

/** 残作業時間（分）。見込未入力なら null。 */
export function remainingMinutes(task: Task): number | null {
  if (task.estimateMin == null) return null
  return Math.max(0, task.estimateMin - task.actualMin)
}

/**
 * 1タスクの「今日中」判定。対象外なら null。
 * @param capacity 1日に確保できる作業時間(分)
 */
export function judgeTodayReason(
  task: Task,
  now: Date,
  capacity = DAILY_CAPACITY_MIN
): TodayReason | null {
  if (!isActiveCandidate(task)) return null
  const dt = deadlineDateTime(task)
  if (!dt) return null

  const today = dayjs(now).startOf('day')
  const dDate = dayjs(task.deadlineDate).startOf('day')

  // 締切超過
  if (dt.getTime() < now.getTime()) return 'OVERDUE'

  // 締切が本日
  if (dDate.isSame(today, 'day')) {
    if (task.deadlinePeriod === 'AM') return 'TODAY_AM'
    if (task.deadlinePeriod === 'PM') return 'TODAY_PM'
    return 'TODAY'
  }

  // 将来締切：残り日数 × capacity で間に合うか逆算
  const diffDays = dDate.diff(today, 'day') // >= 1
  const rem = remainingMinutes(task)
  if (rem != null) {
    const daysInclusive = diffDays + 1 // 本日を含めて使える日数
    const available = daysInclusive * capacity
    if (rem > available) {
      return diffDays === 1 ? 'TOMORROW_START' : 'BACKCALC_START'
    }
  }
  return null
}

const REASON_RANK: Record<TodayReason, number> = {
  OVERDUE: 0,
  TODAY_AM: 1,
  TODAY_PM: 2,
  TODAY: 2,
  TOMORROW_START: 3,
  BACKCALC_START: 4
}

/** エリア2「今日中に終えるべきタスク」を理由付きで返す（表示順ソート済み） */
export function selectTodayTasks(
  tasks: Task[],
  now: Date,
  capacity = DAILY_CAPACITY_MIN
): TodayTask[] {
  const result: TodayTask[] = []
  for (const task of tasks) {
    const reason = judgeTodayReason(task, now, capacity)
    if (reason) result.push({ task, reason })
  }
  result.sort((a, b) => {
    const r = REASON_RANK[a.reason] - REASON_RANK[b.reason]
    if (r !== 0) return r
    const da = deadlineDateTime(a.task)?.getTime() ?? Infinity
    const db = deadlineDateTime(b.task)?.getTime() ?? Infinity
    if (da !== db) return da - db
    const p = PRIORITY_RANK[a.task.priority] - PRIORITY_RANK[b.task.priority]
    if (p !== 0) return p
    return a.task.sortOrder - b.task.sortOrder
  })
  return result
}

/**
 * 自動並び替え（section 8）。未完了かつ後回しでないタスクを優先順で並べ、
 * 後回し/完了タスクは元の順序のまま末尾に付ける。並び替え後の Task[] を返す。
 */
export function autoSortTasks(tasks: Task[], now: Date, capacity = DAILY_CAPACITY_MIN): Task[] {
  const candidates = tasks.filter(isActiveCandidate)
  const others = tasks.filter((t) => !isActiveCandidate(t))

  const bucket = (t: Task): number => {
    const reason = judgeTodayReason(t, now, capacity)
    switch (reason) {
      case 'OVERDUE':
        return 0
      case 'TODAY_AM':
        return 1
      case 'TODAY_PM':
      case 'TODAY':
        return 2
      case 'TOMORROW_START':
      case 'BACKCALC_START':
        return 3
      default:
        return 4
    }
  }

  const sorted = [...candidates].sort((a, b) => {
    const ba = bucket(a)
    const bb = bucket(b)
    if (ba !== bb) return ba - bb
    // 締切が近い順
    const da = deadlineDateTime(a)?.getTime() ?? Infinity
    const db = deadlineDateTime(b)?.getTime() ?? Infinity
    if (da !== db) return da - db
    // 優先度が高い順
    const p = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
    if (p !== 0) return p
    // 見込時間が短い順
    const ea = a.estimateMin ?? Infinity
    const eb = b.estimateMin ?? Infinity
    if (ea !== eb) return ea - eb
    // 現在の手動並び順
    return a.sortOrder - b.sortOrder
  })

  return [...sorted, ...others.sort((a, b) => a.sortOrder - b.sortOrder)]
}

/**
 * 進行中タスク完了後、手動並び順で次に着手すべきタスクを返す。
 * 完了タスクの直後以降で、最初の TODO（未着手）を選ぶ。
 * 見つからなければ全体先頭から TODO を探す。なければ null。
 */
export function pickNextActive(tasks: Task[], completedSortOrder: number): Task | null {
  const ordered = [...tasks].sort((a, b) => a.sortOrder - b.sortOrder)
  const selectable = (t: Task) => t.status === 'TODO'
  const after = ordered.find((t) => t.sortOrder > completedSortOrder && selectable(t))
  if (after) return after
  const any = ordered.find(selectable)
  return any ?? null
}

/** 繰り返しの次サイクル締切日を返す（YYYY-MM-DD） */
export function nextRecurrenceDate(date: string, recurrence: Recurrence): string | null {
  if (recurrence === 'NONE') return null
  const d = dayjs(date)
  if (recurrence === 'WEEKLY') return d.add(1, 'week').format('YYYY-MM-DD')
  // MONTHLY: 月末日なら翌月末日、それ以外は同日（月末でクランプ）
  const isLastDay = d.date() === d.daysInMonth()
  if (isLastDay) return d.add(1, 'month').endOf('month').format('YYYY-MM-DD')
  return d.add(1, 'month').format('YYYY-MM-DD')
}

/** 繰り返し生成のトリガー時刻（次回締切日の7日前 0:00） */
export function recurrenceTriggerTime(nextDate: string): Date {
  return dayjs(nextDate).subtract(7, 'day').startOf('day').toDate()
}
