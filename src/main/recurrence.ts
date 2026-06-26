import { getDb } from './db'
import { listTasks } from './repo'
import { nextRecurrenceDate, recurrenceTriggerTime } from '@shared/logic'

/**
 * 繰り返しタスクの自動生成。次回締切日の7日前0:00以降であれば次回分を生成する。
 * - recurrence_next_date が NULL のものは生成済み扱い（重複防止）
 * - 同一見出し+締切+繰り返しが既に存在する場合も生成しない
 * - アプリ未起動期間が長い場合に備えループで複数世代を生成
 * @returns 生成件数
 */
export function generateDueRecurrences(now: Date = new Date()): number {
  const db = getDb()
  let created = 0
  let again = true
  let guard = 0

  const insert = db.prepare(
    `INSERT INTO tasks
      (title, deadline_date, deadline_period, estimate_min, actual_min, priority, category, memo,
       status, sort_order, recurrence, recurrence_next_date, timer_started_at, created_at, updated_at)
     VALUES (@title, @deadlineDate, @deadlinePeriod, @estimateMin, 0, @priority, @category, @memo,
       'TODO', @sortOrder, @recurrence, @recurrenceNext, NULL, @now, @now)`
  )

  while (again && guard < 1000) {
    again = false
    guard++
    const all = listTasks()
    const pending = all.filter((t) => t.recurrence !== 'NONE' && t.recurrenceNextDate)

    for (const t of pending) {
      const nextDate = t.recurrenceNextDate!
      if (now.getTime() < recurrenceTriggerTime(nextDate).getTime()) continue

      const dup = all.some(
        (x) =>
          x.title === t.title &&
          x.deadlineDate === nextDate &&
          x.recurrence === t.recurrence &&
          x.id !== t.id
      )

      const maxSort =
        (db.prepare('SELECT COALESCE(MAX(sort_order),0) AS m FROM tasks').get() as { m: number }).m

      const iso = now.toISOString()
      const tx = db.transaction(() => {
        if (!dup) {
          insert.run({
            title: t.title,
            deadlineDate: nextDate,
            deadlinePeriod: t.deadlinePeriod,
            estimateMin: t.estimateMin,
            priority: t.priority,
            category: t.category,
            memo: t.memo,
            sortOrder: maxSort + 1,
            recurrence: t.recurrence,
            recurrenceNext: nextRecurrenceDate(nextDate, t.recurrence),
            now: iso
          })
        }
        // 元タスクは生成済みにする（next_date をクリア）
        db.prepare('UPDATE tasks SET recurrence_next_date = NULL, updated_at = ? WHERE id = ?').run(
          iso,
          t.id
        )
      })
      tx()
      if (!dup) created++
      again = true
    }
  }
  return created
}
