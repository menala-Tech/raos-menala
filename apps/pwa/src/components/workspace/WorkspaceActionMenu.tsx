'use client'

import { Copy, Pin, Trash2, X } from 'lucide-react'
import clsx from 'clsx'
import { can } from '@/lib/accessPolicy'
import type { ChatMessageReaction, UserProfile } from '@/types'
import { QUICK_EMOJIS, type ActionMenu } from './types'

interface Props {
  actionMenu: ActionMenu
  user: UserProfile | null
  reactions: Record<string, ChatMessageReaction[]>
  onClose: () => void
  onToggleReaction: (msgId: string, emoji: string) => void
  onPin: (msgId: string) => void
  onCopy: (text?: string) => void
  onDelete: (msgId: string) => void
}

export default function WorkspaceActionMenu({
  actionMenu, user, reactions, onClose, onToggleReaction, onPin, onCopy, onDelete,
}: Props) {
  const canModerate = can(user?.role, 'chat:moderate')
  const canPin = canModerate
  const canDelete = actionMenu.isMe || !!user && can(user.role, 'chat:moderate')

  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end" onClick={onClose}>
      <div className="bg-white rounded-t-3xl shadow-2xl pb-8" onClick={e => e.stopPropagation()}>
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>

        <div className="px-4 py-2">
          <p className="text-[10px] text-gray-400 font-semibold mb-2 text-center">Reaksi Cepat</p>
          <div className="flex justify-center gap-2">
            {QUICK_EMOJIS.map(emoji => {
              const list = reactions[actionMenu.msgId] ?? []
              const mine = list.some(r => r.user_id === user?.id && r.emoji === emoji)
              return (
                <button
                  key={emoji}
                  onClick={() => onToggleReaction(actionMenu.msgId, emoji)}
                  className={clsx(
                    'w-11 h-11 rounded-2xl text-2xl flex items-center justify-center transition-transform active:scale-95',
                    mine ? 'bg-primary/20 ring-2 ring-primary/40' : 'bg-gray-100 hover:bg-gray-200'
                  )}
                >
                  {emoji}
                </button>
              )
            })}
          </div>
        </div>

        <div className="border-t border-gray-100 mx-4 my-2" />

        <div className="px-4 space-y-1">
          {canPin && (
            <button
              onClick={() => onPin(actionMenu.msgId)}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-gray-50 transition-colors text-left"
            >
              <Pin size={18} className="text-secondary" />
              <span className="text-sm font-semibold text-gray-700">Sematkan Pesan</span>
            </button>
          )}
          {actionMenu.content && (
            <button
              onClick={() => onCopy(actionMenu.content)}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-gray-50 transition-colors text-left"
            >
              <Copy size={18} className="text-gray-500" />
              <span className="text-sm font-semibold text-gray-700">Salin Teks</span>
            </button>
          )}
          {canDelete && (
            <button
              onClick={() => onDelete(actionMenu.msgId)}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-red-50 transition-colors text-left"
            >
              <Trash2 size={18} className="text-red-500" />
              <span className="text-sm font-semibold text-red-500">Hapus Pesan</span>
            </button>
          )}
          <button
            onClick={onClose}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-gray-50 transition-colors text-left"
          >
            <X size={18} className="text-gray-400" />
            <span className="text-sm font-medium text-gray-400">Batal</span>
          </button>
        </div>
      </div>
    </div>
  )
}
