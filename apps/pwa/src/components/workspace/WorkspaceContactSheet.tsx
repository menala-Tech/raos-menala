'use client'

import { useState } from 'react'
import { Car, Loader2, MessageCircle, Phone, Search, Users, X } from 'lucide-react'
import type { WorkspaceContact, WorkspaceDriverContact } from './types'

interface Props {
  loading: boolean
  contacts: WorkspaceContact[]
  drivers: WorkspaceDriverContact[]
  search: string
  openingId: string | null
  onSearchChange: (val: string) => void
  onStartPribadi: (userId: string) => void
  onClose: () => void
}

export default function WorkspaceContactSheet({
  loading, contacts, drivers, search, openingId, onSearchChange, onStartPribadi, onClose,
}: Props) {
  const [tab, setTab] = useState<'staff' | 'driver'>('staff')

  const q = search.toLowerCase()
  const filteredStaff = contacts.filter(u =>
    !q || u.full_name.toLowerCase().includes(q) || u.staff_id.toLowerCase().includes(q)
  )
  const filteredDrivers = drivers.filter(d =>
    !q || d.name.toLowerCase().includes(q)
       || d.driver_id.toLowerCase().includes(q)
       || (d.phone ?? '').includes(q)
       || (d.vehicle_plate ?? '').toLowerCase().includes(q)
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
            <h2 className="font-bold text-gray-800">Kontak Cabang</h2>
            <p className="text-[11px] text-gray-400">Ketuk staff untuk chat pribadi</p>
          </div>
          <button onClick={onClose} aria-label="Tutup"><X size={20} className="text-gray-400" /></button>
        </div>

        <div className="px-5 pb-2 flex gap-2">
          <button
            onClick={() => setTab('staff')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
              tab === 'staff' ? 'bg-primary/10 text-secondary' : 'bg-gray-50 text-gray-400'
            }`}
          >
            <Users size={13} />
            Staff <span className="text-[10px] opacity-70">({contacts.length})</span>
          </button>
          <button
            onClick={() => setTab('driver')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
              tab === 'driver' ? 'bg-amber-100 text-amber-700' : 'bg-gray-50 text-gray-400'
            }`}
          >
            <Car size={13} />
            Driver <span className="text-[10px] opacity-70">({drivers.length})</span>
          </button>
        </div>

        <div className="px-5 pb-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-2.5 text-gray-400" />
            <input
              type="text"
              placeholder={tab === 'staff' ? 'Cari nama / ID staff...' : 'Cari nama / ID driver / plat...'}
              value={search}
              onChange={e => onSearchChange(e.target.value)}
              className="input pl-9 text-sm w-full"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3">
          {loading && <p className="text-center text-gray-400 text-sm py-6">Memuat...</p>}

          {!loading && tab === 'staff' && filteredStaff.length === 0 && (
            <p className="text-center text-gray-400 text-sm py-6">Tidak ada staff cocok di cabang ini.</p>
          )}
          {!loading && tab === 'staff' && filteredStaff.map(u => (
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

          {!loading && tab === 'driver' && filteredDrivers.length === 0 && (
            <p className="text-center text-gray-400 text-sm py-6">Tidak ada driver terdaftar untuk cabang ini.</p>
          )}
          {!loading && tab === 'driver' && filteredDrivers.map(d => (
            <div
              key={d.id}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 text-left"
            >
              <div className="w-9 h-9 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center font-bold text-sm flex-shrink-0">
                {d.name?.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-800 truncate">{d.name}</p>
                <p className="text-[11px] text-gray-400 truncate">
                  {d.driver_id} • {d.branches?.name ?? '—'}
                  {d.vehicle_plate ? ` • ${d.vehicle_plate}` : ''}
                </p>
              </div>
              {d.phone && (
                <a
                  href={`tel:${d.phone}`}
                  className="flex-shrink-0 flex items-center gap-1 text-[11px] font-semibold text-green-600 bg-green-50 hover:bg-green-100 px-2.5 py-1.5 rounded-lg"
                  title={`Telepon ${d.phone}`}
                >
                  <Phone size={12} /> {d.phone}
                </a>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
