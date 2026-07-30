'use client'

import { useState } from 'react'
import { Loader2, PhoneCall, CheckCircle2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { QueueHistoryItem, QueueSummary } from './types'

interface Props {
  summary: QueueSummary
  history: QueueHistoryItem[]
  branchId?: string | null
  currentUserRole?: string
  onChanged?: () => void
}

const CAN_ACT = ['staff','koordinator','admin','management','direksi']

export default function WorkspaceQueueSummary({
  summary, history, branchId, currentUserRole, onChanged,
}: Props) {
  const [busy, setBusy] = useState<string | null>(null)
  const canAct = currentUserRole ? CAN_ACT.includes(currentUserRole) : false

  async function callDriver(position: number) {
    if (!branchId) return
    setBusy(`call-${position}`)
    const { error } = await supabase.rpc('raos_call_driver', {
      p_branch_id: branchId, p_position: position,
    })
    setBusy(null)
    if (error) alert('Gagal panggil driver: ' + error.message)
    else onChanged?.()
  }

  async function completeQueue(id: string) {
    setBusy(`done-${id}`)
    const { error } = await supabase.rpc('raos_complete_queue', { p_queue_id: id })
    setBusy(null)
    if (error) alert('Gagal tandai selesai: ' + error.message)
    else onChanged?.()
  }

  return (
    <div className="border-b border-amber-100 bg-amber-50/80 px-4 py-3 flex-shrink-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-700">Queue Driver</p>
          <p className="text-sm font-semibold text-gray-800">
            {summary.waiting} menunggu · {summary.called} dipanggil · {summary.completed} selesai
          </p>
          <p className="text-[11px] text-gray-600 mt-0.5">
            {summary.activeDriver ? `Aktif: ${summary.activeDriver}` : 'Belum ada driver dipanggil'}
            {summary.nextPosition ? ` · posisi berikut: #${summary.nextPosition}` : ''}
          </p>
        </div>
        <div className="rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold text-amber-700 shadow-sm">
          {summary.called > 0 ? 'Live' : 'Siap'}
        </div>
      </div>
      {history.length > 0 && (
        <div className="mt-2 rounded-xl border border-amber-200 bg-white/70 p-2.5">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-700">Riwayat Terbaru</p>
          <div className="space-y-1.5">
            {history.map(item => {
              const status = (item.status ?? 'unknown').toLowerCase()
              const isWaiting = status === 'waiting'
              const isCalled = status === 'called'
              return (
                <div key={item.id} className="flex items-center justify-between gap-2 rounded-lg bg-amber-50 px-2 py-1.5">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold text-gray-800 truncate">{item.driver?.name ?? 'Driver'}</p>
                    <p className="text-[10px] text-gray-500">
                      Posisi #{item.position ?? '-'} · {status.toUpperCase()}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {canAct && isWaiting && typeof item.position === 'number' && (
                      <button
                        disabled={busy === `call-${item.position}`}
                        onClick={() => callDriver(item.position as number)}
                        className="flex items-center gap-1 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-semibold px-2 py-1 disabled:opacity-50"
                        title="Panggil driver"
                      >
                        {busy === `call-${item.position}` ? <Loader2 size={10} className="animate-spin" /> : <PhoneCall size={10} />}
                        Panggil
                      </button>
                    )}
                    {canAct && isCalled && (
                      <button
                        disabled={busy === `done-${item.id}`}
                        onClick={() => completeQueue(item.id)}
                        className="flex items-center gap-1 rounded-full bg-green-600 hover:bg-green-700 text-white text-[10px] font-semibold px-2 py-1 disabled:opacity-50"
                        title="Tandai selesai"
                      >
                        {busy === `done-${item.id}` ? <Loader2 size={10} className="animate-spin" /> : <CheckCircle2 size={10} />}
                        Selesai
                      </button>
                    )}
                    <p className="text-[10px] text-gray-500 whitespace-nowrap min-w-[38px] text-right">
                      {item.called_at ? new Date(item.called_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '—'}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
      <p className="mt-2 text-[10px] text-gray-500">
        Gunakan tombol <span className="font-semibold text-amber-700">+ Antrian Driver</span> untuk masukkan driver ke antrean.
        {canAct ? ' Tekan Panggil / Selesai di kartu di atas untuk kelola langsung.' : ' Kelola dari halaman Antrian Driver.'}
      </p>
    </div>
  )
}
