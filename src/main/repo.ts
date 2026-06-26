import { getDb, rowToTask, TaskRow } from './db'
import { nextRecurrenceDate, pickNextActive } from '@shared/logic'
import type { Status, Task, TaskInput } from '@shared/types'

const nowIso = (): string => new Date().toISOString()

const SELECT = 'SELECT * FROM tasks'

export function listTasks(): Task[] {
  const rows = getDb()
    .prepare(`${SELECT} ORDER BY sort_order ASC, id ASC`)
    .all() as TaskRow[]
  return rows.map(rowToTask)
}

export function getTask(id: number): Task | null {
  const row = getDb().prepare(`${SELECT} WHERE id = ?`).get(id) as TaskRow | undefined
  return row ? rowToTask(row) : null
}

function maxSortOrder(): number {
  const r = getDb().prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM tasks').get() as {
    m: number
  }
  return r.m
}

export function createTask(input: TaskInput): Task {
  const now = nowIso()
  const recurrenceNext =
    input.recurrence !== 'NONE' && input.deadlineDate
      ? nextRecurrenceDate(input.deadlineDate, input.recurrence)
      : null
  const info = getDb()
    .prepare(
      `INSERT INTO tasks
        (title, deadline_date, deadline_period, estimate_min, actual_min, priority, category, memo,
         status, sort_order, recurrence, recurrence_next_date, timer_started_at, created_at, updated_at)
       VALUES (@title, @deadlineDate, @deadlinePeriod, @estimateMin, 0, @priority, @category, @memo,
         'TODO', @sortOrder, @recurrence, @recurrenceNext, NULL, @now, @now)`
    )
    .run({
      title: input.title,
      deadlineDate: input.deadlineDate,
      deadlinePeriod: input.deadlinePeriod,
      estimateMin: input.estimateMin,
      priority: input.priority,
      category: input.category,
      memo: input.memo,
      sortOrder: maxSortOrder() + 1,
      recurrence: input.recurrence,
      recurrenceNext,
      now
    })
  return getTask(Number(info.lastInsertRowid))!
}

export function updateTask(id: number, input: TaskInput): Task {
  const existing = getTask(id)
  if (!existing) throw new Error(`task ${id} not found`)
  const recurrenceNext =
    input.recurrence !== 'NONE' && input.deadlineDate
      ? // 繰り返し設定が維持/変更された場合は次回生成日を再計算
        nextRecurrenceDate(input.deadlineDate, input.recurrence)
      : null
  getDb()
    .prepare(
      `UPDATE tasks SET
        title = @title, deadline_date = @deadlineDate, deadline_period = @deadlinePeriod,
        estimate_min = @estimateMin, priority = @priority, category = @category, memo = @memo,
        recurrence = @recurrence, recurrence_next_date = @recurrenceNext, updated_at = @now
       WHERE id = @id`
    )
    .run({
      id,
      title: input.title,
      deadlineDate: input.deadlineDate,
      deadlinePeriod: input.deadlinePeriod,
      estimateMin: input.estimateMin,
      priority: input.priority,
      category: input.category,
      memo: input.memo,
      recurrence: input.recurrence,
      recurrenceNext,
      now: nowIso()
    })
  return getTask(id)!
}

export function deleteTask(id: number): void {
  getDb().prepare('DELETE FROM tasks WHERE id = ?').run(id)
}

/** ドラッグ&ドロップ後の並び順を一括反映 */
export function reorderTasks(orderedIds: number[]): void {
  const db = getDb()
  const stmt = db.prepare('UPDATE tasks SET sort_order = ?, updated_at = ? WHERE id = ?')
  const now = nowIso()
  const tx = db.transaction((ids: number[]) => {
    ids.forEach((id, i) => stmt.run(i + 1, now, id))
  })
  tx(orderedIds)
}

const elapsedMinutes = (startedAtIso: string, end: Date): number => {
  const ms = end.getTime() - new Date(startedAtIso).getTime()
  return Math.max(0, Math.floor(ms / 60000))
}

/** 進行中タスクのタイマーを停止し実績へ加算（DBは呼び出し側のトランザクション前提でも単独でも可） */
function stopTimer(task: Task, end: Date): void {
  if (task.status !== 'DOING' || !task.timerStartedAt) return
  const add = elapsedMinutes(task.timerStartedAt, end)
  getDb()
    .prepare('UPDATE tasks SET actual_min = actual_min + ?, timer_started_at = NULL, updated_at = ? WHERE id = ?')
    .run(add, end.toISOString(), task.id)
}

/**
 * ステータス変更。進行中タイマーの開始/停止・実績加算を扱う。
 * 進行中にする場合、既存の進行中タスクは未着手へ戻してタイマー停止。
 */
export function setStatus(id: number, status: Status): Task {
  const db = getDb()
  const now = new Date()
  const target = getTask(id)
  if (!target) throw new Error(`task ${id} not found`)

  const tx = db.transaction(() => {
    if (status === 'DOING') {
      // 既存の進行中を停止して未着手へ
      const others = listTasks().filter((t) => t.status === 'DOING' && t.id !== id)
      for (const o of others) {
        stopTimer(o, now)
        db.prepare("UPDATE tasks SET status = 'TODO', updated_at = ? WHERE id = ?").run(
          now.toISOString(),
          o.id
        )
      }
      db.prepare("UPDATE tasks SET status = 'DOING', timer_started_at = ?, updated_at = ? WHERE id = ?").run(
        now.toISOString(),
        now.toISOString(),
        id
      )
    } else {
      // 進行中から離れる場合はタイマー停止
      stopTimer(target, now)
      db.prepare('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?').run(
        status,
        now.toISOString(),
        id
      )
    }
  })
  tx()
  return getTask(id)!
}

/**
 * 完了処理。実績時間を確定し、手動並び順で次の未着手を自動的に進行中へ。
 * @returns 完了タスクと自動選択された次タスク
 */
export function completeTask(
  id: number,
  actualMin: number
): { completed: Task; next: Task | null } {
  const db = getDb()
  const now = new Date().toISOString()
  const target = getTask(id)
  if (!target) throw new Error(`task ${id} not found`)

  const tx = db.transaction(() => {
    db.prepare(
      "UPDATE tasks SET status = 'DONE', actual_min = ?, timer_started_at = NULL, updated_at = ? WHERE id = ?"
    ).run(actualMin, now, id)
  })
  tx()

  // 次の進行中を自動選択
  const all = listTasks()
  const next = pickNextActive(
    all.filter((t) => t.id !== id),
    target.sortOrder
  )
  let nextTask: Task | null = null
  if (next) {
    nextTask = setStatus(next.id, 'DOING')
  }
  return { completed: getTask(id)!, next: nextTask }
}

/**
 * 後回し処理。締切を再設定する場合は未着手へ戻す。
 * 締切を再設定しない場合は POSTPONED のまま保持。
 */
export function postponeTask(
  id: number,
  opts: { deadlineDate?: string | null; deadlinePeriod?: Task['deadlinePeriod']; reschedule: boolean }
): Task {
  const db = getDb()
  const now = new Date()
  const target = getTask(id)
  if (!target) throw new Error(`task ${id} not found`)
  // 進行中だった場合はタイマー停止して実績加算
  stopTimer(target, now)

  if (opts.reschedule) {
    db.prepare(
      "UPDATE tasks SET status = 'TODO', deadline_date = ?, deadline_period = ?, updated_at = ? WHERE id = ?"
    ).run(
      opts.deadlineDate ?? target.deadlineDate,
      opts.deadlinePeriod ?? target.deadlinePeriod,
      now.toISOString(),
      id
    )
  } else {
    db.prepare("UPDATE tasks SET status = 'POSTPONED', updated_at = ? WHERE id = ?").run(
      now.toISOString(),
      id
    )
  }
  return getTask(id)!
}

/** バックアップから全タスクを復元（既存を全削除して挿入）。@returns 取り込んだ件数 */
export function replaceAllFromImport(tasks: Task[]): number {
  const db = getDb()
  const now = nowIso()
  const insert = db.prepare(
    `INSERT INTO tasks
      (title, deadline_date, deadline_period, estimate_min, actual_min, priority, category, memo,
       status, sort_order, recurrence, recurrence_next_date, timer_started_at, created_at, updated_at)
     VALUES (@title, @deadlineDate, @deadlinePeriod, @estimateMin, @actualMin, @priority, @category, @memo,
       @status, @sortOrder, @recurrence, @recurrenceNext, NULL, @createdAt, @updatedAt)`
  )
  const tx = db.transaction((rows: Task[]) => {
    db.prepare('DELETE FROM tasks').run()
    rows.forEach((t, i) => {
      insert.run({
        title: t.title ?? '(無題)',
        deadlineDate: t.deadlineDate ?? null,
        deadlinePeriod: t.deadlinePeriod ?? 'NONE',
        estimateMin: t.estimateMin ?? null,
        actualMin: t.actualMin ?? 0,
        priority: t.priority ?? 'MID',
        category: t.category ?? 'WORK',
        memo: t.memo ?? '',
        // 復元時は進行中タイマーを引き継がない（DOINGはTODOへ）
        status: t.status === 'DOING' ? 'TODO' : (t.status ?? 'TODO'),
        sortOrder: t.sortOrder ?? i + 1,
        recurrence: t.recurrence ?? 'NONE',
        recurrenceNext: t.recurrenceNextDate ?? null,
        createdAt: t.createdAt ?? now,
        updatedAt: now
      })
    })
  })
  tx(tasks)
  return tasks.length
}

/** 見込時間だけを更新（AI推定の採用など） */
export function setEstimate(id: number, estimateMin: number | null): Task {
  getDb()
    .prepare('UPDATE tasks SET estimate_min = ?, updated_at = ? WHERE id = ?')
    .run(estimateMin, nowIso(), id)
  return getTask(id)!
}
