'use client'

import { useEffect, useState } from 'react'
import { Wallet, CheckCircle2, XCircle, Clock } from 'lucide-react'
import { approveSaldoRequest, rejectSaldoRequest } from '@/lib/saldoRequest'
import { supabase } from '@/lib/supabase'

interface SaldoContent {
  request_id: string
  request_no: string
  staff_name: string
  branch_slug?: string | null
  branch_name?: string | null
  branch_id?: string | null       // baru — ID Cabang UUID
  nominal: number
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  is_processed?: boolean
  driver_login_id?: string | null // baru — ID Login (mis. 200878173)
  driver_name?: string | null
  driver_branch_name?: string | null // baru — cabang driver (bisa beda dari cabang staff)
  requested_at?: string | null
  processed_at?: string | null
}

interface Props {
  raw: string
  messageId?: string
  currentUserId: string
  currentUserRole: string
  onUpdated?: () => void
}

function parse(raw: string): SaldoContent | null {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

const canApprove = (role: string) =>
  ['koordinator', 'admin', 'management', 'direksi'].includes(role)

export default function SaldoRequestCard({ raw, messageId, currentUserId, currentUserRole, onUpdated }: Props) {
  const data = parse(raw)
  const requestId = data?.request_id
  const [busy, setBusy] = useState(false)
  const [rejectMode, setRejectMode] = useState(false)
  const [reason, setReason] = useState('')
  const [liveData, setLiveData] = useState<SaldoContent | null>(data)

  useEffect(() => {
    if (!requestId) return
    setLiveData(data)

    const channel = supabase
      .channel(`saldo-request:${requestId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'raos_saldo_requests', filter: `id=eq.${requestId}` }, payload => {
        const row = payload.new as any
        setLiveData(prev => ({
          ...(prev ?? data),
          request_id: requestId,
          request_no: row.request_no ?? prev?.request_no ?? data.request_no,
          nominal: row.nominal ?? prev?.nominal ?? data.nominal,
          status: row.status ?? prev?.status ?? data.status,
          is_processed: row.is_processed ?? prev?.is_processed ?? data.is_processed,
          processed_at: row.processed_at ?? prev?.processed_at ?? data.processed_at,
          driver_login_id: row.driver_login_id ?? prev?.driver_login_id ?? data.driver_login_id,
          driver_name: row.driver_name ?? prev?.driver_name ?? data.driver_name,
        }))
      })
      .subscribe()

    let cancelled = false
    void supabase.from('raos_saldo_requests')
      .select('id, request_no, nominal, status, is_processed, processed_at, rejection_reason, driver_login_id, driver_name')
      .eq('id', requestId)
      .maybeSingle()
      .then(({ data: row }) => {
        if (cancelled || !row) return
        setLiveData(prev => ({ ...(prev ?? data), request_id: requestId, request_no: row.request_no ?? prev?.request_no ?? data.request_no, nominal: row.nominal ?? prev?.nominal ?? data.nominal, status: row.status ?? prev?.status ?? data.status, is_processed: row.is_processed ?? prev?.is_processed ?? data.is_processed, processed_at: row.processed_at ?? prev?.processed_at ?? data.processed_at, driver_login_id: row.driver_login_id ?? prev?.driver_login_id ?? data.driver_login_id, driver_name: row.driver_name ?? prev?.driver_name ?? data.driver_name }))
      })

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [requestId, data])

  if (!data) return <p className="text-xs text-red-500">Pengajuan isi saldo (data tidak terbaca)</p>

  const live = liveData ?? data
  const nominalFmt = `Rp${Number(live.nominal).toLocaleString('id-ID')}`
  // is_processed adalah status FINAL dari admin (via centang sheet).
  // approve/reject koordinator hanya untuk validasi audit, tidak
  // mempengaruhi pengiriman ke sheet.
  const statusChip = (() => {
    if (live.is_processed) return { icon: CheckCircle2, label: 'Sudah Diisi oleh Admin', cls: 'bg-green-100 text-green-700' }
    switch (live.status) {
      case 'rejected': return { icon: XCircle, label: 'Ditolak', cls: 'bg-red-100 text-red-700' }
      case 'cancelled': return { icon: XCircle, label: 'Dibatalkan', cls: 'bg-gray-100 text-gray-600' }
      case 'approved': return { icon: Clock, label: 'Validasi ✓ — Menunggu Admin', cls: 'bg-blue-100 text-blue-700' }
      default: return { icon: Clock, label: 'Menunggu', cls: 'bg-amber-100 text-amber-700' }
    }
  })()
  const StatusIcon = statusChip.icon

  const isPending = live.status === 'pending' && !live.is_processed
  const showApproveBtn = isPending && canApprove(currentUserRole)

  async function handleApprove() {
    setBusy(true)
    const r = await approveSaldoRequest(live.request_id, currentUserId, messageId)
    setBusy(false)
    if (!r.ok) alert(r.error ?? 'Gagal setujui')
    else onUpdated?.()
  }

  async function handleReject() {
    if (!reason.trim()) { alert('Isi alasan penolakan.'); return }
    setBusy(true)
    const r = await rejectSaldoRequest(live.request_id, currentUserId, reason.trim(), messageId)
    setBusy(false)
    if (!r.ok) alert(r.error ?? 'Gagal tolak')
    else { setRejectMode(false); onUpdated?.() }
  }

  return (
    <div className="min-w-[240px] max-w-[320px] rounded-xl bg-white text-gray-900 border border-primary/30 p-3 shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <div className="bg-primary/15 rounded-lg p-1.5"><Wallet size={16} className="text-primary" /></div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-gray-800">Pengajuan Isi Saldo</p>
          <p className="text-[10px] text-gray-500 truncate">{live.request_no}</p>
        </div>
        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${statusChip.cls}`}>
          <StatusIcon size={10} />
          {statusChip.label}
        </span>
      </div>
      <div className="space-y-0.5 text-xs">
        {live.driver_login_id && (
          <div className="flex justify-between"><span className="text-gray-500">ID Driver</span><span className="font-mono text-[11px]">{live.driver_login_id}</span></div>
        )}
        {live.driver_name && (
          <div className="flex justify-between"><span className="text-gray-500">Nama Driver</span><span className="font-medium truncate max-w-[160px] text-right">{live.driver_name}</span></div>
        )}
        {(data.driver_branch_name || data.branch_name) && (
          <div className="flex justify-between"><span className="text-gray-500">Cabang</span><span className="font-medium truncate max-w-[160px] text-right">{data.driver_branch_name ?? data.branch_name}</span></div>
        )}
        <div className="flex justify-between"><span className="text-gray-500">Staff</span><span className="font-medium">{data.staff_name}</span></div>
        {data.requested_at && (
          <div className="flex justify-between">
            <span className="text-gray-500">Waktu</span>
            <span className="text-[11px]">{new Date(data.requested_at).toLocaleString('id-ID', {
              day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
            })}</span>
          </div>
        )}
        <div className="flex justify-between items-center pt-1 border-t border-gray-100">
          <span className="text-gray-500">Nominal</span>
          <span className="font-black text-primary text-base">{nominalFmt}</span>
        </div>
        {live.is_processed && live.processed_at && (
          <div className="rounded-md bg-green-50 px-2 py-1.5 text-[11px] text-green-700">
            Diisi admin pada {new Date(live.processed_at).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </div>
        )}
      </div>

      {showApproveBtn && !rejectMode && (
        <div className="grid grid-cols-2 gap-2 mt-3">
          <button
            disabled={busy}
            onClick={() => setRejectMode(true)}
            className="text-xs font-semibold py-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50">
            Tolak
          </button>
          <button
            disabled={busy}
            onClick={handleApprove}
            className="text-xs font-semibold py-1.5 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50">
            Setujui
          </button>
        </div>
      )}

      {rejectMode && (
        <div className="mt-3 space-y-2">
          <input
            autoFocus
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Alasan tolak..."
            className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded-lg" />
          <div className="grid grid-cols-2 gap-2">
            <button
              disabled={busy}
              onClick={() => { setRejectMode(false); setReason('') }}
              className="text-xs font-semibold py-1.5 rounded-lg bg-gray-100 text-gray-600">
              Batal
            </button>
            <button
              disabled={busy}
              onClick={handleReject}
              className="text-xs font-semibold py-1.5 rounded-lg bg-red-600 text-white disabled:opacity-50">
              Kirim
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
