'use client'

import { X } from 'lucide-react'

interface Reader {
  user_id: string
  full_name: string
  avatar_url: string | null
  read_at: string
}

interface Props {
  loading: boolean
  readers: Reader[]
  onClose: () => void
}

export default function WorkspaceReadersModal({ loading, readers, onClose }: Props) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 w-full sm:w-[90%] sm:max-w-sm rounded-t-2xl sm:rounded-2xl shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-gray-800 dark:text-gray-100">Dibaca oleh</p>
            <p className="text-[10px] text-gray-400">Tap luar untuk tutup</p>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400" aria-label="Tutup">
            <X size={16} />
          </button>
        </div>
        <div
          className="max-h-[50vh] overflow-y-auto"
          style={{ paddingBottom: 'calc(20px + env(safe-area-inset-bottom))' }}
        >
          {loading && <p className="text-center text-xs text-gray-400 py-6">Memuat...</p>}
          {!loading && readers.length === 0 && (
            <p className="text-center text-xs text-gray-400 py-6">Belum ada yang membaca</p>
          )}
          {readers.map(r => (
            <div
              key={r.user_id}
              className="px-4 py-2 flex items-center gap-3 border-b border-gray-50 dark:border-gray-700/50"
            >
              <div className="w-8 h-8 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xs font-bold flex-shrink-0">
                {r.full_name?.[0]?.toUpperCase() ?? '?'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gray-800 dark:text-gray-100 truncate">{r.full_name}</p>
              </div>
              <span className="text-[10px] text-gray-400 flex-shrink-0">
                {new Date(r.read_at).toLocaleString('id-ID', {
                  day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                })}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
