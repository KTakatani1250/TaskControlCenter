import { contextBridge, ipcRenderer } from 'electron'
import type {
  AppSettings,
  EstimateResult,
  IoResult,
  Priority,
  Status,
  Task,
  TaskInput
} from '@shared/types'

const api = {
  // タスク
  list: (): Promise<Task[]> => ipcRenderer.invoke('tasks:list'),
  create: (input: TaskInput): Promise<Task> => ipcRenderer.invoke('tasks:create', input),
  update: (id: number, input: TaskInput): Promise<Task> =>
    ipcRenderer.invoke('tasks:update', id, input),
  remove: (id: number): Promise<void> => ipcRenderer.invoke('tasks:delete', id),
  reorder: (orderedIds: number[]): Promise<void> => ipcRenderer.invoke('tasks:reorder', orderedIds),
  setStatus: (id: number, status: Status): Promise<Task> =>
    ipcRenderer.invoke('tasks:setStatus', id, status),
  complete: (id: number, actualMin: number): Promise<{ completed: Task; next: Task | null }> =>
    ipcRenderer.invoke('tasks:complete', id, actualMin),
  postpone: (
    id: number,
    opts: { deadlineDate?: string | null; deadlinePeriod?: Task['deadlinePeriod']; reschedule: boolean }
  ): Promise<Task> => ipcRenderer.invoke('tasks:postpone', id, opts),
  setEstimate: (id: number, min: number | null): Promise<Task> =>
    ipcRenderer.invoke('tasks:setEstimate', id, min),

  // 繰り返し
  generateRecurrences: (): Promise<number> => ipcRenderer.invoke('recurrence:generate'),

  // AI推定
  estimate: (ctx: { title: string; memo: string; priority: Priority }): Promise<EstimateResult> =>
    ipcRenderer.invoke('ai:estimate', ctx),

  // 設定
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
  setApiKey: (key: string): Promise<void> => ipcRenderer.invoke('settings:setApiKey', key),
  clearApiKey: (): Promise<void> => ipcRenderer.invoke('settings:clearApiKey'),
  setModel: (model: string): Promise<void> => ipcRenderer.invoke('settings:setModel', model),
  testApiKey: (key: string): Promise<boolean> => ipcRenderer.invoke('settings:testApiKey', key),

  // データ入出力
  exportJson: (): Promise<IoResult> => ipcRenderer.invoke('io:exportJson'),
  exportCsv: (): Promise<IoResult> => ipcRenderer.invoke('io:exportCsv'),
  importBackup: (): Promise<IoResult> => ipcRenderer.invoke('io:importBackup')
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
