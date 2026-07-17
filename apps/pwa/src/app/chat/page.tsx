'use client'

import { Suspense, useCallback, useEffect, useState, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import AppShell from '@/components/layout/AppShell'
import SwipeBackWrapper from '@/components/SwipeBackWrapper'
import MenalaLogo from '@/components/MenalaLogo'
import {
  ArrowLeft, Send, MessageCircle, Users, Bell, Search,
  Paperclip, FileText, X, Loader2, Image as ImageIcon, Download,
} from 'lucide-react'
import Link from 'next/link'
import type { ChatRoom, ChatRoomWithMeta, ChatMessage, UserProfile } from '@/types'

type FilterTab = 'semua' | 'grup' | 'lokasi' | 'pribadi'

const GRUP_CATEGORIES = ['umum', 'operasional', 'driver_support', 'proyek']

function matchesFilter(room: ChatRoomWithMeta, tab: FilterTab): boolean {
  if (tab === 'semua') return true
  if (tab === 'lokasi') return room.category === 'lokasi'
  if (tab === 'pribadi') return room.category === 'pribadi'
  if (tab === 'grup') return GRUP_CATEGORIES.includes(room.category)
  return true
}

function formatLastMessageTime(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
  const diffMs = now.getTime() - d.getTime()
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (days === 1) return 'Kemarin'
  if (days < 7) return d.toLocaleDateString('id-ID', { weekday: 'short' })
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

import clsx from 'clsx'

const ROOM_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  umum:        { bg: 'bg-green-600',  text: 'text-white', label: 'U' },
  lokasi:      { bg: 'bg-primary',    text: 'text-secondary', label: 'L' },
  operasional: { bg: 'bg-blue-600',   text: 'text-white', label: 'O' },
  driver:      { bg: 'bg-orange-500', text: 'text-white', label: 'D' },
  proyek:      { bg: 'bg-purple-600', text: 'text-white', label: 'P' },
}

function getRoomStyle(category: string) {
  const key = Object.keys(ROOM_COLORS).find(k => category.toLowerCase().includes(k)) ?? 'umum'
  return ROOM_COLORS[key]
}

export default function ChatPage() {
  return (
    <Suspense fallback={null}>
      <ChatPageInner />
    </Suspense>
  )
}

function ChatPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [user, setUser] = useState<UserProfile | null>(null)
  const [rooms, setRooms] = useState<ChatRoomWithMeta[]>([])
  const [activeRoom, setActiveRoom] = useState<ChatRoom | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [filterTab, setFilterTab] = useState<FilterTab>('semua')
  const [searchQuery, setSearchQuery] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  // --- Attachment state ---
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [pendingPreview, setPendingPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)

  const loadRooms = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_chat_rooms_for_user')
    if (error) { console.error('loadRooms error:', error.message); return }
    setRooms((data ?? []) as ChatRoomWithMeta[])
  }, [])

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/'); return }
      const { data: profile } = await supabase
        .from('user_profiles').select('*, branches(*)').eq('id', session.user.id).single()
      setUser(profile)
      await loadRooms()
      const targetCategory = searchParams.get('room')
      if (targetCategory) {
        const { data: roomData } = await supabase
          .from('chat_rooms').select('*').eq('category', targetCategory).eq('is_active', true).limit(1).single()
        if (roomData) setActiveRoom(roomData)
      }
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  useEffect(() => {
    if (activeRoom === null && user) loadRooms()
  }, [activeRoom, user, loadRooms])

  const loadMessages = useCallback(async (roomId: string) => {
    const { data } = await supabase
      .from('chat_messages')
      .select('*, user_profiles(full_name, role)')
      .eq('room_id', roomId).order('created_at').limit(50)
    setMessages(data ?? [])
    setTimeout(() => bottomRef.current?.scrollIntoView(), 100)
  }, [])

  useEffect(() => {
    if (!activeRoom) return
    loadMessages(activeRoom.id)
    supabase.rpc('mark_chat_room_read', { p_room_id: activeRoom.id }).then(({ error }) => {
      if (error) console.error('mark_chat_room_read error:', error.message)
    })
    const channel = supabase
      .channel(`room:${activeRoom.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `room_id=eq.${activeRoom.id}` },
        payload => {
          const newMsg = payload.new as ChatMessage
          setMessages(prev => (prev.some(m => m.id === newMsg.id) ? prev : [...prev, newMsg]))
          setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
          supabase.rpc('mark_chat_room_read', { p_room_id: activeRoom.id })
        })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [activeRoom, loadMessages])

  // --- Text message ---
  async function sendMessage() {
    if (!text.trim() || !activeRoom || !user) return
    setSending(true)
    const content = text.trim()
    setText('')
    const { data, error } = await supabase.from('chat_messages').insert({
      room_id: activeRoom.id, sender_id: user.id, type: 'text', content,
    }).select('*, user_profiles(full_name, role)').single()
    setSending(false)
    if (error) { alert('Gagal kirim pesan:\n' + error.message); setText(content); return }
    if (data) {
      setMessages(prev => (prev.some(m => m.id === data.id) ? prev : [...prev, data as ChatMessage]))
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    }
  }

  // --- File selection ---
  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPendingFile(file)
    if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file)
      setPendingPreview(url)
    } else {
      setPendingPreview(null)
    }
  }

  function clearPendingFile() {
    if (pendingPreview) URL.revokeObjectURL(pendingPreview)
    setPendingFile(null)
    setPendingPreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // --- Send attachment ---
  async function sendWithAttachment() {
    if (!pendingFile || !activeRoom || !user) return
    setUploading(true)

    const safeName = pendingFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const storagePath = `${user.id}/${activeRoom.id}/${Date.now()}-${safeName}`

    const { error: uploadError } = await supabase.storage
      .from('chat_attachments')
      .upload(storagePath, pendingFile, { upsert: false })

    if (uploadError) {
      alert('Gagal upload file:\n' + uploadError.message)
      setUploading(false)
      return
    }

    const { data: { publicUrl } } = supabase.storage
      .from('chat_attachments')
      .getPublicUrl(storagePath)

    const msgType = pendingFile.type.startsWith('image/') ? 'image' : 'file'

    const { data: msg, error: msgError } = await supabase
      .from('chat_messages')
      .insert({
        room_id: activeRoom.id,
        sender_id: user.id,
        type: msgType,
        content: pendingFile.name,
        media_url: publicUrl,
      })
      .select('*, user_profiles(full_name, role)')
      .single()

    if (msgError) {
      alert('Gagal kirim pesan:\n' + msgError.message)
      setUploading(false)
      return
    }

    if (msg) {
      await supabase.from('chat_message_attachments').insert({
        message_id: msg.id,
        room_id: activeRoom.id,
        uploader_id: user.id,
        file_name: pendingFile.name,
        file_size: pendingFile.size,
        mime_type: pendingFile.type,
        storage_path: storagePath,
        url: publicUrl,
      })
      setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg as ChatMessage])
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    }

    clearPendingFile()
    setUploading(false)
  }

  /* ===== ROOM CHAT VIEW ===== */
  if (activeRoom) {
    const style = getRoomStyle(activeRoom.category)
    return (
      <SwipeBackWrapper onBack={() => setActiveRoom(null)}>
        <div className="flex flex-col h-screen max-w-md mx-auto">

          {/* Lightbox */}
          {lightboxUrl && (
            <div
              className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center"
              onClick={() => setLightboxUrl(null)}
            >
              <button className="absolute top-5 right-5 text-white/70 hover:text-white z-10">
                <X size={28} />
              </button>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={lightboxUrl}
                alt="Preview"
                className="max-w-[92vw] max-h-[85vh] object-contain rounded-xl shadow-2xl"
                onClick={e => e.stopPropagation()}
              />
              <a
                href={lightboxUrl}
                target="_blank"
                rel="noopener noreferrer"
                download
                onClick={e => e.stopPropagation()}
                className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2
                           bg-white/10 hover:bg-white/20 text-white text-xs font-semibold
                           px-5 py-2.5 rounded-full backdrop-blur-sm transition-colors"
              >
                <Download size={14} /> Unduh Gambar
              </a>
            </div>
          )}

          {/* Header */}
          <div className="bg-secondary text-white px-4 pt-10 pb-3 flex items-center gap-3 flex-shrink-0">
            <button onClick={() => setActiveRoom(null)} className="text-white/70">
              <ArrowLeft size={22} />
            </button>
            <div className={`w-9 h-9 rounded-full flex items-center justify-center font-black text-sm flex-shrink-0 ${style.bg} ${style.text}`}>
              {style.label}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm truncate">{activeRoom.name}</p>
              <p className="text-white/40 text-xs capitalize">{activeRoom.category}</p>
            </div>
            <Bell size={18} className="text-white/50" />
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 bg-gray-50">
            {messages.length === 0 && (
              <div className="text-center py-10 text-gray-400">
                <MessageCircle size={32} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">Belum ada pesan di room ini</p>
              </div>
            )}
            {messages.map(msg => {
              const isMe = msg.sender_id === user?.id
              const senderName = (msg as any).user_profiles?.full_name ?? 'Unknown'
              const senderRole = (msg as any).user_profiles?.role ?? ''
              return (
                <div key={msg.id} className={clsx('flex', isMe ? 'justify-end' : 'justify-start')}>
                  <div className="max-w-[78%] space-y-1">
                    {!isMe && (
                      <p className="text-[10px] font-bold text-primary ml-1 capitalize">
                        {senderName} · {senderRole}
                      </p>
                    )}
                    <div className={clsx(
                      'px-3 py-2 rounded-2xl text-sm',
                      isMe
                        ? 'bg-secondary text-white rounded-br-sm'
                        : 'bg-white text-gray-800 shadow-sm rounded-bl-sm'
                    )}>
                      {/* IMAGE */}
                      {msg.type === 'image' && msg.media_url && (
                        <button
                          onClick={() => setLightboxUrl(msg.media_url!)}
                          className="block mb-1.5 rounded-xl overflow-hidden"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={msg.media_url}
                            alt={msg.content || 'Gambar'}
                            className="max-w-[200px] w-full object-cover rounded-xl"
                          />
                        </button>
                      )}

                      {/* FILE */}
                      {msg.type === 'file' && msg.media_url && (
                        <a
                          href={msg.media_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          download
                          className={clsx(
                            'flex items-center gap-2.5 rounded-xl px-3 py-2 mb-1.5 transition-colors',
                            isMe ? 'bg-white/10 hover:bg-white/20' : 'bg-gray-100 hover:bg-gray-200'
                          )}
                        >
                          <FileText size={20} className={clsx('flex-shrink-0', isMe ? 'text-primary' : 'text-blue-500')} />
                          <div className="min-w-0">
                            <p className="text-xs font-semibold truncate max-w-[140px]">{msg.content || 'File'}</p>
                            <p className={clsx('text-[10px]', isMe ? 'text-white/50' : 'text-gray-400')}>Ketuk untuk unduh</p>
                          </div>
                          <Download size={14} className={isMe ? 'text-white/50' : 'text-gray-400'} />
                        </a>
                      )}

                      {/* TEXT (or caption for image/file) */}
                      {msg.type === 'text' && (
                        <p className="leading-relaxed">{msg.content}</p>
                      )}

                      <p className={clsx('text-[9px] mt-1', isMe ? 'text-white/50' : 'text-gray-300')}>
                        {new Date(msg.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                </div>
              )
            })}
            <div ref={bottomRef} />
          </div>

          {/* Attachment preview bar */}
          {pendingFile && (
            <div className="bg-gray-50 border-t border-gray-200 px-3 py-2 flex-shrink-0">
              {pendingPreview ? (
                <div className="relative w-20 h-20">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={pendingPreview} alt="preview" className="w-full h-full object-cover rounded-xl shadow" />
                  <button
                    onClick={clearPendingFile}
                    className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center shadow"
                  >
                    <X size={11} strokeWidth={3} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 bg-white rounded-xl px-3 py-2 shadow-sm max-w-xs">
                  <FileText size={18} className="text-blue-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-700 truncate">{pendingFile.name}</p>
                    <p className="text-[10px] text-gray-400">{formatFileSize(pendingFile.size)}</p>
                  </div>
                  <button onClick={clearPendingFile} className="text-gray-400 ml-1">
                    <X size={14} />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Input bar */}
          <div className="bg-white border-t border-gray-100 px-3 py-2.5 flex items-center gap-2 flex-shrink-0">
            {/* Attachment button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="text-gray-400 hover:text-primary transition-colors disabled:opacity-40 flex-shrink-0"
              title="Kirim foto / file"
            >
              <Paperclip size={20} />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
              className="hidden"
              onChange={handleFileSelect}
            />

            <input
              type="text"
              placeholder={pendingFile ? 'Tambah caption (opsional)...' : 'Ketik pesan...'}
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => {
                if (e.key !== 'Enter') return
                if (pendingFile) sendWithAttachment()
                else sendMessage()
              }}
              className="flex-1 bg-gray-100 rounded-2xl px-4 py-2.5 text-sm focus:outline-none"
              disabled={uploading}
            />

            <button
              onClick={pendingFile ? sendWithAttachment : sendMessage}
              disabled={(!text.trim() && !pendingFile) || sending || uploading}
              className="bg-primary text-secondary p-2.5 rounded-2xl disabled:opacity-40 transition-opacity flex-shrink-0"
            >
              {uploading
                ? <Loader2 size={18} className="animate-spin" />
                : <Send size={18} strokeWidth={2.5} />
              }
            </button>
          </div>
        </div>
      </SwipeBackWrapper>
    )
  }

  /* ===== ROOM LIST VIEW ===== */
  return (
    <AppShell>
      {/* Header */}
      <div className="bg-secondary text-white px-4 pt-10 pb-5 sticky top-0 z-30">
        <div className="flex items-center gap-3 mb-3">
          <Link href="/dashboard"><ArrowLeft size={22} className="text-white/70" /></Link>
          <div className="flex-1">
            <MenalaLogo size={28} showText />
          </div>
        </div>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-black text-xl">Chat Room Staff</h1>
            <p className="text-white/50 text-xs mt-0.5">
              Komunikasi cepat, koordinasi akurat
            </p>
          </div>
          <div className="bg-white/10 rounded-xl p-2 mt-1">
            <Users size={18} className="text-white/60" />
          </div>
        </div>

        {/* Search rooms */}
        <div className="relative mt-3">
          <Search className="absolute left-3 top-2.5 text-white/40" size={16} />
          <input
            type="text"
            placeholder="Cari room atau pesan..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-white/10 text-white placeholder-white/40 text-sm
                       pl-9 pr-3 py-2 rounded-xl border border-white/20 focus:outline-none"
          />
        </div>
      </div>

      {/* Category filter */}
      <div className="bg-white border-b border-gray-100 px-4 py-2 flex gap-2 overflow-x-auto sticky top-[8.5rem] z-20">
        {(['semua', 'grup', 'lokasi', 'pribadi'] as FilterTab[]).map(cat => {
          const active = filterTab === cat
          return (
            <button key={cat}
              onClick={() => setFilterTab(cat)}
              className={clsx(
                'flex-shrink-0 px-3 py-1 rounded-full text-xs font-semibold capitalize transition-colors',
                active ? 'bg-secondary text-white' : 'bg-gray-100 text-gray-500'
              )}>
              {cat}
            </button>
          )
        })}
      </div>

      <div className="px-4 py-3 space-y-2">
        {(() => {
          const q = searchQuery.trim().toLowerCase()
          const filtered = rooms
            .filter(r => matchesFilter(r, filterTab))
            .filter(r => !q || r.name.toLowerCase().includes(q) ||
              (r.last_message_content ?? '').toLowerCase().includes(q))
          if (filtered.length === 0) {
            return (
              <div className="text-center py-10 text-gray-400">
                <MessageCircle size={32} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">
                  {rooms.length === 0 ? 'Tidak ada room aktif' : 'Tidak ada room yang cocok'}
                </p>
              </div>
            )
          }
          return filtered.map(room => {
            const style = getRoomStyle(room.category)
            const lastMsgIsMedia = room.last_message_content &&
              (room.last_message_content === room.last_message_content)
            const preview = room.last_message_content
              ? (room.last_message_sender
                  ? `${room.last_message_sender}: ${room.last_message_content}`
                  : room.last_message_content)
              : (room.description ?? 'Belum ada pesan')
            return (
              <button
                key={room.id}
                onClick={() => setActiveRoom(room)}
                className="card w-full flex items-center gap-3 text-left active:scale-[0.99] transition-transform"
              >
                <div className={`w-11 h-11 rounded-full flex items-center justify-center font-black text-base flex-shrink-0 shadow-sm ${style.bg} ${style.text}`}>
                  {room.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className={clsx('font-bold text-sm truncate', room.unread_count > 0 ? 'text-gray-900' : 'text-gray-800')}>
                      {room.name}
                    </p>
                    <span className={clsx('text-[10px] flex-shrink-0', room.unread_count > 0 ? 'text-primary font-bold' : 'text-gray-400')}>
                      {formatLastMessageTime(room.last_message_at)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <p className={clsx('text-xs truncate flex-1',
                      room.unread_count > 0 ? 'text-gray-700 font-semibold' : 'text-gray-400')}>
                      {preview}
                    </p>
                    {room.unread_count > 0 && (
                      <span className="flex-shrink-0 bg-primary text-secondary text-[10px] font-bold min-w-[18px] h-[18px] px-1.5 rounded-full flex items-center justify-center">
                        {room.unread_count > 99 ? '99+' : room.unread_count}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            )
          })
        })()}

        <div className="pt-4 text-center">
          <p className="text-[10px] text-gray-400">
            Hanya peserta yang diundang dapat bergabung • Data terenkripsi end-to-end
          </p>
        </div>
      </div>
    </AppShell>
  )
}
