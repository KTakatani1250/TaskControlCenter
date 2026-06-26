import { BrowserWindow, dialog } from 'electron'
import { writeFile, readFile } from 'node:fs/promises'
import { listTasks, replaceAllFromImport } from './repo'
import type { IoResult, Task } from '@shared/types'

const stamp = (): string => new Date().toISOString().slice(0, 10)

function csvEscape(v: unknown): string {
  const s = v == null ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const CSV_COLUMNS: (keyof Task)[] = [
  'id',
  'title',
  'deadlineDate',
  'deadlinePeriod',
  'estimateMin',
  'actualMin',
  'priority',
  'category',
  'memo',
  'status',
  'sortOrder',
  'recurrence',
  'recurrenceNextDate',
  'createdAt',
  'updatedAt'
]

function toCsv(tasks: Task[]): string {
  const head = CSV_COLUMNS.join(',')
  const rows = tasks.map((t) => CSV_COLUMNS.map((c) => csvEscape(t[c])).join(','))
  return [head, ...rows].join('\r\n')
}

export async function exportJson(win: BrowserWindow | null): Promise<IoResult> {
  const tasks = listTasks()
  const { canceled, filePath } = await dialog.showSaveDialog(win ?? undefined!, {
    title: 'JSONでエクスポート',
    defaultPath: `taskcontrolcenter-${stamp()}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }]
  })
  if (canceled || !filePath) return { ok: false, canceled: true }
  const payload = { app: 'TaskControlCenter', version: 1, exportedAt: new Date().toISOString(), tasks }
  await writeFile(filePath, JSON.stringify(payload, null, 2), 'utf-8')
  return { ok: true, path: filePath, count: tasks.length }
}

export async function exportCsv(win: BrowserWindow | null): Promise<IoResult> {
  const tasks = listTasks()
  const { canceled, filePath } = await dialog.showSaveDialog(win ?? undefined!, {
    title: 'CSVでエクスポート',
    defaultPath: `taskcontrolcenter-${stamp()}.csv`,
    filters: [{ name: 'CSV', extensions: ['csv'] }]
  })
  if (canceled || !filePath) return { ok: false, canceled: true }
  // Excelでの文字化け防止にUTF-8 BOMを付与
  await writeFile(filePath, '﻿' + toCsv(tasks), 'utf-8')
  return { ok: true, path: filePath, count: tasks.length }
}

/** バックアップ(JSON)から全タスクを復元（全置換） */
export async function importBackup(win: BrowserWindow | null): Promise<IoResult> {
  const { canceled, filePaths } = await dialog.showOpenDialog(win ?? undefined!, {
    title: 'バックアップ(JSON)から復元',
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }]
  })
  if (canceled || !filePaths[0]) return { ok: false, canceled: true }
  try {
    const raw = await readFile(filePaths[0], 'utf-8')
    const parsed = JSON.parse(raw)
    const tasks: Task[] = Array.isArray(parsed) ? parsed : parsed.tasks
    if (!Array.isArray(tasks)) throw new Error('tasks 配列が見つかりません')
    const count = replaceAllFromImport(tasks)
    return { ok: true, path: filePaths[0], count }
  } catch (e) {
    return { ok: false, error: String((e as Error).message ?? e) }
  }
}
