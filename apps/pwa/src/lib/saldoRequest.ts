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

const CMD_REGEX = /^\/isisaldo\s+(\S+)/i

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
  const { userId, branchId, branchSlug, branchName, fullName, roomId, clientMsgId, nominal, allowedNominals } = opts

  if (!branchId) {
    return { ok: false, error: 'Cabang tidak diketahui — hubungi admin untuk set branch di /admin.' }
  }
  if (allowedNominals.length > 0 && !allowedNominals.includes(nominal)) {
    return {
      ok: false,
      error: `Nominal Rp${nominal.toLocaleString('id-ID')} tidak tersedia untuk cabang ini. Pilihan: ${allowedNominals.map(n => 'Rp' + n.toLocaleString('id-ID')).join(', ')}`,
    }
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
      chat_room_id: roomId,
    })
    .select('id, request_no')
    .single()

  if (reqErr || !request) {
    return { ok: false, error: reqErr?.message ?? 'Gagal simpan pengajuan.' }
  }

  // Post chat message type='saldo_request'
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
  })

  const { data: msg, error: msgErr } = await supabase
    .from('chat_messages')
    .insert({
      room_id: roomId,
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

export async function approveSaldoRequest(requestId: string, approverId: string): Promise<{ ok: boolean; error?: string }> {
  const { data: row, error } = await supabase
    .from('raos_saldo_requests')
    .update({ status: 'approved', approved_by: approverId, approved_at: new Date().toISOString() })
    .eq('id', requestId)
    .eq('status', 'pending')
    .select('staff_id, request_no, nominal')
    .single()
  if (error) return { ok: false, error: error.message }
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

export async function rejectSaldoRequest(requestId: string, approverId: string, reason: string): Promise<{ ok: boolean; error?: string }> {
  const { data: row, error } = await supabase
    .from('raos_saldo_requests')
    .update({ status: 'rejected', approved_by: approverId, approved_at: new Date().toISOString(), rejection_reason: reason })
    .eq('id', requestId)
    .eq('status', 'pending')
    .select('staff_id, request_no, nominal')
    .single()
  if (error) return { ok: false, error: error.message }
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
