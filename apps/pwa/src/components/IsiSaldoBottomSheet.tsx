'use client'

import { useEffect, useRef, useState } from 'react'
import { X, Wallet, CheckCircle2, AlertCircle, Loader2, Zap } from 'lucide-react'
import { submitIsiSaldo } from '@/lib/saldoRequest'
import {
  lookupDriverCached,
  primeDriverCache,
  type CachedDriverLookup,
} from '@/lib/driverLookupCache'

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

type LookupState = 'idle' | 'searching' | 'found' | 'not_found' | 'error'

/**
 * FASE 3 cache-first driver lookup untuk IsiSaldoBottomSheet.
 * - warm cache ketika sheet dibuka
 * - exact driver ID dari memory/localStorage user-scope lebih dulu
 * - cache miss fallback ke Supabase direct query
 * - stale cache diperbarui background
 * - optimistic submit existing tetap dipertahankan
 */
export default function IsiSaldoBottomSheet({
  userId, userFullName, branchId, branchSlug, branchName,
  branchNominalOptions, roomId, onClose, onSubmitted,
}: Props) {
  const [driverIdInput, setDriverIdInput] = useState('')
  const [driver, setDriver] = useState<CachedDriverLookup | null>(null)
  const [lookupState, setLookupState] = useState<LookupState>('idle')
  const [lookupErrMsg, setLookupErrMsg] = useState('')
  const [lookupSource, setLookupSource] = useState<'cache' | 'network' | null>(null)
  const [selectedNominal, setSelectedNominal] = useState<number | null>(null)
  const [error, setError] = useState('')
  const debounceRef = useRef<number | null>(null)
  const lookupSeq = useRef(0)

  const branchSlugStr = branchSlug ?? undefined
  const branchNameStr = branchName ?? undefined

  useEffect(() => {
    primeDriverCache()
  }, [])

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current)

    const q = driverIdInput.trim().toUpperCase()
    const seq = ++lookupSeq.current

    if (!q) {
      setDriver(null)
      setLookupState('idle')
      setLookupSource(null)
      setLookupErrMsg('')
      return
    }

    debounceRef.current = window.setTimeout(() => {
      setLookupState('searching')
      void lookupDriverCached(q)
        .then(result => {
          if (seq !== lookupSeq.current) return
          setLookupErrMsg('')
          setLookupSource(result.source)
          if (result.driver) {
            setDriver(result.driver)
            setLookupState('found')
          } else {
            setDriver(null)
            setLookupState('not_found')
          }
        })
        .catch(err => {
          if (seq !== lookupSeq.current) return
          setLookupErrMsg(err instanceof Error ? err.message : String(err))
          setDriver(null)
          setLookupSource(null)
          setLookupState('error')
        })
    }, 80)

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current)
    }
  }, [driverIdInput])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!driver) {
      setError('ID Driver tidak valid. Cek ejaan atau minta admin daftarkan driver dulu.')
      return
    }
    if (!selectedNominal) {
      setError('Pilih nominal dulu.')
      return
    }

    const payload = {
      userId,
      branchId,
      branchSlug: branchSlugStr,
      branchName: branchNameStr,
      fullName: userFullName,
      roomId,
      clientMsgId: crypto.randomUUID(),
      nominal: selectedNominal,
      allowedNominals: branchNominalOptions,
      driverIdRef: driver.id,
      driverLoginId: driver.driver_id,
      driverName: driver.name,
      driverBranchName: driver.branch_name,
    }

    onSubmitted()
    void submitIsiSaldo(payload).then(result => {
      if (!result.ok) {
        window.alert('Gagal ajukan isi saldo: ' + (result.error ?? 'unknown error'))
      }
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
            <div className="bg-primary/10 rounded-lg p-1.5">
              <Wallet size={18} className="text-primary" />
            </div>
            <h2 className="font-bold text-gray-800 dark:text-gray-100">Pengajuan Isi Saldo</h2>
          </div>
          <button onClick={onClose}><X size={20} className="text-gray-400" /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
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
                <div className="text-[11px] leading-tight flex-1">
                  <p className="font-semibold text-green-800 dark:text-green-200">{driver.name}</p>
                  <p className="text-green-700 dark:text-green-300">
                    Cabang: {driver.branch_name ?? 'tidak diketahui'}
                  </p>
                </div>
                {lookupSource === 'cache' && (
                  <span className="inline-flex items-center gap-1 text-[9px] font-bold text-green-700">
                    <Zap size={10} /> instant
                  </span>
                )}
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
                <span>Koneksi database gagal: {lookupErrMsg}. Data cache lokal tidak memiliki ID ini.</span>
              </p>
            )}
          </div>

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
                    type="button"
                    key={n}
                    onClick={() => setSelectedNominal(n)}
                    className={`py-2.5 rounded-lg text-sm font-bold border-2 transition-colors ${
                      selectedNominal === n
                        ? 'bg-primary/10 border-primary text-primary'
                        : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'
                    }`}
                  >
                    Rp{n.toLocaleString('id-ID')}
                  </button>
                ))}
              </div>
            )}
          </div>

          {error && <p className="text-red-500 text-xs bg-red-50 py-2 px-3 rounded-lg">{error}</p>}

          <button
            type="submit"
            disabled={!driver || !selectedNominal}
            className="btn-primary flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Wallet size={16} /> Kirim Pengajuan
          </button>
        </form>
      </div>
    </div>
  )
}
