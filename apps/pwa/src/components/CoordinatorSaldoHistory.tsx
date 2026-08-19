'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import clsx from 'clsx'

interface Row {
  id: string
  request_id: string
  driver_login_id: string
  driver_name: string | null
  nominal: number
  requested_at: string
  status: string
  aist_reference: string | null
}

interface RequestSnapshot {
  status: string
  is_processed: boolean
}

// Bug 2 fix (2026-08-19): row ini dulu render `aist_jobs.status` mentah
// (queued/timeout/dst) sebagai satu-satunya status, sehingga kontradiksi
// dengan ringkasan di atasnya (summary /validasi-saldo pakai
// raos_saldo_requests.is_processed — "SUDAH DIISI Rp370.000") sementara
// row lama di sini masih nunjukin "queued" dari aist_jobs legacy yang
// tidak pernah diupdate (job lama expired/timeout tapi request-nya sendiri
// sudah diproses lewat jalur lain, mis. manual). aist_jobs TETAP dibaca
// (lifecycle AIST asli, tidak dihapus/diubah di DB) tapi statusnya
// sekarang SEKUNDER — badge utama ikut raos_saldo_requests, exact logika
// yang sama dengan apps/pwa/src/app/validasi-saldo/page.tsx biar 2 section
// di 1 halaman tidak pernah kontradiksi lagi.
function primaryStatusBadge(req: RequestSnapshot | undefined) {
  if (!req) return { label: 'MENUNGGU', cls: 'bg-yellow-100 text-yellow-700' }
  if (req.is_processed) return { label: 'SUDAH DIISI', cls: 'bg-green-100 text-green-700' }
  if (req.status === 'rejected' || req.status === 'cancelled') return { label: 'DITOLAK', cls: 'bg-red-100 text-red-700' }
  return { label: 'MENUNGGU', cls: 'bg-yellow-100 text-yellow-700' }
}

function aistAuditLabel(status: string) {
  if (status === 'success') return 'Audit AIST: success'
  if (status === 'queued') return 'Audit AIST: queued'
  if (status === 'timeout') return 'Audit AIST: timeout'
  if (status === 'mismatch') return 'Audit AIST: mismatch'
  return `Audit AIST: ${status}`
}

export default function CoordinatorSaldoHistory() {
  const [rows, setRows] = useState<Row[]>([])
  const [requestMap, setRequestMap] = useState<Map<string, RequestSnapshot>>(new Map())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    supabase
      .from('aist_jobs')
      .select('id,request_id,driver_login_id,driver_name,nominal,requested_at,status,aist_reference')
      .order('requested_at', { ascending:false })
      .limit(200)
      .then(async ({ data }) => {
        if (cancelled) return
        const jobRows = (data ?? []) as Row[]
        setRows(jobRows)

        // Primary status source: raos_saldo_requests, SAMA persis dengan
        // /validasi-saldo — client filter ini murni UX, RLS (is_branch_in_scope)
        // tetap otoritas scope, kita hanya join by request_id untuk display.
        const requestIds = Array.from(new Set(jobRows.map(r => r.request_id).filter(Boolean)))
        if (requestIds.length > 0) {
          const { data: reqData } = await supabase
            .from('raos_saldo_requests')
            .select('id, status, is_processed')
            .in('id', requestIds)
          if (!cancelled && reqData) {
            setRequestMap(new Map(reqData.map((r: any) => [r.id, { status: r.status, is_processed: r.is_processed }])))
          }
        }
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  if (loading) return <div className="card text-sm text-gray-400">Memuat riwayat cabang...</div>

  return (
    <section className="card">
      <h2 className="text-sm font-bold text-gray-800 mb-3">Riwayat Isi Saldo Cabang</h2>
      <div className="space-y-2">
        {rows.map(row => {
          const badge = primaryStatusBadge(requestMap.get(row.request_id))
          return (
            <div key={row.id} className="rounded-xl border border-gray-100 p-3">
              <div className="flex justify-between gap-3">
                <div>
                  <p className="text-xs font-bold text-gray-800">{row.driver_name || row.driver_login_id}</p>
                  <p className="text-[10px] text-gray-400">ID {row.driver_login_id}</p>
                </div>
                <p className="text-sm font-black">Rp{Number(row.nominal).toLocaleString('id-ID')}</p>
              </div>
              <div className="flex items-center justify-between mt-2">
                <span className="text-[10px] text-gray-500">{new Date(row.requested_at).toLocaleString('id-ID')}</span>
                <span className={clsx('text-[9px] font-bold px-1.5 py-0.5 rounded-full', badge.cls)}>{badge.label}</span>
              </div>
              <p className="text-[9px] text-gray-400 mt-1">{aistAuditLabel(row.status)}</p>
              {row.aist_reference && (
                <p className="text-[10px] text-gray-400 mt-0.5">Ref AIST: {row.aist_reference}</p>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
