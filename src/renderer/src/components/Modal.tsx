import { ReactNode, type JSX } from 'react'

export function Modal({
  title,
  children,
  footer,
  onClose
}: {
  title: string
  children: ReactNode
  footer?: ReactNode
  onClose: () => void
}): JSX.Element {
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">{title}</div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  )
}
