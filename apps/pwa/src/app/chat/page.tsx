'use client'

import { Suspense, useEffect, useState, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import AppShell from '@/components/layout/AppShell'
import SwipeBackWrapper from '@/components/SwipeBackWrapper'
import { ArrowLeft, Send, MessageCircle } from 'lucide-react'
import Link from 'next/link'
import type { ChatRoom, ChatMessage, UserProfile } from '@/types'
import clsx from 'clsx'

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
        .from('user_profiles')
        .select('*, branches(*)')
        .eq('id', session.user.id)
        .single()
      setUser(profile)

      const { data: roomData } = await supabase
        .from('chat_rooms')
        .select('*')
        .eq('is_active', true)
        .order('name')
      setRooms(roomData ?? [])

      // Deep link ?room=umum (dipakai dari tombol "Hubungi Admin")
      const targetCategory = searchParams.get('room')
      if (targetCategory) {
        const match = roomData?.find(r => r.category === targetCategory)
        if (match) setActiveRoom(match)
      }
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  useEffect(() => {
    if (!activeRoom) return
    loadMessages(activeRoom.id)

    const channel = supabase
      .channel(`room:${activeRoom.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
        filter: `room_id=eq.${activeRoom.id}`,
      }, payload => {
        setMessages(prev => [...prev, payload.new as ChatMessage])
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [activeRoom])

  async function loadMessages(roomId: string) {
    const { data } = await supabase
      .from('chat_messages')
      .select('*, user_profiles(full_name, role)')
      .eq('room_id', roomId)
      .order('created_at')
      .limit(50)
    setMessages(data ?? [])
    setTimeout(() => bottomRef.current?.scrollIntoView(), 100)
  }

  async function sendMessage() {
    if (!text.trim() || !activeRoom || !user) return
    setSending(true)
    await supabase.from('chat_messages').insert({
      room_id: activeRoom.id,
      sender_id: user.id,
      type: 'text',
      content: text.trim(),
    })
    setText('')
    setSending(false)
  }

  if (activeRoom) {
    return (
      <SwipeBackWrapper onBack={() => setActiveRoom(null)}>
      <div className="flex flex-col h-screen max-w-md mx-auto">
        {/* Chat Header */}
        <div className="bg-secondary text-white px-4 pt-10 pb-3 flex items-center gap-3 flex-shrink-0">
          <button onClick={() => setActiveRoom(null)}>
            <ArrowLeft size={22} />
          </button>
          <div className="flex-1">
            <p className="font-bold text-sm">{activeRoom.name}</p>
            <p className="text-white/50 text-xs">{activeRoom.category}</p>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 bg-gray-50">
          {messages.map(msg => {
            const isMe = msg.sender_id === user?.id
            return (
              <div key={msg.id} className={clsx('flex', isMe ? 'justify-end' : 'justify-start')}>
                <div className={clsx(
                  'max-w-[75%] px-3 py-2 rounded-2xl text-sm',
                  isMe
                    ? 'bg-primary text-white rounded-br-sm'
                    : 'bg-white text-gray-800 shadow-sm rounded-bl-sm'
                )}>
                  {!isMe && (
                    <p className="text-[10px] font-semibold text-primary mb-1">
                      {(msg as any).user_profiles?.full_name}
                    </p>
                  )}
                  <p>{msg.content}</p>
                  <p className={clsx('text-[9px] mt-1', isMe ? 'text-white/60' : 'text-gray-400')}>
                    {new Date(msg.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            )
          })}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="bg-white border-t px-3 py-2 flex items-center gap-2 flex-shrink-0">
          <input
            type="text"
            placeholder="Ketik pesan..."
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendMessage()}
            className="flex-1 bg-gray-100 rounded-xl px-4 py-2 text-sm focus:outline-none"
          />
          <button
            onClick={sendMessage}
            disabled={!text.trim() || sending}
            className="bg-primary text-white p-2.5 rounded-xl disabled:opacity-50"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
      </SwipeBackWrapper>
    )
  }

  return (
    <AppShell>
      <div className="bg-secondary text-white px-4 pt-10 pb-4 flex items-center gap-3">
        <Link href="/dashboard"><ArrowLeft size={22} /></Link>
        <h1 className="font-bold text-base">Chat Room Staff</h1>
      </div>

      <div className="px-4 py-3 space-y-2">
        {rooms.map(room => (
          <button
            key={room.id}
            onClick={() => setActiveRoom(room)}
            className="card w-full flex items-center gap-3 text-left"
          >
            <div className="bg-primary/10 p-2.5 rounded-xl">
              <MessageCircle size={20} className="text-primary" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-sm text-gray-800">{room.name}</p>
              <p className="text-xs text-gray-400 capitalize">{room.category}</p>
            </div>
          </button>
        ))}
      </div>
    </AppShell>
  )
}
