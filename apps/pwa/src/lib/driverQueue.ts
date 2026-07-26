import { supabase } from './supabase'
import { invokePush } from './pushClient'

/**
 * Driver Queue commands (P3.3). Model dari radms-driver:
 * FIFO WAITING → CALLED → COMPLETED/LEFT.
 *
 * Commands di chat room:
 *   /antri <driver_id_atau_barcode>   — join driver ke queue cabang room ini
 *   /panggil <nomor_urut>             — staff panggil driver di posisi tsb
 *   /selesai <nomor_urut>             — mark completed (dari CALLED)
 *   /keluar <driver_id_atau_barcode>  — driver keluar dari queue
 *
 * Sender selalu user_profile aktif (staff/koord). Untuk join/keluar,
 * driver_id di-lookup dari raos_drivers by driver_id text ATAU barcode.
 *
 * Message type: 'driver_queue' — content JSON berisi event + snapshot state.
 */

type Cmd = 'antri' | 'panggil' | 'selesai' | 'keluar'

export interface ParsedQueueCommand {
  cmd: Cmd
  arg: string
}

const CMD_RE = /^\/(antri|panggil|selesai|keluar)(?:\s+(\S+))?/i

export function parseDriverQueueCommand(text: string): ParsedQueueCommand | null {
  const m = text.trim().match(CMD_RE)
  if (!m) return null
  const cmd = m[1].toLowerCase() as Cmd
  const arg = (m[2] ?? '').trim()
  if (!arg) return null
  return { cmd, arg }
}

interface DispatchOpts {
  userId: string
  roomId: string
  branchId: string
  branchName?: string
  clientMsgId: string
  parsed: ParsedQueueCommand
}

export interface DispatchResult {
  ok: boolean
  error?: string
  queueId?: string
  position?: number
}

async function findDriver(hint: string): Promise<{ id: string; name: string; driver_id: string } | null> {
  const s = hint.trim()
  const { data } = await supabase
    .from('raos_drivers')
    .select('id, name, driver_id')
    .or(`driver_id.eq.${s},barcode.eq.${s}`)
    .eq('is_active', true)
    .maybeSingle()
  return data ?? null
}

async function postQueueEventChat(opts: {
  roomId: string
  senderId: string
  clientMsgId: string
  event: string
  driverName?: string
  driverId?: string
  position?: number
  extra?: Record<string, unknown>
}) {
  const content = JSON.stringify({
    event: opts.event,
    driver_name: opts.driverName ?? null,
    driver_id: opts.driverId ?? null,
    position: opts.position ?? null,
    ...opts.extra,
  })
  await supabase.from('chat_messages').insert({
    room_id: opts.roomId,
    sender_id: opts.senderId,
    type: 'driver_queue',
    content,
    client_id: opts.clientMsgId,
  })
}

async function notifyQueueEvent(roomId: string, event: string, driverName?: string, position?: number) {
  const [{ data: membersData }, { data: roomData }] = await Promise.all([
    supabase.from('chat_room_members').select('user_id').eq('room_id', roomId),
    supabase.from('chat_rooms').select('name').eq('id', roomId).maybeSingle(),
  ])
  const userIds = Array.from(
  new Set(
    (membersData ?? [])
      .map((row: any) => row.user_id)
      .filter(Boolean)
  )
)
  const titleMap: Record<string, string> = {
    joined: 'Driver masuk antrean',
    called: 'Driver dipanggil',
    completed: 'Antrian driver selesai',
    left: 'Driver keluar antrean',
  }
  const bodyMap: Record<string, string> = {
    joined: driverName ? `${driverName} masuk antrean${position ? ` di posisi #${position}` : ''}.` : 'Driver baru masuk antrean.',
    called: driverName ? `${driverName} dipanggil${position ? ` untuk posisi #${position}` : ''}.` : 'Driver dipanggil.',
    completed: driverName ? `${driverName} menyelesaikan antrean${position ? ` posisi #${position}` : ''}.` : 'Antrian driver selesai.',
    left: driverName ? `${driverName} keluar antrean${position ? ` dari posisi #${position}` : ''}.` : 'Driver keluar antrean.',
  }

  void invokePush({
    user_ids: userIds,
    title: titleMap[event] ?? 'Update antrian driver',
    body: `${roomData?.name ? `${roomData.name}: ` : ''}${bodyMap[event] ?? 'Ada update antrian driver.'}`,
    url: '/chat',
    tag: `queue-event-${roomId}-${event}`,
    kategori: 'chat_room',
  })
}

export async function dispatchDriverQueue(opts: DispatchOpts): Promise<DispatchResult> {
  const { userId, roomId, branchId, parsed, clientMsgId } = opts

  if (parsed.cmd === 'antri') {
    const driver = await findDriver(parsed.arg)
    if (!driver) return { ok: false, error: `Driver "${parsed.arg}" tidak ditemukan / non-aktif.` }
    const { data, error } = await supabase.rpc('raos_join_queue', {
      p_driver_id: driver.id,
      p_branch_id: branchId,
      p_room_id: roomId,
    })
    if (error) return { ok: false, error: error.message }
    const row = Array.isArray(data) ? data[0] : data
    const position = row?.queue_pos ?? null
    const queueId = row?.queue_id ?? null
    await postQueueEventChat({
      roomId, senderId: userId, clientMsgId,
      event: 'joined', driverName: driver.name, driverId: driver.driver_id, position,
      extra: { queue_id: queueId },
    })
    void notifyQueueEvent(roomId, 'joined', driver.name, position ?? undefined)
    return { ok: true, queueId, position }
  }

  if (parsed.cmd === 'panggil') {
    const pos = parseInt(parsed.arg, 10)
    if (!Number.isInteger(pos) || pos <= 0) return { ok: false, error: 'Nomor urut tidak valid.' }
    // Ambil driver info dulu sebelum call (untuk pesan chat)
    const { data: qRow } = await supabase
      .from('raos_driver_queue')
      .select('id, position, driver:raos_drivers(id, driver_id, name)')
      .eq('branch_id', branchId)
      .eq('position', pos)
      .eq('status', 'waiting')
      .maybeSingle()
    if (!qRow) return { ok: false, error: `Tidak ada driver di posisi ${pos} (status waiting).` }
    const drv = (qRow as any).driver as { id: string; driver_id: string; name: string } | null
    const { data, error } = await supabase.rpc('raos_call_driver', {
      p_branch_id: branchId,
      p_position: pos,
    })
    if (error) return { ok: false, error: error.message }
    await postQueueEventChat({
      roomId, senderId: userId, clientMsgId,
      event: 'called', driverName: drv?.name, driverId: drv?.driver_id, position: pos,
      extra: { queue_id: data },
    })
    void notifyQueueEvent(roomId, 'called', drv?.name, pos)
    return { ok: true, queueId: data as string, position: pos }
  }

  if (parsed.cmd === 'selesai') {
    const pos = parseInt(parsed.arg, 10)
    if (!Number.isInteger(pos) || pos <= 0) return { ok: false, error: 'Nomor urut tidak valid.' }
    const { data: qRow } = await supabase
      .from('raos_driver_queue')
      .select('id, driver:raos_drivers(id, driver_id, name)')
      .eq('branch_id', branchId)
      .eq('position', pos)
      .eq('status', 'called')
      .maybeSingle()
    if (!qRow) return { ok: false, error: `Tidak ada driver di posisi ${pos} yang berstatus dipanggil.` }
    const drv = (qRow as any).driver as { id: string; driver_id: string; name: string } | null
    const queueId = (qRow as any).id as string
    const { error } = await supabase.rpc('raos_complete_queue', { p_queue_id: queueId })
    if (error) return { ok: false, error: error.message }
    await postQueueEventChat({
      roomId, senderId: userId, clientMsgId,
      event: 'completed', driverName: drv?.name, driverId: drv?.driver_id, position: pos,
      extra: { queue_id: queueId },
    })
    void notifyQueueEvent(roomId, 'completed', drv?.name, pos)
    return { ok: true, queueId }
  }

  if (parsed.cmd === 'keluar') {
    const driver = await findDriver(parsed.arg)
    if (!driver) return { ok: false, error: `Driver "${parsed.arg}" tidak ditemukan.` }
    const { data: qRow } = await supabase
      .from('raos_driver_queue')
      .select('id, position')
      .eq('branch_id', branchId)
      .eq('driver_id', driver.id)
      .in('status', ['waiting', 'called'])
      .maybeSingle()
    if (!qRow) return { ok: false, error: `Driver ${driver.name} tidak ada di queue aktif.` }
    const { error } = await supabase.rpc('raos_leave_queue', { p_queue_id: (qRow as any).id })
    if (error) return { ok: false, error: error.message }
    await postQueueEventChat({
      roomId, senderId: userId, clientMsgId,
      event: 'left', driverName: driver.name, driverId: driver.driver_id, position: (qRow as any).position,
      extra: { queue_id: (qRow as any).id },
    })
    void notifyQueueEvent(roomId, 'left', driver.name, (qRow as any).position)
    return { ok: true, queueId: (qRow as any).id }
  }

  return { ok: false, error: 'Command tidak dikenal.' }
}
