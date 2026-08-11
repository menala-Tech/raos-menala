'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import AppShell from '@/components/layout/AppShell'
import BarcodeScanner from '@/components/BarcodeScanner'
import { checkGeofence, GEOFENCE_TOLERANCE_METERS, type GeofenceResult } from '@/lib/geo'
import { requestLocationTiered } from '@/lib/gps'
import { logActivity } from '@/lib/activity'
import { enqueue, isNetworkError } from '@/lib/offlineQueue'
import MenalaLogo from '@/components/MenalaLogo'
import { DateTimeStack } from '@/components/DateTimeHeader'
import { ArrowLeft, MapPin, CheckCircle2, XCircle, Loader2, Keyboard, Camera } from 'lucide-react'
import Link from 'next/link'
import type { UserProfile } from '@/types'
import { useSystemConfigNumber } from '@/lib/useSystemConfig'
import { deriveOperationalGate } from '@/lib/operational-geofence-gate'

type ScanState = 'idle' | 'scanning' | 'success' | 'error'

export default function ScanPage() {
  const router = useRouter()
  const [user, setUser] = useState<UserProfile | null>(null)
  const [scanState, setScanState] = useState<ScanState>('idle')
  const [lastScan, setLastScan] = useState<any>(null)
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [geofence, setGeofence] = useState<GeofenceResult | null>(null)
  const [locationStatus, setLocationStatus] = useState<'checking' | 'valid' | 'invalid' | 'unavailable'>('checking')
  // Kamera SELALU aktif secara default di setiap page load (user feedback
  // 30 Juli 2026: "harusnya otomatis kamera scan barcode yang tampil").
  // Toggle localStorage `raos_prefs.scanMode` di Settings sengaja tidak
  // dipakai sebagai initial state — supaya user tidak stuck di mode manual
  // gara-gara pernah switch di sesi sebelumnya. FAB pojok kanan bawah
  // tetap available kalau butuh switch ke manual per sesi.
  const [inputMode, setInputMode] = useState<'camera' | 'manual'>('camera')
  const inputRef = useRef<HTMLInputElement>(null)
  const { value: geofenceTolerance } = useSystemConfigNumber('GEOFENCE_TOLERANCE_METER', GEOFENCE_TOLERANCE_METERS)
  const operationalGate = deriveOperationalGate({
    role: user?.role,
    geofence,
    locationStatus,
    toleranceMeters: geofenceTolerance,
    isGeofenceExempt: (user as any)?.is_geofence_exempt,
  })
  useEffect(() => {
    let active=true
    let stopGps:(()=>void)|undefined
    async function init(){
      const {data:{session}}=await supabase.auth.getSession()
      if(!session){router.push('/');return}
      const {data,error}=await supabase.from('user_profiles').select('*, branches(*)').eq('id',session.user.id).single()
      if(!active||error||!data)return
      setUser(data)
      stopGps=requestLocationTiered({
        onFix:async fix=>{
          if(!active)return
          setLocation({lat:fix.lat,lng:fix.lng})
          const g=await checkGeofence(fix.lat,fix.lng,data.branch_id)
          if(!active)return
          setGeofence(g); setLocationStatus(g.isValid?'valid':'invalid')
        },
        onUnavailable:()=>active&&setLocationStatus('unavailable')
      })
    }
    void init()
    return()=>{active=false;stopGps?.()}
  },[router])

  const handleScan = useCallback(async (barcode: string) => {
    if (!barcode.trim() || !user) return

    if (!operationalGate.scan_order) {
      setScanState('error')
      const overshoot = geofence?.overshootMeters
      setLastScan({
        error: operationalGate.reason ?? (locationStatus === 'unavailable'
          ? 'GPS tidak terdeteksi. Scan dibatalkan — aktifkan lokasi HP lalu coba lagi.'
          : locationStatus === 'checking'
            ? 'Menunggu lokasi terdeteksi. Coba beberapa detik lagi.'
            : overshoot === null || overshoot === undefined
              ? 'Data pickup point cabang belum di-setup. Hubungi admin untuk konfigurasi lokasi.'
              : `Anda berada ${overshoot}m di luar radius pickup point ${geofence?.nearestPointName ?? 'lokasi cabang'}. Batas toleransi ${geofenceTolerance}m. Scan dibatalkan.`),
      })
      return
    }

    setScanState('scanning')

    // Cari driver dari cache Supabase (butuh network).
    const { data: driver, error: driverErr } = await supabase
      .from('raos_drivers')
      .select('id, driver_id, name, vehicle_plate, vehicle_type, barcode')
      .or(`barcode.eq.${barcode.trim()},driver_id.eq.${barcode.trim()}`)
      .eq('is_active', true)
      .single()

    // Kalau offline saat lookup driver → queue by driver_id/barcode string,
    // syncer akan resolve driver saat replay dan skip kalau driver tidak ada.
    if (driverErr && isNetworkError(driverErr)) {
      const scanId = `SCN-${Date.now()}`
      await enqueue('scan_order', {
        scan_id: scanId,
        driver_id_or_barcode: barcode.trim(),
        staff_id: user.id,
        pickup_point_id: geofence?.nearestPointId ?? null,
        scanned_at: new Date().toISOString(),
        latitude: location?.lat ?? null,
        longitude: location?.lng ?? null,
        status: 'pending',
        _needs_driver_lookup: true,
      })
      setScanState('success')
      setLastScan({ scan_id: scanId, queued: true, driver_hint: barcode.trim() })
      logActivity('scan_offline', `queued ${scanId} for ${barcode.trim()}`)
      if (inputRef.current) inputRef.current.value = ''
      return
    }

    if (!driver) {
      setScanState('error')
      setLastScan({ error: 'Barcode tidak ditemukan dalam sistem.' })
      return
    }

    const scanId = `SCN-${Date.now()}`
    const payload = {
      scan_id: scanId,
      driver_id: driver.id,
      staff_id: user.id,
      pickup_point_id: geofence?.nearestPointId ?? null,
      scanned_at: new Date().toISOString(),
      latitude: location?.lat,
      longitude: location?.lng,
      status: 'pending',
    }
    const { data: scan, error } = await supabase
      .from('scan_orders')
      .insert(payload)
      .select('*, raos_drivers(id, driver_id, name, vehicle_plate, vehicle_type)')
      .single()

    if (error && isNetworkError(error)) {
      await enqueue('scan_order', payload)
      setScanState('success')
      setLastScan({ ...payload, queued: true, raos_drivers: driver })
      logActivity('scan_offline', `queued ${scanId} — ${driver.name}`)
    } else if (error) {
      setScanState('error')
      setLastScan({ error: 'Gagal menyimpan scan. Coba lagi.' })
    } else {
      setScanState('success')
      setLastScan(scan)
      logActivity('scan_barcode', `${scanId} — ${driver.name} (${driver.driver_id})`)
    }

    if (inputRef.current) inputRef.current.value = ''
  }, [user, location, geofence, locationStatus, geofenceTolerance, operationalGate])

  function reset() {
    setScanState('idle')
    setLastScan(null)
    inputRef.current?.focus()
  }

  return (
    <AppShell>
      {/* Header */}
      <div className="bg-secondary text-white px-4 pt-10 pb-5">
        <div className="flex items-center gap-3 mb-3">
          <Link href="/dashboard" className="text-white/70"><ArrowLeft size={22} /></Link>
          <div className="flex-1"><MenalaLogo size={28} showText /></div>
        </div>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-black text-xl">Scan Barcode</h1>
            <p className="text-white/50 text-xs mt-0.5">Validasi Order Driver — {(user as any)?.branches?.name ?? 'Cabang'}</p>
          </div>
          <DateTimeStack />
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* Location Status */}
        <div className={`flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-lg
          ${locationStatus === 'valid' ? 'bg-green-50 text-green-700' : 'bg-yellow-50 text-yellow-700'}`}>
          <MapPin size={14} />
          {locationStatus === 'checking' && 'Mengecek lokasi & geo-fence...'}
          {locationStatus === 'valid' && geofence &&
            `Lokasi valid — ${geofence.nearestPointName} (${geofence.distanceMeters}m)`}
          {locationStatus === 'invalid' && geofence && (geofence.overshootMeters === null || geofence.nearestPointName === null) &&
            'Data pickup point cabang belum di-setup — hubungi admin.'}
          {locationStatus === 'invalid' && geofence && geofence.overshootMeters !== null && user?.role === 'staff' &&
            `Di luar radius ${geofence.nearestPointName} (+${geofence.overshootMeters}m). Batas ${geofenceTolerance}m — scan akan diblok kalau lewat.`}
          {locationStatus === 'invalid' && geofence && geofence.distanceMeters !== null && user?.role !== 'staff' &&
            `Di luar radius ${geofence.nearestPointName} terdekat ${geofence.distanceMeters}m. Scan tetap bisa (bypass role).`}
          {locationStatus === 'unavailable' && user?.role === 'staff' && 'GPS tidak terdeteksi — scan diblok. Aktifkan lokasi HP.'}
          {locationStatus === 'unavailable' && user?.role !== 'staff' && 'GPS tidak terdeteksi — scan tetap bisa (bypass role).'}
        </div>

        {/* Scanner Area — kamera langsung tampil saat buka tab, manual jadi FAB pojok */}
        {scanState === 'idle' && (
          <div className="card">
            {inputMode === 'camera' ? (
              <>
                <BarcodeScanner active={inputMode === 'camera'} onDetected={handleScan} />
                <p className="text-xs text-gray-400 text-center mt-2">
                  Arahkan kamera ke barcode/QR di stiker kendaraan
                </p>
              </>
            ) : (
              <>
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Ketik barcode / ID Maxim..."
                  className="input"
                  autoFocus
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleScan((e.target as HTMLInputElement).value)
                  }}
                />
                <p className="text-xs text-gray-400 text-center mt-2">
                  Tekan Enter setelah mengetik barcode
                </p>
              </>
            )}
          </div>
        )}

        {/* FAB toggle — bulat di pojok kanan bawah, di atas BottomNav (bottom ~104px).
            Selalu tampil (bahkan saat sedang proses/sudah ada hasil) supaya user
            bisa switch mode kapan saja tanpa harus reset dulu. */}
        <button
          onClick={() => { setInputMode(m => m === 'camera' ? 'manual' : 'camera'); if (scanState !== 'idle') reset() }}
          aria-label={inputMode === 'camera' ? 'Ganti ke input manual' : 'Ganti ke kamera'}
          className="fixed right-4 z-20 w-14 h-14 rounded-full bg-secondary text-white
                     shadow-lg shadow-black/30 flex items-center justify-center
                     active:scale-95 transition-transform border-2 border-white"
          style={{ bottom: 'calc(104px + env(safe-area-inset-bottom))' }}
        >
          {inputMode === 'camera' ? <Keyboard size={22} /> : <Camera size={22} />}
        </button>

        {scanState === 'scanning' && (
          <div className="card flex flex-col items-center py-8 gap-3">
            <Loader2 size={40} className="text-primary animate-spin" />
            <p className="text-gray-600 font-medium">Memproses scan...</p>
          </div>
        )}

        {scanState === 'success' && lastScan && (
          <div className="space-y-3">
            <div className="card border-2 border-green-500">
              <div className="flex items-center gap-3 mb-4">
                <CheckCircle2 size={32} className="text-green-500" />
                <div>
                  <p className="font-bold text-green-700">Scan Berhasil!</p>
                  <p className="text-xs text-gray-500">Status: PENDING — Menunggu Validasi</p>
                </div>
              </div>
              <div className="space-y-2 text-sm">
                {[
                  ['ID Scan', lastScan.scan_id],
                  ['Driver', lastScan.raos_drivers?.name],
                  ['Kendaraan', lastScan.raos_drivers?.vehicle_plate ?? lastScan.raos_drivers?.vehicle_type],
                  ['Waktu', new Date(lastScan.scanned_at).toLocaleTimeString('id')],
                  ['Status', 'PENDING'],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between">
                    <span className="text-gray-500">{k}</span>
                    <span className="font-medium text-gray-800">{v}</span>
                  </div>
                ))}
              </div>
            </div>
            <button onClick={reset} className="btn-primary">
              Scan Berikutnya
            </button>
          </div>
        )}

        {scanState === 'error' && (
          <div className="space-y-3">
            <div className="card border-2 border-red-400">
              <div className="flex items-center gap-3">
                <XCircle size={32} className="text-red-500" />
                <div>
                  <p className="font-bold text-red-700">Scan Gagal</p>
                  <p className="text-xs text-gray-600">{lastScan?.error}</p>
                </div>
              </div>
            </div>
            <button onClick={reset} className="btn-secondary">
              Coba Lagi
            </button>
          </div>
        )}
      </div>
    </AppShell>
  )
}
