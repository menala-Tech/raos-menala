'use client'

import { useEffect, useState } from 'react'
import { X, Wallet, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { submitIsiSaldo } from '@/lib/saldoRequest'

interface Driver { id: string; driver_id: string; name: string; branch_id: string | null }
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
 * BottomSheet form Pengajuan Isi Saldo (mirip Polling toggle).
 * Field:
 * - Nominal picker (dari branches.saldo_nominal_options)
 * - Driver dropdown (raos_drivers WHERE branch_id = user.branch_id, is_active)
 *   → auto-fill Nama + ID Login saat pilih
 * - Nama Staff (auto-filled, read-only)
 * - Cabang (auto-filled, read-only)
 */
export default function IsiSaldoBottomSheet({
  userId, userFullName, branchId, branchSlug, branchName,
  branchNominalOptions, roomId, onClose, onSubmitted,
}: Props) {
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [loadingDrivers, setLoadingDrivers] = useState(true)
  const [selectedDriverId, setSelectedDriverId] = useState('')
  const [selectedNominal, setSelectedNominal] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const branchSlugStr = branchSlug ?? undefined
  const branchNameStr = branchName ?? undefined

  useEffect(() => {
    if (!branchId) { setLoadingDrivers(false); return }
    supabase.from('raos_drivers')
      .select('id, driver_id, name, branch_id')
      .eq('is_active', true)
      .eq('branch_id', branchId)
      .order('name')
      .then(({ data }) => {
        setDrivers((data ?? []) as Driver[])
        setLoadingDrivers(false)
      })
  }, [branchId])

  const selectedDriver = drivers.find(d => d.id === selectedDriverId) ?? null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!selectedNominal) { setError('Pilih nominal dulu.'); return }
    if (!selectedDriver) { setError('Pilih driver dulu.'); return }
    setSubmitting(true)

    const clientMsgId = crypto.randomUUID()
    const result = await submitIsiSaldo({
      userId, branchId, branchSlug: branchSlugStr, branchName: branchNameStr,
      fullName: userFullName, roomId, clientMsgId,
      nominal: selectedNominal,
      allowedNominals: branchNominalOptions,
    })
    if (!result.ok) {
      setSubmitting(false)
      setError(result.error ?? 'Gagal ajukan isi saldo')
      return
    }
    // Update row dengan driver info (submit lib default null)
    if (result.requestId) {
      await supabase.from('raos_saldo_requests')
        .update({
          driver_id: selectedDriver.id,
          driver_login_id: selectedDriver.driver_id,
          driver_name: selectedDriver.name,
        })
        .eq('id', result.requestId)
    }
    setSubmitting(false)
    onSubmitted()
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
          {/* Staff + Cabang auto-filled read-only */}
          <div className="grid grid-cols-2 gap-2">
            <div className="card !p-2.5">
              <p className="text-[10px] font-bold text-gray-500 uppercase">Staff</p>
              <p className="text-xs font-semibold text-gray-800 dark:text-gray-100 truncate">{userFullName}</p>
            </div>
            <div className="card !p-2.5">
              <p className="text-[10px] font-bold text-gray-500 uppercase">Cabang</p>
              <p className="text-xs font-semibold text-gray-800 dark:text-gray-100 truncate">{branchName ?? '-'}</p>
            </div>
          </div>

          {/* Driver picker */}
          <div>
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1.5">
              Driver *
            </label>
            <select
              value={selectedDriverId}
              onChange={e => setSelectedDriverId(e.target.value)}
              disabled={loadingDrivers}
              className="input">
              <option value="">{loadingDrivers ? 'Memuat driver...' : `Pilih driver (${drivers.length})`}</option>
              {drivers.map(d => (
                <option key={d.id} value={d.id}>{d.name} — {d.driver_id}</option>
              ))}
            </select>
            {selectedDriver && (
              <p className="text-[11px] text-gray-500 mt-1">
                ID Login: <span className="font-mono">{selectedDriver.driver_id}</span>
              </p>
            )}
            {!loadingDrivers && drivers.length === 0 && (
              <p className="text-[11px] text-amber-600 mt-1">
                Tidak ada driver aktif di cabang ini. Hubungi admin untuk sync SSOT.
              </p>
            )}
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
            disabled={submitting || !selectedDriver || !selectedNominal}
            className="btn-primary flex items-center justify-center gap-2 disabled:opacity-50">
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <Wallet size={16} />}
            {submitting ? 'Mengirim...' : 'Kirim Pengajuan'}
          </button>
        </form>
      </div>
    </div>
  )
}
