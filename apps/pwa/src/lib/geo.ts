import { supabase } from './supabase'

export function haversineDistance(
  lat1: number, lng1: number, lat2: number, lng2: number
): number {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export interface GeofenceResult {
  isValid: boolean
  nearestPointId: string | null
  nearestPointName: string | null
  distanceMeters: number | null
  radiusMeters: number | null
  overshootMeters: number | null
}

// Tolerance GPS drift + area operasional luar terminal (parkiran, jalur
// akses bandara). Sejarah: 50m (sesi awal) → 1000m (feedback 30 Juli
// 2026) → 500m (feedback 31 Juli 2026, kembali diperketat untuk
// menegakkan hard-block yang efektif). Kombinasi radius pickup point
// (500-1000m per cabang) + tolerance 500m = coverage efektif ~1-1.5km
// dari titik pusat, masih meng-cover area operasional terminal.
export const GEOFENCE_TOLERANCE_METERS = 500

/**
 * Role staff dihard-block kalau di luar (radius + GEOFENCE_TOLERANCE_METERS).
 * Direksi/koordinator/management/admin bypass hard-block, tapi
 * `is_location_valid` tetap direkam untuk audit.
 *
 * Staff dengan `is_geofence_exempt = true` (mis. Gusril, Hadityawarman S.E.
 * per sesi 17 rifim-isi-saldo) juga bypass — mereka boleh absen/scan/
 * isi saldo dari mana saja.
 */
export function shouldBlockByGeofence(
  role: string | null | undefined,
  geo: GeofenceResult | null,
  locationStatus: 'checking' | 'valid' | 'invalid' | 'unavailable' | 'done',
  isExempt?: boolean | null,
): boolean {
  if (isExempt) return false
  if (role !== 'staff') return false
  if (locationStatus === 'checking') return true
  if (locationStatus === 'unavailable') return true
  if (!geo || geo.overshootMeters === null) return true
  return geo.overshootMeters > GEOFENCE_TOLERANCE_METERS
}

/**
 * Cek apakah koordinat berada di dalam radius geo-fence pickup point aktif.
 * Sesuai spec Absensi.md: setiap pickup point punya radius_meters sendiri.
 *
 * `branchId` opsional — kalau ada, hanya cek pickup point di Terminal user
 * (mis. staff T3 tidak divalidasi terhadap PP T1/T2). Kalau null (mis.
 * direksi Head Office yang lintas terminal), cek semua pickup point aktif.
 */
export async function checkGeofence(
  lat: number,
  lng: number,
  branchId?: string | null
): Promise<GeofenceResult> {
  // View raos_geofence_points menggabungkan pickup_points aktif +
  // fallback ke branches.lat/lng/default_radius_meters untuk cabang yang
  // belum punya pickup point. Filter branchId supaya staff cabang lain
  // tidak salah-validate ke titik cabang tetangga.
  let query = supabase
    .from('raos_geofence_points')
    .select('id, name, latitude, longitude, radius_meters, branch_id')
    .eq('is_active', true)

  if (branchId) {
    query = query.eq('branch_id', branchId)
  }

  const { data: points } = await query

  if (!points || points.length === 0) {
    return { isValid: false, nearestPointId: null, nearestPointName: null, distanceMeters: null, radiusMeters: null, overshootMeters: null }
  }

  let nearest = points[0]
  let nearestDist = haversineDistance(lat, lng, points[0].latitude, points[0].longitude)

  for (const p of points.slice(1)) {
    const d = haversineDistance(lat, lng, p.latitude, p.longitude)
    if (d < nearestDist) { nearest = p; nearestDist = d }
  }

  const dist = Math.round(nearestDist)
  return {
    isValid: nearestDist <= nearest.radius_meters,
    nearestPointId: nearest.id,
    nearestPointName: nearest.name,
    distanceMeters: dist,
    radiusMeters: nearest.radius_meters,
    overshootMeters: Math.max(0, dist - nearest.radius_meters),
  }
}
