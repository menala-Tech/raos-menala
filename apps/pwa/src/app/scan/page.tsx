'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import AppShell from '@/components/layout/AppShell'
import BarcodeScanner from '@/components/BarcodeScanner'
import { checkGeofence, type GeofenceResult } from '@/lib/geo'
import { ArrowLeft, MapPin, CheckCircle2, XCircle, Loader2, Keyboard, Camera } from 'lucide-react'
import Link from 'next/link'
import type { UserProfile } from '@/types'

type ScanState = 'idle' | 'scanning' | 'success' | 'error'

export default function ScanPage() {
  const router = useRouter()
  const [user, setUser] = useState<UserProfile | null>(null)
  const [scanState, setScanState] = useState<ScanState>('idle')
  const [lastScan, setLastScan] = useState<any>(null)
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [geofence, setGeofence] = useState<GeofenceResult | null>(null)
  const [locationStatus, setLocationStatus] = useState<'checking' | 'valid' | 'invalid' | 'unavailable'>('checking')
  const [inputMode, setInputMode] = useState<'camera' | 'manual'>('manual')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/'); return }
      const { data } = await supabase
        .from('user_profiles')
        .select('*, branches(*)')
        .eq('id', session.user.id)
        .single()
      setUser(data)
    }
    init()

    navigator.geolocation.getCurrentPosition(
      async pos => {
        const lat = pos.coords.latitude
        const lng = pos.coords.longitude
        setLocation({ lat, lng })
        const result = await checkGeofence(lat, lng)
        setGeofence(result)
        setLocationStatus(result.isValid ? 'valid' : 'invalid')
      },
      () => setLocationStatus('unavailable'),
      { enableHighAccuracy: true }
    )
  }, [router])

  const handleScan = useCallback(async (barcode: string) => {
    if (!barcode.trim() || !user) return
    setScanState('scanning')

    // Cari driver via barcode ATAU id_maxim
    const { data: driver } = await supabase
      .from('drivers')
      .select('id, id_maxim, nama_driver, cabang, vehicle_plate, barcode')
      .or(`barcode.eq.${barcode.trim()},id_maxim.eq.${barcode.trim()}`)
      .eq('is_active', true)
      .single()

    if (!driver) {
      setScanState('error')
      setLastScan({ error: 'Barcode tidak ditemukan dalam sistem.' })
      return
    }

    const scanId = `SCN-${Date.now()}`
    const { data: scan, error } = await supabase
      .from('scan_orders')
      .insert({
        scan_id: scanId,
        driver_id: driver.id,
        staff_id: user.id,
        pickup_point_id: geofence?.nearestPointId ?? null,
        scanned_at: new Date().toISOString(),
        latitude: location?.lat,
        longitude: location?.lng,
        status: 'pending',
      })
      .select('*, drivers(id, id_maxim, nama_driver, vehicle_plate, cabang)')
      .single()

    if (error) {
      setScanState('error')
      setLastScan({ error: 'Gagal menyimpan scan. Coba lagi.' })
    } else {
      setScanState('success')
      setLastScan(scan)
    }

    if (inputRef.current) inputRef.current.value = ''
  }, [user, location])

  function reset() {
    setScanState('idle')
    setLastScan(null)
    inputRef.current?.focus()
  }

  return (
    <AppShell>
      {/* Header */}
      <div className="bg-secondary text-white px-4 pt-10 pb-4 flex items-center gap-3">
        <Link href="/dashboard">
          <ArrowLeft size={22} />
        </Link>
        <div>
          <h1 className="font-bold text-base">Scan Barcode</h1>
          <p className="text-white/50 text-xs">Validasi Order Driver</p>
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
          {locationStatus === 'invalid' && geofence &&
            `Di luar radius geo-fence — ${geofence.nearestPointName} terdekat ${geofence.distanceMeters}m. Scan tetap bisa dilakukan.`}
          {locationStatus === 'unavailable' && 'GPS tidak terdeteksi — scan tetap bisa dilakukan'}
        </div>

        {/* Scanner Area */}
        {scanState === 'idle' && (
          <div className="card">
            <div className="flex gap-2 mb-3">
              <button
                onClick={() => setInputMode('camera')}
                className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-2 rounded-lg transition-colors
                  ${inputMode === 'camera' ? 'bg-secondary text-white' : 'bg-gray-100 text-gray-500'}`}
              >
                <Camera size={14} /> Kamera
              </button>
              <button
                onClick={() => setInputMode('manual')}
                className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-2 rounded-lg transition-colors
                  ${inputMode === 'manual' ? 'bg-secondary text-white' : 'bg-gray-100 text-gray-500'}`}
              >
                <Keyboard size={14} /> Manual
              </button>
            </div>

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
                  ['Driver', lastScan.drivers?.nama_driver],
                  ['Kendaraan', lastScan.drivers?.vehicle_plate ?? lastScan.drivers?.cabang],
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
