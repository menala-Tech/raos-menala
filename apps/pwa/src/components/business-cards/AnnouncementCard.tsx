'use client'

import { Megaphone } from 'lucide-react'
import type { ChatMessage, UserProfile } from '@/types'

interface Props {
  message: ChatMessage
  author?: Pick<UserProfile, 'full_name' | 'role'> | null
  onOpenReadersModal?: () => void
}

/**
 * AnnouncementCard — renders a `chat_messages` entry from the Pengumuman
 * workspace with distinct announcement styling. Owns no data; visualises
 * the existing chat_messages row.
 */
export default function AnnouncementCard({ message, author, onOpenReadersModal }: Props) {
  return (
    <button
      type="button"
      onClick={onOpenReadersModal}
      className="min-w-[240px] max-w-[320px] rounded-2xl bg-gradient-to-br from-amber-50 to-yellow-100 border border-amber-200 p-3 text-left shadow-sm"
    >
      <div className="flex items-start gap-2">
        <div className="bg-amber-500 text-white rounded-lg p-1.5 flex-shrink-0 shadow-sm">
          <Megaphone size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wide">Pengumuman</p>
          <p className="text-sm font-semibold text-gray-800 leading-relaxed whitespace-pre-wrap break-words">
            {message.content ?? ''}
          </p>
          {author?.full_name && (
            <p className="text-[10px] text-amber-700/80 mt-2 capitalize">
              {author.full_name} · {author.role ?? ''}
            </p>
          )}
          <p className="text-[10px] text-amber-700/60 mt-0.5">
            {new Date(message.created_at).toLocaleString('id-ID', {
              day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
            })}
          </p>
        </div>
      </div>
    </button>
  )
}
