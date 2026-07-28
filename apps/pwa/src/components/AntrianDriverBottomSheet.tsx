'use client'

import { useEffect, useState } from 'react'
import { Car, Loader2, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface Driver { id: string; driver_id: string; name: string; branch_id: string | null }

interface Props {
  branchId: string | null
  branchName?: string | null
  roomId: string | null
  onClose: () => void
  onJoined: (queuePosition: number, driverName: string) => void
}

/**
 * Bottom sheet Antrian Driver — analog IsiSaldoBottomSheet.
 *
 * Reuse RPC `raos_join_queue(p_driver_id uuid, p_branch_id uuid, p_room_id uuid)`
 * yang sudah ada. Tidak ada tabel baru, tidak ada logika bisnis baru —
 * hanya UI untuk masukkan driver ke antrean via dropdown.
 *
 * Business ownership: RAOS (raos_driver_queue, raos_drivers).
 */
export default function AntrianDriverBottomSheet({
  branchId, branchName, roomId, onClose, onJoined,
}: Props) {
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [loadingDrivers, setLoadingDrivers] = useState(true)
  const [selectedDriverId, setSelectedDriverId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

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
    if (!selectedDriver) { setError('Pilih driver dulu.'); return }
    if (!branchId) { setError('Cabang tidak diketahui.'); return }
    setSubmitting(true)

    const { data, error: rpcErr } = await supabase.rpc('raos_join_queue', {
      p_driver_id: selectedDriver.id,
      p_branch_id: branchId,
      p_room_id: roomId,
    })

    if (rpcErr) {
      setSubmitting(false)
      setError(parseJoinError(rpcErr.message))
      return
    }

    const row = Array.isArray(data) ? data[0] : data
    const pos = typeof row === 'number' ? row : (row?.queue_pos ?? row?.position ?? 0)
    setSubmitting(false)
    onJoined(Number(pos), selectedDriver.name)
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
            <div className="bg-amber-100 rounded-lg p-1.5"><Car size={18} className="text-amber-700" /></div>
            <h2 className="font-bold text-gray-800 dark:text-gray-100">Antrian Driver</h2>
          </div>
          <button onClick={onClose} aria-label="Tutup"><X size={20} className="text-gray-400" /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="card !p-2.5">
            <p className="text-[10px] font-bold text-gray-500 uppercase">Cabang</p>
            <p className="text-xs font-semibold text-gray-800 dark:text-gray-100 truncate">{branchName ?? '-'}</p>
          </div>

          <div>
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1.5">
              Driver *
            </label>
            <select
              value={selectedDriverId}
              onChange={e => setSelectedDriverId(e.target.value)}
              disabled={loadingDrivers}
              className="input"
            >
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
                Tidak ada driver aktif di cabang ini.
              </p>
            )}
          </div>

          {error && <p className="text-red-500 text-xs bg-red-50 py-2 px-3 rounded-lg">{error}</p>}

          <button
            type="submit"
            disabled={submitting || !selectedDriver}
            className="btn-primary flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <Car size={16} />}
            {submitting ? 'Mengantre...' : 'Masukkan ke Antrean'}
          </button>

          <p className="text-[10px] text-gray-400 leading-relaxed">
            Tips: chat command <code className="bg-gray-100 px-1 rounded">/antri &lt;id_driver&gt;</code> juga tetap aktif.
          </p>
        </form>
      </div>
    </div>
  )
}

function parseJoinError(msg: string): string {
  if (msg.includes('driver_not_found')) return 'Driver tidak ditemukan atau tidak aktif.'
  if (msg.includes('driver_wrong_branch')) return 'Driver terdaftar di cabang berbeda.'
  if (msg.includes('branch_not_in_scope')) return 'Anda tidak punya akses ke cabang ini.'
  if (msg.includes('driver_already_in_queue')) return 'Driver sudah dalam antrean aktif.'
  if (msg.includes('unauthenticated')) return 'Sesi login expired.'
  return msg
}
