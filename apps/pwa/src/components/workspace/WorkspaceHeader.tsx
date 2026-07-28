'use client'

import { ArrowLeft, Bell, BellOff, Info } from 'lucide-react'
import clsx from 'clsx'
import type { ChatRoom } from '@/types'
import { CATEGORY_LABELS, getRoomStyle, type RoomPrefs } from './types'

interface Props {
  room: ChatRoom
  prefs: RoomPrefs
  onBack: () => void
  onOpenInfo: () => void
  onOpenSettings: () => void
}

export default function WorkspaceHeader({ room, prefs, onBack, onOpenInfo, onOpenSettings }: Props) {
  const style = getRoomStyle(room.category)
  const catLabel = CATEGORY_LABELS[room.category] ?? room.category

  return (
    <div className="bg-secondary text-white px-4 pt-10 pb-3 flex items-center gap-3 flex-shrink-0">
      <button onClick={onBack} aria-label="Kembali" className="text-white/70">
        <ArrowLeft size={22} />
      </button>
      <button
        onClick={onOpenInfo}
        className={`w-9 h-9 rounded-full flex items-center justify-center font-black text-sm flex-shrink-0 ${style.bg} ${style.text}`}
        aria-label="Info workspace"
      >
        {style.label}
      </button>
      <button onClick={onOpenInfo} className="flex-1 min-w-0 text-left">
        <p className="font-bold text-sm truncate">{room.name}</p>
        <p className="text-white/40 text-xs capitalize">{catLabel}</p>
      </button>
      <button
        onClick={onOpenInfo}
        className="text-white/50 hover:text-white/80 transition-colors"
        title="Info Workspace"
      >
        <Info size={18} />
      </button>
      <button
        onClick={onOpenSettings}
        className={clsx('transition-colors', prefs.notif ? 'text-white/50 hover:text-white/80' : 'text-white/30')}
        title="Pengaturan Workspace"
      >
        {prefs.notif ? <Bell size={18} /> : <BellOff size={16} />}
      </button>
    </div>
  )
}
