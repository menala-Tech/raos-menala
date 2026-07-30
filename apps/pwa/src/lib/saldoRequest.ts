import { supabase } from './supabase'
import { invokePush } from './pushClient'

/**
 * Parse dan handle chat command untuk pengajuan isi saldo.
 *
 * Format command: `/isisaldo <nominal>` — mis. `/isisaldo 45000`
 * atau `/isisaldo 45k` (support suffix k).
 *
 * Return null kalau bukan command isisaldo. Kalau ya, return object hasil.
 * Handle:
 *  1. Parse nominal
 *  2. Validate nominal terhadap branches.saldo_nominal_options user cabang
 *  3. Insert row raos_saldo_requests (RLS enforce staff_id = auth.uid)
 *  4. Insert chat_messages type='saldo_request' dengan content JSON
 *  5. Link chat_message_id + chat_room_id ke request row
 */

// Match: /isisaldo 95000, /isi saldo 95000, /isi_saldo 95000, /isi-saldo 95000
const CMD_REGEX = /^\/isi[\s_-]?saldo\s+(\S+)/i

export interface ParsedCommand {
  raw: string
  nominal: number
}

export function parseIsiSaldoCommand(text: string): ParsedCommand | null {
  const m = text.trim().match(CMD_REGEX)
  if (!m) return null
  const rawNominal = m[1].toLowerCase().replace(/[.,]/g, '')
  // Support suffix k (mis. 45k = 45000)
  let nominal: number
  if (rawNominal.endsWith('k')) {
    nominal = parseFloat(rawNominal.slice(0, -1)) * 1000
  } else {
    nominal = parseFloat(rawNominal)
  }
  if (!nominal || isNaN(nominal) || nominal <= 0) return null
  return { raw: text, nominal }
}

export interface SubmitResult {
  ok: boolean
  error?: string
  requestNo?: string
  requestId?: string
}

interface SubmitOpts {
  userId: string
  branchId: string | null | undefined
  branchSlug?: string
  branchName?: string
  fullName: string
  roomId: string
  clientMsgId: string
  nominal: number
  allowedNominals: number[]
  // Driver info — wajib per feedback 30 Juli 2026 sore. Input manual driver_id
  // di IsiSaldoBottomSheet, di-lookup dulu ke raos_drivers. Kalau null berarti
  // caller belum lookup — di sini kita validate & block.
  driverIdRef?: string | null       // raos_drivers.id (UUID)
  driverLoginId?: string | null     // raos_drivers.driver_id (text yang di-input user)
  driverName?: string | null        // raos_drivers.name
  driverBranchName?: string | null  // opsional snapshot cabang driver
}

async function postSaldoSystemMessage(opts: {
  roomId: string
  senderId: string
  requestNo: string
  nominal: number
  status: 'approved' | 'rejected' | 'processed'
  note?: string
}) {
  const label = opts.status === 'processed'
    ? '✅ Saldo sudah diisi oleh admin.'
    : opts.status === 'rejected'
      ? '❌ Pengajuan saldo ditolak.'
      : '✅ Pengajuan saldo disetujui.'
  const content = `${label}\n${opts.requestNo} • Rp${Number(opts.nominal).toLocaleString('id-ID')}\n${opts.note ?? ''}`.trim()

  await supabase.from('chat_messages').insert({
    room_id: opts.roomId,
    sender_id: opts.senderId,
    type: 'text',
    content,
  })
}

function newRequestNo(nominal: number): string {
  const now = new Date()
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  const hh = String(now.getHours()).padStart(2, '0')
  const mi = String(now.getMinutes()).padStart(2, '0')
  const ss = String(now.getSeconds()).padStart(2, '0')
  const rnd = Math.floor(Math.random() * 900 + 100)
  return `SLD-${yyyy}${mm}${dd}-${hh}${mi}${ss}-${rnd}`
}

export async function submitIsiSaldo(opts: SubmitOpts): Promise<SubmitResult> {
  const { userId, branchId, branchSlug, branchName, fullName, roomId, clientMsgId, nominal, allowedNominals,
          driverIdRef, driverLoginId, driverName, driverBranchName } = opts

  if (!branchId) {
    return { ok: false, error: 'Cabang tidak diketahui — hubungi admin untuk set branch di /admin.' }
  }
  if (!driverIdRef || !driverLoginId || !driverName) {
    return { ok: false, error: 'Driver wajib diisi. Ketik ID Driver dulu (mis. M6X1U) untuk auto-lookup nama & cabang.' }
  }
  if (allowedNominals.length > 0 && !allowedNominals.includes(nominal)) {
    return {
      ok: false,
      error: `Nominal Rp${nominal.toLocaleString('id-ID')} tidak tersedia untuk cabang ini. Pilihan: ${allowedNominals.map(n => 'Rp' + n.toLocaleString('id-ID')).join(', ')}`,
    }
  }

  // Auto-route ke room "Pengisian Saldo — <Cabang>" berdasarkan branchId
  // regardless of activeRoom user. Feedback 30 Juli: pengajuan saldo Batam
  // bocor ke room "Umum" karena user (direksi/admin) buka Umum saat submit.
  // Cari room saldo cabang yang match. Kalau tidak ketemu, fallback ke
  // roomId lama (backward-compat) dengan warning.
  const { data: saldoRoom } = await supabase
    .from('chat_rooms')
    .select('id')
    .eq('branch_id', branchId)
    .eq('is_active', true)
    .or('name.ilike.%pengisian saldo%,name.ilike.%isi saldo%')
    .limit(1)
    .maybeSingle()

  const targetRoomId = saldoRoom?.id ?? roomId
  if (!saldoRoom) {
    console.warn(`[submitIsiSaldo] Room "Pengisian Saldo — <cabang>" tidak ditemukan untuk branch ${branchId}. Fallback ke ${roomId}. Minta admin bulk-create room via /admin.`)
  }

  const requestNo = newRequestNo(nominal)
  const { data: request, error: reqErr } = await supabase
    .from('raos_saldo_requests')
    .insert({
      request_no: requestNo,
      staff_id: userId,
      branch_id: branchId,
      nominal,
      status: 'pending',
      chat_room_id: targetRoomId,
      driver_id: driverIdRef,
      driver_login_id: driverLoginId,
      driver_name: driverName,
    })
    .select('id, request_no')
    .single()

  if (reqErr || !request) {
    return { ok: false, error: reqErr?.message ?? 'Gagal simpan pengajuan.' }
  }

  const content = JSON.stringify({
    request_id: request.id,
    request_no: request.request_no,
    staff_name: fullName,
    branch_slug: branchSlug ?? null,
    branch_name: branchName ?? null,
    branch_id: branchId,
    nominal,
    status: 'pending',
    requested_at: new Date().toISOString(),
    // Driver snapshot untuk render card tanpa join tambahan di client
    driver_login_id: driverLoginId,
    driver_name: driverName,
    driver_branch_name: driverBranchName ?? null,
  })

  const { data: msg, error: msgErr } = await supabase
    .from('chat_messages')
    .insert({
      room_id: targetRoomId,
      sender_id: userId,
      type: 'saldo_request',
      content,
      client_id: clientMsgId,
    })
    .select('id')
    .single()

  if (msgErr) {
    return { ok: false, error: `Pengajuan tersimpan (${request.request_no}) tapi gagal post ke chat: ${msgErr.message}` }
  }

  if (msg) {
    // Link msg_id ke request (fire-and-forget)
    void supabase.from('raos_saldo_requests').update({ chat_message_id: msg.id }).eq('id', request.id)
  }

  return { ok: true, requestNo: request.request_no, requestId: request.id }
}

async function syncSaldoRequestMessageStatus(messageId: string | undefined, status: string, extra: Record<string, unknown> = {}) {
  if (!messageId) return
  const { data: existingMsg, error: fetchErr } = await supabase
    .from('chat_messages')
    .select('content')
    .eq('id', messageId)
    .maybeSingle()
  if (fetchErr || !existingMsg?.content) return
  try {
    const parsed = JSON.parse(existingMsg.content as string)
    const nextPayload = JSON.stringify({ ...parsed, ...extra, status })
    await supabase.from('chat_messages').update({ content: nextPayload }).eq('id', messageId)
  } catch {
    // ignore malformed content; keep request row update as source of truth
  }
}

export async function approveSaldoRequest(requestId: string, approverId: string, messageId?: string): Promise<{ ok: boolean; error?: string }> {
  const { data: row, error } = await supabase
    .from('raos_saldo_requests')
    .update({ status: 'approved', approved_by: approverId, approved_at: new Date().toISOString() })
    .eq('id', requestId)
    .eq('status', 'pending')
    .select('staff_id, request_no, nominal, chat_room_id')
    .single()
  if (error) return { ok: false, error: error.message }
  await syncSaldoRequestMessageStatus(messageId, 'approved')
  if (row?.chat_room_id) {
    void postSaldoSystemMessage({
      roomId: row.chat_room_id,
      senderId: approverId,
      requestNo: row.request_no,
      nominal: Number(row.nominal),
      status: 'approved',
      note: 'Pengajuan saldo telah disetujui oleh koordinator. Menunggu admin mengisi saldo.',
    })
  }
  if (row?.staff_id) {
    void invokePush({
      user_ids: [row.staff_id],
      title: 'Pengajuan Isi Saldo Divalidasi',
      body: `${row.request_no} Rp${Number(row.nominal).toLocaleString('id-ID')} disetujui koord. Menunggu admin proses.`,
      url: '/riwayat',
      tag: `saldo-approved-${requestId}`,
      kategori: 'pengumuman',
    })
  }
  return { ok: true }
}

export async function rejectSaldoRequest(requestId: string, approverId: string, reason: string, messageId?: string): Promise<{ ok: boolean; error?: string }> {
  const { data: row, error } = await supabase
    .from('raos_saldo_requests')
    .update({ status: 'rejected', approved_by: approverId, approved_at: new Date().toISOString(), rejection_reason: reason })
    .eq('id', requestId)
    .eq('status', 'pending')
    .select('staff_id, request_no, nominal, chat_room_id')
    .single()
  if (error) return { ok: false, error: error.message }
  await syncSaldoRequestMessageStatus(messageId, 'rejected', { rejection_reason: reason })
  if (row?.chat_room_id) {
    void postSaldoSystemMessage({
      roomId: row.chat_room_id,
      senderId: approverId,
      requestNo: row.request_no,
      nominal: Number(row.nominal),
      status: 'rejected',
      note: `Pengajuan saldo ditolak. Alasan: ${reason}`,
    })
  }
  if (row?.staff_id) {
    void invokePush({
      user_ids: [row.staff_id],
      title: 'Pengajuan Isi Saldo Ditolak',
      body: `${row.request_no} Rp${Number(row.nominal).toLocaleString('id-ID')} ditolak. Alasan: ${reason}`,
      url: '/riwayat',
      tag: `saldo-rejected-${requestId}`,
      kategori: 'pengumuman',
    })
  }
  return { ok: true }
}

/**
 * Tandai pengajuan saldo LUNAS oleh Finance/admin.
 *
 * SSOT lifecycle Paid ada di kolom `is_processed`, `processed_at`,
 * `processed_by`, `note`. Trigger DB `raos_saldo_after_processed`
 * (SECURITY DEFINER) mengambil alih efek samping "kelas Paid":
 *   - push notif langsung ke staff pemilik request
 *   - auto-chat "Terima kasih" ke room driver cabang
 *   - snapshot progress KPI ke chat pribadi staff
 *
 * Client tetap post system message ke room Saldo tempat request
 * berada (chat_room_id) supaya history di room itu utuh. Jangan
 * invokePush langsung — akan double dengan trigger.
 */
export async function markSaldoRequestProcessed(requestId: string, adminId: string, note?: string, messageId?: string): Promise<{ ok: boolean; error?: string }> {
  const { data: row, error } = await supabase
    .from('raos_saldo_requests')
    .update({
      status: 'approved',
      is_processed: true,
      processed_at: new Date().toISOString(),
      processed_by: adminId,
      note: note ?? null,
    })
    .eq('id', requestId)
    .select('staff_id, request_no, nominal, chat_room_id')
    .single()
  if (error) return { ok: false, error: error.message }
  await syncSaldoRequestMessageStatus(messageId, 'approved', {
    is_processed: true,
    processed_at: new Date().toISOString(),
    processed_by: adminId,
    note: note ?? null,
  })
  if (row?.chat_room_id) {
    void postSaldoSystemMessage({
      roomId: row.chat_room_id,
      senderId: adminId,
      requestNo: row.request_no,
      nominal: Number(row.nominal),
      status: 'processed',
      note: note ?? 'Saldo sudah diisi oleh admin.',
    })
  }
  return { ok: true }
}
