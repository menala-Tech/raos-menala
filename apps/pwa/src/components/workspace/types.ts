import type { ChatMessage, ChatMessageReaction, ChatPoll, ChatPollVote, ChatRoom, ChatRoomWithMeta, UserProfile } from '@/types'
import { parseActionCard } from '@/lib/actionCardParser'

export type FilterTab = 'semua' | 'grup' | 'lokasi' | 'pribadi'
export type RoomSheet = 'none' | 'info' | 'settings'

export interface RoomPrefs { notif: boolean; pinned: boolean }

export const DEFAULT_ROOM_PREFS: RoomPrefs = { notif: true, pinned: false }
export const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥']
export const GRUP_CATEGORIES = ['umum', 'operasional', 'driver_support', 'proyek']
export const NON_DEFAULT_CATEGORIES = ['pribadi', 'proyek']

export const CATEGORY_LABELS: Record<string, string> = {
  umum: 'Umum',
  operasional: 'Operasional',
  driver_support: 'Dukungan Driver',
  lokasi: 'Lokasi',
  pribadi: 'Pribadi',
  proyek: 'Proyek',
}

export const ROOM_COLORS: Record<string, { bg: string; text: string; label: string; lightBg: string }> = {
  umum:        { bg: 'bg-green-600',  text: 'text-white',    label: 'U', lightBg: 'bg-green-100'  },
  lokasi:      { bg: 'bg-primary',    text: 'text-secondary',label: 'L', lightBg: 'bg-yellow-100' },
  operasional: { bg: 'bg-blue-600',   text: 'text-white',    label: 'O', lightBg: 'bg-blue-100'   },
  driver:      { bg: 'bg-orange-500', text: 'text-white',    label: 'D', lightBg: 'bg-orange-100' },
  proyek:      { bg: 'bg-purple-600', text: 'text-white',    label: 'P', lightBg: 'bg-purple-100' },
}

export function getRoomStyle(category: string) {
  const key = Object.keys(ROOM_COLORS).find(k => category.toLowerCase().includes(k)) ?? 'umum'
  return ROOM_COLORS[key]
}

export function getRoomPrefs(roomId: string): RoomPrefs {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(`raos_room_prefs_${roomId}`) : null
    return raw ? { ...DEFAULT_ROOM_PREFS, ...JSON.parse(raw) } : DEFAULT_ROOM_PREFS
  } catch { return DEFAULT_ROOM_PREFS }
}

export function saveRoomPrefs(roomId: string, patch: Partial<RoomPrefs>) {
  localStorage.setItem(`raos_room_prefs_${roomId}`, JSON.stringify({ ...getRoomPrefs(roomId), ...patch }))
}

export function matchesFilter(room: ChatRoomWithMeta, tab: FilterTab): boolean {
  if (tab === 'semua') return true
  if (tab === 'lokasi') return room.category === 'lokasi'
  if (tab === 'pribadi') return room.category === 'pribadi'
  if (tab === 'grup') return GRUP_CATEGORIES.includes(room.category)
  return true
}

export function isSaldoRoomContext(
  room: ChatRoom | null,
  branch: { saldo_nominal_options: number[] } | null,
): boolean {
  if (!room || !branch) return false
  const name = room.name?.toLowerCase() ?? ''
  return (name.includes('saldo') || name.includes('pengisian')) && branch.saldo_nominal_options.length > 0
}

/**
 * Deteksi workspace bertema driver/antrean untuk konfigurasi tombol
 * `+ Antrian Driver`. Room bertema driver harus punya branch_id supaya
 * RPC `raos_join_queue` bisa dijalankan (butuh cabang spesifik).
 */
export function isDriverRoomContext(room: ChatRoom | null): boolean {
  if (!room) return false
  if (!(room as any).branch_id) return false
  const name = room.name?.toLowerCase() ?? ''
  return name.includes('driver') || name.includes('antrian') || name.includes('antrean')
}

export function formatTime(iso: string | null): string {
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

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function stripSystemMeta(content: string): string {
  return content.replace(/<!--SYSMETA:[\s\S]*?-->/g, '').trim()
}

function looksLikeLocationPayload(content: string): boolean {
  return /"lat"\s*:/.test(content) && /"lng"\s*:/.test(content)
}

function looksLikeStructuredPayload(content: string): boolean {
  return (
    content.startsWith('{') ||
    content.startsWith('[') ||
    content.startsWith('<!--')
  )
}

function tryParseJsonObject(content: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(content)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null
  } catch {
    return null
  }
}

function withSender(sender: string | null | undefined, label: string): string {
  return sender ? `${sender}: ${label}` : label
}

function formatStructuredPreview(content: string, sender: string | null | undefined): string | null {
  const actionCard = parseActionCard(content)
  if (actionCard?.kind === 'queue') {
    const status = typeof actionCard.status === 'string' ? actionCard.status : 'pending'
    return withSender(sender, `Antrian driver (${status})`)
  }
  if (actionCard?.kind === 'driver') {
    const status = typeof actionCard.status === 'string' ? actionCard.status : 'pending'
    return withSender(sender, `Data driver (${status})`)
  }

  const parsed = tryParseJsonObject(content)
  if (!parsed) return null

  if ('lat' in parsed && 'lng' in parsed) {
    return withSender(sender, 'Lokasi Saat Ini')
  }

  if ('request_no' in parsed && 'nominal' in parsed) {
    const requestNo = typeof parsed.request_no === 'string' ? parsed.request_no : 'Request saldo'
    const nominal = typeof parsed.nominal === 'number'
      ? ` Rp${parsed.nominal.toLocaleString('id-ID')}`
      : ''
    return withSender(sender, `${requestNo}${nominal}`.trim())
  }

  if ('event' in parsed && 'driver_name' in parsed) {
    const event = typeof parsed.event === 'string' ? parsed.event : 'update'
    const driverName = typeof parsed.driver_name === 'string' ? parsed.driver_name : 'driver'
    return withSender(sender, `${event} • ${driverName}`)
  }

  if ('status' in parsed && 'nominal' in parsed) {
    const status = typeof parsed.status === 'string' ? parsed.status : 'pending'
    return withSender(sender, `Pengajuan saldo (${status})`)
  }

  return withSender(sender, 'Pesan sistem')
}

export function formatRoomPreview(
  content: string | null | undefined,
  sender: string | null | undefined,
  description: string | null | undefined,
): string {
  const raw = String(content ?? '').trim()
  if (!raw) return String(description ?? '').trim() || 'Belum ada pesan'

  const withoutMeta = stripSystemMeta(raw)
  if (!withoutMeta) return 'Pesan sistem'

  if (looksLikeLocationPayload(withoutMeta)) {
    return withSender(sender, 'Lokasi Saat Ini')
  }

  if (withoutMeta.includes('raos-selfie://')) {
    return withSender(sender, 'Foto selfie')
  }

  if (looksLikeStructuredPayload(withoutMeta)) {
    return formatStructuredPreview(withoutMeta, sender) ?? withSender(sender, 'Pesan sistem')
  }

  return withSender(sender, withoutMeta)
}

export interface ReadSummaryEntry { read_count: number; total_recipients: number }
export interface QueueSummary {
  waiting: number
  called: number
  completed: number
  activeDriver: string | null
  nextPosition: number | null
  items: any[]
}
export interface QueueHistoryItem {
  id: string
  position?: number | null
  status?: string | null
  joined_at?: string | null
  called_at?: string | null
  driver?: { id?: string; driver_id?: string; name?: string } | null
}

export interface ActionMenu { msgId: string; isMe: boolean; content?: string }

export interface WorkspaceMember {
  user_id: string
  joined_at?: string
  user_profiles?: Pick<UserProfile, 'full_name' | 'role' | 'staff_id'> | null
}

export interface WorkspaceContact {
  id: string
  full_name: string
  role: string
  staff_id: string
  branches?: { name: string } | null
}

export interface WorkspaceDriverContact {
  id: string
  driver_id: string
  name: string
  phone: string | null
  vehicle_plate: string | null
  branches?: { name: string } | null
}

export type WorkspaceTimelineMessage = ChatMessage
export type WorkspaceMessageReaction = ChatMessageReaction
export type WorkspacePoll = ChatPoll
export type WorkspacePollVote = ChatPollVote
export type WorkspaceRoom = ChatRoom
export type WorkspaceRoomWithMeta = ChatRoomWithMeta
