'use client'

import type React from 'react'
import { Pin } from 'lucide-react'
import clsx from 'clsx'

/**
 * WorkspaceCard — envelope for a single item on the timeline.
 * Any kind of collaboration payload (message, business card, event notice)
 * can be wrapped in it so it inherits the same bubble/pin/border treatment.
 */
interface Props {
  isMe: boolean
  isPinned?: boolean
  onLongPressStart?: () => void
  onLongPressEnd?: () => void
  onContextMenu?: (e: React.MouseEvent) => void
  children: React.ReactNode
  className?: string
}

export default function WorkspaceCard({
  isMe,
  isPinned,
  onLongPressStart,
  onLongPressEnd,
  onContextMenu,
  children,
  className,
}: Props) {
  return (
    <div
      onTouchStart={onLongPressStart}
      onTouchEnd={onLongPressEnd}
      onTouchMove={onLongPressEnd}
      onContextMenu={onContextMenu}
      className={clsx(
        'max-w-[78%] px-3 py-2 rounded-2xl text-sm cursor-pointer select-none',
        isMe ? 'bg-secondary text-white rounded-br-sm' : 'bg-white text-gray-800 shadow-sm rounded-bl-sm',
        isPinned && 'ring-1 ring-primary/40',
        className
      )}
    >
      {isPinned && (
        <div className="flex items-center gap-1 mb-1 opacity-60">
          <Pin size={9} className="text-primary" />
          <span className="text-[9px] font-semibold text-primary">Disematkan</span>
        </div>
      )}
      {children}
    </div>
  )
}
