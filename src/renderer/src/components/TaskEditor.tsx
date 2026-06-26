import { useState, type JSX } from 'react'
import {
  Category,
  DeadlinePeriod,
  EstimateResult,
  Priority,
  Recurrence,
  Task,
  TaskInput
} from '@shared/types'
import { Modal } from './Modal'
import { minutesToText } from '../format'

export function TaskEditor({
  task,
  onClose,
  onSaved
}: {
  task?: Task
  onClose: () => void
  onSaved: () => void
}): JSX.Element {
  const [title, setTitle] = useState(task?.title ?? '')
  const [deadlineDate, setDeadlineDate] = useState(task?.deadlineDate ?? '')
  const [deadlinePeriod, setDeadlinePeriod] = useState<DeadlinePeriod>(
    task?.deadlinePeriod ?? 'NONE'
  )
  const [estimateMin, setEstimateMin] = useState<string>(
    task?.estimateMin != null ? String(task.estimateMin) : ''
  )
  const [priority, setPriority] = useState<Priority>(task?.priority ?? 'MID')
  const [category, setCategory] = useState<Category>(task?.category ?? 'WORK')
  const [memo, setMemo] = useState(task?.memo ?? '')
  const [recurrence, setRecurrence] = useState<Recurrence>(task?.recurrence ?? 'NONE')

  const [estimating, setEstimating] = useState(false)
  const [estimate, setEstimate] = useState<EstimateResult | null>(null)
  const [error, setError] = useState('')

  const save = async (): Promise<void> => {
    if (!title.trim()) {
      setError('見出しを入力してください。')
      return
    }
    const input: TaskInput = {
      title: title.trim(),
      deadlineDate: deadlineDate || null,
      deadlinePeriod: deadlineDate ? deadlinePeriod : 'NONE',
      estimateMin: estimateMin.trim() === '' ? null : Math.max(1, Number(estimateMin)),
      priority,
      category,
      memo,
      recurrence
    }
    try {
      if (task) await window.api.update(task.id, input)
      else await window.api.create(input)
      onSaved()
    } catch (e) {
      setError(String((e as Error).message ?? e))
    }
  }

  const runEstimate = async (): Promise<void> => {
    setError('')
    setEstimating(true)
    setEstimate(null)
    try {
      const res = await window.api.estimate({ title: title.trim(), memo, priority })
      setEstimate(res)
      setEstimateMin(String(res.estimateMin))
    } catch (e) {
      setError(String((e as Error).message ?? e))
    } finally {
      setEstimating(false)
    }
  }

  return (
    <Modal
      title={task ? 'タスクを編集' : '新規タスク'}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose}>キャンセル</button>
          <button className="primary" onClick={save}>
            保存
          </button>
        </>
      }
    >
      <div className="field">
        <label>見出し</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
      </div>

      <div className="row">
        <div className="field">
          <label>締切日</label>
          <input
            type="date"
            value={deadlineDate}
            onChange={(e) => setDeadlineDate(e.target.value)}
          />
        </div>
        <div className="field">
          <label>締切時間帯</label>
          <select
            value={deadlinePeriod}
            disabled={!deadlineDate}
            onChange={(e) => setDeadlinePeriod(e.target.value as DeadlinePeriod)}
          >
            <option value="NONE">指定なし</option>
            <option value="AM">AM（当日12:00）</option>
            <option value="PM">PM（当日24:00）</option>
          </select>
        </div>
      </div>

      <div className="field">
        <label>見込時間（分）</label>
        <div className="row">
          <input
            type="number"
            min={1}
            placeholder="空欄ならAIで推定"
            value={estimateMin}
            onChange={(e) => setEstimateMin(e.target.value)}
          />
          <button type="button" onClick={runEstimate} disabled={estimating || !title.trim()}>
            {estimating ? '推定中…' : 'AIで推定'}
          </button>
        </div>
        {estimate && (
          <div className="estimate-box">
            推定：{minutesToText(estimate.estimateMin)}（範囲：
            {minutesToText(estimate.rangeMinMin)}〜{minutesToText(estimate.rangeMaxMin)}）
            <br />
            {estimate.rationale}
          </div>
        )}
      </div>

      <div className="row">
        <div className="field">
          <label>タグ</label>
          <select value={category} onChange={(e) => setCategory(e.target.value as Category)}>
            <option value="WORK">仕事</option>
            <option value="PRIVATE">私事</option>
          </select>
        </div>
        <div className="field">
          <label>優先度</label>
          <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
            <option value="HIGH">高</option>
            <option value="MID">中</option>
            <option value="LOW">低</option>
          </select>
        </div>
        <div className="field">
          <label>繰り返し</label>
          <select value={recurrence} onChange={(e) => setRecurrence(e.target.value as Recurrence)}>
            <option value="NONE">なし</option>
            <option value="WEEKLY">毎週</option>
            <option value="MONTHLY">毎月</option>
          </select>
        </div>
      </div>

      <div className="field">
        <label>メモ</label>
        <textarea rows={3} value={memo} onChange={(e) => setMemo(e.target.value)} />
      </div>

      {error && <div className="error">{error}</div>}
    </Modal>
  )
}
