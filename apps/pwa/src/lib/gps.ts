/**
 * lib/gps.ts — Tiered GPS acquisition untuk RAOS.
 *
 * Masalah dulu (sesi 4-14): `getCurrentPosition({ enableHighAccuracy: true })`
 * tanpa timeout/maximumAge bikin scan & absensi indoor terminal Soeta nunggu
 * 10-30 detik (kadang hang total) karena chip GPS device kesulitan lock
 * satelit di bawah struktur baja terminal.
 *
 * Strategi baru: dua fase paralel-berlapis.
 *   1. COARSE (cepat, ~0.5-2s) — wifi/cell trilateration, akurasi 20-200m.
 *      Cukup untuk validasi geo-fence pickup point (radius 50-100m).
 *      UI langsung update, staff bisa lanjut submit.
 *   2. REFINE (background, 3-8s) — GPS asli, akurasi <20m. Non-blocking,
 *      cuma overwrite koordinat kalau akurasi jauh lebih baik.
 *
 * Estimasi kecepatan: waktu ke UI-siap turun dari 10-30s → 0.5-2s (60-95%
 * lebih cepat), scan berikut di titik sama pakai cache device (~instant).
 */

export interface LocationFix {
  lat: number
  lng: number
  /** Akurasi (meter, semakin kecil semakin presisi). Dari GeolocationPosition.coords.accuracy. */
  accuracyM: number
  /** Sumber fix — informasional, dipakai untuk log/debug. */
  source: 'coarse' | 'refine'
  timestamp: number
}

export interface RequestLocationOptions {
  /** Dipanggil setiap kali fix baru masuk (coarse dulu, lalu refine kalau lebih akurat). */
  onFix: (fix: LocationFix) => void
  /** Dipanggil sekali kalau dua-duanya gagal (permission denied, timeout habis, dsb). */
  onUnavailable: (reason: 'permission_denied' | 'timeout' | 'unsupported') => void
}

/**
 * Selisih akurasi minimum sebelum refine overwrite coarse (biar tidak kedip).
 * Kalau coarse dapat 80m dan refine 75m, biarkan coarse. Kalau refine 20m,
 * baru overwrite.
 */
const REFINE_MIN_IMPROVEMENT_M = 30

/**
 * Minta lokasi dua fase. Return function abort untuk cleanup (dipanggil di
 * useEffect return supaya request tidak lanjut kalau komponen unmount).
 */
export function requestLocationTiered(opts: RequestLocationOptions): () => void {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    opts.onUnavailable('unsupported')
    return () => {}
  }

  let aborted = false
  let latestFix: LocationFix | null = null
  let coarseSettled = false

  const handleSuccess = (source: 'coarse' | 'refine') => (pos: GeolocationPosition) => {
    if (aborted) return
    const fix: LocationFix = {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracyM: pos.coords.accuracy,
      source,
      timestamp: pos.timestamp,
    }

    // Kalau refine akurasinya nggak lebih baik dari coarse yang sudah ada
    // sebesar threshold, jangan overwrite (hindari state kedip).
    if (
      source === 'refine' &&
      latestFix &&
      latestFix.accuracyM - fix.accuracyM < REFINE_MIN_IMPROVEMENT_M
    ) {
      return
    }

    latestFix = fix
    opts.onFix(fix)
  }

  const handleError = (source: 'coarse' | 'refine') => (err: GeolocationPositionError) => {
    if (aborted) return
    if (source === 'coarse') {
      coarseSettled = true
      // Kalau coarse gagal, refine masih jalan — jangan lapor unavailable dulu.
      // Refine handler yang akan lapor kalau dia juga gagal.
      return
    }
    // Refine gagal. Kalau coarse juga sudah gagal dan belum ada fix apa pun,
    // baru lapor unavailable.
    if (coarseSettled && !latestFix) {
      if (err.code === err.PERMISSION_DENIED) {
        opts.onUnavailable('permission_denied')
      } else {
        opts.onUnavailable('timeout')
      }
    }
  }

  // FASE 1 — coarse, cepat. Cache 15 detik supaya kalau ada fix baru saja
  // dari browser bisa langsung dipakai tanpa request ulang.
  navigator.geolocation.getCurrentPosition(
    handleSuccess('coarse'),
    handleError('coarse'),
    { enableHighAccuracy: false, timeout: 3000, maximumAge: 15000 },
  )

  // FASE 2 — refine, jalan paralel dari mount (bukan setelah coarse selesai).
  // Kalau device cepat lock GPS, refine bisa datang duluan dari coarse dan
  // langsung terpakai; kalau lambat, coarse sudah update UI dulu.
  navigator.geolocation.getCurrentPosition(
    handleSuccess('refine'),
    handleError('refine'),
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 15000 },
  )

  return () => { aborted = true }
}
