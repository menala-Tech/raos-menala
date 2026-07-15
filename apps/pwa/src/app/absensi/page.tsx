'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import AppShell from '@/components/layout/AppShell'
import { ArrowLeft, Camera, MapPin, CheckCircle2, Clock, UserCheck } from 'lucide-react'
import Link from 'next/link'
import SelfieCapture from '@/components/SelfieCapture'
import { checkGeofence, type GeofenceResult } from '@/lib/geo'
import type { UserProfile, Attendance } from '@/types'

export default function AbsensiPage() {
  const router = useRouter()
  const [user, setUser] = useState<UserProfile | null>(null)
  const [today, setToday] = useState<Attendance | null>(null)
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [locationValid, setLocationValid] = useState(false)
  const [geofence, setGeofence] = useState<GeofenceResult | null>(null)
  const [locationStatus, setLocationStatus] = useState<'checking' | 'done' | 'unavailable'>('checking')
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState<'form' | 'camera' | 'success'>('form')
  const [type, setType] = useState<'in' | 'out'>('in')
  const [selfieBlob, setSelfieBlob] = useState<Blob | null>(null)

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/'); return }
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('*, branches(*)')
        .eq('id', session.user.id)
        .single()
      setUser(profile)

      const dateStr = new Date().toISOString().split('T')[0]
      const { data: att } = await supabase
        .from('raos_attendance')
        .select('*')
        .eq('staff_id', session.user.id)
        .eq('date', dateStr)
        .single()
      setToday(att)

      navigator.geolocation.getCurrentPosition(
        async pos => {
          const lat = pos.coords.latitude
          const lng = pos.coords.longitude
          setLocation({ lat, lng })
          const result = await checkGeofence(lat, lng)
          setGeofence(result)
          setLocationValid(result.isValid)
          setLocationStatus('done')
        },
        () => setLocationStatus('unavailable'),
        { enableHighAccuracy: true }
      )
    }
    init()
  }, [router])

  async function handleAbsensi(absenType: 'in' | 'out') {
    if (!user) return
    setType(absenType)
    setStep('camera')
  }

  async function uploadSelfie(blob: Blob): Promise<string | null> {
    if (!user) return null
    const path = `${user.id}/${type}-${Date.now()}.jpg`
    const { error } = await supabase.storage.from('selfies').upload(path, blob, {
      contentType: 'image/jpeg',
      upsert: false,
    })
    if (error) return null
    return path
  }

  async function submitAbsensi() {
    if (!user || !selfieBlob) return
    setLoading(true)
    const dateStr = new Date().toISOString().split('T')[0]
    const now = new Date().toISOString()
    const selfiePath = await uploadSelfie(selfieBlob)

    if (type === 'in') {
      const { data } = await supabase
        .from('raos_attendance')
        .upsert({
          staff_id: user.id,
          branch_id: user.branch_id,
          date: dateStr,
          check_in_at: now,
          check_in_lat: location?.lat ?? null,
          check_in_lng: location?.lng ?? null,
          pickup_point_id: geofence?.nearestPointId ?? null,
          selfie_in_url: selfiePath,
          is_location_valid: locationValid,
          status: 'hadir',
        }, { onConflict: 'staff_id,date' })
        .select()
        .single()
      setToday(data)
    } else {
      const { data } = await supabase
        .from('raos_attendance')
        .update({
          check_out_at: now,
          check_out_lat: location?.lat ?? null,
          check_out_lng: location?.lng ?? null,
          selfie_out_url: selfiePath,
        })
        .eq('staff_id', user.id)
        .eq('date', dateStr)
        .select()
        .single()
      setToday(data)
    }
    setLoading(false)
    setSelfieBlob(null)
    setStep('success')
  }

  const now = new Date()
  const hasCheckedIn = !!today?.check_in_at
  const hasCheckedOut = !!today?.check_out_at

  return (
    <AppShell>
      <div className="bg-secondary text-white px-4 pt-10 pb-4 flex items-center gap-3">
        <Link href="/dashboard"><ArrowLeft size={22} /></Link>
        <div>
          <h1 className="font-bold text-base">Absensi</h1>
          <p className="text-white/50 text-xs">
            {now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* Shift Info */}
        <div className="card flex items-center gap-3">
          <div className="bg-primary/10 p-2.5 rounded-xl">
            <Clock size={20} className="text-primary" />
          </div>
          <div>
            <p className="text-xs text-gray-500">Shift Hari Ini</p>
            <p className="font-semibold text-gray-800">Pagi — 07:00 s/d 15:00</p>
          </div>
        </div>

        {/* Location — validasi geo-fence sesuai radius per pickup point */}
        <div className={`flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-lg
          ${locationValid ? 'bg-green-50 text-green-700' : 'bg-yellow-50 text-yellow-700'}`}>
          <MapPin size={14} />
          {locationStatus === 'checking' && 'Mengecek lokasi & geo-fence...'}
          {locationStatus === 'unavailable' &&
            'GPS tidak terdeteksi — absensi tetap bisa dilakukan (ditandai tanpa lokasi)'}
          {locationStatus === 'done' && geofence && (
            geofence.isValid
              ? `Lokasi valid — ${geofence.nearestPointName} (${geofence.distanceMeters}m)`
              : `Di luar radius geo-fence — ${geofence.nearestPointName} terdekat ${geofence.distanceMeters}m. Absensi tetap bisa dilakukan.`
          )}
        </div>

        {/* Status Absensi */}
        {step === 'form' && (
          <div className="space-y-3">
            <div className="card">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Status Absensi</h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Masuk</span>
                  <span className={`text-xs font-semibold ${hasCheckedIn ? 'text-green-600' : 'text-gray-400'}`}>
                    {today?.check_in_at
                      ? new Date(today.check_in_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
                      : '— Belum absen'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Pulang</span>
                  <span className={`text-xs font-semibold ${hasCheckedOut ? 'text-green-600' : 'text-gray-400'}`}>
                    {today?.check_out_at
                      ? new Date(today.check_out_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
                      : '— Belum absen'}
                  </span>
                </div>
              </div>
            </div>

            {!hasCheckedIn && (
              <button
                className="btn-primary flex items-center justify-center gap-2 !bg-green-600"
                onClick={() => handleAbsensi('in')}
              >
                <UserCheck size={18} />
                ABSENSI MASUK
              </button>
            )}

            {hasCheckedIn && !hasCheckedOut && (
              <button
                className="btn-primary flex items-center justify-center gap-2"
                onClick={() => handleAbsensi('out')}
              >
                <UserCheck size={18} />
                ABSENSI PULANG
              </button>
            )}

            {hasCheckedIn && hasCheckedOut && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
                <CheckCircle2 size={32} className="text-green-500 mx-auto mb-2" />
                <p className="font-semibold text-green-700">Absensi Hari Ini Selesai</p>
              </div>
            )}
          </div>
        )}

        {step === 'camera' && (
          <div className="card space-y-4">
            <p className="text-xs text-gray-500 text-center">
              Ambil foto selfie sebagai bukti absensi {type === 'in' ? 'masuk' : 'pulang'}
            </p>
            <SelfieCapture onCapture={blob => setSelfieBlob(blob)} />
            {selfieBlob && (
              <button
                className="btn-primary flex items-center justify-center gap-2"
                onClick={submitAbsensi}
                disabled={loading}
              >
                <Camera size={18} />
                {loading ? 'Menyimpan...' : 'Konfirmasi Absen'}
              </button>
            )}
            <button
              className="btn-secondary"
              onClick={() => { setStep('form'); setSelfieBlob(null) }}
            >
              Batal
            </button>
          </div>
        )}

        {step === 'success' && (
          <div className="card text-center space-y-3">
            <CheckCircle2 size={56} className="text-green-500 mx-auto" />
            <h2 className="font-bold text-gray-800 text-lg">
              Absensi {type === 'in' ? 'Masuk' : 'Pulang'} Berhasil!
            </h2>
            <div className="text-sm text-gray-600 space-y-1">
              <p>{now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
              <p className="font-bold text-primary text-xl">
                {now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB
              </p>
              <p>
                Lokasi: {geofence
                  ? `${geofence.nearestPointName} — ${locationValid ? 'Dalam radius ✓' : `${geofence.distanceMeters}m di luar radius`}`
                  : 'Tidak terdeteksi (mode tanpa GPS)'}
              </p>
            </div>
            <button className="btn-primary" onClick={() => setStep('form')}>
              Kembali
            </button>
          </div>
        )}
      </div>
    </AppShell>
  )
}
