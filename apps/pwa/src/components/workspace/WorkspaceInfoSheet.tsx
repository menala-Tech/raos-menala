'use client'

import { ArrowLeft, Bell, BellOff, ChevronRight, Loader2, LogOut, MessageCircle, Pin, PinOff, Settings, Trash2, X } from 'lucide-react'
import clsx from 'clsx'
import type { ChatRoom, UserProfile } from '@/types'
import { CATEGORY_LABELS, getRoomStyle, NON_DEFAULT_CATEGORIES, type RoomPrefs, type RoomSheet, type WorkspaceMember } from './types'

interface Props {
  sheet: RoomSheet
  room: ChatRoom
  user: UserProfile | null
  prefs: RoomPrefs
  members: WorkspaceMember[]
  membersLoading: boolean
  onOpenPribadi: (otherUserId: string) => void
  onToggleNotif: () => void
  onTogglePinned: () => void
  onUpdateRetention: (days: number | null) => void
  onClearAllMessages: () => void
  onLeaveRoom: () => void
  onGotoInfo: () => void
  onGotoSettings: () => void
  onClose: () => void
}

const RETENTION_OPTIONS = [
  { val: null, label: 'Tidak' },
  { val: 7,    label: '7 hari' },
  { val: 30,   label: '30 hari' },
  { val: 90,   label: '90 hari' },
] as const

export default function WorkspaceInfoSheet({
  sheet, room, user, prefs, members, membersLoading,
  onOpenPribadi, onToggleNotif, onTogglePinned, onUpdateRetention, onClearAllMessages, onLeaveRoom,
  onGotoInfo, onGotoSettings, onClose,
}: Props) {
  const style = getRoomStyle(room.category)
  const catLabel = CATEGORY_LABELS[room.category] ?? room.category
  const canLeave = NON_DEFAULT_CATEGORIES.includes(room.category)
  const roomName = String(room.name ?? '').trim() || 'Workspace'
  const roomInitial = roomName.charAt(0)

  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end" onClick={onClose}>
      <div className="bg-white rounded-t-3xl shadow-2xl max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>

        {sheet === 'info' && (
          <div className="px-5 pb-8">
            <div className="flex items-center justify-between mb-5">
              <p className="font-bold text-gray-800 text-base">Info Workspace</p>
              <button onClick={onClose} aria-label="Tutup"><X size={20} className="text-gray-400" /></button>
            </div>
            <div className="flex flex-col items-center mb-6">
              <div className={`w-20 h-20 rounded-full flex items-center justify-center font-black text-3xl shadow-md mb-3 ${style.bg} ${style.text}`}>
                {roomInitial}
              </div>
              <p className="font-black text-gray-900 text-lg text-center">{roomName}</p>
              <span className={`mt-1.5 px-3 py-0.5 rounded-full text-xs font-semibold ${style.lightBg}`}>{catLabel}</span>
            </div>
            {room.description && (
              <div className="bg-gray-50 rounded-2xl px-4 py-3 mb-4">
                <p className="text-xs font-semibold text-gray-500 mb-1">Deskripsi</p>
                <p className="text-sm text-gray-700 leading-relaxed">{room.description}</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-gray-50 rounded-2xl px-4 py-3 text-center">
                <p className="text-[10px] text-gray-400 font-semibold mb-0.5">STATUS</p>
                <p className="text-sm font-bold text-green-600">Aktif</p>
              </div>
              <div className="bg-gray-50 rounded-2xl px-4 py-3 text-center">
                <p className="text-[10px] text-gray-400 font-semibold mb-0.5">ANGGOTA</p>
                {membersLoading
                  ? <Loader2 size={14} className="animate-spin mx-auto text-gray-400" />
                  : <p className="text-sm font-bold text-gray-700">
                      {members.length > 0 ? members.length + ' staff' : 'Semua Staff'}
                    </p>}
              </div>
            </div>
            {members.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-semibold text-gray-500 mb-2">Anggota ({members.length})</p>
                <div className="max-h-[280px] overflow-y-auto space-y-1 pr-1">
                  {members.map(m => {
                    const p = m.user_profiles
                    const isSelf = m.user_id === user?.id
                    return (
                      <button
                        key={m.user_id}
                        onClick={() => !isSelf && onOpenPribadi(m.user_id)}
                        disabled={isSelf}
                        className={clsx(
                          'w-full flex items-center gap-3 px-2 py-2 rounded-lg text-left transition-colors',
                          isSelf ? 'opacity-60 cursor-default' : 'hover:bg-gray-100 active:bg-gray-200'
                        )}
                      >
                        <div className="w-9 h-9 rounded-full bg-secondary text-white flex items-center justify-center text-sm font-bold flex-shrink-0">
                          {(p?.full_name ?? '?').charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-800 truncate">
                            {p?.full_name ?? 'Staff'}{isSelf ? ' (Saya)' : ''}
                          </p>
                          <p className="text-[10px] text-gray-400 capitalize">{p?.role ?? ''}</p>
                        </div>
                        {!isSelf && <MessageCircle size={14} className="text-primary flex-shrink-0" />}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
            <button
              onClick={onGotoSettings}
              className="w-full flex items-center gap-3 bg-gray-50 hover:bg-gray-100 rounded-2xl px-4 py-3.5 transition-colors"
            >
              <Settings size={18} className="text-gray-500" />
              <span className="flex-1 text-sm font-semibold text-gray-700 text-left">Pengaturan Workspace</span>
              <ChevronRight size={16} className="text-gray-400" />
            </button>
          </div>
        )}

        {sheet === 'settings' && (
          <div className="px-5 pb-8">
            <div className="flex items-center gap-3 mb-5">
              <button onClick={onGotoInfo} aria-label="Kembali"><ArrowLeft size={20} className="text-gray-500" /></button>
              <p className="font-bold text-gray-800 text-base flex-1">Pengaturan Workspace</p>
              <button onClick={onClose} aria-label="Tutup"><X size={20} className="text-gray-400" /></button>
            </div>
            <div className="flex items-center gap-3 bg-gray-50 rounded-2xl px-4 py-3 mb-5">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-sm flex-shrink-0 ${style.bg} ${style.text}`}>
                {roomInitial}
              </div>
              <div>
                <p className="font-bold text-sm text-gray-800">{roomName}</p>
                <p className="text-[10px] text-gray-400 capitalize">{catLabel}</p>
              </div>
            </div>
            <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden mb-4">
              {([
                { key: 'notif', icon: prefs.notif ? Bell : BellOff, label: 'Notifikasi', sub: prefs.notif ? 'Aktif' : 'Nonaktif — tanpa notifikasi', val: prefs.notif, fn: onToggleNotif },
                { key: 'pin',   icon: prefs.pinned ? Pin : PinOff, label: 'Sematkan Workspace', sub: prefs.pinned ? 'Disematkan di daftar' : 'Tidak disematkan', val: prefs.pinned, fn: onTogglePinned },
              ]).map((item, i) => {
                const Icon = item.icon
                return (
                  <div key={item.key} className={clsx('flex items-center gap-3 px-4 py-4', i === 0 && 'border-b border-gray-50')}>
                    <Icon size={18} className={item.val ? 'text-primary flex-shrink-0' : 'text-gray-400 flex-shrink-0'} />
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-gray-800">{item.label}</p>
                      <p className="text-[10px] text-gray-400">{item.sub}</p>
                    </div>
                    <button
                      onClick={item.fn}
                      className={clsx('relative w-11 h-6 rounded-full transition-colors flex-shrink-0', item.val ? 'bg-primary' : 'bg-gray-200')}
                      aria-label={item.label}
                    >
                      <span className={clsx('absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform', item.val ? 'translate-x-5' : 'translate-x-0.5')} />
                    </button>
                  </div>
                )
              })}
            </div>
            <div className="bg-yellow-50 border border-yellow-100 rounded-2xl px-4 py-3 mb-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-yellow-700">Retensi Pesan</p>
                  <p className="text-[11px] text-yellow-600 mt-0.5">
                    {room.auto_delete_days
                      ? `Otomatis dihapus setelah ${room.auto_delete_days} hari (pesan yang di-pin tetap disimpan)`
                      : 'Tidak aktif — pesan disimpan selamanya'}
                  </p>
                </div>
              </div>
              {user && (
                <div className="flex gap-1.5 mt-3">
                  {RETENTION_OPTIONS.map(opt => {
                    const isActive = (room.auto_delete_days ?? null) === opt.val
                    return (
                      <button
                        key={opt.label}
                        onClick={() => onUpdateRetention(opt.val)}
                        className={clsx(
                          'flex-1 text-[11px] font-bold py-1.5 rounded-lg transition-colors',
                          isActive ? 'bg-yellow-500 text-white' : 'bg-white border border-yellow-200 text-yellow-800'
                        )}
                      >
                        {opt.label}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
            {user && (
              <button
                onClick={onClearAllMessages}
                className="w-full flex items-center justify-center gap-2 text-red-600 border border-red-200 bg-red-50 hover:bg-red-100 rounded-2xl px-4 py-3.5 transition-colors mt-2"
              >
                <Trash2 size={16} /><span className="text-sm font-semibold">Hapus Semua Pesan (untuk Saya)</span>
              </button>
            )}
            {canLeave && (
              <button
                onClick={onLeaveRoom}
                className="w-full flex items-center justify-center gap-2 text-red-500 border border-red-100 bg-red-50 hover:bg-red-100 rounded-2xl px-4 py-3.5 transition-colors mt-2"
              >
                <LogOut size={16} /><span className="text-sm font-semibold">Tinggalkan Workspace</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
