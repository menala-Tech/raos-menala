'use client'

import { MessageCircle } from 'lucide-react'
import clsx from 'clsx'
import type { ChatRoomWithMeta } from '@/types'
import WorkspaceListItem from './WorkspaceListItem'
import { formatRoomPreview, matchesFilter, type FilterTab } from './types'

interface Props {
  rooms: ChatRoomWithMeta[]
  filterTab: FilterTab
  onFilterChange: (tab: FilterTab) => void
  searchQuery: string
  onOpenRoom: (room: ChatRoomWithMeta) => void
}

const TABS: FilterTab[] = ['semua', 'grup', 'lokasi', 'pribadi']

export default function WorkspaceList({ rooms, filterTab, onFilterChange, searchQuery, onOpenRoom }: Props) {
  const q = searchQuery.trim().toLowerCase()
  const filtered = rooms
    .filter(r => matchesFilter(r, filterTab))
    .filter(r => {
      if (!q) return true
      const roomName = String(r.name ?? '').toLowerCase()
      const preview = formatRoomPreview(r.last_message_content, r.last_message_sender, r.description).toLowerCase()
      return roomName.includes(q) || preview.includes(q)
    })

  return (
    <>
      <div className="bg-white border-b border-gray-100 px-4 py-2 flex gap-2 overflow-x-auto sticky top-[8.5rem] z-20">
        {TABS.map(cat => (
          <button
            key={cat}
            onClick={() => onFilterChange(cat)}
            className={clsx(
              'flex-shrink-0 px-3 py-1 rounded-full text-xs font-semibold capitalize transition-colors',
              filterTab === cat ? 'bg-secondary text-white' : 'bg-gray-100 text-gray-500'
            )}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="px-4 py-3 space-y-2">
        {filtered.length === 0 ? (
          <div className="text-center py-10 text-gray-400">
            <MessageCircle size={32} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">
              {rooms.length === 0 ? 'Tidak ada workspace aktif' : 'Tidak ada workspace yang cocok'}
            </p>
          </div>
        ) : (
          filtered.map(room => (
            <WorkspaceListItem key={room.id} room={room} onOpen={() => onOpenRoom(room)} />
          ))
        )}
        <div className="pt-4 text-center">
          <p className="text-[10px] text-gray-400">
            Hanya peserta yang diundang dapat bergabung • Data terenkripsi end-to-end
          </p>
        </div>
      </div>
    </>
  )
}
