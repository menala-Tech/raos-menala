'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface InvoiceValidation {
  id: string
  invoice_date: string
  total_transactions: number
  total_nominal: number
  aist_valid_count: number
  mismatch_count: number
  status: 'pending' | 'validated' | 'correction_requested'
  correction_note: string | null
}

/** Koordinator read-only sesuai kontrak role sistem. */
export default function CoordinatorInvoiceValidation() {
  const [rows, setRows] = useState<InvoiceValidation[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    supabase.from('aist_invoice_daily_validation')
      .select('id,invoice_date,total_transactions,total_nominal,aist_valid_count,mismatch_count,status,correction_note')
      .order('invoice_date', { ascending:false }).limit(31)
      .then(({ data }) => {
        if (!cancelled) { setRows((data ?? []) as InvoiceValidation[]); setLoading(false) }
      })
    return () => { cancelled = true }
  }, [])

  if (loading) return <section className="card text-sm text-gray-400">Memuat validasi invoice...</section>
  return (
    <section className="card">
      <h2 className="text-sm font-bold text-gray-800">Validasi Invoice Harian</h2>
      <p className="text-[11px] text-gray-400 mt-1 mb-3">Mode lihat saja · Koordinator hanya melihat data cabangnya.</p>
      <div className="space-y-3">
        {rows.length === 0 && <p className="text-xs text-gray-400">Belum ada data.</p>}
        {rows.map(row => (
          <article key={row.id} className="rounded-xl border border-gray-100 p-3">
            <div className="flex justify-between gap-3">
              <div><p className="text-xs font-black text-gray-800">{new Date(row.invoice_date + 'T00:00:00').toLocaleDateString('id-ID', { dateStyle:'long' })}</p><p className="text-[10px] text-gray-400 mt-1">{row.total_transactions} transaksi · {row.status}</p></div>
              <p className="text-sm font-black">Rp{Number(row.total_nominal).toLocaleString('id-ID')}</p>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-3 text-[10px]"><div className="bg-green-50 rounded-lg p-2">AIST Valid: <b>{row.aist_valid_count}</b></div><div className={row.mismatch_count ? 'bg-red-50 rounded-lg p-2' : 'bg-gray-50 rounded-lg p-2'}>Mismatch: <b>{row.mismatch_count}</b></div></div>
            {row.correction_note && <p className="text-[10px] text-amber-700 mt-2">Catatan: {row.correction_note}</p>}
          </article>
        ))}
      </div>
    </section>
  )
}
