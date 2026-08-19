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
import { ArrowLeft, MapPin, CheckCircle2, XCircle, Loader2, Keyboard, Camera, Clock } from 'lucide-react'
import Link from 'next/link'
import clsx from 'clsx'
import type { UserProfile } from '@/types'
import { useSystemConfigNumber } from '@/lib/useSystemConfig'
import { deriveOperationalGate } from '@/lib/operational-geofence-gate'

type ScanState = 'idle' | 'scanning' | 'success' | 'error'

function scanErrorMessage(error: any): string {
  const raw=`${error?.message ?? ''} ${error?.details ?? ''}`.toLowerCase()
  if(raw.includes('driver_not_found_in_scope')) return 'Barcode/driver tidak ditemukan atau tidak terdaftar pada cabang Anda.'
  if(raw.includes('geofence_blocked')) return 'Lokasi ditolak server karena berada di luar area operasional.'
  if(raw.includes('replay_too_old')) return 'Scan offline sudah terlalu lama untuk disinkronkan. Silakan scan ulang.'
  if(raw.includes('future_timestamp')) return 'Waktu perangkat tidak valid. Periksa tanggal/jam HP lalu coba lagi.'
  if(raw.includes('role_not_allowed')) return 'Akun ini tidak diizinkan melakukan Scan Order.'
  return 'Gagal menyimpan scan. Coba lagi.'
}

export default function ScanPage() {
  const router = useRouter()
  const [user, setUser] = useState<UserProfile | null>(null)
  const [scanState, setScanState] = useState<ScanState>('idle')
  const [lastScan, setLastScan] = useState<any>(null)
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [geofence, setGeofence] = useState<GeofenceResult | null>(null)
  const [locationStatus, setLocationStatus] = useState<'checking' | 'valid' | 'invalid' | 'unavailable'>('checking')
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
    const driverRef=barcode.trim()
    if (!driverRef || !user) return

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
    const scanId=`SCN-${Date.now()}`
    const capturedAt=new Date().toISOString()

    const { data, error } = await supabase.rpc('raos_submit_scan', {
      p_driver_ref: driverRef,
      p_lat: location?.lat ?? null,
      p_lng: location?.lng ?? null,
      p_client_scan_id: scanId,
      // Online submission is server-time authoritative.
      p_client_captured_at: null,
    })

    if (error && isNetworkError(error)) {
      await enqueue('scan_order', {
        scan_id: scanId,
        driver_ref: driverRef,
        captured_at: capturedAt,
        latitude: location?.lat ?? null,
        longitude: location?.lng ?? null,
      })
      setScanState('success')
      setLastScan({ scan_id: scanId, scanned_at: capturedAt, queued: true, driver_hint: driverRef })
      logActivity('scan_offline', `queued ${scanId} for ${driverRef}`)
    } else if (error) {
      setScanState('error')
      setLastScan({ error: scanErrorMessage(error) })
    } else {
      const result=data as any
      const row=result?.row ?? {}
      setScanState('success')
      setLastScan({ ...row, scan_id: row.scan_id ?? scanId, scanned_at: row.scanned_at ?? capturedAt, raos_drivers: result?.driver ?? null })
      logActivity('scan_barcode', `${row.scan_id ?? scanId} — ${result?.driver?.name ?? driverRef}`)
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
        <div className={`flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-lg ${locationStatus === 'valid' ? 'bg-green-50 text-green-700' : 'bg-yellow-50 text-yellow-700'}`}>
          <MapPin size={14} />
          {locationStatus === 'checking' && 'Mengecek lokasi & geo-fence...'}
          {locationStatus === 'valid' && geofence && `Lokasi valid — ${geofence.nearestPointName} (${geofence.distanceMeters}m)`}
          {locationStatus === 'invalid' && geofence && (geofence.overshootMeters === null || geofence.nearestPointName === null) && 'Data pickup point cabang belum di-setup — hubungi admin.'}
          {locationStatus === 'invalid' && geofence && geofence.overshootMeters !== null && user?.role === 'staff' && `Di luar radius ${geofence.nearestPointName} (+${geofence.overshootMeters}m). Batas ${geofenceTolerance}m — scan akan diblok kalau lewat.`}
          {locationStatus === 'invalid' && geofence && geofence.distanceMeters !== null && user?.role !== 'staff' && `Di luar radius ${geofence.nearestPointName} terdekat ${geofence.distanceMeters}m.`}
          {locationStatus === 'unavailable' && user?.role === 'staff' && 'GPS tidak terdeteksi — scan diblok. Aktifkan lokasi HP.'}
          {locationStatus === 'unavailable' && user?.role !== 'staff' && 'GPS tidak terdeteksi.'}
        </div>

        {scanState === 'idle' && (
          <div className="card">
            {inputMode === 'camera' ? (
              <>
                <BarcodeScanner active onDetected={handleScan} />
                <p className="text-xs text-gray-400 text-center mt-2">Arahkan kamera ke barcode/QR di stiker kendaraan</p>
              </>
            ) : (
              <>
                <input ref={inputRef} type="text" placeholder="Ketik barcode / ID Maxim..." className="input" autoFocus
                  onKeyDown={e => { if (e.key === 'Enter') handleScan((e.target as HTMLInputElement).value) }} />
                <p className="text-xs text-gray-400 text-center mt-2">Tekan Enter setelah mengetik barcode</p>
              </>
            )}
          </div>
        )}

        <button
          onClick={() => { setInputMode(m => m === 'camera' ? 'manual' : 'camera'); if (scanState !== 'idle') reset() }}
          aria-label={inputMode === 'camera' ? 'Ganti ke input manual' : 'Ganti ke kamera'}
          className="fixed right-4 z-20 w-14 h-14 rounded-full bg-secondary text-white shadow-lg shadow-black/30 flex items-center justify-center active:scale-95 transition-transform border-2 border-white"
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
            <div className={clsx('card border-2', lastScan.queued ? 'border-yellow-400' : 'border-green-500')}>
              <div className="flex items-center gap-3 mb-4">
                {lastScan.queued ? <Clock size={32} className="text-yellow-500" /> : <CheckCircle2 size={32} className="text-green-500" />}
                <div>
                  <p className={clsx('font-bold', lastScan.queued ? 'text-yellow-700' : 'text-green-700')}>
                    {lastScan.queued ? 'Tersimpan di Perangkat — Menunggu Sinkronisasi' : 'Scan Berhasil!'}
                  </p>
                  <p className="text-xs text-gray-500">{lastScan.queued ? 'Belum terkirim ke server. Akan otomatis sync saat online.' : 'Status: PENDING — Menunggu Validasi'}</p>
                </div>
              </div>
              <div className="space-y-2 text-sm">
                {[
                  ['ID Scan', lastScan.scan_id],
                  ['Driver', lastScan.raos_drivers?.name ?? lastScan.driver_hint],
                  ['Kendaraan', lastScan.raos_drivers?.vehicle_plate ?? lastScan.raos_drivers?.vehicle_type],
                  ['Waktu', lastScan.scanned_at ? new Date(lastScan.scanned_at).toLocaleTimeString('id') : '—'],
                  ['Status', lastScan.queued ? 'QUEUED' : 'PENDING'],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between"><span className="text-gray-500">{k}</span><span className="font-medium text-gray-800">{v}</span></div>
                ))}
              </div>
            </div>
            <button onClick={reset} className="btn-primary">Scan Berikutnya</button>
          </div>
        )}

        {scanState === 'error' && (
          <div className="space-y-3">
            <div className="card border-2 border-red-400">
              <div className="flex items-center gap-3">
                <XCircle size={32} className="text-red-500" />
                <div><p className="font-bold text-red-700">Scan Gagal</p><p className="text-xs text-gray-600">{lastScan?.error}</p></div>
              </div>
            </div>
            <button onClick={reset} className="btn-secondary">Coba Lagi</button>
          </div>
        )}
      </div>
    </AppShell>
  )
}
