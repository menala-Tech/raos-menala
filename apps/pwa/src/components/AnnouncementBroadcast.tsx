'use client'

import { useEffect, useState } from 'react'
import { Loader2, Megaphone, Send } from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface Props {
  senderId: string
  senderRole: string
}

/**
 * Announcement broadcast tool untuk direksi/admin/management.
 *
 * Post pesan ke room global "Pengumuman" (branch_id IS NULL). Trigger DB
 * `raos_notify_new_chat_message` otomatis dispatch push kategori
 * 'pengumuman' ke semua anggota room (dan filter notification_prefs
 * per user).
 *
 * SSOT: chat_messages. Tidak ada tabel/api baru — hanya UI khusus untuk
 * broadcast cepat tanpa harus buka /chat.
 */

const ALLOWED_ROLES = ['admin', 'management', 'direksi']

export default function AnnouncementBroadcast({ senderId, senderRole }: Props) {
  const [roomId, setRoomId] = useState<string | null>(null)
  const [roomError, setRoomError] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [lastSentAt, setLastSentAt] = useState<Date | null>(null)

  useEffect(() => {
    supabase.from('chat_rooms')
      .select('id, name, branch_id, is_active')
      .ilike('name', 'pengumuman%')
      .is('branch_id', null)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) { setRoomError(error.message); return }
        if (!data) { setRoomError('Room "Pengumuman" tidak ditemukan.'); return }
        setRoomId(data.id)
      })
  }, [])

  if (!ALLOWED_ROLES.includes(senderRole)) return null

  async function handleSend() {
    if (!roomId) return
    const content = text.trim()
    if (!content) return
    setSending(true)
    const { error } = await supabase.from('chat_messages').insert({
      room_id: roomId,
      sender_id: senderId,
      type: 'text',
      content,
    })
    setSending(false)
    if (error) { alert('Gagal broadcast: ' + error.message); return }
    setText('')
    setLastSentAt(new Date())
  }

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-3">
        <div className="bg-amber-100 rounded-lg p-1.5"><Megaphone size={16} className="text-amber-700" /></div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-gray-800">Broadcast Pengumuman</p>
          <p className="text-[10px] text-gray-400">
            Post ke room global Pengumuman — semua staff aktif dapat notif push
          </p>
        </div>
      </div>

      {roomError && (
        <p className="text-[11px] text-red-500 bg-red-50 px-3 py-2 rounded-lg mb-2">
          {roomError}
        </p>
      )}

      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Tulis pengumuman... (mis. jadwal libur, perubahan operasional, apresiasi)"
        rows={3}
        maxLength={2000}
        disabled={sending || !roomId}
        className="w-full text-sm bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-amber-400 disabled:opacity-50 resize-none"
      />

      <div className="flex items-center justify-between mt-2">
        <p className="text-[10px] text-gray-400">
          {text.length}/2000
          {lastSentAt && (
            <span className="ml-2 text-emerald-600">
              ✓ Terkirim {lastSentAt.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </p>
        <button
          onClick={handleSend}
          disabled={sending || !roomId || !text.trim()}
          className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white font-semibold text-xs px-4 py-2 rounded-lg disabled:opacity-40"
        >
          {sending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
          {sending ? 'Mengirim...' : 'Broadcast'}
        </button>
      </div>
    </div>
  )
}
