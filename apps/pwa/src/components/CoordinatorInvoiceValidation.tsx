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
        Invoice hanya dapat divalidasi jika seluruh transaksi Lunas sudah tercatat AIST valid,
        baik dari worker maupun konfirmasi manual Finance.
      </p>

      {rows.length === 0 && (
        <div className="rounded-xl bg-gray-50 px-3 py-4 text-center text-[11px] text-gray-400">
          Belum ada invoice harian untuk scope cabang Anda.
        </div>
      )}

      <div className="space-y-3">
        {rows.map(row => {
          const clean = row.total_transactions > 0 && row.mismatch_count === 0 && row.aist_valid_count === row.total_transactions
          const statusLabel = row.status === 'validated'
            ? 'VALIDATED'
            : row.status === 'correction_requested'
              ? 'KOREKSI DIMINTA'
              : 'PENDING'
          const statusClass = row.status === 'validated'
            ? 'bg-green-100 text-green-700'
            : row.status === 'correction_requested'
              ? 'bg-amber-100 text-amber-700'
              : 'bg-gray-100 text-gray-600'

          return (
            <article key={row.id} className="rounded-xl border border-gray-100 p-3">
              <div className="flex justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-black text-gray-800">
                      {new Date(row.invoice_date + 'T00:00:00').toLocaleDateString('id-ID', { dateStyle:'long' })}
                    </p>
                    <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${statusClass}`}>{statusLabel}</span>
                  </div>
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

              {row.correction_note && (
                <div className="mt-3 rounded-lg bg-amber-50 px-2 py-2 text-[10px] text-amber-800">
                  Koreksi: {row.correction_note}
                </div>
              )}

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
