'use client'

import { BellOff, Pin } from 'lucide-react'
import clsx from 'clsx'
import type { ChatRoomWithMeta } from '@/types'
import { formatTime, getRoomPrefs, getRoomStyle } from './types'

interface Props {
  room: ChatRoomWithMeta
  onOpen: () => void
}

export default function WorkspaceListItem({ room, onOpen }: Props) {
  const style = getRoomStyle(room.category)
  const prefs = getRoomPrefs(room.id)
  const preview = room.last_message_content
    ? (room.last_message_sender ? `${room.last_message_sender}: ${room.last_message_content}` : room.last_message_content)
    : (room.description ?? 'Belum ada pesan')

  return (
    <button onClick={onOpen}
      className="card w-full flex items-center gap-3 text-left active:scale-[0.99] transition-transform">
      <div className={`w-11 h-11 rounded-full flex items-center justify-center font-black text-base flex-shrink-0 shadow-sm ${style.bg} ${style.text}`}>
        {room.name.charAt(0)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            {prefs.pinned && <Pin size={10} className="text-primary flex-shrink-0" />}
            {!prefs.notif && <BellOff size={10} className="text-gray-300 flex-shrink-0" />}
            <p className={clsx('font-bold text-sm truncate', room.unread_count > 0 ? 'text-gray-900' : 'text-gray-800')}>
              {room.name}
            </p>
          </div>
          <span className={clsx('text-[10px] flex-shrink-0', room.unread_count > 0 ? 'text-primary font-bold' : 'text-gray-400')}>
            {formatTime(room.last_message_at)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <p className={clsx('text-xs truncate flex-1', room.unread_count > 0 ? 'text-gray-700 font-semibold' : 'text-gray-400')}>
            {preview}
          </p>
          {room.unread_count > 0 && (
            <span className="flex-shrink-0 bg-primary text-secondary text-[10px] font-bold min-w-[18px] h-[18px] px-1.5 rounded-full flex items-center justify-center">
              {room.unread_count > 99 ? '99+' : room.unread_count}
            </span>
          )}
        </div>
      </div>
    </button>
  )
}
