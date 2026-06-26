import { useState, type JSX } from 'react'
import { Task } from '@shared/types'
import { Modal } from './Modal'
import { minutesToText } from '../format'

export function CompleteDialog({
  task,
  measuredMin,
  onClose,
  onDone
}: {
  task: Task
  measuredMin: number
  onClose: () => void
  onDone: (nextTitle: string | null) => void
}): JSX.Element {
  const [actual, setActual] = useState<string>(String(measuredMin))

  const confirm = async (): Promise<void> => {
    const min = Math.max(0, Math.round(Number(actual) || 0))
    const { next } = await window.api.complete(task.id, min)
    onDone(next ? next.title : null)
  }

  return (
    <Modal
      title="タスクを完了"
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose}>キャンセル</button>
          <button className="primary" onClick={confirm}>
            完了を確定
          </button>
        </>
      }
    >
      <div className="hint">「{task.title}」を完了します。</div>
      <div className="row">
        <div className="field">
          <label>自動計測された実績</label>
          <input value={minutesToText(measuredMin)} disabled />
        </div>
        <div className="field">
          <label>見込時間</label>
          <input value={minutesToText(task.estimateMin)} disabled />
        </div>
      </div>
      <div className="field">
        <label>実績時間（分）— 必要なら修正</label>
        <input
          type="number"
          min={0}
          value={actual}
          onChange={(e) => setActual(e.target.value)}
          autoFocus
        />
        <div className="hint">確定した実績時間は、今後のAI推定に利用されます。</div>
      </div>
    </Modal>
  )
}
