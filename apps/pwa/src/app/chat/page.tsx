'use client'

import { Suspense, useCallback, useEffect, useState, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import AppShell from '@/components/layout/AppShell'
import SwipeBackWrapper from '@/components/SwipeBackWrapper'
import MenalaLogo from '@/components/MenalaLogo'
import { ArrowLeft, Send, MessageCircle, Users, Bell, Search } from 'lucide-react'
import Link from 'next/link'
import type { ChatRoom, ChatMessage, UserProfile } from '@/types'
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
  const [rooms, setRooms] = useState<ChatRoom[]>([])
  const [activeRoom, setActiveRoom] = useState<ChatRoom | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/'); return }
      const { data: profile } = await supabase
        .from('user_profiles').select('*, branches(*)').eq('id', session.user.id).single()
      setUser(profile)

      const { data: roomData } = await supabase
        .from('chat_rooms').select('*').eq('is_active', true).order('name')
      setRooms(roomData ?? [])

      const targetCategory = searchParams.get('room')
      if (targetCategory) {
        const match = roomData?.find(r => r.category === targetCategory)
        if (match) setActiveRoom(match)
      }
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

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
    const channel = supabase
      .channel(`room:${activeRoom.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `room_id=eq.${activeRoom.id}` },
        payload => {
          setMessages(prev => [...prev, payload.new as ChatMessage])
          setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
        })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [activeRoom, loadMessages])

  async function sendMessage() {
    if (!text.trim() || !activeRoom || !user) return
    setSending(true)
    const { error } = await supabase.from('chat_messages').insert({
      room_id: activeRoom.id, sender_id: user.id, type: 'text', content: text.trim(),
    })
    setSending(false)
    if (error) {
      alert('Gagal kirim pesan:\n' + error.message)
      return
    }
    setText('')
  }

  /* ===== ROOM CHAT VIEW ===== */
  if (activeRoom) {
    const style = getRoomStyle(activeRoom.category)
    return (
      <SwipeBackWrapper onBack={() => setActiveRoom(null)}>
        <div className="flex flex-col h-screen max-w-md mx-auto">
          {/* Header */}
          <div className="bg-secondary text-white px-4 pt-10 pb-3 flex items-center gap-3 flex-shrink-0">
            <button onClick={() => setActiveRoom(null)} className="text-white/70">
              <ArrowLeft size={22} />
            </button>
            {/* Room avatar */}
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
                  <div className={clsx('max-w-[78%] space-y-1')}>
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
                      <p className="leading-relaxed">{msg.content}</p>
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

          {/* Input bar */}
          <div className="bg-white border-t border-gray-100 px-3 py-2.5 flex items-center gap-2 flex-shrink-0">
            <input
              type="text"
              placeholder="Ketik pesan..."
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendMessage()}
              className="flex-1 bg-gray-100 rounded-2xl px-4 py-2.5 text-sm focus:outline-none"
            />
            <button
              onClick={sendMessage}
              disabled={!text.trim() || sending}
              className="bg-primary text-secondary p-2.5 rounded-2xl disabled:opacity-40 transition-opacity"
            >
              <Send size={18} strokeWidth={2.5} />
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
      <div className="bg-secondary text-white px-4 pt-10 pb-5">
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
            className="w-full bg-white/10 text-white placeholder-white/40 text-sm
                       pl-9 pr-3 py-2 rounded-xl border border-white/20 focus:outline-none"
            readOnly
          />
        </div>
      </div>

      {/* Category filter */}
      <div className="bg-white border-b border-gray-100 px-4 py-2 flex gap-2 overflow-x-auto">
        {['Semua', 'Grup', 'Lokasi', 'Pribadi'].map(cat => (
          <button key={cat}
            className={clsx(
              'flex-shrink-0 px-3 py-1 rounded-full text-xs font-semibold',
              cat === 'Semua' ? 'bg-secondary text-white' : 'bg-gray-100 text-gray-500'
            )}>
            {cat}
          </button>
        ))}
      </div>

      <div className="px-4 py-3 space-y-2">
        {rooms.length === 0 && (
          <div className="text-center py-10 text-gray-400">
            <MessageCircle size={32} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">Tidak ada room aktif</p>
          </div>
        )}
        {rooms.map(room => {
          const style = getRoomStyle(room.category)
          return (
            <button
              key={room.id}
              onClick={() => setActiveRoom(room)}
              className="card w-full flex items-center gap-3 text-left active:scale-[0.99] transition-transform"
            >
              {/* Avatar */}
              <div className={`w-11 h-11 rounded-full flex items-center justify-center font-black text-base flex-shrink-0 shadow-sm ${style.bg} ${style.text}`}>
                {room.name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="font-bold text-sm text-gray-800 truncate">{room.name}</p>
                  <span className="text-[10px] text-gray-400 flex-shrink-0 ml-2">
                    {new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <p className="text-xs text-gray-400 capitalize mt-0.5 truncate">
                  {room.category} · {room.description ?? 'Room staff MENALA'}
                </p>
              </div>
            </button>
          )
        })}

        <div className="pt-4 text-center">
          <p className="text-[10px] text-gray-400">
            Hanya peserta yang diundang dapat bergabung • Data terenkripsi end-to-end
          </p>
        </div>
      </div>
    </AppShell>
  )
}
