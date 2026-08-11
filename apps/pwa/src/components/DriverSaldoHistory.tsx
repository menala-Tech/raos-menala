'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface Row {
  id: string
  driver_login_id: string
  driver_name: string | null
  nominal: number
  requested_at: string
  completed_at: string | null
  status: string
  aist_reference: string | null
}

export default function DriverSaldoHistory() {
  const [rows, setRows] = useState<Row[]>([])

  useEffect(() => {
    let cancelled = false
    supabase
      .from('aist_jobs')
      .select('id,driver_login_id,driver_name,nominal,requested_at,completed_at,status,aist_reference')
      .order('requested_at', { ascending:false })
      .limit(100)
      .then(({ data }) => {
        if (!cancelled) setRows((data ?? []) as Row[])
      })
    return () => { cancelled = true }
  }, [])

  return (
    <section className="card">
      <h2 className="text-sm font-bold text-gray-800 mb-3">Riwayat Pengajuan Saldo Saya</h2>
      <div className="space-y-2">
        {rows.map(row => (
          <div key={row.id} className="rounded-xl border border-gray-100 p-3">
            <div className="flex justify-between">
              <span className="text-xs font-bold">Rp{Number(row.nominal).toLocaleString('id-ID')}</span>
              <span className="text-[10px]">{row.status === 'success' ? '✅ Sudah Diisi' : '⏳ ' + row.status}</span>
            </div>
            <p className="text-[10px] text-gray-400 mt-1">
              Diajukan {new Date(row.requested_at).toLocaleString('id-ID')}
            </p>
            {row.completed_at && (
              <p className="text-[10px] text-gray-400">
                Diproses {new Date(row.completed_at).toLocaleString('id-ID')}
              </p>
            )}
            {row.aist_reference && (
              <p className="text-[10px] text-gray-400">Ref AIST: {row.aist_reference}</p>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
