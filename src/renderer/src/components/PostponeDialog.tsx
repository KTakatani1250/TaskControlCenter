import { useState, type JSX } from 'react'
import { DeadlinePeriod, Task } from '@shared/types'
import { Modal } from './Modal'

export function PostponeDialog({
  task,
  onClose,
  onDone
}: {
  task: Task
  onClose: () => void
  onDone: () => void
}): JSX.Element {
  const [reschedule, setReschedule] = useState(true)
  const [deadlineDate, setDeadlineDate] = useState(task.deadlineDate ?? '')
  const [deadlinePeriod, setDeadlinePeriod] = useState<DeadlinePeriod>(task.deadlinePeriod)

  const confirm = async (): Promise<void> => {
    if (reschedule) {
      await window.api.postpone(task.id, {
        reschedule: true,
        deadlineDate: deadlineDate || null,
        deadlinePeriod: deadlineDate ? deadlinePeriod : 'NONE'
      })
    } else {
      await window.api.postpone(task.id, { reschedule: false })
    }
    onDone()
  }

  return (
    <Modal
      title="タスクを後回し"
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose}>キャンセル</button>
          <button className="primary" onClick={confirm}>
            後回しにする
          </button>
        </>
      }
    >
      <div className="hint">「{task.title}」を後回しにします。</div>
      <div className="field">
        <label>
          <input
            type="radio"
            style={{ width: 'auto', marginRight: 6 }}
            checked={reschedule}
            onChange={() => setReschedule(true)}
          />
          締切を再設定して未着手に戻す
        </label>
      </div>
      {reschedule && (
        <div className="row">
          <div className="field">
            <label>新しい締切日</label>
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
              <option value="AM">AM</option>
              <option value="PM">PM</option>
            </select>
          </div>
        </div>
      )}
      <div className="field">
        <label>
          <input
            type="radio"
            style={{ width: 'auto', marginRight: 6 }}
            checked={!reschedule}
            onChange={() => setReschedule(false)}
          />
          締切は再設定せず、後回しのまま保存する
        </label>
      </div>
      <div className="hint">
        後回しのタスクは「今日中」判定から除外されます（締切超過の場合は警告が表示されます）。
      </div>
    </Modal>
  )
}
