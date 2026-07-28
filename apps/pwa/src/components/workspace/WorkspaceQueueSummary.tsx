'use client'

import type { QueueHistoryItem, QueueSummary } from './types'

interface Props {
  summary: QueueSummary
  history: QueueHistoryItem[]
}

export default function WorkspaceQueueSummary({ summary, history }: Props) {
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
            {history.map(item => (
              <div key={item.id} className="flex items-center justify-between gap-2 rounded-lg bg-amber-50 px-2 py-1.5">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-gray-800 truncate">{item.driver?.name ?? 'Driver'}</p>
                  <p className="text-[10px] text-gray-500">
                    Posisi #{item.position ?? '-'} · {(item.status ?? 'unknown').toUpperCase()}
                  </p>
                </div>
                <p className="text-[10px] text-gray-500 whitespace-nowrap">
                  {item.called_at ? new Date(item.called_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '—'}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
      <p className="mt-2 text-[10px] text-gray-500">
        Perintah cepat: /antri &lt;driver_id&gt; · /panggil &lt;posisi&gt; · /selesai &lt;posisi&gt; · /keluar &lt;driver_id&gt;
      </p>
    </div>
  )
}
