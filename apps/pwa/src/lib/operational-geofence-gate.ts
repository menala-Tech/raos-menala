import { shouldBlockByGeofence, type GeofenceResult } from '@/lib/geo'

export interface OperationalGateState {
  chat: true
  attendance: boolean
  scan_order: boolean
  isi_saldo: boolean
  reason: string | null
}

export type OperationalLocationStatus = 'checking' | 'valid' | 'invalid' | 'unavailable'

export function deriveOperationalGate(opts: {
  role?: string | null
  geofence: GeofenceResult | null
  locationStatus: OperationalLocationStatus
  toleranceMeters: number
  isGeofenceExempt?: boolean | null
}): OperationalGateState {
  const blocked = shouldBlockByGeofence(
    opts.role ?? '',
    opts.geofence,
    opts.locationStatus,
    opts.isGeofenceExempt ?? false,
    opts.toleranceMeters,
  )

  if (!blocked) {
    return { chat: true, attendance: true, scan_order: true, isi_saldo: true, reason: null }
  }

  const overshoot = opts.geofence?.overshootMeters
  const pointName = opts.geofence?.nearestPointName ?? 'lokasi cabang'
  const reason = opts.locationStatus === 'unavailable'
    ? 'GPS tidak terdeteksi. Aktifkan lokasi HP lalu coba lagi.'
    : opts.locationStatus === 'checking'
      ? 'Menunggu lokasi terdeteksi. Coba beberapa detik lagi.'
      : overshoot == null
        ? 'Data pickup point cabang belum di-setup. Hubungi admin untuk konfigurasi lokasi.'
        : `Anda berada ${overshoot}m di luar radius ${pointName}. Batas toleransi ${opts.toleranceMeters}m.`

  return {
    chat: true,
    attendance: false,
    scan_order: false,
    isi_saldo: false,
    reason,
  }
}
