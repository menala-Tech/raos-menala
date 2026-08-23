'use client'

import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Users } from 'lucide-react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { enrichChatMessages, loadChatDirectory } from '@/lib/chatProfileDirectory'
import { can } from '@/lib/accessPolicy'
import { getCameraPermissionStatus, requestCameraPermission, isNativeAndroid } from '@/lib/nativeCameraBridge'
import { getMicrophonePermissionStatus, requestMicrophonePermission, openMicrophoneAppSettings } from '@/lib/nativeMicrophoneBridge'
import { useRealtimeRefresh } from '@/lib/useRealtimeRefresh'
import { enqueue, isNetworkError } from '@/lib/offlineQueue'
// Note: sesi 22 — parseIsiSaldoCommand & parseDriverQueueCommand tidak
// lagi digunakan di composer sesuai spec RIFIM OS "tanpa teks command".
// Interactive Action Cards (IsiSaldoBottomSheet, AntrianDriverBottomSheet)
// menggantikan alur ini. Helper submit* tetap dipakai oleh bottom sheets.
import { scanContent, formatModerationWarning } from '@/lib/moderation'
import { runtimeMessage, runtimeTechnicalMessage } from '@/lib/runtimeError'
import { logActivity } from '@/lib/activity'
import type { DriverPayload, QueuePayload } from '@/lib/actionCardParser'
import IsiSaldoBottomSheet from '@/components/IsiSaldoBottomSheet'
import AntrianDriverBottomSheet from '@/components/AntrianDriverBottomSheet'
import AppShell from '@/components/layout/AppShell'
import SwipeBackWrapper from '@/components/SwipeBackWrapper'
import MenalaLogo from '@/components/MenalaLogo'
import { DateTimeStack } from '@/components/DateTimeHeader'
import type {
  ChatMessage,
  ChatMessageReaction,
  ChatPoll,
  ChatPollOption,
  ChatPollVote,
  ChatRoom,
  ChatRoomWithMeta,
  UserProfile,
} from '@/types'
import {
  WorkspaceActionMenu,
  WorkspaceComposer,
  WorkspaceContactSheet,
  WorkspaceHeader,
  WorkspaceInfoSheet,
  WorkspaceLightbox,
  WorkspaceList,
  WorkspacePinnedBanner,
  WorkspacePollSheet,
  WorkspaceQueueSummary,
  WorkspaceReadersModal,
  WorkspaceSearch,
  WorkspaceTimeline,
} from '@/components/workspace'
import {
  DEFAULT_ROOM_PREFS,
  getRoomPrefs,
  isDriverRoomContext,
  isSaldoRoomContext,
  saveRoomPrefs,
  type ActionMenu,
  type FilterTab,
  type QueueHistoryItem,
  type QueueSummary,
  type ReadSummaryEntry,
  type RoomPrefs,
  type RoomSheet,
  type WorkspaceContact,
  type WorkspaceDriverContact,
  type WorkspaceMember,
} from '@/components/workspace/types'

// ─── Entry ────────────────────────────────────────────────────────────────────

export default function ChatPage() {
  return <Suspense fallback={<div className="min-h-screen bg-secondary flex items-center justify-center"><MenalaLogo size={72} variant="splash" tone="onNavy" /></div>}><ChatPageInner /></Suspense>
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function ChatPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [user, setUser] = useState<UserProfile | null>(null)
  const [rooms, setRooms] = useState<ChatRoomWithMeta[]>([])
  const [activeRoom, setActiveRoom] = useState<ChatRoom | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [actionBusy, setActionBusy] = useState<Record<string, boolean>>({})
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [filterTab, setFilterTab] = useState<FilterTab>('semua')
  const [searchQuery, setSearchQuery] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const msgRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [pendingPreview, setPendingPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const [sendingLocation, setSendingLocation] = useState(false)

  const [polls, setPolls] = useState<Record<string, { poll: ChatPoll; votes: ChatPollVote[] }>>({})
  const [pollSheet, setPollSheet] = useState(false)
  const [isiSaldoSheet, setIsiSaldoSheet] = useState(false)
  const [antrianDriverSheet, setAntrianDriverSheet] = useState(false)
  const [pollQuestion, setPollQuestion] = useState('')
  const [pollOptions, setPollOptions] = useState(['', ''])
  const [pollMultiple, setPollMultiple] = useState(false)
  const [pollSending, setPollSending] = useState(false)

  const [roomSheet, setRoomSheet] = useState<RoomSheet>('none')
  const [roomMembers, setRoomMembers] = useState<WorkspaceMember[]>([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [roomPrefs, setRoomPrefs] = useState<RoomPrefs>(DEFAULT_ROOM_PREFS)
  const [queueSummary, setQueueSummary] = useState<QueueSummary | null>(null)
  const [queueHistory, setQueueHistory] = useState<QueueHistoryItem[]>([])

  const [reactions, setReactions] = useState<Record<string, ChatMessageReaction[]>>({})
  const [pinnedMsg, setPinnedMsg] = useState<ChatMessage | null>(null)
  const [actionMenu, setActionMenu] = useState<ActionMenu | null>(null)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [activeRoomBranch, setActiveRoomBranch] = useState<{
    id: string; slug: string | null; name: string | null; saldo_nominal_options: number[]
  } | null>(null)
  const showSaldoRequestButton = can(user?.role,'saldo:submit') && isSaldoRoomContext(activeRoom, activeRoomBranch)
  // Feedback 1 Agu 2026: tombol "+ Antrian Driver" di composer chat hanya
  // dimunculkan untuk role driver (self-request). Staff/koord/mgmt/admin
  // pakai /drivers page (tombol per driver) untuk Panggil/Selesai/Request.
  const showQueueRequestButton = isDriverRoomContext(activeRoom) && user?.role === 'driver'
  const showPollButton = !showSaldoRequestButton && !showQueueRequestButton

  const [roomDrivers, setRoomDrivers] = useState<Array<{ id: string; driver_id: string; name: string }>>([])

  const [mentionsPending, setMentionsPending] = useState<string[]>([])
  const [mentionDropdown, setMentionDropdown] = useState<{ open: boolean; query: string; startPos: number }>({ open: false, query: '', startPos: 0 })
  const textInputRef = useRef<HTMLInputElement>(null)

  const [readSummary, setReadSummary] = useState<Record<string, ReadSummaryEntry>>({})
  const [readersModalMsgId, setReadersModalMsgId] = useState<string | null>(null)
  const [readersList, setReadersList] = useState<Array<{ user_id: string; full_name: string; avatar_url: string | null; read_at: string }>>([])
  const [readersLoading, setReadersLoading] = useState(false)
  const markedReadRef = useRef<Set<string>>(new Set())
  // Track current room id untuk race-guard di loadMessages — kalau user
  // sudah pindah room sebelum fetch return, jangan set state room lama.
  const activeRoomIdRef = useRef<string | null>(null)

  const [recording, setRecording] = useState(false)
  const [recSeconds, setRecSeconds] = useState(0)
  const [uploadingAudio, setUploadingAudio] = useState(false)
  const mediaRecRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const VOICE_MAX_SECONDS = 60

  const [contactSheet, setContactSheet] = useState(false)
  const [contactList, setContactList] = useState<WorkspaceContact[]>([])
  const [contactDrivers, setContactDrivers] = useState<WorkspaceDriverContact[]>([])
  const [contactLoading, setContactLoading] = useState(false)
  const [contactSearch, setContactSearch] = useState('')
  const [openingPribadi, setOpeningPribadi] = useState<string | null>(null)

  // ── Data loaders ──────────────────────────────────────────────────────────

  const loadRooms = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_chat_rooms_for_user')
    if (!error) setRooms((data ?? []) as ChatRoomWithMeta[])
  }, [])

  const loadReadSummary = useCallback(async (msgIds: string[]) => {
    if (msgIds.length === 0) return
    const { data } = await supabase.rpc('get_message_read_summary', { p_message_ids: msgIds })
    if (data) {
      setReadSummary(prev => {
        const next = { ...prev }
        for (const row of data as Array<{ message_id: string; read_count: number; total_recipients: number }>) {
          next[row.message_id] = { read_count: row.read_count, total_recipients: row.total_recipients }
        }
        return next
      })
    }
  }, [])

  const markVisibleMessagesRead = useCallback(async (msgIds: string[]) => {
    const pending = msgIds.filter(id => !markedReadRef.current.has(id))
    if (pending.length === 0) return
    pending.forEach(id => markedReadRef.current.add(id))
    void supabase.rpc('mark_messages_read', { p_message_ids: pending })
  }, [])

  async function openReadersModal(msgId: string) {
    setReadersModalMsgId(msgId)
    setReadersLoading(true)
    setReadersList([])
    const { data } = await supabase.rpc('get_message_readers', { p_message_id: msgId })
    setReadersList((data ?? []) as any[])
    setReadersLoading(false)
  }

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

  useEffect(() => { if (activeRoom === null && user && rooms.length === 0) void loadRooms() }, [activeRoom, user, rooms.length, loadRooms])
  useRealtimeRefresh(
    `chat-room-list-${user?.id ?? 'anon'}`,
    [{table:'chat_rooms'},{table:'chat_messages'},{table:'chat_room_members'}],
    ()=>void loadRooms(),
    250,
    !!user?.id,
  )

  const loadMessages = useCallback(async (roomId: string) => {
    let clearedBefore: string | null = null
    if (user?.id) {
      const { data: clr } = await supabase
        .from('chat_room_local_clears')
        .select('cleared_before_at')
        .eq('user_id', user.id).eq('room_id', roomId)
        .maybeSingle()
      clearedBefore = clr?.cleared_before_at ?? null
    }
    let q = supabase
      .from('chat_messages')
      .select('*')
      .eq('room_id', roomId)
    if (clearedBefore) q = q.gt('created_at', clearedBefore)
    const { data } = await q.order('created_at').limit(50)
    const rows = await enrichChatMessages(roomId,(data ?? []) as ChatMessage[])
    // Race guard: kalau user sudah pindah ke room lain sebelum fetch return,
    // jangan setMessages pakai data room lama (bikin bubble stale).
    if (activeRoomIdRef.current !== roomId) return
    setMessages(rows)
    setTimeout(() => bottomRef.current?.scrollIntoView(), 100)
    if (user?.id) {
      const mine = rows.filter((m: any) => m.sender_id === user.id).map((m: any) => m.id)
      const others = rows.filter((m: any) => m.sender_id !== user.id).map((m: any) => m.id)
      if (mine.length) void loadReadSummary(mine)
      if (others.length) void markVisibleMessagesRead(others)
    }
  }, [user?.id, loadReadSummary, markVisibleMessagesRead])

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
      .select('*')
      .eq('room_id', roomId).eq('is_pinned', true)
      .order('pinned_at', { ascending: false }).limit(1).maybeSingle()
    if(!data){setPinnedMsg(null);return}
    const [enrichedPinned]=await enrichChatMessages(roomId,[data as ChatMessage])
    setPinnedMsg(enrichedPinned as ChatMessage)
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

  const loadQueueSummary = useCallback(async (branchId: string | null | undefined) => {
    if (!branchId) {
      setQueueSummary(null)
      setQueueHistory([])
      return
    }
    const { data, error } = await supabase
      .from('raos_driver_queue')
      .select('id, position, status, joined_at, called_at, driver:raos_drivers(id, driver_id, name)')
      .eq('branch_id', branchId)
      .order('position', { ascending: true })
    if (error) {
      setQueueSummary(null)
      setQueueHistory([])
      return
    }
    const items = (data ?? []) as any[]
    const waiting = items.filter(item => item.status === 'waiting').length
    const called = items.filter(item => item.status === 'called').length
    const completed = items.filter(item => item.status === 'completed').length
    const activeDriver = items.find(item => item.status === 'called')?.driver?.name ?? null
    const nextPosition = items.find(item => item.status === 'waiting')?.position ?? null
    setQueueSummary({ waiting, called, completed, activeDriver, nextPosition, items })

    const { data: historyRows } = await supabase
      .from('raos_driver_queue')
      .select('id, position, status, joined_at, called_at, driver:raos_drivers(id, driver_id, name)')
      .eq('branch_id', branchId)
      .order('joined_at', { ascending: false })
      .limit(6)
    setQueueHistory((historyRows ?? []) as QueueHistoryItem[])
  }, [])

  useEffect(() => {
    if (!activeRoom) return
    const stateTag = { raosChatRoom: activeRoom.id }
    window.history.pushState(stateTag, '', window.location.pathname + window.location.search)
    const onPop = () => setActiveRoom(null)
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
      if ((window.history.state as any)?.raosChatRoom === activeRoom.id) {
        window.history.back()
      }
    }
  }, [activeRoom])

  useEffect(() => {
    if (!activeRoom) {
      activeRoomIdRef.current = null
      setActiveRoomBranch(null)
      setIsiSaldoSheet(false)
      setAntrianDriverSheet(false)
      return
    }
    // Update roomId ref (dipakai loadMessages sebagai race-guard supaya
    // fetch late dari room sebelumnya tidak setMessages ke UI room baru).
    activeRoomIdRef.current = activeRoom.id
    // Jangan reset messages/reactions/pinned di sini — bikin UI kosong ~200ms
    // sampai loadMessages selesai fetch dari network (lag pindah room feel).
    // loadMessages akan panggil setMessages(rows) yang overwrite full array.
    // Reset kecil (readSummary, markedReadRef) tetap dibutuhkan karena
    // itu per-message dan bisa clash antar room.
    setReadSummary({})
    markedReadRef.current = new Set()
    setRoomPrefs(getRoomPrefs(activeRoom.id))

    const roomBranchId = (activeRoom as any).branch_id as string | null | undefined
    if (roomBranchId) {
      supabase.from('branches')
        .select('id, slug, name, saldo_nominal_options')
        .eq('id', roomBranchId).single()
        .then(({ data }) => {
          if (data) setActiveRoomBranch({
            id: data.id,
            slug: data.slug,
            name: data.name,
            saldo_nominal_options: Array.isArray(data.saldo_nominal_options) ? data.saldo_nominal_options : [],
          })
        })
      supabase.from('raos_drivers')
        .select('id, driver_id, name')
        .eq('is_active', true).eq('branch_id', roomBranchId)
        .order('name')
        .then(({ data }) => setRoomDrivers((data ?? []) as any[]))
      void loadQueueSummary(roomBranchId)
    } else {
      setActiveRoomBranch(null)
      // Room global (Umum/Absensi/Pengumuman): mention pool = SEMUA driver
      // aktif supaya @ dropdown tetap workable.
      supabase.from('raos_drivers')
        .select('id, driver_id, name')
        .eq('is_active', true)
        .order('name').limit(200)
        .then(({ data }) => setRoomDrivers((data ?? []) as any[]))
      setQueueSummary(null)
    }
    // Mention pool comes from the membership-scoped safe directory RPC.
    ;(async()=>{
      try{
        const data=await loadChatDirectory(activeRoom.id)
        setRoomMembers(data.map(p=>({user_id:p.user_id,joined_at:p.joined_at,user_profiles:{full_name:p.full_name,role:p.role,staff_id:p.staff_id}})) as WorkspaceMember[])
      }catch(error){console.warn('[chat] safe directory load failed',error)}
    })()
    loadMessages(activeRoom.id)
    loadReactions(activeRoom.id)
    loadPinnedMessage(activeRoom.id)
    loadPolls(activeRoom.id)
    // Fix B round 3: mark_chat_room_read() is now the canonical >50-message
    // safety net -- it bulk-marks every post-cutover message in this room
    // as read (chat_message_reads), not just the latest-50 batch
    // loadMessages() fetches. Clear this room's badge optimistically so
    // the sidebar updates instantly, then refresh from the server (loadRooms)
    // so it reflects the real post-mark state -- covers a message arriving
    // in the gap between the mark call and this callback.
    void (async () => {
      const { error } = await supabase.rpc('mark_chat_room_read', { p_room_id: activeRoom.id })
      if (!error) {
        setRooms(prev => prev.map(r => (r.id === activeRoom.id ? { ...r, unread_count: 0 } : r)))
        void loadRooms()
      }
    })()

    const channel = supabase
      .channel(`room:${activeRoom.id}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `room_id=eq.${activeRoom.id}` },
        async payload => {
          const raw = payload.new as ChatMessage
          // payload.new tidak include join user_profiles → nama pengirim
          // muncul "Unknown" di bubble. Fetch enriched row supaya nama
          // & role sender langsung tampil di realtime append.
          const { data: enriched } = await supabase
            .from('chat_messages')
            .select('*')
            .eq('id', raw.id).maybeSingle()
          const [msg] = await enrichChatMessages(activeRoom.id,[(enriched ?? raw) as ChatMessage])
          setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg])
          setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
          supabase.rpc('mark_chat_room_read', { p_room_id: activeRoom.id })
          if (msg.sender_id !== user?.id) void markVisibleMessagesRead([msg.id])
          else void loadReadSummary([msg.id])
        })
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'raos_driver_queue', filter: `branch_id=eq.${(activeRoom as any).branch_id}` },
        () => { if ((activeRoom as any).branch_id) void loadQueueSummary((activeRoom as any).branch_id) })
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'raos_driver_queue', filter: `branch_id=eq.${(activeRoom as any).branch_id}` },
        () => { if ((activeRoom as any).branch_id) void loadQueueSummary((activeRoom as any).branch_id) })
      .on('postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'raos_driver_queue', filter: `branch_id=eq.${(activeRoom as any).branch_id}` },
        () => { if ((activeRoom as any).branch_id) void loadQueueSummary((activeRoom as any).branch_id) })
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_message_reads' },
        payload => {
          const r = payload.new as { message_id: string; user_id: string }
          setReadSummary(prev => {
            const cur = prev[r.message_id]
            if (!cur) return prev
            return { ...prev, [r.message_id]: { ...cur, read_count: cur.read_count + 1 } }
          })
        })
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'chat_messages', filter: `room_id=eq.${activeRoom.id}` },
        payload => {
          const updated = payload.new as ChatMessage
          setMessages(prev => prev.map(m => m.id === updated.id ? { ...m, ...updated } : m))
          if (updated.is_pinned) setPinnedMsg(updated)
          else setPinnedMsg(prev => prev?.id === updated.id ? null : prev)
        })
      .on('postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'chat_messages', filter: `room_id=eq.${activeRoom.id}` },
        payload => {
          const deleted = payload.old as { id: string }
          setMessages(prev => prev.filter(m => m.id !== deleted.id))
          setPinnedMsg(prev => prev?.id === deleted.id ? null : prev)
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
  }, [activeRoom, loadMessages, loadReadSummary, markVisibleMessagesRead, user?.id, loadQueueSummary])

  // ── Messages ──────────────────────────────────────────────────────────────

  async function sendMessage(fileUrl?: string) {
    if (!activeRoom || !user) return
    if ((activeRoom as any).branch_id == null && String((activeRoom as any).name ?? '').trim().toLowerCase() === 'pengumuman' && !can(user.role,'announcement:broadcast')) {
      alert('Room Pengumuman hanya dapat ditulis oleh Admin/Direksi.')
      return
    }
    const content = text.trim()
    if (!content && !fileUrl) return

    // Moderasi konten client-side (sesi 22) — warn tapi tidak block.
    // Kalau user tetap kirim, log ke activity_logs untuk audit koord/admin.
    if (content) {
      const hits = scanContent(content)
      if (hits.length > 0) {
        const proceed = confirm(formatModerationWarning(hits))
        if (!proceed) return
        void logActivity('chat_moderation_override', JSON.stringify({
          room_id: activeRoom.id,
          hits: hits.map(h => ({ kind: h.kind, match: h.match })),
        }))
      }
    }

    setSending(true)
    setText('')
    const clientId = crypto.randomUUID()

    const mentionsArr = mentionsPending.filter(uid => {
      const member = roomMembers.find(m => m.user_id === uid)
      const name = member?.user_profiles?.full_name
      return name && content.includes(`@${name}`)
    })

    const payload: any = {
      room_id: activeRoom.id,
      sender_id: user.id,
      client_id: clientId,
      type: fileUrl ? (fileUrl.includes('/voice-') ? 'audio' : 'file') : 'text',
    }
    if (content) payload.content = content
    if (fileUrl) payload.media_url = fileUrl
    if (mentionsArr.length > 0) payload.mentions = mentionsArr

    const { data, error } = await supabase.from('chat_messages').insert(payload)
      .select('*').single()
    setSending(false)
    if (error && isNetworkError(error)) {
      await enqueue('chat_message', payload)
      setMessages(prev => prev.some((m: any) => m.client_id === clientId) ? prev : [
        ...prev,
        { ...payload, id: `local-${clientId}`, created_at: new Date().toISOString(), user_profiles: { full_name: (user as any).full_name, role: user.role } } as any,
      ])
      setMentionsPending([])
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
      return
    }
    if (error) { console.warn('[chat] send failed', runtimeTechnicalMessage(error)); alert(runtimeMessage(error,'Gagal mengirim pesan.')); setText(content); return }
    if (data) {
      setMessages(prev => prev.some(m => m.id === data.id) ? prev : [...prev, data as ChatMessage])
      setMentionsPending([])
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    }
  }

  function showCanonicalActionNotice(kind: 'driver' | 'queue') {
    const label = kind === 'driver' ? 'Driver' : 'Antrean'
    alert(`${label} action card di Chat hanya tampilan. Jalankan aksi melalui modul canonical ${label}/Queue.`)
  }


  // ── Attachment ────────────────────────────────────────────────────────────

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    setPendingFile(file)
    setPendingPreview(file.type.startsWith('image/') ? URL.createObjectURL(file) : null)
    e.target.value = ''
  }
  function clearPendingFile() {
    if (pendingPreview) URL.revokeObjectURL(pendingPreview)
    setPendingFile(null); setPendingPreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (cameraInputRef.current) cameraInputRef.current.value = ''
  }

  async function handleCapturePhoto() {
    if (!isNativeAndroid()) {
      cameraInputRef.current?.click()
      return
    }
    let { status } = await getCameraPermissionStatus()
    if (status === 'prompt') {
      const res = await requestCameraPermission()
      status = res.status
    }
    if (status !== 'granted') {
      alert('Izin kamera ditolak atau belum diizinkan. Aktifkan kamera di Pengaturan Aplikasi.')
      return
    }
    cameraInputRef.current?.click()
  }
  async function sendWithAttachment() {
    if (!pendingFile || !activeRoom || !user) return
    setUploading(true)
    const safeName = pendingFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const storagePath = `${user.id}/${activeRoom.id}/${Date.now()}-${safeName}`

    const { data: { session } } = await supabase.auth.getSession()
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    const authToken = session?.access_token ?? anonKey
    const uploadUrl = `${supabaseUrl}/storage/v1/object/chat_attachments/${storagePath}`

    async function tryUpload() {
      return fetch(uploadUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': pendingFile!.type || 'application/octet-stream',
          'x-upsert': 'false',
        },
        body: pendingFile!,
      })
    }

    let res: Response
    try {
      res = await tryUpload()
      if (!res.ok && res.status === 0) throw new Error('Failed to fetch')
    } catch (e: any) {
      console.warn('[attachment] retry after:', e?.message)
      await new Promise(r => setTimeout(r, 800))
      try {
        res = await tryUpload()
      } catch (e2: any) {
        alert('Gagal upload: koneksi bermasalah. Cek internet & coba lagi.')
        console.error('[attachment] upload gagal 2x:', e2)
        setUploading(false); return
      }
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      alert(`Gagal upload (HTTP ${res.status}): ${body.slice(0, 200) || res.statusText}`)
      console.error('[attachment] server reject:', res.status, body)
      setUploading(false); return
    }
    const { data: { publicUrl } } = supabase.storage.from('chat_attachments').getPublicUrl(storagePath)
    const msgType = pendingFile.type.startsWith('image/') ? 'image' : 'file'
    const { data: msg, error: msgErr } = await supabase.from('chat_messages').insert({
      room_id: activeRoom.id, sender_id: user.id, type: msgType,
      content: pendingFile.name, media_url: publicUrl,
    }).select('*').single()
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

  // ── Kirim Lokasi ─────────────────────────────────────────────────────────

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
        }).select('*').single()
        setSendingLocation(false)
        if (error) { console.warn('[chat] location send failed', runtimeTechnicalMessage(error)); alert(runtimeMessage(error,'Gagal mengirim lokasi.')); return }
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

  // ── Polling ──────────────────────────────────────────────────────────────

  async function createPoll() {
    if (!activeRoom || !user) return
    const q = pollQuestion.trim()
    const opts = pollOptions.map(o => o.trim()).filter(Boolean)
    if (!q || opts.length < 2) return
    setPollSending(true)
    const options: ChatPollOption[] = opts.map(t => ({ id: crypto.randomUUID(), text: t }))
    const { data: msg, error: msgErr } = await supabase.from('chat_messages').insert({
      room_id: activeRoom.id, sender_id: user.id, type: 'poll', content: q,
    }).select('*').single()
    if (msgErr || !msg) { alert('Gagal buat polling'); setPollSending(false); return }
    const { data: poll, error: pollErr } = await supabase.from('chat_polls').insert({
      room_id: activeRoom.id, message_id: msg.id, creator_id: user.id,
      question: q, options, is_multiple_choice: pollMultiple,
    }).select().single()
    if (pollErr || !poll) { alert('Gagal simpan polling'); setPollSending(false); return }
    setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg as ChatMessage])
    setPolls(prev => ({ ...prev, [msg.id]: { poll: poll as ChatPoll, votes: [] } }))
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    setPollQuestion(''); setPollOptions(['', '']); setPollMultiple(false)
    setPollSheet(false); setPollSending(false)
  }

  async function votePoll(poll: ChatPoll, optionId: string) {
    if (!user) return
    const myVotes = polls[poll.message_id]?.votes.filter(v => v.voter_id === user.id) ?? []
    const alreadyVoted = myVotes.find(v => v.option_id === optionId)
    if (alreadyVoted) {
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

  // ── Room prefs ───────────────────────────────────────────────────────────

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
    const data=await loadChatDirectory(activeRoom.id)
    setRoomMembers(data.map(p=>({user_id:p.user_id,joined_at:p.joined_at,user_profiles:{full_name:p.full_name,role:p.role,staff_id:p.staff_id}})) as WorkspaceMember[]); setMembersLoading(false)
  }

  async function openPribadiWithMember(otherUserId: string) {
    if (!user || otherUserId === user.id) return
    const { data, error } = await supabase.rpc('get_or_create_pribadi_room', { p_other_user_id: otherUserId })
    if (error || !data) {
      console.warn('[openPribadiWithMember] RPC failed', error)
      alert('Gagal buka chat pribadi: ' + (error?.message ?? 'RPC tidak mengembalikan room_id'))
      return
    }
    const { data: roomData, error: roomErr } = await supabase
      .from('chat_rooms').select('*').eq('id', data).maybeSingle()
    if (roomErr) console.warn('[openPribadiWithMember] fetch room failed', roomErr)
    // Fallback minimal room kalau SELECT belum propagate (baru dibuat via RPC).
    const otherMember = roomMembers.find(m => m.user_id === otherUserId)
    const otherName = otherMember?.user_profiles?.full_name ?? 'Chat Pribadi'
    const targetRoom = roomData ?? ({
      id: data as string,
      name: otherName,
      category: 'pribadi',
      description: 'Chat pribadi',
      branch_id: null,
      is_active: true,
      auto_delete_days: null,
      created_by: user.id,
      created_at: new Date().toISOString(),
    } as any)
    setRoomSheet('none')
    setActiveRoom(targetRoom as ChatRoom)
  }

  // ── Voice recorder ───────────────────────────────────────────────────────

  function pickAudioMime(): string {
    if (typeof MediaRecorder === 'undefined') return ''
    if (MediaRecorder.isTypeSupported('audio/webm')) return 'audio/webm'
    if (MediaRecorder.isTypeSupported('audio/mp4')) return 'audio/mp4'
    return ''
  }

  async function startRecording() {
    if (!activeRoom || !user || recording) return
    if (isNativeAndroid()) {
      let { status } = await getMicrophonePermissionStatus()
      if (status === 'prompt') {
        const res = await requestMicrophonePermission()
        status = res.status
      }
      if (status !== 'granted') {
        const goSettings = confirm('Izin mikrofon ditolak. Buka Pengaturan Aplikasi untuk mengaktifkan mikrofon?')
        if (goSettings) await openMicrophoneAppSettings()
        return
      }
    }
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
    } catch {
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
      audioChunksRef.current = []
      rec.stop()
    }
    setRecording(false)
    setRecSeconds(0)
    mediaRecRef.current = null
  }

  async function uploadVoiceMessage(blob: Blob, mimeRaw: string, seconds: number) {
    if (!activeRoom || !user) return
    setUploadingAudio(true)
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
    }).select('*').single()

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

  async function openContactSheet() {
    setContactSheet(true)
    setContactLoading(true)
    const branchId: string | null = user?.branch_id ?? null
    const {data:profileRows,error:profileErr}=await supabase.rpc('raos_contact_directory')
    if(profileErr)console.warn('[chat] contact directory failed',profileErr)
    let driverQ = supabase
      .from('raos_drivers')
      .select('id, driver_id, name, phone, vehicle_plate, branch_id, branches(name)')
      .eq('is_active', true)
      .order('name')
    const seesAllBranches = user && ['admin','management','direksi','direktur'].includes(user.role)
    if (!seesAllBranches && branchId) driverQ = driverQ.eq('branch_id', branchId)
    const {data:driverData}=await driverQ
    const staffData=(profileRows??[]).map((p:any)=>({id:p.user_id,full_name:p.full_name,role:p.role,staff_id:p.staff_id,branch_id:p.branch_id,avatar_url:p.avatar_url,branches:p.branch_name?{name:p.branch_name}:null}))
    setContactList(staffData.filter((u:any) => u.id !== user?.id) as unknown as WorkspaceContact[])
    setContactDrivers((driverData ?? []) as unknown as WorkspaceDriverContact[])
    setContactLoading(false)
  }

  async function startPribadiChat(otherUserId: string) {
    setOpeningPribadi(otherUserId)
    const { data: roomId, error } = await supabase.rpc('get_or_create_pribadi_room', { p_other_user_id: otherUserId })
    setOpeningPribadi(null)
    if (error || !roomId) {
      console.warn('[startPribadiChat] RPC failed', error)
      alert('Gagal buka chat pribadi: ' + (error?.message ?? 'RPC tidak mengembalikan room_id'))
      return
    }
    // Fetch room dulu — kalau RLS SELECT belum propagate untuk pribadi baru dibuat,
    // fallback ke minimal room object supaya UI tetap masuk ke room. Realtime
    // subscribe di useEffect akan populate messages ketika data siap.
    const { data: room, error: roomErr } = await supabase
      .from('chat_rooms').select('*').eq('id', roomId).maybeSingle()
    if (roomErr) console.warn('[startPribadiChat] fetch room failed', roomErr)
    const otherContact = contactList.find(c => c.id === otherUserId)
    const otherName = otherContact?.full_name ?? 'Chat Pribadi'
    const targetRoom = room ?? ({
      id: roomId as string,
      name: otherName,
      category: 'pribadi',
      description: 'Chat pribadi',
      branch_id: null,
      is_active: true,
      auto_delete_days: null,
      created_by: user?.id ?? null,
      created_at: new Date().toISOString(),
    } as any)
    setContactSheet(false)
    setActiveRoom(targetRoom)
  }

  async function leaveRoom() {
    if (!activeRoom || !user) return
    if (!confirm(`Tinggalkan workspace "${activeRoom.name}"? Anda tidak akan menerima pesan baru sampai diundang ulang.`)) return
    const { error } = await supabase.from('chat_room_members')
      .delete().eq('room_id', activeRoom.id).eq('user_id', user.id)
    if (error) { console.warn('[chat] leave room failed', runtimeTechnicalMessage(error)); alert(runtimeMessage(error,'Gagal keluar workspace.')); return }
    setRoomSheet('none')
    setActiveRoom(null)
  }

  async function updateRetention(days: number | null) {
    if (!activeRoom || !user || !can(user.role,'chat:moderate')) return
    const { error } = await supabase.rpc('set_chat_room_retention', {
      p_room_id: activeRoom.id, p_days: days,
    })
    if (error) { console.warn('[chat] retention update failed', runtimeTechnicalMessage(error)); alert(runtimeMessage(error,'Gagal mengubah retensi.')); return }
    setActiveRoom({ ...activeRoom, auto_delete_days: days ?? undefined })
  }

  async function deleteMessage(messageId: string) {
    if (!confirm('Hapus pesan ini? Aksi tidak bisa di-undo.')) return
    const { error } = await supabase.rpc('delete_chat_message', { p_message_id: messageId })
    if (error) { console.warn('[chat] delete message failed', runtimeTechnicalMessage(error)); alert(runtimeMessage(error,'Gagal menghapus pesan.')); return }
    setMessages(prev => prev.filter(m => m.id !== messageId))
    setActionMenu(null)
  }

  async function clearAllMessages() {
    if (!activeRoom || !user) return
    if (!confirm(`Sembunyikan semua pesan di workspace "${activeRoom.name}" hanya untuk Anda?\n\nPesan tetap ada untuk anggota lain. Pesan baru setelah ini akan tetap muncul.`)) return
    const { error } = await supabase.rpc('clear_chat_room_for_me', { p_room_id: activeRoom.id })
    if (error) { console.warn('[chat] delete failed', runtimeTechnicalMessage(error)); alert(runtimeMessage(error,'Gagal menghapus pesan.')); return }
    setMessages([])
    setRoomSheet('none')
  }

  // ── Reactions ─────────────────────────────────────────────────────────────

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

  // ── Pin ───────────────────────────────────────────────────────────────────

  async function pinMessage(messageId: string) {
    if (!user || !can(user.role,'chat:moderate')) return
    const { data, error } = await supabase.rpc('raos_set_chat_message_pin', {
      p_message_id: messageId, p_pinned: true,
    })
    if (error) { alert('Gagal sematkan pesan.'); return }
    const row=(data ?? {}) as any
    const msg=messages.find(m=>m.id===messageId)
    const next={...(msg ?? row),...row,is_pinned:true} as ChatMessage
    setPinnedMsg(next)
    setMessages(prev=>prev.map(m=>m.id===messageId?{...m,...row,is_pinned:true}:m))
    setActionMenu(null)
  }

  async function unpinMessage() {
    if (!pinnedMsg || !user || !can(user.role,'chat:moderate')) return
    const { data, error } = await supabase.rpc('raos_set_chat_message_pin', {
      p_message_id: pinnedMsg.id, p_pinned: false,
    })
    if (error) { alert('Gagal melepas sematan pesan.'); return }
    const row=(data ?? {}) as any
    setMessages(prev=>prev.map(m=>m.id===pinnedMsg.id?{...m,...row,is_pinned:false}:m))
    setPinnedMsg(null)
  }

  // ── Long press / copy ────────────────────────────────────────────────────

  function startLongPress(msgId: string, isMe: boolean, content?: string) {
    longPressTimer.current = setTimeout(() => {
      setActionMenu({ msgId, isMe, content })
    }, 450)
  }
  function cancelLongPress() {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null }
  }

  function copyText(t?: string) {
    if (!t) return
    navigator.clipboard.writeText(t).catch(() => {})
    setActionMenu(null)
  }

  // ── Composer text change / mention dropdown ──────────────────────────────

  function handleComposerTextChange(val: string, caret: number) {
    setText(val)
    const uptoCaret = val.slice(0, caret)
    const m = uptoCaret.match(/(?:^|\s)@([\w.\-]*)$/)
    if (m) {
      const startPos = caret - m[0].length + (m[0].startsWith(' ') ? 1 : 0)
      setMentionDropdown({ open: true, query: m[1] ?? '', startPos })
    } else if (mentionDropdown.open) {
      setMentionDropdown({ open: false, query: '', startPos: 0 })
    }
  }

  /**
   * Tap nama pengirim di bubble → append `@Nama` ke input + register user_id
   * ke mentionsPending supaya push notification kategori 'pengumuman'
   * (title "📣 Anda di-tag") sampai. Kalau text sudah ada mention untuk user
   * yang sama, tidak duplikat.
   */
  function tagSender(userId: string, fullName: string) {
    if (userId === user?.id) return
    const mention = `@${fullName}`
    if (!text.includes(mention)) {
      setText(prev => (prev.endsWith(' ') || prev.length === 0 ? prev : prev + ' ') + mention + ' ')
    }
    setMentionsPending(prev => prev.includes(userId) ? prev : [...prev, userId])
    setTimeout(() => textInputRef.current?.focus(), 0)
  }

  function insertMention(name: string, extraSuffix: string, userId?: string) {
    const before = text.slice(0, mentionDropdown.startPos)
    const afterAt = text.slice(mentionDropdown.startPos + 1 + mentionDropdown.query.length)
    const inserted = `@${name}${extraSuffix} `
    setText(before + inserted + afterAt)
    if (userId) {
      setMentionsPending(prev => prev.includes(userId) ? prev : [...prev, userId])
    }
    setMentionDropdown({ open: false, query: '', startPos: 0 })
    setTimeout(() => textInputRef.current?.focus(), 0)
  }

  // ─────────────────────────────────────────────────────────────────────────
  /* ===== WORKSPACE (in-room) VIEW ===== */
  // ─────────────────────────────────────────────────────────────────────────

  if (activeRoom) {
    // Feedback 1 Agu 2026: sembunyikan QueueSummary card di room chat supaya
    // ruang chat tidak habis oleh tabel antrian. Pantau antrian pindah ke
    // /drivers atau /antrian-driver.
    const showQueueSummary = false
    const isAnnouncementRoom = (activeRoom as any).branch_id == null && String((activeRoom as any).name ?? '').trim().toLowerCase() === 'pengumuman'
    const canWriteAnnouncement = !isAnnouncementRoom || can(user?.role,'announcement:broadcast')
    const composerDisabled = uploading || sendingLocation || pollSending || uploadingAudio || !canWriteAnnouncement

    return (
      <SwipeBackWrapper onBack={() => setActiveRoom(null)}>
        <div className="flex flex-col h-screen max-w-md mx-auto">

          {lightboxUrl && <WorkspaceLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />}

          {readersModalMsgId && (
            <WorkspaceReadersModal
              loading={readersLoading}
              readers={readersList}
              onClose={() => setReadersModalMsgId(null)}
            />
          )}

          {isiSaldoSheet && activeRoom && user && activeRoomBranch && (
            <IsiSaldoBottomSheet
              userId={user.id}
              userFullName={(user as any).full_name ?? 'Staff'}
              branchId={activeRoomBranch.id}
              branchSlug={activeRoomBranch.slug}
              branchName={activeRoomBranch.name}
              branchNominalOptions={activeRoomBranch.saldo_nominal_options}
              roomId={activeRoom.id}
              onClose={() => setIsiSaldoSheet(false)}
              onSubmitted={() => setIsiSaldoSheet(false)}
            />
          )}

          {antrianDriverSheet && activeRoom && (
            <AntrianDriverBottomSheet
              branchId={(activeRoom as any).branch_id ?? null}
              branchName={activeRoomBranch?.name ?? null}
              roomId={activeRoom.id}
              onClose={() => setAntrianDriverSheet(false)}
              onJoined={() => setAntrianDriverSheet(false)}
            />
          )}

          {pollSheet && (
            <WorkspacePollSheet
              pollQuestion={pollQuestion}
              pollOptions={pollOptions}
              pollMultiple={pollMultiple}
              pollSending={pollSending}
              onQuestionChange={setPollQuestion}
              onOptionsChange={setPollOptions}
              onToggleMultiple={() => setPollMultiple(!pollMultiple)}
              onCreate={createPoll}
              onClose={() => setPollSheet(false)}
            />
          )}

          {actionMenu && (
            <WorkspaceActionMenu
              actionMenu={actionMenu}
              user={user}
              reactions={reactions}
              onClose={() => setActionMenu(null)}
              onToggleReaction={toggleReaction}
              onPin={pinMessage}
              onCopy={copyText}
              onDelete={deleteMessage}
            />
          )}

          {roomSheet !== 'none' && (
            <WorkspaceInfoSheet
              sheet={roomSheet}
              room={activeRoom}
              user={user}
              prefs={roomPrefs}
              members={roomMembers}
              membersLoading={membersLoading}
              onOpenPribadi={openPribadiWithMember}
              onToggleNotif={toggleNotif}
              onTogglePinned={togglePinned}
              onUpdateRetention={updateRetention}
              onClearAllMessages={clearAllMessages}
              onLeaveRoom={leaveRoom}
              onGotoInfo={() => setRoomSheet('info')}
              onGotoSettings={() => setRoomSheet('settings')}
              onClose={() => setRoomSheet('none')}
            />
          )}

          <WorkspaceHeader
            room={activeRoom}
            prefs={roomPrefs}
            onBack={() => setActiveRoom(null)}
            onOpenInfo={openInfoSheet}
            onOpenSettings={() => { setRoomSheet('settings'); setMembersLoading(false) }}
          />

          {pinnedMsg && (
            <WorkspacePinnedBanner
              pinned={pinnedMsg}
              canUnpin={can(user?.role,'chat:moderate')}
              onScrollTo={() => msgRefs.current[pinnedMsg.id]?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
              onUnpin={unpinMessage}
            />
          )}

          {showQueueSummary && queueSummary && (
            <WorkspaceQueueSummary
              summary={queueSummary}
              history={queueHistory}
              branchId={(activeRoom as any).branch_id ?? null}
              currentUserRole={user?.role}
              onChanged={() => (activeRoom as any).branch_id && loadQueueSummary((activeRoom as any).branch_id)}
            />
          )}

          {user && (
            <WorkspaceTimeline
              ref={bottomRef}
              messages={messages}
              user={user}
              reactions={reactions}
              polls={polls}
              readSummary={readSummary}
              actionBusy={actionBusy}
              registerMessageRef={(id, el) => { msgRefs.current[id] = el }}
              onOpenLightbox={setLightboxUrl}
              onOpenReadersModal={openReadersModal}
              onVotePoll={votePoll}
              onClosePoll={closePoll}
              onToggleReaction={toggleReaction}
              onOpenActionMenu={setActionMenu}
              onStartLongPress={startLongPress}
              onCancelLongPress={cancelLongPress}
              onDriverApprove={() => showCanonicalActionNotice('driver')}
              onDriverReject={() => showCanonicalActionNotice('driver')}
              onDriverActivate={() => showCanonicalActionNotice('driver')}
              onQueueApprove={() => showCanonicalActionNotice('queue')}
              onQueueReject={() => showCanonicalActionNotice('queue')}
              onQueueComplete={() => showCanonicalActionNotice('queue')}
              onTagSender={tagSender}
            />
          )}

          <WorkspaceComposer
            text={text}
            onTextChange={handleComposerTextChange}
            disabled={composerDisabled}
            sending={sending}
            uploading={uploading}
            sendingLocation={sendingLocation}
            pollSending={pollSending}
            uploadingAudio={uploadingAudio}
            recording={recording}
            recSeconds={recSeconds}
            voiceMaxSeconds={VOICE_MAX_SECONDS}
            pendingFile={pendingFile}
            pendingPreview={pendingPreview}
            fileInputRef={fileInputRef}
            cameraInputRef={cameraInputRef}
            textInputRef={textInputRef}
            showSaldoRequestButton={showSaldoRequestButton}
            showQueueRequestButton={showQueueRequestButton}
            showPollButton={showPollButton}
            mentionDropdown={mentionDropdown}
            roomMembers={roomMembers}
            roomDrivers={roomDrivers}
            currentUserId={user?.id}
            onPickFile={() => fileInputRef.current?.click()}
            onCapturePhoto={handleCapturePhoto}
            onFileSelect={handleFileSelect}
            onClearPendingFile={clearPendingFile}
            onSendLocation={sendLocation}
            onOpenPoll={() => setPollSheet(true)}
            onOpenSaldo={() => setIsiSaldoSheet(true)}
            onOpenQueue={() => setAntrianDriverSheet(true)}
            onStartRecording={startRecording}
            onStopRecording={stopRecording}
            onCancelRecording={cancelRecording}
            onSubmit={() => sendMessage()}
            onSubmitAttachment={sendWithAttachment}
            onInsertMention={insertMention}
            onCloseMentionDropdown={() => setMentionDropdown({ open: false, query: '', startPos: 0 })}
          />
        </div>
      </SwipeBackWrapper>
    )
  }

  /* ===== WORKSPACE DIRECTORY VIEW ===== */
  return (
    <AppShell>
      <div className="bg-secondary text-white px-4 pt-10 pb-5 sticky top-0 z-30">
        <div className="flex items-center gap-3 mb-3">
          <Link href="/dashboard" aria-label="Kembali ke dashboard">
            <ArrowLeft size={22} className="text-white/70" />
          </Link>
          <div className="flex-1"><MenalaLogo size={28} showText /></div>
        </div>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-black text-xl">Workspace Kolaborasi</h1>
            <p className="text-white/50 text-xs mt-0.5">Koordinasi lintas cabang untuk operasi Saldo, Antrian, Driver, dan Absensi</p>
          </div>
          <div className="flex items-start gap-2 flex-shrink-0">
            <DateTimeStack />
            <button
              onClick={openContactSheet}
              aria-label="Mulai chat pribadi dengan staff"
              title="Mulai chat pribadi"
              className="bg-white/10 hover:bg-white/20 rounded-xl p-2 active:scale-95 transition-transform"
            >
              <Users size={18} className="text-white" />
            </button>
          </div>
        </div>
        <div className="mt-3">
          <WorkspaceSearch
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Cari workspace atau pesan..."
          />
        </div>
      </div>

      <WorkspaceList
        rooms={rooms}
        filterTab={filterTab}
        onFilterChange={setFilterTab}
        searchQuery={searchQuery}
        onOpenRoom={setActiveRoom}
      />

      {contactSheet && (
        <WorkspaceContactSheet
          loading={contactLoading}
          contacts={contactList}
          drivers={contactDrivers}
          search={contactSearch}
          openingId={openingPribadi}
          onSearchChange={setContactSearch}
          onStartPribadi={startPribadiChat}
          onClose={() => setContactSheet(false)}
        />
      )}
    </AppShell>
  )
}
