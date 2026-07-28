'use client'

import { Loader2, MessageCircle, Search, X } from 'lucide-react'
import type { WorkspaceContact } from './types'

interface Props {
  loading: boolean
  contacts: WorkspaceContact[]
  search: string
  openingId: string | null
  onSearchChange: (val: string) => void
  onStartPribadi: (userId: string) => void
  onClose: () => void
}

export default function WorkspaceContactSheet({
  loading, contacts, search, openingId, onSearchChange, onStartPribadi, onClose,
}: Props) {
  const filtered = contacts.filter(u =>
    !search ||
    u.full_name.toLowerCase().includes(search.toLowerCase()) ||
    u.staff_id.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end z-50" onClick={onClose}>
      <div
        className="bg-white rounded-t-3xl w-full max-w-md mx-auto pt-4 max-h-[85vh] flex flex-col"
        style={{ paddingBottom: 'calc(96px + env(safe-area-inset-bottom))' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-center pb-2">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>
        <div className="px-5 flex items-center justify-between mb-3">
          <div>
            <h2 className="font-bold text-gray-800">Kontak Staff</h2>
            <p className="text-[11px] text-gray-400">Ketuk untuk mulai chat pribadi</p>
          </div>
          <button onClick={onClose} aria-label="Tutup"><X size={20} className="text-gray-400" /></button>
        </div>
        <div className="px-5 pb-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-2.5 text-gray-400" />
            <input
              type="text"
              placeholder="Cari nama / ID staff..."
              value={search}
              onChange={e => onSearchChange(e.target.value)}
              className="input pl-9 text-sm w-full"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-3">
          {loading && <p className="text-center text-gray-400 text-sm py-6">Memuat...</p>}
          {!loading && filtered.length === 0 && (
            <p className="text-center text-gray-400 text-sm py-6">Tidak ada staff cocok.</p>
          )}
          {!loading && filtered.map(u => (
            <button
              key={u.id}
              onClick={() => onStartPribadi(u.id)}
              disabled={openingId === u.id}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 active:bg-gray-100 disabled:opacity-60 text-left"
            >
              <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm flex-shrink-0">
                {u.full_name?.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-800 truncate">{u.full_name}</p>
                <p className="text-[11px] text-gray-400 capitalize truncate">
                  {u.staff_id} • {u.role} • {u.branches?.name ?? '—'}
                </p>
              </div>
              {openingId === u.id
                ? <Loader2 size={16} className="animate-spin text-primary flex-shrink-0" />
                : <MessageCircle size={16} className="text-gray-300 flex-shrink-0" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
