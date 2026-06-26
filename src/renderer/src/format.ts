import { Task } from '@shared/types'

/** 分 → 「1時間30分」表記 */
export function minutesToText(min: number | null | undefined): string {
  if (min == null) return '—'
  if (min <= 0) return '0分'
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h && m) return `${h}時間${m}分`
  if (h) return `${h}時間`
  return `${m}分`
}

/** 締切表示 */
export function deadlineText(task: Pick<Task, 'deadlineDate' | 'deadlinePeriod'>): string {
  if (!task.deadlineDate) return '締切なし'
  const period =
    task.deadlinePeriod === 'AM' ? ' AM' : task.deadlinePeriod === 'PM' ? ' PM' : ''
  return `${task.deadlineDate}${period}`
}

/** 進行中タスクの現時点での実績（分） = 累計 + 計測中の経過 */
export function liveActualMin(task: Task, now: number): number {
  let total = task.actualMin
  if (task.status === 'DOING' && task.timerStartedAt) {
    const elapsed = Math.floor((now - new Date(task.timerStartedAt).getTime()) / 60000)
    total += Math.max(0, elapsed)
  }
  return total
}

export function todayStr(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
