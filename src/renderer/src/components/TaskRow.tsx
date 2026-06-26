import { ReactNode, type JSX } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Task } from '@shared/types'
import { deadlineText, minutesToText } from '../format'

export function TaskRow({
  task,
  isToday,
  isPostponed,
  badges,
  actions,
  handle
}: {
  task: Task
  isToday?: boolean
  isPostponed?: boolean
  badges?: ReactNode
  actions?: ReactNode
  handle?: ReactNode
}): JSX.Element {
  return (
    <div
      className={
        'task-row' + (isToday ? ' is-today' : '') + (isPostponed ? ' is-postponed' : '')
      }
    >
      {handle}
      <div className="task-main">
        <div className="task-name">{task.title}</div>
        <div className="task-sub">
          <span>{deadlineText(task)}</span>
          <span>見込 {minutesToText(task.estimateMin)}</span>
          {task.actualMin > 0 && <span>実績 {minutesToText(task.actualMin)}</span>}
          {badges}
        </div>
      </div>
      {actions && <div className="task-actions">{actions}</div>}
    </div>
  )
}

/** ドラッグ&ドロップ可能な行（エリア3用） */
export function SortableTaskRow({
  task,
  isToday,
  isPostponed,
  badges,
  actions
}: {
  task: Task
  isToday?: boolean
  isPostponed?: boolean
  badges?: ReactNode
  actions?: ReactNode
}): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id
  })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1
  }
  return (
    <div ref={setNodeRef} style={style}>
      <TaskRow
        task={task}
        isToday={isToday}
        isPostponed={isPostponed}
        badges={badges}
        actions={actions}
        handle={
          <span className="drag-handle" {...attributes} {...listeners} title="ドラッグで並び替え">
            ⠿
          </span>
        }
      />
    </div>
  )
}
