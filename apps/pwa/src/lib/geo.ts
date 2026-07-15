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
}

/**
 * Cek apakah koordinat berada di dalam radius geo-fence pickup point aktif mana pun.
 * Sesuai spec Absensi.md: setiap pickup point punya radius_meters sendiri.
 */
export async function checkGeofence(lat: number, lng: number): Promise<GeofenceResult> {
  const { data: points } = await supabase
    .from('pickup_points')
    .select('id, name, latitude, longitude, radius_meters')
    .eq('is_active', true)

  if (!points || points.length === 0) {
    return { isValid: false, nearestPointId: null, nearestPointName: null, distanceMeters: null }
  }

  let nearest = points[0]
  let nearestDist = haversineDistance(lat, lng, points[0].latitude, points[0].longitude)

  for (const p of points.slice(1)) {
    const d = haversineDistance(lat, lng, p.latitude, p.longitude)
    if (d < nearestDist) { nearest = p; nearestDist = d }
  }

  return {
    isValid: nearestDist <= nearest.radius_meters,
    nearestPointId: nearest.id,
    nearestPointName: nearest.name,
    distanceMeters: Math.round(nearestDist),
  }
}
