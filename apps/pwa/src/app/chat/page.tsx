'use client'

import { Suspense, useCallback, useEffect, useState, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import AppShell from '@/components/layout/AppShell'
import SwipeBackWrapper from '@/components/SwipeBackWrapper'
import MenalaLogo from '@/components/MenalaLogo'
import DateTimeHeader from '@/components/DateTimeHeader'
import {
  ArrowLeft, Send, MessageCircle, Users, Bell, BellOff, Search,
  Paperclip, FileText, X, Loader2, Download,
  Info, Settings, ChevronRight, LogOut, Pin, PinOff,
  Copy, SmilePlus, MapPin, Navigation,
  BarChart2, CheckSquare, Square, Plus, Trash2, Lock,
  Mic, Trash, StopCircle,
} from 'lucide-react'
import Link from 'next/link'
import type { ChatRoom, ChatRoomWithMeta, ChatMessage, ChatMessageReaction, ChatPoll, ChatPollVote, ChatPollOption, UserProfile } from '@/types'

// ─── Constants ────────────────────────────────────────────────────────────────

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥']
const PIN_ROLES = ['admin', 'koordinator', 'direksi']

type FilterTab = 'semua' | 'grup' | 'lokasi' | 'pribadi'
type RoomSheet = 'none' | 'info' | 'settings'

interface RoomPrefs { notif: boolean; pinned: boolean }
const DEFAULT_ROOM_PREFS: RoomPrefs = { notif: true, pinned: false }

interface ActionMenu { msgId: string; isMe: boolean; content?: string }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getRoomPrefs(roomId: string): RoomPrefs {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(`raos_room_prefs_${roomId}`) : null
    return raw ? { ...DEFAULT_ROOM_PREFS, ...JSON.parse(raw) } : DEFAULT_ROOM_PREFS
  } catch { return DEFAULT_ROOM_PREFS }
}
function saveRoomPrefs(roomId: string, patch: Partial<RoomPrefs>) {
  localStorage.setItem(`raos_room_prefs_${roomId}`, JSON.stringify({ ...getRoomPrefs(roomId), ...patch }))
}

const GRUP_CATEGORIES = ['umum', 'operasional', 'driver_support', 'proyek']
const NON_DEFAULT_CATEGORIES = ['pribadi', 'proyek']

function matchesFilter(room: ChatRoomWithMeta, tab: FilterTab): boolean {
  if (tab === 'semua') return true
  if (tab === 'lokasi') return room.category === 'lokasi'
  if (tab === 'pribadi') return room.category === 'pribadi'
  if (tab === 'grup') return GRUP_CATEGORIES.includes(room.category)
  return true
}

function formatTime(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
  const days = Math.floor((now.getTime() - d.getTime()) / 86400000)
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

const ROOM_COLORS: Record<string, { bg: string; text: string; label: string; lightBg: string }> = {
  umum:        { bg: 'bg-green-600',  text: 'text-white',    label: 'U', lightBg: 'bg-green-100'  },
  lokasi:      { bg: 'bg-primary',    text: 'text-secondary',label: 'L', lightBg: 'bg-yellow-100' },
  operasional: { bg: 'bg-blue-600',   text: 'text-white',    label: 'O', lightBg: 'bg-blue-100'   },
  driver:      { bg: 'bg-orange-500', text: 'text-white',    label: 'D', lightBg: 'bg-orange-100' },
  proyek:      { bg: 'bg-purple-600', text: 'text-white',    label: 'P', lightBg: 'bg-purple-100' },
}
function getRoomStyle(category: string) {
  const key = Object.keys(ROOM_COLORS).find(k => category.toLowerCase().includes(k)) ?? 'umum'
  return ROOM_COLORS[key]
}

const CATEGORY_LABELS: Record<string, string> = {
  umum: 'Umum', operasional: 'Operasional', driver_support: 'Dukungan Driver',
  lokasi: 'Lokasi', pribadi: 'Pribadi', proyek: 'Proyek',
}

// ─── Entry ────────────────────────────────────────────────────────────────────

export default function ChatPage() {
  return <Suspense fallback={null}><ChatPageInner /></Suspense>
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function ChatPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [user, setUser]         = useState<UserProfile | null>(null)
  const [rooms, setRooms]       = useState<ChatRoomWithMeta[]>([])
  const [activeRoom, setActiveRoom] = useState<ChatRoom | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [text, setText]         = useState('')
  const [sending, setSending]   = useState(false)
  const [filterTab, setFilterTab] = useState<FilterTab>('semua')
  const [searchQuery, setSearchQuery] = useState('')
  const bottomRef   = useRef<HTMLDivElement>(null)
  const msgRefs     = useRef<Record<string, HTMLDivElement | null>>({})

  // Fase 2 – attachment
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [pendingFile, setPendingFile]       = useState<File | null>(null)
  const [pendingPreview, setPendingPreview] = useState<string | null>(null)
  const [uploading, setUploading]           = useState(false)
  const [lightboxUrl, setLightboxUrl]       = useState<string | null>(null)
  const [sendingLocation, setSendingLocation] = useState(false)

  // Fase 7 – polling
  const [polls, setPolls]               = useState<Record<string, { poll: ChatPoll; votes: ChatPollVote[] }>>({})
  const [pollSheet, setPollSheet]       = useState(false)
  const [pollQuestion, setPollQuestion] = useState('')
  const [pollOptions, setPollOptions]   = useState(['', ''])
  const [pollMultiple, setPollMultiple] = useState(false)
  const [pollSending, setPollSending]   = useState(false)

  // Fase 3 – sheets
  const [roomSheet, setRoomSheet]     = useState<RoomSheet>('none')
  const [roomMembers, setRoomMembers] = useState<any[]>([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [roomPrefs, setRoomPrefs]     = useState<RoomPrefs>(DEFAULT_ROOM_PREFS)

  // Fase 4 – reactions + pin
  const [reactions, setReactions]       = useState<Record<string, ChatMessageReaction[]>>({})
  const [pinnedMsg, setPinnedMsg]       = useState<ChatMessage | null>(null)
  const [actionMenu, setActionMenu]     = useState<ActionMenu | null>(null)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Voice recorder (Fase 8) — MediaRecorder blob → upload → message type 'audio'
  const [recording, setRecording]           = useState(false)
  const [recSeconds, setRecSeconds]         = useState(0)
  const [uploadingAudio, setUploadingAudio] = useState(false)
  const mediaRecRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Kontak sheet — daftar staff untuk mulai chat pribadi
  const [contactSheet, setContactSheet] = useState(false)
  const [contactList, setContactList]   = useState<Array<{ id: string; full_name: string; role: string; staff_id: string; branches?: { name: string } | null }>>([])
  const [contactLoading, setContactLoading] = useState(false)
  const [contactSearch, setContactSearch]   = useState('')
  const [openingPribadi, setOpeningPribadi] = useState<string | null>(null)

  // ── Data loaders ──────────────────────────────────────────────────────────

  const loadRooms = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_chat_rooms_for_user')
    if (!error) setRooms((data ?? []) as ChatRoomWithMeta[])
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

  useEffect(() => { if (activeRoom === null && user) loadRooms() }, [activeRoom, user, loadRooms])

  const loadMessages = useCallback(async (roomId: string) => {
    const { data } = await supabase
      .from('chat_messages')
      .select('*, user_profiles!chat_messages_sender_id_fkey(full_name, role)')
      .eq('room_id', roomId).order('created_at').limit(50)
    setMessages(data ?? [])
    setTimeout(() => bottomRef.current?.scrollIntoView(), 100)
  }, [])

  async function loadReactions(roomId: string) {
    const { data } = await supabase
      .from('chat_message_reactions').select('*').eq('room_id', roomId)
    if (!data) return
    const grouped: Record<string, ChatMessageReaction[]> = {}
    data.forEach(r => {
      if (!grouped[r.message_id]) grouped[r.message_id] = []
      grouped[r.message_id].push(r)
    })
    setReactions(grouped)
  }

  async function loadPinnedMessage(roomId: string) {
    const { data } = await supabase
      .from('chat_messages')
      .select('*, user_profiles!chat_messages_sender_id_fkey(full_name)')
      .eq('room_id', roomId).eq('is_pinned', true)
      .order('pinned_at', { ascending: false }).limit(1).maybeSingle()
    setPinnedMsg(data ?? null)
  }

  async function loadPolls(roomId: string) {
    const { data: pollData } = await supabase
      .from('chat_polls').select('*').eq('room_id', roomId)
    const { data: voteData } = await supabase
      .from('chat_poll_votes').select('*').in('poll_id', pollData?.map(p => p.id) ?? [])
    if (!pollData) return
    const map: Record<string, { poll: ChatPoll; votes: ChatPollVote[] }> = {}
    pollData.forEach(p => {
      const votes = (voteData ?? []).filter(v => v.poll_id === p.id)
      map[p.message_id] = { poll: p as ChatPoll, votes }
    })
    setPolls(map)
  }

  // Sinkron activeRoom ↔ browser history — supaya swipe back, tombol back HP
  // Android, tombol back browser desktop, dan tombol Kembali di header semua
  // konsisten kembali ke room list (BUKAN lompat ke dashboard atau halaman
  // sebelumnya di history). Push state saat open room, popstate listener
  // untuk close. Ini mekanisme SATU-SATUNYA untuk close room dari input user.
  useEffect(() => {
    if (!activeRoom) return
    const stateTag = { raosChatRoom: activeRoom.id }
    // Push entry baru — swipe/back akan popState kembali ke entry sebelumnya.
    window.history.pushState(stateTag, '', window.location.pathname + window.location.search)
    const onPop = () => {
      // Ke sini kalau user back/swipe → keluar dari room, kembali ke list.
      setActiveRoom(null)
    }
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
      // Kalau room ditutup PROGRAMMATIC (bukan lewat back — mis. leaveRoom),
      // pop state extra yang tadi kita push supaya history bersih. Kalau user
      // sudah pencet back sendiri, history sudah pop → skip. Deteksi via
      // state tag di window.history.state.
      if ((window.history.state as any)?.raosChatRoom === activeRoom.id) {
        window.history.back()
      }
    }
  }, [activeRoom])

  useEffect(() => {
    if (!activeRoom) return
    setReactions({})
    setPinnedMsg(null)
    setRoomPrefs(getRoomPrefs(activeRoom.id))
    loadMessages(activeRoom.id)
    loadReactions(activeRoom.id)
    loadPinnedMessage(activeRoom.id)
    loadPolls(activeRoom.id)
    supabase.rpc('mark_chat_room_read', { p_room_id: activeRoom.id })

    const channel = supabase
      .channel(`room:${activeRoom.id}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `room_id=eq.${activeRoom.id}` },
        payload => {
          const msg = payload.new as ChatMessage
          setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg])
          setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
          supabase.rpc('mark_chat_room_read', { p_room_id: activeRoom.id })
        })
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'chat_messages', filter: `room_id=eq.${activeRoom.id}` },
        payload => {
          const updated = payload.new as ChatMessage
          setMessages(prev => prev.map(m => m.id === updated.id ? { ...m, ...updated } : m))
          // Update pinned banner
          if (updated.is_pinned) setPinnedMsg(updated)
          else setPinnedMsg(prev => prev?.id === updated.id ? null : prev)
        })
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_message_reactions', filter: `room_id=eq.${activeRoom.id}` },
        payload => {
          const r = payload.new as ChatMessageReaction
          setReactions(prev => ({
            ...prev,
            [r.message_id]: [...(prev[r.message_id] ?? []).filter(x => x.id !== r.id), r],
          }))
        })
      .on('postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'chat_message_reactions', filter: `room_id=eq.${activeRoom.id}` },
        payload => {
          const r = payload.old as ChatMessageReaction
          setReactions(prev => ({
            ...prev,
            [r.message_id]: (prev[r.message_id] ?? []).filter(x => x.id !== r.id),
          }))
        })
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_poll_votes', filter: `poll_id=in.(select id from chat_polls where room_id=${activeRoom.id})` },
        payload => {
          const v = payload.new as ChatPollVote
          setPolls(prev => {
            const entry = Object.values(prev).find(e => e.poll.id === v.poll_id)
            if (!entry) return prev
            const msgId = entry.poll.message_id
            return {
              ...prev,
              [msgId]: { ...entry, votes: [...entry.votes.filter(x => x.id !== v.id), v] },
            }
          })
        })
      .on('postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'chat_poll_votes' },
        payload => {
          const v = payload.old as ChatPollVote
          setPolls(prev => {
            const entry = Object.values(prev).find(e => e.poll.id === v.poll_id)
            if (!entry) return prev
            const msgId = entry.poll.message_id
            return {
              ...prev,
              [msgId]: { ...entry, votes: entry.votes.filter(x => x.id !== v.id) },
            }
          })
        })
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'chat_polls', filter: `room_id=eq.${activeRoom.id}` },
        payload => {
          const updated = payload.new as ChatPoll
          setPolls(prev => {
            const msgId = updated.message_id
            if (!prev[msgId]) return prev
            return { ...prev, [msgId]: { ...prev[msgId], poll: updated } }
          })
        })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [activeRoom, loadMessages])

  // ── Messages ──────────────────────────────────────────────────────────────

  async function sendMessage() {
    if (!text.trim() || !activeRoom || !user) return
    setSending(true)
    const content = text.trim(); setText('')
    const { data, error } = await supabase.from('chat_messages').insert({
      room_id: activeRoom.id, sender_id: user.id, type: 'text', content,
    }).select('*, user_profiles!chat_messages_sender_id_fkey(full_name, role)').single()
    setSending(false)
    if (error) { alert('Gagal kirim: ' + error.message); setText(content); return }
    if (data) {
      setMessages(prev => prev.some(m => m.id === data.id) ? prev : [...prev, data as ChatMessage])
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    }
  }

  // ── Attachment (Fase 2) ───────────────────────────────────────────────────

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    setPendingFile(file)
    setPendingPreview(file.type.startsWith('image/') ? URL.createObjectURL(file) : null)
  }
  function clearPendingFile() {
    if (pendingPreview) URL.revokeObjectURL(pendingPreview)
    setPendingFile(null); setPendingPreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }
  async function sendWithAttachment() {
    if (!pendingFile || !activeRoom || !user) return
    setUploading(true)
    const safeName = pendingFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const storagePath = `${user.id}/${activeRoom.id}/${Date.now()}-${safeName}`
    const { error: upErr } = await supabase.storage.from('chat_attachments').upload(storagePath, pendingFile, { upsert: false })
    if (upErr) { alert('Gagal upload: ' + upErr.message); setUploading(false); return }
    const { data: { publicUrl } } = supabase.storage.from('chat_attachments').getPublicUrl(storagePath)
    const msgType = pendingFile.type.startsWith('image/') ? 'image' : 'file'
    const { data: msg, error: msgErr } = await supabase.from('chat_messages').insert({
      room_id: activeRoom.id, sender_id: user.id, type: msgType,
      content: pendingFile.name, media_url: publicUrl,
    }).select('*, user_profiles!chat_messages_sender_id_fkey(full_name, role)').single()
    if (!msgErr && msg) {
      await supabase.from('chat_message_attachments').insert({
        message_id: msg.id, room_id: activeRoom.id, uploader_id: user.id,
        file_name: pendingFile.name, file_size: pendingFile.size,
        mime_type: pendingFile.type, storage_path: storagePath, url: publicUrl,
      })
      setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg as ChatMessage])
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    }
    clearPendingFile(); setUploading(false)
  }

  // ── Kirim Lokasi (Fase 6) ────────────────────────────────────────────────

  async function sendLocation() {
    if (!activeRoom || !user) return
    if (!navigator.geolocation) {
      alert('Browser ini tidak mendukung GPS.')
      return
    }
    setSendingLocation(true)
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const { latitude: lat, longitude: lng, accuracy } = pos.coords
        const content = JSON.stringify({ lat, lng, accuracy: Math.round(accuracy) })
        const { data, error } = await supabase.from('chat_messages').insert({
          room_id: activeRoom.id, sender_id: user.id, type: 'location', content,
        }).select('*, user_profiles!chat_messages_sender_id_fkey(full_name, role)').single()
        setSendingLocation(false)
        if (error) { alert('Gagal kirim lokasi: ' + error.message); return }
        if (data) {
          setMessages(prev => prev.some(m => m.id === data.id) ? prev : [...prev, data as ChatMessage])
          setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
        }
      },
      err => {
        setSendingLocation(false)
        const msg = err.code === 1 ? 'Izin lokasi ditolak. Aktifkan GPS di pengaturan browser.'
          : err.code === 2 ? 'Posisi tidak tersedia. Pastikan GPS aktif.'
          : 'GPS timeout. Coba lagi.'
        alert(msg)
      },
      { timeout: 10000, maximumAge: 30000, enableHighAccuracy: true }
    )
  }

  // ── Polling (Fase 7) ─────────────────────────────────────────────────────

  async function createPoll() {
    if (!activeRoom || !user) return
    const q = pollQuestion.trim()
    const opts = pollOptions.map(o => o.trim()).filter(Boolean)
    if (!q || opts.length < 2) return
    setPollSending(true)
    const options: ChatPollOption[] = opts.map(text => ({
      id: crypto.randomUUID(),
      text,
    }))
    // Insert pesan dulu
    const { data: msg, error: msgErr } = await supabase.from('chat_messages').insert({
      room_id: activeRoom.id, sender_id: user.id, type: 'poll', content: q,
    }).select('*, user_profiles!chat_messages_sender_id_fkey(full_name, role)').single()
    if (msgErr || !msg) { alert('Gagal buat polling'); setPollSending(false); return }
    // Insert poll
    const { data: poll, error: pollErr } = await supabase.from('chat_polls').insert({
      room_id: activeRoom.id, message_id: msg.id, creator_id: user.id,
      question: q, options, is_multiple_choice: pollMultiple,
    }).select().single()
    if (pollErr || !poll) { alert('Gagal simpan polling'); setPollSending(false); return }
    setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg as ChatMessage])
    setPolls(prev => ({ ...prev, [msg.id]: { poll: poll as ChatPoll, votes: [] } }))
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    // Reset form
    setPollQuestion(''); setPollOptions(['', '']); setPollMultiple(false)
    setPollSheet(false); setPollSending(false)
  }

  async function votePoll(poll: ChatPoll, optionId: string) {
    if (!user) return
    const myVotes = polls[poll.message_id]?.votes.filter(v => v.voter_id === user.id) ?? []
    const alreadyVoted = myVotes.find(v => v.option_id === optionId)
    if (alreadyVoted) {
      // Cabut vote
      await supabase.from('chat_poll_votes').delete().eq('id', alreadyVoted.id)
      setPolls(prev => ({
        ...prev,
        [poll.message_id]: {
          ...prev[poll.message_id],
          votes: prev[poll.message_id].votes.filter(v => v.id !== alreadyVoted.id),
        },
      }))
    } else {
      if (!poll.is_multiple_choice) {
        // Single choice: hapus vote sebelumnya
        const prev_vote = myVotes[0]
        if (prev_vote) {
          await supabase.from('chat_poll_votes').delete().eq('id', prev_vote.id)
          setPolls(prev => ({
            ...prev,
            [poll.message_id]: {
              ...prev[poll.message_id],
              votes: prev[poll.message_id].votes.filter(v => v.id !== prev_vote.id),
            },
          }))
        }
      }
      const { data } = await supabase.from('chat_poll_votes').insert({
        poll_id: poll.id, voter_id: user.id, option_id: optionId,
      }).select().single()
      if (data) {
        setPolls(prev => ({
          ...prev,
          [poll.message_id]: {
            ...prev[poll.message_id],
            votes: [...(prev[poll.message_id]?.votes ?? []), data as ChatPollVote],
          },
        }))
      }
    }
  }

  async function closePoll(poll: ChatPoll) {
    await supabase.from('chat_polls')
      .update({ is_closed: true, closed_at: new Date().toISOString() })
      .eq('id', poll.id)
    setPolls(prev => ({
      ...prev,
      [poll.message_id]: {
        ...prev[poll.message_id],
        poll: { ...poll, is_closed: true },
      },
    }))
  }

  // ── Room prefs (Fase 3) ───────────────────────────────────────────────────

  function toggleNotif() {
    if (!activeRoom) return
    const next = { ...roomPrefs, notif: !roomPrefs.notif }
    setRoomPrefs(next); saveRoomPrefs(activeRoom.id, next)
  }
  function togglePinned() {
    if (!activeRoom) return
    const next = { ...roomPrefs, pinned: !roomPrefs.pinned }
    setRoomPrefs(next); saveRoomPrefs(activeRoom.id, next)
  }

  async function openInfoSheet() {
    if (!activeRoom) return
    setRoomSheet('info'); setMembersLoading(true)
    const { data } = await supabase.from('chat_room_members')
      .select('user_id, joined_at, user_profiles(full_name, role, staff_id)')
      .eq('room_id', activeRoom.id).limit(30)
    setRoomMembers(data ?? []); setMembersLoading(false)
  }

  // ── Voice recorder (Fase 8) ──────────────────────────────────────────────
  const VOICE_MAX_SECONDS = 60

  function pickAudioMime(): string {
    // Chrome/Firefox: webm/opus. iOS Safari: mp4/aac. Fallback ke default.
    if (typeof MediaRecorder === 'undefined') return ''
    if (MediaRecorder.isTypeSupported('audio/webm')) return 'audio/webm'
    if (MediaRecorder.isTypeSupported('audio/mp4')) return 'audio/mp4'
    return ''
  }

  async function startRecording() {
    if (!activeRoom || !user || recording) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mime = pickAudioMime()
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
      audioChunksRef.current = []
      rec.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data) }
      rec.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        if (recTimerRef.current) { clearInterval(recTimerRef.current); recTimerRef.current = null }
        const blob = new Blob(audioChunksRef.current, { type: rec.mimeType || 'audio/webm' })
        // Baca durasi FINAL dari state via functional setter (recSeconds via closure
        // di sini sudah stale karena onstop diset di startRecording, sedangkan
        // state ter-update lewat tick interval).
        let finalSeconds = 0
        setRecSeconds(s => { finalSeconds = s; return s })
        if (blob.size < 500) {
          console.warn('[voice] blob terlalu kecil, skip upload:', blob.size)
          return
        }
        await uploadVoiceMessage(blob, rec.mimeType || 'audio/webm', finalSeconds)
      }
      mediaRecRef.current = rec
      rec.start()
      setRecording(true)
      setRecSeconds(0)
      recTimerRef.current = setInterval(() => {
        setRecSeconds(s => {
          if (s + 1 >= VOICE_MAX_SECONDS) { stopRecording(); return VOICE_MAX_SECONDS }
          return s + 1
        })
      }, 1000)
    } catch (err: any) {
      alert('Tidak bisa akses mikrofon. Cek izin mic di setelan browser.')
    }
  }

  function stopRecording() {
    const rec = mediaRecRef.current
    if (rec && rec.state !== 'inactive') rec.stop()
    setRecording(false)
    mediaRecRef.current = null
  }

  function cancelRecording() {
    if (recTimerRef.current) { clearInterval(recTimerRef.current); recTimerRef.current = null }
    const rec = mediaRecRef.current
    if (rec && rec.state !== 'inactive') {
      audioChunksRef.current = [] // clear chunks supaya onstop skip upload
      rec.stop()
    }
    setRecording(false)
    setRecSeconds(0)
    mediaRecRef.current = null
  }

  async function uploadVoiceMessage(blob: Blob, mimeRaw: string, seconds: number) {
    if (!activeRoom || !user) return
    setUploadingAudio(true)
    // Strip parameter (mis. "audio/webm;codecs=opus" → "audio/webm") supaya
    // match strict whitelist bucket allowed_mime_types.
    const mime = mimeRaw.split(';')[0].trim() || 'audio/webm'
    const ext = mime.includes('mp4') ? 'm4a' : (mime.includes('webm') ? 'webm' : (mime.includes('mpeg') ? 'mp3' : 'ogg'))
    const storagePath = `${user.id}/${activeRoom.id}/voice-${Date.now()}.${ext}`

    const { error: upErr } = await supabase.storage.from('chat_attachments').upload(storagePath, blob, {
      upsert: false, contentType: mime,
    })
    if (upErr) {
      console.error('[voice] upload gagal:', upErr, 'mime:', mime, 'size:', blob.size)
      alert('Gagal upload suara: ' + upErr.message)
      setUploadingAudio(false); return
    }

    const { data: { publicUrl } } = supabase.storage.from('chat_attachments').getPublicUrl(storagePath)
    const { data: msg, error: msgErr } = await supabase.from('chat_messages').insert({
      room_id: activeRoom.id, sender_id: user.id, type: 'audio',
      content: `Voice ${seconds}s`, media_url: publicUrl,
    }).select('*, user_profiles!chat_messages_sender_id_fkey(full_name, role)').single()

    if (msgErr) {
      console.error('[voice] insert message gagal:', msgErr)
      alert('Gagal simpan pesan suara: ' + msgErr.message)
      setUploadingAudio(false); return
    }

    if (msg) {
      const { error: attErr } = await supabase.from('chat_message_attachments').insert({
        message_id: msg.id, room_id: activeRoom.id, uploader_id: user.id,
        file_name: `Voice ${seconds}s`, file_size: blob.size,
        mime_type: mime, storage_path: storagePath, url: publicUrl,
      })
      if (attErr) console.warn('[voice] insert attachment metadata gagal (pesan tetap terkirim):', attErr)

      setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg as ChatMessage])
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    }
    setRecSeconds(0)
    setUploadingAudio(false)
  }

  // Kontak sheet — daftar staff aktif untuk mulai chat pribadi
  async function openContactSheet() {
    setContactSheet(true)
    setContactLoading(true)
    const { data } = await supabase
      .from('user_profiles')
      .select('id, full_name, role, staff_id, branches(name)')
      .eq('is_active', true)
      .order('full_name')
    setContactList((data ?? []).filter(u => u.id !== user?.id) as any)
    setContactLoading(false)
  }

  // Mulai / buka chat pribadi dengan staff lain. RPC handle dedup (idempotent).
  async function startPribadiChat(otherUserId: string) {
    setOpeningPribadi(otherUserId)
    const { data: roomId, error } = await supabase.rpc('get_or_create_pribadi_room', { p_other_user_id: otherUserId })
    setOpeningPribadi(null)
    if (error || !roomId) { alert('Gagal buka chat pribadi: ' + (error?.message ?? 'unknown')); return }
    const { data: room } = await supabase.from('chat_rooms').select('*').eq('id', roomId).single()
    if (room) {
      setContactSheet(false)
      setActiveRoom(room)
    }
  }

  // Fase 3 — keluar dari room (untuk kategori pribadi/proyek, bukan default channel).
  // Delete membership user → RLS `chat_room_members_delete_own` (migration raos_023)
  // memastikan user cuma bisa hapus baris miliknya sendiri.
  async function leaveRoom() {
    if (!activeRoom || !user) return
    if (!confirm(`Tinggalkan room "${activeRoom.name}"? Anda tidak akan menerima pesan baru sampai diundang ulang.`)) return
    const { error } = await supabase.from('chat_room_members')
      .delete().eq('room_id', activeRoom.id).eq('user_id', user.id)
    if (error) { alert('Gagal keluar room: ' + error.message); return }
    setRoomSheet('none')
    setActiveRoom(null) // balik ke list, useEffect akan refresh loadRooms()
  }

  // Fase 5 — admin set/ubah retensi pesan per room. Cron server-side
  // (raos_delete_expired_chat_messages) menghormati kolom auto_delete_days.
  // Kirim null = matikan retensi (pesan tidak dihapus otomatis).
  async function updateRetention(days: number | null) {
    if (!activeRoom || !user) return
    if (!PIN_ROLES.includes(user.role)) return
    const { error } = await supabase.from('chat_rooms')
      .update({ auto_delete_days: days }).eq('id', activeRoom.id)
    if (error) { alert('Gagal ubah retensi: ' + error.message); return }
    setActiveRoom({ ...activeRoom, auto_delete_days: days ?? undefined })
  }

  // ── Reactions (Fase 4) ────────────────────────────────────────────────────

  async function toggleReaction(messageId: string, emoji: string) {
    if (!user || !activeRoom) return
    const msgReactions = reactions[messageId] ?? []
    const existing = msgReactions.find(r => r.user_id === user.id && r.emoji === emoji)
    if (existing) {
      await supabase.from('chat_message_reactions').delete().eq('id', existing.id)
      setReactions(prev => ({
        ...prev,
        [messageId]: (prev[messageId] ?? []).filter(r => r.id !== existing.id),
      }))
    } else {
      const { data } = await supabase.from('chat_message_reactions')
        .insert({ message_id: messageId, room_id: activeRoom.id, user_id: user.id, emoji })
        .select().single()
      if (data) {
        setReactions(prev => ({
          ...prev,
          [messageId]: [...(prev[messageId] ?? []).filter(r => !(r.user_id === user.id && r.emoji === emoji)), data],
        }))
      }
    }
    setActionMenu(null)
  }

  // ── Pin message (Fase 4) ──────────────────────────────────────────────────

  async function pinMessage(messageId: string) {
    if (!user) return
    const { error } = await supabase.from('chat_messages')
      .update({ is_pinned: true, pinned_at: new Date().toISOString(), pinned_by: user.id })
      .eq('id', messageId)
    if (!error) {
      const msg = messages.find(m => m.id === messageId)
      if (msg) setPinnedMsg({ ...msg, is_pinned: true })
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, is_pinned: true } : m))
    }
    setActionMenu(null)
  }

  async function unpinMessage() {
    if (!pinnedMsg) return
    await supabase.from('chat_messages')
      .update({ is_pinned: false, pinned_at: null, pinned_by: null })
      .eq('id', pinnedMsg.id)
    setMessages(prev => prev.map(m => m.id === pinnedMsg.id ? { ...m, is_pinned: false } : m))
    setPinnedMsg(null)
  }

  // ── Long press ────────────────────────────────────────────────────────────

  function startLongPress(msgId: string, isMe: boolean, content?: string) {
    longPressTimer.current = setTimeout(() => {
      setActionMenu({ msgId, isMe, content })
    }, 450)
  }
  function cancelLongPress() {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null }
  }

  // ── Copy ──────────────────────────────────────────────────────────────────

  function copyText(text?: string) {
    if (!text) return
    navigator.clipboard.writeText(text).catch(() => {})
    setActionMenu(null)
  }

  // ── Reaction display helpers ──────────────────────────────────────────────

  function groupedReactions(msgId: string): { emoji: string; count: number; mine: boolean }[] {
    const list = reactions[msgId] ?? []
    const map: Record<string, { count: number; mine: boolean }> = {}
    list.forEach(r => {
      if (!map[r.emoji]) map[r.emoji] = { count: 0, mine: false }
      map[r.emoji].count++
      if (r.user_id === user?.id) map[r.emoji].mine = true
    })
    return Object.entries(map).map(([emoji, v]) => ({ emoji, ...v }))
  }

  const canPin = PIN_ROLES.includes(user?.role ?? '')

  // ─────────────────────────────────────────────────────────────────────────
  /* ===== ROOM CHAT VIEW ===== */
  // ─────────────────────────────────────────────────────────────────────────

  if (activeRoom) {
    const style    = getRoomStyle(activeRoom.category)
    const catLabel = CATEGORY_LABELS[activeRoom.category] ?? activeRoom.category
    const canLeave = NON_DEFAULT_CATEGORIES.includes(activeRoom.category)

    return (
      <SwipeBackWrapper onBack={() => window.history.back()}>
        <div className="flex flex-col h-screen max-w-md mx-auto">

          {/* ── Lightbox ──────────────────────────────────────────────────── */}
          {lightboxUrl && (
            <div className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center"
              onClick={() => setLightboxUrl(null)}>
              <button
                onClick={() => setLightboxUrl(null)}
                aria-label="Tutup"
                className="absolute top-5 right-5 w-11 h-11 rounded-full bg-white/10 backdrop-blur-sm
                           text-white flex items-center justify-center active:scale-95">
                <X size={22} />
              </button>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={lightboxUrl} alt="Preview"
                className="max-w-[92vw] max-h-[80vh] object-contain rounded-xl shadow-2xl"
                onClick={e => e.stopPropagation()} />
              <a href={lightboxUrl} target="_blank" rel="noopener noreferrer" download
                onClick={e => e.stopPropagation()}
                style={{ bottom: 'calc(28px + env(safe-area-inset-bottom))' }}
                className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2
                           bg-primary hover:bg-primary/90 text-secondary text-sm font-bold
                           px-6 py-3 rounded-full shadow-lg active:scale-95 transition-transform">
                <Download size={18} /> Unduh Gambar
              </a>
            </div>
          )}

          {/* ── Poll Sheet ───────────────────────────────────────────────── */}
          {pollSheet && (
            <div className="fixed inset-0 z-40 flex flex-col justify-end"
              onClick={() => { if (!pollSending) setPollSheet(false) }}>
              <div className="bg-white rounded-t-3xl shadow-2xl max-h-[85vh] overflow-y-auto"
                onClick={e => e.stopPropagation()}>
                <div className="flex justify-center pt-3 pb-1">
                  <div className="w-10 h-1 bg-gray-200 rounded-full" />
                </div>
                <div className="px-5 pb-8">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <BarChart2 size={18} className="text-secondary" />
                      <p className="font-bold text-gray-800 text-base">Buat Polling</p>
                    </div>
                    <button onClick={() => setPollSheet(false)} disabled={pollSending}>
                      <X size={20} className="text-gray-400" />
                    </button>
                  </div>

                  {/* Pertanyaan */}
                  <div className="mb-4">
                    <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Pertanyaan</label>
                    <input
                      type="text" maxLength={200}
                      placeholder="Tulis pertanyaan polling..."
                      value={pollQuestion} onChange={e => setPollQuestion(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-secondary"
                    />
                  </div>

                  {/* Opsi */}
                  <div className="mb-3">
                    <label className="text-xs font-semibold text-gray-500 mb-1.5 block">
                      Pilihan ({pollOptions.length}/4)
                    </label>
                    <div className="space-y-2">
                      {pollOptions.map((opt, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <input
                            type="text" maxLength={100}
                            placeholder={`Pilihan ${i + 1}`}
                            value={opt} onChange={e => {
                              const next = [...pollOptions]
                              next[i] = e.target.value
                              setPollOptions(next)
                            }}
                            className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-secondary"
                          />
                          {pollOptions.length > 2 && (
                            <button onClick={() => setPollOptions(pollOptions.filter((_, j) => j !== i))}
                              className="text-gray-300 hover:text-red-400 transition-colors flex-shrink-0">
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    {pollOptions.length < 4 && (
                      <button onClick={() => setPollOptions([...pollOptions, ''])}
                        className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-secondary">
                        <Plus size={13} /> Tambah pilihan
                      </button>
                    )}
                  </div>

                  {/* Toggle multi pilihan */}
                  <div className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3 mb-5">
                    <div>
                      <p className="text-sm font-semibold text-gray-700">Boleh pilih banyak</p>
                      <p className="text-[10px] text-gray-400">Peserta bisa memilih lebih dari satu opsi</p>
                    </div>
                    <button onClick={() => setPollMultiple(!pollMultiple)}
                      className={clsx('relative w-11 h-6 rounded-full transition-colors flex-shrink-0', pollMultiple ? 'bg-secondary' : 'bg-gray-200')}>
                      <span className={clsx('absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform', pollMultiple ? 'translate-x-5' : 'translate-x-0.5')} />
                    </button>
                  </div>

                  <button
                    onClick={createPoll}
                    disabled={pollSending || !pollQuestion.trim() || pollOptions.filter(o => o.trim()).length < 2}
                    className="w-full bg-secondary text-white font-bold py-3 rounded-2xl disabled:opacity-40 transition-opacity flex items-center justify-center gap-2">
                    {pollSending
                      ? <><Loader2 size={16} className="animate-spin" /> Membuat...</>
                      : <><BarChart2 size={16} /> Buat Polling</>}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Action menu (long press) ───────────────────────────────────── */}
          {actionMenu && (
            <div className="fixed inset-0 z-40 flex flex-col justify-end"
              onClick={() => setActionMenu(null)}>
              <div className="bg-white rounded-t-3xl shadow-2xl pb-8"
                onClick={e => e.stopPropagation()}>
                {/* Drag handle */}
                <div className="flex justify-center pt-3 pb-2">
                  <div className="w-10 h-1 bg-gray-200 rounded-full" />
                </div>

                {/* Quick emoji row */}
                <div className="px-4 py-2">
                  <p className="text-[10px] text-gray-400 font-semibold mb-2 text-center">Reaksi Cepat</p>
                  <div className="flex justify-center gap-2">
                    {QUICK_EMOJIS.map(emoji => {
                      const list = reactions[actionMenu.msgId] ?? []
                      const mine = list.some(r => r.user_id === user?.id && r.emoji === emoji)
                      return (
                        <button key={emoji}
                          onClick={() => toggleReaction(actionMenu.msgId, emoji)}
                          className={clsx(
                            'w-11 h-11 rounded-2xl text-2xl flex items-center justify-center transition-transform active:scale-95',
                            mine ? 'bg-primary/20 ring-2 ring-primary/40' : 'bg-gray-100 hover:bg-gray-200'
                          )}>
                          {emoji}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="border-t border-gray-100 mx-4 my-2" />

                {/* Actions */}
                <div className="px-4 space-y-1">
                  {/* Pin — hanya admin/koordinator/direksi */}
                  {canPin && (
                    <button
                      onClick={() => pinMessage(actionMenu.msgId)}
                      className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-gray-50 transition-colors text-left"
                    >
                      <Pin size={18} className="text-secondary" />
                      <span className="text-sm font-semibold text-gray-700">Sematkan Pesan</span>
                    </button>
                  )}

                  {/* Copy teks */}
                  {actionMenu.content && (
                    <button
                      onClick={() => copyText(actionMenu.content)}
                      className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-gray-50 transition-colors text-left"
                    >
                      <Copy size={18} className="text-gray-500" />
                      <span className="text-sm font-semibold text-gray-700">Salin Teks</span>
                    </button>
                  )}

                  <button onClick={() => setActionMenu(null)}
                    className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-gray-50 transition-colors text-left">
                    <X size={18} className="text-gray-400" />
                    <span className="text-sm font-medium text-gray-400">Batal</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Info / Settings Sheet (Fase 3) ────────────────────────────── */}
          {roomSheet !== 'none' && (
            <div className="fixed inset-0 z-40 flex flex-col justify-end"
              onClick={() => setRoomSheet('none')}>
              <div className="bg-white rounded-t-3xl shadow-2xl max-h-[80vh] overflow-y-auto"
                onClick={e => e.stopPropagation()}>
                <div className="flex justify-center pt-3 pb-1">
                  <div className="w-10 h-1 bg-gray-200 rounded-full" />
                </div>

                {/* INFO */}
                {roomSheet === 'info' && (
                  <div className="px-5 pb-8">
                    <div className="flex items-center justify-between mb-5">
                      <p className="font-bold text-gray-800 text-base">Info Room</p>
                      <button onClick={() => setRoomSheet('none')}><X size={20} className="text-gray-400" /></button>
                    </div>
                    <div className="flex flex-col items-center mb-6">
                      <div className={`w-20 h-20 rounded-full flex items-center justify-center font-black text-3xl shadow-md mb-3 ${style.bg} ${style.text}`}>
                        {activeRoom.name.charAt(0)}
                      </div>
                      <p className="font-black text-gray-900 text-lg text-center">{activeRoom.name}</p>
                      <span className={`mt-1.5 px-3 py-0.5 rounded-full text-xs font-semibold ${style.lightBg}`}>{catLabel}</span>
                    </div>
                    {activeRoom.description && (
                      <div className="bg-gray-50 rounded-2xl px-4 py-3 mb-4">
                        <p className="text-xs font-semibold text-gray-500 mb-1">Deskripsi</p>
                        <p className="text-sm text-gray-700 leading-relaxed">{activeRoom.description}</p>
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
                              {roomMembers.length > 0 ? roomMembers.length + ' staff' : 'Semua Staff'}
                            </p>}
                      </div>
                    </div>
                    {roomMembers.length > 0 && (
                      <div className="mb-4 space-y-2">
                        <p className="text-xs font-semibold text-gray-500">Anggota</p>
                        {roomMembers.slice(0, 5).map((m: any) => {
                          const p = m.user_profiles
                          return (
                            <div key={m.user_id} className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-secondary text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
                                {(p?.full_name ?? '?').charAt(0)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-gray-800 truncate">{p?.full_name ?? 'Staff'}</p>
                                <p className="text-[10px] text-gray-400 capitalize">{p?.role ?? ''}</p>
                              </div>
                            </div>
                          )
                        })}
                        {roomMembers.length > 5 && <p className="text-xs text-gray-400 text-center">+{roomMembers.length - 5} lainnya</p>}
                      </div>
                    )}
                    <button onClick={() => setRoomSheet('settings')}
                      className="w-full flex items-center gap-3 bg-gray-50 hover:bg-gray-100 rounded-2xl px-4 py-3.5 transition-colors">
                      <Settings size={18} className="text-gray-500" />
                      <span className="flex-1 text-sm font-semibold text-gray-700 text-left">Pengaturan Room</span>
                      <ChevronRight size={16} className="text-gray-400" />
                    </button>
                  </div>
                )}

                {/* SETTINGS */}
                {roomSheet === 'settings' && (
                  <div className="px-5 pb-8">
                    <div className="flex items-center gap-3 mb-5">
                      <button onClick={() => setRoomSheet('info')}><ArrowLeft size={20} className="text-gray-500" /></button>
                      <p className="font-bold text-gray-800 text-base flex-1">Pengaturan Room</p>
                      <button onClick={() => setRoomSheet('none')}><X size={20} className="text-gray-400" /></button>
                    </div>
                    <div className="flex items-center gap-3 bg-gray-50 rounded-2xl px-4 py-3 mb-5">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-sm flex-shrink-0 ${style.bg} ${style.text}`}>
                        {activeRoom.name.charAt(0)}
                      </div>
                      <div>
                        <p className="font-bold text-sm text-gray-800">{activeRoom.name}</p>
                        <p className="text-[10px] text-gray-400 capitalize">{catLabel}</p>
                      </div>
                    </div>
                    <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden mb-4">
                      {[
                        { key: 'notif', icon: roomPrefs.notif ? Bell : BellOff, label: 'Notifikasi', sub: roomPrefs.notif ? 'Aktif' : 'Nonaktif — tanpa notifikasi', val: roomPrefs.notif, fn: toggleNotif },
                        { key: 'pin',   icon: roomPrefs.pinned ? Pin : PinOff,  label: 'Sematkan Room', sub: roomPrefs.pinned ? 'Disematkan di daftar' : 'Tidak disematkan', val: roomPrefs.pinned, fn: togglePinned },
                      ].map((item, i) => (
                        <div key={item.key} className={clsx('flex items-center gap-3 px-4 py-4', i === 0 && 'border-b border-gray-50')}>
                          <item.icon size={18} className={item.val ? 'text-primary flex-shrink-0' : 'text-gray-400 flex-shrink-0'} />
                          <div className="flex-1">
                            <p className="text-sm font-semibold text-gray-800">{item.label}</p>
                            <p className="text-[10px] text-gray-400">{item.sub}</p>
                          </div>
                          <button onClick={item.fn}
                            className={clsx('relative w-11 h-6 rounded-full transition-colors flex-shrink-0', item.val ? 'bg-primary' : 'bg-gray-200')}>
                            <span className={clsx('absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform', item.val ? 'translate-x-5' : 'translate-x-0.5')} />
                          </button>
                        </div>
                      ))}
                    </div>
                    {/* Retensi pesan — read-only untuk semua, dropdown edit khusus admin/koordinator/direksi */}
                    <div className="bg-yellow-50 border border-yellow-100 rounded-2xl px-4 py-3 mb-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-yellow-700">Retensi Pesan</p>
                          <p className="text-[11px] text-yellow-600 mt-0.5">
                            {activeRoom.auto_delete_days
                              ? `Otomatis dihapus setelah ${activeRoom.auto_delete_days} hari (pesan yang di-pin tetap disimpan)`
                              : 'Tidak aktif — pesan disimpan selamanya'}
                          </p>
                        </div>
                        {user && PIN_ROLES.includes(user.role) && (
                          <select
                            className="text-xs font-semibold bg-white border border-yellow-200 rounded-lg px-2 py-1.5 text-yellow-800 flex-shrink-0"
                            value={activeRoom.auto_delete_days ?? ''}
                            onChange={e => updateRetention(e.target.value ? Number(e.target.value) : null)}
                          >
                            <option value="">Tidak</option>
                            <option value="7">7 hari</option>
                            <option value="30">30 hari</option>
                            <option value="90">90 hari</option>
                          </select>
                        )}
                      </div>
                    </div>
                    {canLeave && (
                      <button
                        onClick={leaveRoom}
                        className="w-full flex items-center justify-center gap-2 text-red-500 border border-red-100 bg-red-50 hover:bg-red-100 rounded-2xl px-4 py-3.5 transition-colors mt-2">
                        <LogOut size={16} /><span className="text-sm font-semibold">Tinggalkan Room</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Header ────────────────────────────────────────────────────── */}
          <div className="bg-secondary text-white px-4 pt-10 pb-3 flex items-center gap-3 flex-shrink-0">
            <button onClick={() => window.history.back()} className="text-white/70"><ArrowLeft size={22} /></button>
            <button onClick={openInfoSheet}
              className={`w-9 h-9 rounded-full flex items-center justify-center font-black text-sm flex-shrink-0 ${style.bg} ${style.text}`}>
              {style.label}
            </button>
            <button onClick={openInfoSheet} className="flex-1 min-w-0 text-left">
              <p className="font-bold text-sm truncate">{activeRoom.name}</p>
              <p className="text-white/40 text-xs capitalize">{catLabel}</p>
            </button>
            <button onClick={openInfoSheet} className="text-white/50 hover:text-white/80 transition-colors" title="Info Room">
              <Info size={18} />
            </button>
            <button onClick={() => { setRoomSheet('settings'); setMembersLoading(false) }}
              className={clsx('transition-colors', roomPrefs.notif ? 'text-white/50 hover:text-white/80' : 'text-white/30')}
              title="Pengaturan Room">
              {roomPrefs.notif ? <Bell size={18} /> : <BellOff size={16} />}
            </button>
          </div>

          {/* ── Pinned message banner ─────────────────────────────────────── */}
          {pinnedMsg && (
            <div className="bg-primary/10 border-b border-primary/20 px-4 py-2 flex items-center gap-2 flex-shrink-0">
              <Pin size={12} className="text-primary flex-shrink-0" />
              <button
                onClick={() => msgRefs.current[pinnedMsg.id]?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                className="flex-1 min-w-0 text-left">
                <p className="text-[10px] font-bold text-primary">Pesan Disematkan</p>
                <p className="text-xs text-gray-600 truncate">{pinnedMsg.content || (pinnedMsg.type === 'image' ? '📷 Gambar' : pinnedMsg.type === 'audio' ? '🎤 Pesan suara' : '📎 File')}</p>
              </button>
              {canPin && (
                <button onClick={unpinMessage} className="text-gray-400 hover:text-red-400 transition-colors flex-shrink-0">
                  <X size={14} />
                </button>
              )}
            </div>
          )}

          {/* ── Messages ──────────────────────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 bg-gray-50">
            {messages.length === 0 && (
              <div className="text-center py-10 text-gray-400">
                <MessageCircle size={32} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">Belum ada pesan di room ini</p>
              </div>
            )}
            {messages.map(msg => {
              const isMe       = msg.sender_id === user?.id
              const senderName = (msg as any).user_profiles?.full_name ?? 'Unknown'
              const senderRole = (msg as any).user_profiles?.role ?? ''
              const rxGroups   = groupedReactions(msg.id)

              return (
                <div key={msg.id}
                  ref={el => { msgRefs.current[msg.id] = el }}
                  className={clsx('flex flex-col', isMe ? 'items-end' : 'items-start')}>

                  {/* Sender label */}
                  {!isMe && (
                    <p className="text-[10px] font-bold text-primary ml-1 mb-0.5 capitalize">
                      {senderName} · {senderRole}
                    </p>
                  )}

                  {/* Bubble */}
                  <div
                    onTouchStart={() => startLongPress(msg.id, isMe, msg.content)}
                    onTouchEnd={cancelLongPress}
                    onTouchMove={cancelLongPress}
                    onContextMenu={e => { e.preventDefault(); setActionMenu({ msgId: msg.id, isMe, content: msg.content }) }}
                    className={clsx(
                      'max-w-[78%] px-3 py-2 rounded-2xl text-sm cursor-pointer select-none',
                      isMe ? 'bg-secondary text-white rounded-br-sm' : 'bg-white text-gray-800 shadow-sm rounded-bl-sm',
                      msg.is_pinned && 'ring-1 ring-primary/40'
                    )}
                  >
                    {msg.is_pinned && (
                      <div className="flex items-center gap-1 mb-1 opacity-60">
                        <Pin size={9} className={isMe ? 'text-primary' : 'text-primary'} />
                        <span className="text-[9px] font-semibold text-primary">Disematkan</span>
                      </div>
                    )}

                    {/* IMAGE */}
                    {msg.type === 'image' && msg.media_url && (
                      <button onClick={() => setLightboxUrl(msg.media_url!)} className="block mb-1.5 rounded-xl overflow-hidden">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={msg.media_url} alt={msg.content || 'Gambar'} className="max-w-[200px] w-full object-cover rounded-xl" />
                      </button>
                    )}

                    {/* FILE */}
                    {msg.type === 'file' && msg.media_url && (
                      <a href={msg.media_url} target="_blank" rel="noopener noreferrer" download
                        className={clsx('flex items-center gap-2.5 rounded-xl px-3 py-2 mb-1.5 transition-colors',
                          isMe ? 'bg-white/10 hover:bg-white/20' : 'bg-gray-100 hover:bg-gray-200')}>
                        <FileText size={20} className={clsx('flex-shrink-0', isMe ? 'text-primary' : 'text-blue-500')} />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold truncate max-w-[140px]">{msg.content || 'File'}</p>
                          <p className={clsx('text-[10px]', isMe ? 'text-white/50' : 'text-gray-400')}>Ketuk untuk unduh</p>
                        </div>
                        <Download size={14} className={isMe ? 'text-white/50' : 'text-gray-400'} />
                      </a>
                    )}

                    {/* AUDIO / VOICE MESSAGE (Fase 8) */}
                    {msg.type === 'audio' && msg.media_url && (
                      <div className={clsx('flex items-center gap-2 rounded-xl px-3 py-2 mb-1.5',
                        isMe ? 'bg-white/10' : 'bg-gray-100')}>
                        <Mic size={16} className={clsx('flex-shrink-0', isMe ? 'text-primary' : 'text-red-500')} />
                        <audio controls preload="metadata" src={msg.media_url}
                          className="h-8 min-w-[180px] max-w-[220px]" />
                      </div>
                    )}

                    {/* LOCATION */}
                    {msg.type === 'location' && (() => {
                      let loc = { lat: 0, lng: 0, accuracy: 0 }
                      try { loc = JSON.parse(msg.content ?? '{}') } catch {}
                      const mapsUrl = `https://www.google.com/maps?q=${loc.lat},${loc.lng}`
                      return (
                        <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
                          className={clsx(
                            'flex items-start gap-2.5 rounded-xl px-3 py-2.5 mb-1 transition-colors no-underline',
                            isMe ? 'bg-white/10 hover:bg-white/20' : 'bg-gray-50 hover:bg-gray-100'
                          )}>
                          <MapPin size={18} className={clsx('mt-0.5 flex-shrink-0', isMe ? 'text-primary' : 'text-red-500')} />
                          <div className="min-w-0">
                            <p className={clsx('text-xs font-bold', isMe ? 'text-white' : 'text-gray-800')}>
                              📍 Lokasi Saat Ini
                            </p>
                            <p className={clsx('text-[10px] mt-0.5', isMe ? 'text-white/60' : 'text-gray-500')}>
                              {loc.lat.toFixed(6)}, {loc.lng.toFixed(6)}
                            </p>
                            {loc.accuracy > 0 && (
                              <p className={clsx('text-[9px] mt-0.5', isMe ? 'text-white/40' : 'text-gray-400')}>
                                Akurasi ±{loc.accuracy} m
                              </p>
                            )}
                            <p className={clsx('text-[9px] mt-1 font-semibold', isMe ? 'text-primary' : 'text-blue-500')}>
                              Ketuk untuk buka Maps →
                            </p>
                          </div>
                        </a>
                      )
                    })()}

                    {/* POLL */}
                    {msg.type === 'poll' && (() => {
                      const entry = polls[msg.id]
                      if (!entry) return (
                        <div className="flex items-center gap-2 py-1 opacity-60">
                          <BarChart2 size={14} /><span className="text-xs">Polling</span>
                        </div>
                      )
                      const { poll, votes } = entry
                      const totalVotes = votes.length
                      const myVotes    = votes.filter(v => v.voter_id === user?.id).map(v => v.option_id)
                      const canClose   = !poll.is_closed && (poll.creator_id === user?.id || canPin)
                      return (
                        <div className={clsx(
                          'rounded-xl overflow-hidden mb-1 min-w-[200px]',
                          isMe ? 'bg-white/10' : 'bg-gray-50 border border-gray-100'
                        )}>
                          <div className="px-3 pt-2.5 pb-1">
                            <div className="flex items-start gap-1.5 mb-2">
                              <BarChart2 size={13} className={clsx('mt-0.5 flex-shrink-0', isMe ? 'text-primary' : 'text-secondary')} />
                              <p className={clsx('text-xs font-bold leading-tight', isMe ? 'text-white' : 'text-gray-800')}>
                                {poll.question}
                              </p>
                            </div>
                            {poll.options.map(opt => {
                              const count   = votes.filter(v => v.option_id === opt.id).length
                              const pct     = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0
                              const voted   = myVotes.includes(opt.id)
                              return (
                                <button key={opt.id} disabled={poll.is_closed}
                                  onClick={() => !poll.is_closed && votePoll(poll, opt.id)}
                                  className={clsx(
                                    'w-full text-left mb-1.5 rounded-lg overflow-hidden transition-opacity',
                                    poll.is_closed ? 'cursor-default' : 'active:opacity-70'
                                  )}>
                                  <div className={clsx(
                                    'relative px-2.5 py-1.5',
                                    isMe
                                      ? (voted ? 'bg-primary/30' : 'bg-white/10')
                                      : (voted ? 'bg-secondary/10' : 'bg-gray-100')
                                  )}>
                                    {/* progress bar */}
                                    <div
                                      className={clsx(
                                        'absolute inset-0 origin-left transition-all duration-500',
                                        isMe ? 'bg-primary/20' : 'bg-secondary/10'
                                      )}
                                      style={{ transform: `scaleX(${pct / 100})` }}
                                    />
                                    <div className="relative flex items-center justify-between gap-2">
                                      <div className="flex items-center gap-1.5 min-w-0">
                                        {voted
                                          ? <CheckSquare size={12} className={isMe ? 'text-primary flex-shrink-0' : 'text-secondary flex-shrink-0'} />
                                          : <Square size={12} className={clsx('flex-shrink-0', isMe ? 'text-white/40' : 'text-gray-400')} />}
                                        <span className={clsx('text-[11px] font-semibold truncate', isMe ? 'text-white' : 'text-gray-700')}>
                                          {opt.text}
                                        </span>
                                      </div>
                                      <span className={clsx('text-[10px] font-bold flex-shrink-0', isMe ? 'text-primary' : 'text-secondary')}>
                                        {pct}%
                                      </span>
                                    </div>
                                  </div>
                                </button>
                              )
                            })}
                          </div>
                          <div className={clsx(
                            'px-3 py-1.5 flex items-center justify-between',
                            isMe ? 'bg-white/5' : 'bg-gray-100/80'
                          )}>
                            <span className={clsx('text-[9px]', isMe ? 'text-white/40' : 'text-gray-400')}>
                              {totalVotes} suara · {poll.is_multiple_choice ? 'multi pilihan' : '1 pilihan'}
                            </span>
                            {poll.is_closed
                              ? <span className="flex items-center gap-0.5 text-[9px] text-red-400 font-semibold">
                                  <Lock size={8} /> Ditutup
                                </span>
                              : canClose && (
                                  <button onClick={() => closePoll(poll)}
                                    className={clsx('text-[9px] font-semibold', isMe ? 'text-primary' : 'text-secondary')}>
                                    Tutup Polling
                                  </button>
                                )}
                          </div>
                        </div>
                      )
                    })()}

                    {/* TEXT */}
                    {msg.type === 'text' && <p className="leading-relaxed">{msg.content}</p>}

                    <p className={clsx('text-[9px] mt-1', isMe ? 'text-white/50' : 'text-gray-300')}>
                      {new Date(msg.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>

                  {/* Reaction bubbles */}
                  {rxGroups.length > 0 && (
                    <div className={clsx('flex flex-wrap gap-1 mt-1', isMe ? 'justify-end' : 'justify-start')}>
                      {rxGroups.map(({ emoji, count, mine }) => (
                        <button
                          key={emoji}
                          onClick={() => toggleReaction(msg.id, emoji)}
                          className={clsx(
                            'flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold transition-colors',
                            mine
                              ? 'bg-primary/20 text-secondary ring-1 ring-primary/40'
                              : 'bg-white shadow-sm text-gray-600 hover:bg-gray-100'
                          )}>
                          <span>{emoji}</span>
                          {count > 1 && <span>{count}</span>}
                        </button>
                      ))}
                      {/* Tambah reaksi */}
                      <button
                        onClick={() => setActionMenu({ msgId: msg.id, isMe, content: msg.content })}
                        className="flex items-center px-1.5 py-0.5 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors">
                        <SmilePlus size={12} className="text-gray-400" />
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
            <div ref={bottomRef} />
          </div>

          {/* ── Attachment preview ────────────────────────────────────────── */}
          {pendingFile && (
            <div className="bg-gray-50 border-t border-gray-200 px-3 py-2 flex-shrink-0">
              {pendingPreview ? (
                <div className="relative w-20 h-20">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={pendingPreview} alt="preview" className="w-full h-full object-cover rounded-xl shadow" />
                  <button onClick={clearPendingFile}
                    className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center shadow">
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
                  <button onClick={clearPendingFile}><X size={14} className="text-gray-400" /></button>
                </div>
              )}
            </div>
          )}

          {/* ── Input bar ─────────────────────────────────────────────────── */}
          {recording ? (
            <div className="bg-red-50 border-t border-red-100 px-4 py-3 flex items-center gap-3 flex-shrink-0">
              <button onClick={cancelRecording}
                className="text-red-500 hover:text-red-700 flex-shrink-0"
                title="Batal rekam">
                <Trash size={22} />
              </button>
              <div className="flex-1 flex items-center gap-2 text-red-700 font-semibold">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
                </span>
                <span className="text-sm tabular-nums">
                  {String(Math.floor(recSeconds / 60)).padStart(2, '0')}:
                  {String(recSeconds % 60).padStart(2, '0')}
                </span>
                <span className="text-xs text-red-500">/ 01:00</span>
              </div>
              <button onClick={stopRecording}
                className="bg-red-500 hover:bg-red-600 text-white p-2.5 rounded-2xl flex-shrink-0"
                title="Kirim rekaman">
                <StopCircle size={20} />
              </button>
            </div>
          ) : (
            <div className="bg-white border-t border-gray-100 px-3 py-2.5 flex items-center gap-2 flex-shrink-0">
              <button onClick={() => fileInputRef.current?.click()} disabled={uploading || sendingLocation || uploadingAudio}
                className="text-gray-400 hover:text-primary transition-colors disabled:opacity-40 flex-shrink-0"
                title="Kirim foto / file">
                <Paperclip size={20} />
              </button>
              <button onClick={sendLocation} disabled={uploading || sendingLocation || pollSending || uploadingAudio}
                className="text-gray-400 hover:text-red-500 transition-colors disabled:opacity-40 flex-shrink-0"
                title="Kirim lokasi">
                {sendingLocation
                  ? <Loader2 size={18} className="animate-spin text-red-400" />
                  : <MapPin size={20} />}
              </button>
              <button onClick={() => setPollSheet(true)} disabled={uploading || sendingLocation || pollSending || uploadingAudio}
                className="text-gray-400 hover:text-secondary transition-colors disabled:opacity-40 flex-shrink-0"
                title="Buat polling">
                <BarChart2 size={20} />
              </button>
              <input ref={fileInputRef} type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
                className="hidden" onChange={handleFileSelect} />
              <input
                type="text"
                placeholder={pendingFile ? 'Tambah caption (opsional)...' : 'Ketik pesan...'}
                value={text}
                onChange={e => setText(e.target.value)}
                onKeyDown={e => { if (e.key !== 'Enter') return; pendingFile ? sendWithAttachment() : sendMessage() }}
                className="flex-1 bg-gray-100 rounded-2xl px-4 py-2.5 text-sm focus:outline-none"
                disabled={uploading || sendingLocation || pollSending || uploadingAudio}
              />
              {(text.trim() || pendingFile) ? (
                <button
                  onClick={pendingFile ? sendWithAttachment : sendMessage}
                  disabled={sending || uploading}
                  className="bg-primary text-secondary p-2.5 rounded-2xl disabled:opacity-40 transition-opacity flex-shrink-0">
                  {uploading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} strokeWidth={2.5} />}
                </button>
              ) : (
                <button
                  onClick={startRecording} disabled={uploadingAudio}
                  className="bg-primary text-secondary p-2.5 rounded-2xl disabled:opacity-40 transition-opacity flex-shrink-0"
                  title="Rekam suara (max 60 detik)">
                  {uploadingAudio ? <Loader2 size={18} className="animate-spin" /> : <Mic size={18} strokeWidth={2.5} />}
                </button>
              )}
            </div>
          )}
        </div>
      </SwipeBackWrapper>
    )
  }

  /* ===== ROOM LIST VIEW ===== */
  return (
    <AppShell>
      <div className="bg-secondary text-white px-4 pt-10 pb-5 sticky top-0 z-30">
        <div className="flex items-center gap-3 mb-3">
          <Link href="/dashboard"><ArrowLeft size={22} className="text-white/70" /></Link>
          <div className="flex-1"><MenalaLogo size={28} showText /></div>
          <DateTimeHeader compact />
        </div>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-black text-xl">Chat Room Staff</h1>
            <p className="text-white/50 text-xs mt-0.5">Komunikasi cepat, koordinasi akurat</p>
          </div>
          <button
            onClick={openContactSheet}
            aria-label="Mulai chat pribadi dengan staff"
            title="Mulai chat pribadi"
            className="bg-white/10 hover:bg-white/20 rounded-xl p-2 mt-1 active:scale-95 transition-transform">
            <Users size={18} className="text-white" />
          </button>
        </div>
        <div className="relative mt-3">
          <Search className="absolute left-3 top-2.5 text-white/40" size={16} />
          <input type="text" placeholder="Cari room atau pesan..." value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-white/10 text-white placeholder-white/40 text-sm pl-9 pr-3 py-2 rounded-xl border border-white/20 focus:outline-none" />
        </div>
      </div>

      <div className="bg-white border-b border-gray-100 px-4 py-2 flex gap-2 overflow-x-auto sticky top-[8.5rem] z-20">
        {(['semua', 'grup', 'lokasi', 'pribadi'] as FilterTab[]).map(cat => (
          <button key={cat} onClick={() => setFilterTab(cat)}
            className={clsx('flex-shrink-0 px-3 py-1 rounded-full text-xs font-semibold capitalize transition-colors',
              filterTab === cat ? 'bg-secondary text-white' : 'bg-gray-100 text-gray-500')}>
            {cat}
          </button>
        ))}
      </div>

      <div className="px-4 py-3 space-y-2">
        {(() => {
          const q = searchQuery.trim().toLowerCase()
          const filtered = rooms
            .filter(r => matchesFilter(r, filterTab))
            .filter(r => !q || r.name.toLowerCase().includes(q) || (r.last_message_content ?? '').toLowerCase().includes(q))
          if (filtered.length === 0) {
            return (
              <div className="text-center py-10 text-gray-400">
                <MessageCircle size={32} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">{rooms.length === 0 ? 'Tidak ada room aktif' : 'Tidak ada room yang cocok'}</p>
              </div>
            )
          }
          return filtered.map(room => {
            const style = getRoomStyle(room.category)
            const prefs = getRoomPrefs(room.id)
            const preview = room.last_message_content
              ? (room.last_message_sender ? `${room.last_message_sender}: ${room.last_message_content}` : room.last_message_content)
              : (room.description ?? 'Belum ada pesan')
            return (
              <button key={room.id} onClick={() => setActiveRoom(room)}
                className="card w-full flex items-center gap-3 text-left active:scale-[0.99] transition-transform">
                <div className={`w-11 h-11 rounded-full flex items-center justify-center font-black text-base flex-shrink-0 shadow-sm ${style.bg} ${style.text}`}>
                  {room.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {prefs.pinned && <Pin size={10} className="text-primary flex-shrink-0" />}
                      {!prefs.notif && <BellOff size={10} className="text-gray-300 flex-shrink-0" />}
                      <p className={clsx('font-bold text-sm truncate', room.unread_count > 0 ? 'text-gray-900' : 'text-gray-800')}>
                        {room.name}
                      </p>
                    </div>
                    <span className={clsx('text-[10px] flex-shrink-0', room.unread_count > 0 ? 'text-primary font-bold' : 'text-gray-400')}>
                      {formatTime(room.last_message_at)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <p className={clsx('text-xs truncate flex-1', room.unread_count > 0 ? 'text-gray-700 font-semibold' : 'text-gray-400')}>
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
          <p className="text-[10px] text-gray-400">Hanya peserta yang diundang dapat bergabung • Data terenkripsi end-to-end</p>
        </div>
      </div>

      {/* Kontak sheet — daftar staff aktif untuk mulai chat pribadi */}
      {contactSheet && (
        <div className="fixed inset-0 bg-black/50 flex items-end z-50" onClick={() => setContactSheet(false)}>
          <div
            className="bg-white rounded-t-3xl w-full max-w-md mx-auto pt-4 max-h-[85vh] flex flex-col"
            style={{ paddingBottom: 'calc(96px + env(safe-area-inset-bottom))' }}
            onClick={e => e.stopPropagation()}>
            <div className="flex justify-center pb-2">
              <div className="w-10 h-1 bg-gray-200 rounded-full" />
            </div>
            <div className="px-5 flex items-center justify-between mb-3">
              <div>
                <h2 className="font-bold text-gray-800">Kontak Staff</h2>
                <p className="text-[11px] text-gray-400">Ketuk untuk mulai chat pribadi</p>
              </div>
              <button onClick={() => setContactSheet(false)}><X size={20} className="text-gray-400" /></button>
            </div>
            <div className="px-5 pb-2">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-2.5 text-gray-400" />
                <input type="text" placeholder="Cari nama / ID staff..." value={contactSearch}
                  onChange={e => setContactSearch(e.target.value)}
                  className="input pl-9 text-sm w-full" />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-3">
              {contactLoading && <p className="text-center text-gray-400 text-sm py-6">Memuat...</p>}
              {!contactLoading && (() => {
                const filtered = contactList.filter(u =>
                  !contactSearch ||
                  u.full_name.toLowerCase().includes(contactSearch.toLowerCase()) ||
                  u.staff_id.toLowerCase().includes(contactSearch.toLowerCase())
                )
                if (filtered.length === 0) {
                  return <p className="text-center text-gray-400 text-sm py-6">Tidak ada staff cocok.</p>
                }
                return filtered.map(u => (
                  <button key={u.id} onClick={() => startPribadiChat(u.id)} disabled={openingPribadi === u.id}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 active:bg-gray-100 disabled:opacity-60 text-left">
                    <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm flex-shrink-0">
                      {u.full_name?.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{u.full_name}</p>
                      <p className="text-[11px] text-gray-400 capitalize truncate">{u.staff_id} • {u.role} • {u.branches?.name ?? '—'}</p>
                    </div>
                    {openingPribadi === u.id
                      ? <Loader2 size={16} className="animate-spin text-primary flex-shrink-0" />
                      : <MessageCircle size={16} className="text-gray-300 flex-shrink-0" />}
                  </button>
                ))
              })()}
            </div>
          </div>
        </div>
      )}
    </AppShell>
  )
}
