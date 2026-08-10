'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

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

/** Read-only; RLS membatasi Koordinator ke cabang sendiri. */
export default function CoordinatorSaldoHistory() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    supabase.from('aist_jobs')
      .select('id,request_id,driver_login_id,driver_name,nominal,requested_at,status,aist_reference')
      .order('requested_at', { ascending:false }).limit(200)
      .then(({ data }) => {
        if (!cancelled) { setRows((data ?? []) as Row[]); setLoading(false) }
      })
    return () => { cancelled = true }
  }, [])

  if (loading) return <div className="card text-sm text-gray-400">Memuat riwayat cabang...</div>
  return (
    <section className="card">
      <h2 className="text-sm font-bold text-gray-800 mb-3">Riwayat Isi Saldo Cabang</h2>
      <div className="space-y-2">
        {rows.map(row => (
          <div key={row.id} className="rounded-xl border border-gray-100 p-3">
            <div className="flex justify-between gap-3">
              <div><p className="text-xs font-bold text-gray-800">{row.driver_name || row.driver_login_id}</p><p className="text-[10px] text-gray-400">ID {row.driver_login_id}</p></div>
              <p className="text-sm font-black">Rp{Number(row.nominal).toLocaleString('id-ID')}</p>
            </div>
            <div className="flex justify-between mt-2 text-[10px] text-gray-500"><span>{new Date(row.requested_at).toLocaleString('id-ID')}</span><span>{row.status === 'success' ? '✅ AIST Valid' : row.status}</span></div>
            {row.aist_reference && <p className="text-[10px] text-gray-400 mt-1">Ref AIST: {row.aist_reference}</p>}
          </div>
        ))}
      </div>
    </section>
  )
}
