import { BrowserWindow, ipcMain } from 'electron'
import { exportCsv, exportJson, importBackup } from './io'
import {
  completeTask,
  createTask,
  deleteTask,
  listTasks,
  postponeTask,
  reorderTasks,
  setEstimate,
  setStatus,
  updateTask
} from './repo'
import { generateDueRecurrences } from './recurrence'
import { estimateDuration, getModel, setModel, testApiKey } from './anthropic'
import { clearApiKey, hasApiKey, setApiKey } from './secrets'
import { DAILY_CAPACITY_MIN, Priority, Status, TaskInput } from '@shared/types'

/** 完了タスクから類似候補（実績あり）を収集してAI推定の文脈にする */
function gatherSimilar(): { title: string; estimateMin: number | null; actualMin: number }[] {
  return listTasks()
    .filter((t) => t.status === 'DONE' && t.actualMin > 0)
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
    .slice(0, 8)
    .map((t) => ({ title: t.title, estimateMin: t.estimateMin, actualMin: t.actualMin }))
}

export function registerIpc(): void {
  ipcMain.handle('tasks:list', () => listTasks())
  ipcMain.handle('tasks:create', (_e, input: TaskInput) => createTask(input))
  ipcMain.handle('tasks:update', (_e, id: number, input: TaskInput) => updateTask(id, input))
  ipcMain.handle('tasks:delete', (_e, id: number) => deleteTask(id))
  ipcMain.handle('tasks:reorder', (_e, orderedIds: number[]) => reorderTasks(orderedIds))
  ipcMain.handle('tasks:setStatus', (_e, id: number, status: Status) => setStatus(id, status))
  ipcMain.handle('tasks:complete', (_e, id: number, actualMin: number) =>
    completeTask(id, actualMin)
  )
  ipcMain.handle(
    'tasks:postpone',
    (
      _e,
      id: number,
      opts: { deadlineDate?: string | null; deadlinePeriod?: TaskInput['deadlinePeriod']; reschedule: boolean }
    ) => postponeTask(id, opts)
  )
  ipcMain.handle('tasks:setEstimate', (_e, id: number, min: number | null) => setEstimate(id, min))

  ipcMain.handle('recurrence:generate', () => generateDueRecurrences())

  ipcMain.handle(
    'ai:estimate',
    (_e, ctx: { title: string; memo: string; priority: Priority }) =>
      estimateDuration({ ...ctx, similar: gatherSimilar() })
  )

  ipcMain.handle('settings:get', () => ({
    hasApiKey: hasApiKey(),
    model: getModel(),
    dailyCapacityMin: DAILY_CAPACITY_MIN
  }))
  ipcMain.handle('settings:setApiKey', (_e, key: string) => setApiKey(key))
  ipcMain.handle('settings:clearApiKey', () => clearApiKey())
  ipcMain.handle('settings:setModel', (_e, model: string) => setModel(model))
  ipcMain.handle('settings:testApiKey', (_e, key: string) => testApiKey(key))

  ipcMain.handle('io:exportJson', (e) => exportJson(BrowserWindow.fromWebContents(e.sender)))
  ipcMain.handle('io:exportCsv', (e) => exportCsv(BrowserWindow.fromWebContents(e.sender)))
  ipcMain.handle('io:importBackup', (e) => importBackup(BrowserWindow.fromWebContents(e.sender)))
}
