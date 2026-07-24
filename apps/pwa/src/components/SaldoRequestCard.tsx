'use client'

import { useState } from 'react'
import { Wallet, CheckCircle2, XCircle, Clock } from 'lucide-react'
import { approveSaldoRequest, rejectSaldoRequest } from '@/lib/saldoRequest'

interface SaldoContent {
  request_id: string
  request_no: string
  staff_name: string
  branch_slug?: string | null
  branch_name?: string | null
  nominal: number
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
}

interface Props {
  raw: string
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

export default function SaldoRequestCard({ raw, currentUserId, currentUserRole, onUpdated }: Props) {
  const data = parse(raw)
  const [busy, setBusy] = useState(false)
  const [rejectMode, setRejectMode] = useState(false)
  const [reason, setReason] = useState('')

  if (!data) return <p className="text-xs text-red-500">Pengajuan isi saldo (data tidak terbaca)</p>

  const nominalFmt = `Rp${Number(data.nominal).toLocaleString('id-ID')}`
  const statusChip = (() => {
    switch (data.status) {
      case 'approved': return { icon: CheckCircle2, label: 'Disetujui', cls: 'bg-green-100 text-green-700' }
      case 'rejected': return { icon: XCircle, label: 'Ditolak', cls: 'bg-red-100 text-red-700' }
      case 'cancelled': return { icon: XCircle, label: 'Dibatalkan', cls: 'bg-gray-100 text-gray-600' }
      default: return { icon: Clock, label: 'Menunggu', cls: 'bg-amber-100 text-amber-700' }
    }
  })()
  const StatusIcon = statusChip.icon

  const isPending = data.status === 'pending'
  const showApproveBtn = isPending && canApprove(currentUserRole)

  async function handleApprove() {
    setBusy(true)
    const r = await approveSaldoRequest(data!.request_id, currentUserId)
    setBusy(false)
    if (!r.ok) alert(r.error ?? 'Gagal setujui')
    else onUpdated?.()
  }

  async function handleReject() {
    if (!reason.trim()) { alert('Isi alasan penolakan.'); return }
    setBusy(true)
    const r = await rejectSaldoRequest(data!.request_id, currentUserId, reason.trim())
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
          <p className="text-[10px] text-gray-500 truncate">{data.request_no}</p>
        </div>
        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${statusChip.cls}`}>
          <StatusIcon size={10} />
          {statusChip.label}
        </span>
      </div>
      <div className="space-y-0.5 text-xs">
        <div className="flex justify-between"><span className="text-gray-500">Staff</span><span className="font-medium">{data.staff_name}</span></div>
        {data.branch_name && (
          <div className="flex justify-between"><span className="text-gray-500">Cabang</span><span className="font-medium truncate max-w-[160px] text-right">{data.branch_name}</span></div>
        )}
        <div className="flex justify-between items-center pt-1 border-t border-gray-100">
          <span className="text-gray-500">Nominal</span>
          <span className="font-black text-primary text-base">{nominalFmt}</span>
        </div>
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
