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

export default function CoordinatorInvoiceValidation() {
  const [rows, setRows] = useState<InvoiceValidation[]>([])
  const [busy, setBusy] = useState<string | null>(null)

  async function load() {
    const { data } = await supabase
      .from('aist_invoice_daily_validation')
      .select('*')
      .order('invoice_date', { ascending:false })
      .limit(31)
    setRows((data ?? []) as InvoiceValidation[])
  }

  useEffect(() => { void load() }, [])

  async function act(id: string, action: 'validate' | 'correction') {
    let note: string | null = null
    if (action === 'correction') {
      note = window.prompt('Tuliskan koreksi yang harus diperiksa admin:')
      if (!note) return
    }

    setBusy(id)
    const { error } = await supabase.rpc('aist_validate_invoice_daily', {
      p_validation_id: id,
      p_action: action,
      p_note: note,
    })
    setBusy(null)

    if (error) {
      window.alert(error.message)
      return
    }
    await load()
  }

  return (
    <section className="card">
      <h2 className="text-sm font-bold text-gray-800">Validasi Invoice Harian</h2>
      <p className="text-[11px] text-gray-400 mt-1 mb-3">
        Hanya transaksi Lunas yang telah tervalidasi AIST.
      </p>

      <div className="space-y-3">
        {rows.map(row => {
          const clean = row.mismatch_count === 0 && row.aist_valid_count === row.total_transactions
          return (
            <article key={row.id} className="rounded-xl border border-gray-100 p-3">
              <div className="flex justify-between gap-3">
                <div>
                  <p className="text-xs font-black text-gray-800">
                    {new Date(row.invoice_date + 'T00:00:00').toLocaleDateString('id-ID', { dateStyle:'long' })}
                  </p>
                  <p className="text-[10px] text-gray-400 mt-1">{row.total_transactions} transaksi</p>
                </div>
                <p className="text-sm font-black">
                  Rp{Number(row.total_nominal).toLocaleString('id-ID')}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 mt-3 text-[10px]">
                <div className="bg-green-50 rounded-lg p-2">
                  AIST Valid: <b>{row.aist_valid_count}</b>
                </div>
                <div className={row.mismatch_count ? 'bg-red-50 rounded-lg p-2' : 'bg-gray-50 rounded-lg p-2'}>
                  Mismatch: <b>{row.mismatch_count}</b>
                </div>
              </div>

              <div className="flex gap-2 mt-3">
                <button
                  disabled={busy === row.id || !clean || row.status === 'validated'}
                  onClick={() => act(row.id, 'validate')}
                  className="flex-1 rounded-lg bg-green-600 text-white text-xs font-bold py-2 disabled:opacity-40"
                >
                  ✓ Validasi
                </button>
                <button
                  disabled={busy === row.id}
                  onClick={() => act(row.id, 'correction')}
                  className="flex-1 rounded-lg bg-amber-100 text-amber-800 text-xs font-bold py-2 disabled:opacity-40"
                >
                  Ajukan Koreksi
                </button>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
