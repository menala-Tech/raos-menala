'use client'

import { useEffect, useRef, useState } from 'react'
import { X, Wallet, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { submitIsiSaldo } from '@/lib/saldoRequest'

interface DriverLookup {
  id: string
  driver_id: string
  name: string
  branch_id: string | null
  branch_name?: string | null
}

interface Props {
  userId: string
  userFullName: string
  branchId: string | null
  branchSlug?: string | null
  branchName?: string | null
  branchNominalOptions: number[]
  roomId: string
  onClose: () => void
  onSubmitted: () => void
}

/**
 * BottomSheet form Pengajuan Isi Saldo (input manual driver ID + auto-lookup).
 * Per feedback user 30 Juli 2026 sore, dropdown driver diganti input teks:
 *  - ID Driver (input manual — mis. "M6X1U")
 *  - Nama Driver (otomatis dari lookup raos_drivers.driver_id)
 *  - Cabang Driver (otomatis)
 *  - Staff (otomatis dari user login)
 *  - Nominal (pilihan chip sesuai branches.saldo_nominal_options)
 *
 * Kalau ID Driver tidak ketemu di raos_drivers, submit di-block.
 */
export default function IsiSaldoBottomSheet({
  userId, userFullName, branchId, branchSlug, branchName,
  branchNominalOptions, roomId, onClose, onSubmitted,
}: Props) {
  const [driverIdInput, setDriverIdInput] = useState('')
  const [driver, setDriver] = useState<DriverLookup | null>(null)
  const [lookupState, setLookupState] = useState<'idle' | 'searching' | 'found' | 'not_found' | 'error'>('idle')
  const [lookupErrMsg, setLookupErrMsg] = useState<string>('')
  const [selectedNominal, setSelectedNominal] = useState<number | null>(null)
  const [error, setError] = useState('')
  const debounceRef = useRef<number | null>(null)

  const branchSlugStr = branchSlug ?? undefined
  const branchNameStr = branchName ?? undefined

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current)
    const q = driverIdInput.trim()
    if (!q) { setDriver(null); setLookupState('idle'); return }
    setLookupState('searching')
    debounceRef.current = window.setTimeout(async () => {
      // Feedback 2026-08-07 (Isi Saldo UX #1+#2):
      //   (1) Debounce 250ms → 180ms — trigger lebih cepat setelah ketik
      //   (2) Query drivers + join branches DALAM 1 ROUNDTRIP via FK embed
      //       (raos_drivers_branch_id_fkey) — sebelumnya 2 RTT sequential
      //   (3) Branch name langsung tersedia saat state 'found' → tidak
      //       ada flash 'tidak diketahui' + form ready-to-submit lebih cepat
      const qEsc = q.replace(/[,()"]/g, '')
      const { data, error: lookupErr } = await supabase
        .from('raos_drivers')
        .select('id, driver_id, name, branch_id, branches(name)')
        .eq('is_active', true)
        .or(`driver_id.eq.${qEsc},driver_id.ilike.${qEsc}`)
        .limit(1)
        .maybeSingle()
      if (lookupErr) {
        console.warn('[IsiSaldoBottomSheet] driver lookup error', lookupErr)
        setLookupErrMsg(lookupErr.message ?? String(lookupErr))
        setLookupState('error')
        setDriver(null)
        return
      }
      setLookupErrMsg('')
      if (data) {
        // Supabase FK embed: branches shape = { name: string } | null
        const branchRel = (data as unknown as { branches?: { name?: string | null } | null }).branches
        setDriver({
          id: data.id,
          driver_id: data.driver_id,
          name: data.name,
          branch_id: data.branch_id,
          branch_name: branchRel?.name ?? null,
        })
        setLookupState('found')
      } else {
        setDriver(null)
        setLookupState('not_found')
      }
    }, 180)
    return () => { if (debounceRef.current) window.clearTimeout(debounceRef.current) }
  }, [driverIdInput])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!driver) { setError('ID Driver tidak valid. Cek ejaan atau minta admin daftarkan driver dulu.'); return }
    if (!selectedNominal) { setError('Pilih nominal dulu.'); return }

    // Feedback 2026-08-07 (Isi Saldo UX #3+#4): submit rasanya lambat karena
    // spinner block seluruh sheet selama RTT RPC (500-1500ms). Fix optimistic:
    //   (1) Snapshot input → close sheet SEGERA
    //   (2) RPC fire-in-background, bubble muncul via realtime subscribe
    //       chat page (INSERT chat_messages di raos_saldo_submit RPC)
    //   (3) Kalau RPC error → alert() (chat page pattern) supaya user tahu
    //   (4) Offline queue tetap bekerja: submitIsiSaldo enqueue kalau
    //       network fail; result.queued=true → sudah dianggap ok
    const payload = {
      userId, branchId, branchSlug: branchSlugStr, branchName: branchNameStr,
      fullName: userFullName, roomId,
      clientMsgId: crypto.randomUUID(),
      nominal: selectedNominal,
      allowedNominals: branchNominalOptions,
      driverIdRef: driver.id,
      driverLoginId: driver.driver_id,
      driverName: driver.name,
      driverBranchName: driver.branch_name ?? null,
    }
    onSubmitted() // close sheet immediately
    void submitIsiSaldo(payload).then(result => {
      if (!result.ok) {
        window.alert('Gagal ajukan isi saldo: ' + (result.error ?? 'unknown error'))
      }
      // ok=true (termasuk queued=true untuk offline) → no-op, bubble akan
      // muncul via realtime subscribe di chat page ketika RPC selesai
    })
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end z-50" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-900 rounded-t-3xl w-full max-w-md mx-auto px-6 pt-6 max-h-[90vh] overflow-y-auto"
        style={{ paddingBottom: 'calc(96px + env(safe-area-inset-bottom))' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="bg-primary/10 rounded-lg p-1.5"><Wallet size={18} className="text-primary" /></div>
            <h2 className="font-bold text-gray-800 dark:text-gray-100">Pengajuan Isi Saldo</h2>
          </div>
          <button onClick={onClose}><X size={20} className="text-gray-400" /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* ID Driver — input manual */}
          <div>
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1.5">
              ID Driver *
            </label>
            <input
              type="text"
              value={driverIdInput}
              onChange={e => setDriverIdInput(e.target.value.toUpperCase())}
              placeholder="Contoh: M6X1U"
              className="input font-mono"
              autoFocus
              autoComplete="off"
            />
            {lookupState === 'searching' && (
              <p className="text-[11px] text-gray-400 mt-1 flex items-center gap-1">
                <Loader2 size={11} className="animate-spin" /> Mencari driver...
              </p>
            )}
            {lookupState === 'found' && driver && (
              <div className="mt-1.5 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 px-3 py-2 flex items-start gap-2">
                <CheckCircle2 size={14} className="text-green-600 mt-0.5 flex-shrink-0" />
                <div className="text-[11px] leading-tight">
                  <p className="font-semibold text-green-800 dark:text-green-200">{driver.name}</p>
                  <p className="text-green-700 dark:text-green-300">
                    Cabang: {driver.branch_name ?? 'tidak diketahui'}
                  </p>
                </div>
              </div>
            )}
            {lookupState === 'not_found' && (
              <p className="text-[11px] text-red-600 mt-1 flex items-center gap-1">
                <AlertCircle size={11} /> ID Driver tidak ditemukan. Cek ejaan.
              </p>
            )}
            {lookupState === 'error' && (
              <p className="text-[11px] text-red-600 mt-1 flex items-start gap-1">
                <AlertCircle size={11} className="mt-0.5 flex-shrink-0" />
                <span>Koneksi ke database gagal: {lookupErrMsg}. Refresh halaman lalu coba lagi.</span>
              </p>
            )}
          </div>

          {/* Staff + Cabang Staff auto */}
          <div className="grid grid-cols-2 gap-2">
            <div className="card !p-2.5">
              <p className="text-[10px] font-bold text-gray-500 uppercase">Staff</p>
              <p className="text-xs font-semibold text-gray-800 dark:text-gray-100 truncate">{userFullName}</p>
            </div>
            <div className="card !p-2.5">
              <p className="text-[10px] font-bold text-gray-500 uppercase">Cabang Staff</p>
              <p className="text-xs font-semibold text-gray-800 dark:text-gray-100 truncate">{branchName ?? '-'}</p>
            </div>
          </div>

          {/* Nominal picker */}
          <div>
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1.5">
              Nominal *
            </label>
            {branchNominalOptions.length === 0 ? (
              <p className="text-xs text-red-500">Cabang ini tidak menerima Isi Saldo.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {branchNominalOptions.map(n => (
                  <button
                    type="button" key={n}
                    onClick={() => setSelectedNominal(n)}
                    className={`py-2.5 rounded-lg text-sm font-bold border-2 transition-colors ${
                      selectedNominal === n
                        ? 'bg-primary/10 border-primary text-primary'
                        : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'
                    }`}>
                    Rp{n.toLocaleString('id-ID')}
                  </button>
                ))}
              </div>
            )}
          </div>

          {error && <p className="text-red-500 text-xs bg-red-50 py-2 px-3 rounded-lg">{error}</p>}

          <button type="submit"
            disabled={!driver || !selectedNominal}
            className="btn-primary flex items-center justify-center gap-2 disabled:opacity-50">
            <Wallet size={16} />
            Kirim Pengajuan
          </button>
        </form>
      </div>
    </div>
  )
}
