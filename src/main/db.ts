import { app } from 'electron'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import type { Task } from '@shared/types'

let db: Database.Database

export function getDb(): Database.Database {
  if (!db) throw new Error('DB not initialized')
  return db
}

/** アプリデータはアプリ本体と分離（userData 配下に保存） */
export function dbPath(): string {
  return join(app.getPath('userData'), 'tasks.db')
}

export function initDb(): void {
  db = new Database(dbPath())
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  migrate()
}

function migrate(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      title                 TEXT    NOT NULL,
      deadline_date         TEXT,
      deadline_period       TEXT    NOT NULL DEFAULT 'NONE',
      estimate_min          INTEGER,
      actual_min            INTEGER NOT NULL DEFAULT 0,
      priority              TEXT    NOT NULL DEFAULT 'MID',
      category              TEXT    NOT NULL DEFAULT 'WORK',
      memo                  TEXT    NOT NULL DEFAULT '',
      status                TEXT    NOT NULL DEFAULT 'TODO',
      sort_order            INTEGER NOT NULL DEFAULT 0,
      recurrence            TEXT    NOT NULL DEFAULT 'NONE',
      recurrence_next_date  TEXT,
      timer_started_at      TEXT,
      created_at            TEXT    NOT NULL,
      updated_at            TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS meta (
      key   TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_sort   ON tasks(sort_order);
  `)

  // 既存DBへのカラム追加（後方互換）
  addColumnIfMissing('category', "TEXT NOT NULL DEFAULT 'WORK'")
}

/** tasks テーブルに指定カラムが無ければ追加する */
function addColumnIfMissing(name: string, decl: string): void {
  const cols = db.prepare('PRAGMA table_info(tasks)').all() as { name: string }[]
  if (!cols.some((c) => c.name === name)) {
    db.exec(`ALTER TABLE tasks ADD COLUMN ${name} ${decl}`)
  }
}

/** DB行 -> ドメイン Task */
export interface TaskRow {
  id: number
  title: string
  deadline_date: string | null
  deadline_period: string
  estimate_min: number | null
  actual_min: number
  priority: string
  category: string
  memo: string
  status: string
  sort_order: number
  recurrence: string
  recurrence_next_date: string | null
  timer_started_at: string | null
  created_at: string
  updated_at: string
}

export function rowToTask(r: TaskRow): Task {
  return {
    id: r.id,
    title: r.title,
    deadlineDate: r.deadline_date,
    deadlinePeriod: r.deadline_period as Task['deadlinePeriod'],
    estimateMin: r.estimate_min,
    actualMin: r.actual_min,
    priority: r.priority as Task['priority'],
    category: (r.category as Task['category']) ?? 'WORK',
    memo: r.memo,
    status: r.status as Task['status'],
    sortOrder: r.sort_order,
    recurrence: r.recurrence as Task['recurrence'],
    recurrenceNextDate: r.recurrence_next_date,
    timerStartedAt: r.timer_started_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }
}

export function getMeta(key: string): string | null {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  return row?.value ?? null
}

export function setMeta(key: string, value: string): void {
  db.prepare(
    'INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, value)
}
