'use client'

import { Pin, X } from 'lucide-react'
import type { ChatMessage } from '@/types'

interface Props {
  pinned: ChatMessage
  canUnpin: boolean
  onScrollTo: () => void
  onUnpin: () => void
}

export default function WorkspacePinnedBanner({ pinned, canUnpin, onScrollTo, onUnpin }: Props) {
  return (
    <div className="bg-primary/10 border-b border-primary/20 px-4 py-2 flex items-center gap-2 flex-shrink-0">
      <Pin size={12} className="text-primary flex-shrink-0" />
      <button onClick={onScrollTo} className="flex-1 min-w-0 text-left">
        <p className="text-[10px] font-bold text-primary">Pesan Disematkan</p>
        <p className="text-xs text-gray-600 truncate">
          {pinned.content || (pinned.type === 'image'
            ? '📷 Gambar'
            : pinned.type === 'audio'
              ? '🎤 Pesan suara'
              : '📎 File')}
        </p>
      </button>
      {canUnpin && (
        <button onClick={onUnpin} className="text-gray-400 hover:text-red-400 transition-colors flex-shrink-0" aria-label="Lepas pin">
          <X size={14} />
        </button>
      )}
    </div>
  )
}
