'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import AppShell from '@/components/layout/AppShell'
import MenalaLogo from '@/components/MenalaLogo'
import { DateTimeStack } from '@/components/DateTimeHeader'
import {
  ArrowLeft, Camera, MapPin, CheckCircle2, Clock, UserCheck,
  Fingerprint, Navigation, AlertTriangle
} from 'lucide-react'
import Link from 'next/link'
import SelfieCapture from '@/components/SelfieCapture'
import { checkGeofence, shouldBlockByGeofence, GEOFENCE_TOLERANCE_METERS, type GeofenceResult } from '@/lib/geo'
import { requestLocationTiered } from '@/lib/gps'
import { logActivity } from '@/lib/activity'
import { enqueue, isNetworkError } from '@/lib/offlineQueue'
import { detectCurrentShift, formatShiftTime, isLate, type Shift } from '@/lib/shift'
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
  const [shift, setShift] = useState<Shift | null>(null)
  const [recentAttendance, setRecentAttendance] = useState<Attendance[]>([])

  useEffect(() => {
    // Init dulu untuk dapat user.branch_id (cabang yang di-assign admin di
    // HRIS / panel /admin), BARU jalankan GPS+geofence supaya cabang yang
    // di-cek benar sesuai staff login. Sebelumnya userBranchId di-fetch
    // paralel dan sering null saat fix pertama → checkGeofence menyapu
    // pickup_points semua cabang → salah "nearest".
    let abortGps: (() => void) | undefined

    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/'); return }
      const { data: profile } = await supabase
        .from('user_profiles').select('*, branches(*)').eq('id', session.user.id).single()
      setUser(profile)

      const userBranchId: string | null = profile?.branch_id ?? null
      abortGps = requestLocationTiered({
        onFix: async fix => {
          setLocation({ lat: fix.lat, lng: fix.lng })
          const result = await checkGeofence(fix.lat, fix.lng, userBranchId)
          setGeofence(result)
          setLocationValid(result.isValid)
          setLocationStatus('done')
        },
        onUnavailable: () => setLocationStatus('unavailable'),
      })

      // Shift otomatis (spec Absensi.md: Pagi/Siang/Malam by jam sekarang)
      detectCurrentShift().then(setShift)

      const dateStr = new Date().toISOString().split('T')[0]
      const { data: att } = await supabase
        .from('raos_attendance').select('*').eq('staff_id', session.user.id).eq('date', dateStr).single()
      setToday(att)

      // Riwayat absensi 7 hari terakhir (spec: Riwayat Absensi harian)
      const { data: recent } = await supabase
        .from('raos_attendance').select('*')
        .eq('staff_id', session.user.id)
        .neq('date', dateStr)
        .order('date', { ascending: false })
        .limit(7)
      setRecentAttendance(recent ?? [])
    }
    init()
    return () => { abortGps?.() }
  }, [router])

  async function handleAbsensi(absenType: 'in' | 'out') {
    if (!user) return
    if (shouldBlockByGeofence(user.role, geofence, locationStatus, (user as any).is_geofence_exempt)) {
      const overshoot = geofence?.overshootMeters
      const pointName = geofence?.nearestPointName
      // Kalau overshoot null berarti checkGeofence tidak ketemu pickup point
      // sama sekali untuk cabang staff (data kosong / branch belum di-setup).
      // Jangan render "nullm" ke user — kasih pesan yang jelas.
      const reason = locationStatus === 'unavailable'
        ? 'GPS tidak terdeteksi. Aktifkan lokasi HP lalu coba lagi.'
        : locationStatus === 'checking'
          ? 'Menunggu lokasi terdeteksi. Coba beberapa detik lagi.'
          : overshoot === null || overshoot === undefined
            ? 'Data pickup point cabang belum di-setup. Hubungi admin untuk konfigurasi lokasi.'
            : `Anda ${overshoot}m di luar radius ${pointName ?? 'lokasi cabang'}. Batas toleransi ${GEOFENCE_TOLERANCE_METERS}m — absensi dibatalkan.`
      alert(reason)
      return
    }
    setType(absenType)
    setStep('camera')
  }

  async function uploadSelfie(blob: Blob): Promise<{ path: string | null; err?: unknown }> {
    if (!user) return { path: null }
    const path = `${user.id}/${type}-${Date.now()}.jpg`
    const { error } = await supabase.storage.from('selfies').upload(path, blob, { contentType: 'image/jpeg' })
    if (error) return { path: null, err: error }
    return { path }
  }

  async function submitAbsensi() {
    if (!user || !selfieBlob) return
    setLoading(true)
    const dateStr = new Date().toISOString().split('T')[0]
    const now = new Date().toISOString()
    // Selfie upload — kalau gagal karena network, selfie blob ikut dienqueue
    // (syncer akan upload saat online + inject path ke row sebelum insert).
    const upload = await uploadSelfie(selfieBlob)
    const selfiePath = upload.path
    const selfieOffline = !upload.path && !!upload.err && isNetworkError(upload.err)
    // Path hint kalau selfie masih pending upload — sama dengan format uploadSelfie
    // supaya konsisten dengan bucket policy per-user folder.
    const pendingPath = `${user.id}/${type}-${Date.now()}.jpg`

    if (type === 'in') {
      const status = shift && isLate(shift, new Date()) ? 'terlambat' : 'hadir'
      const payload = {
        staff_id: user.id, branch_id: user.branch_id, date: dateStr,
        shift_id: shift?.id ?? null,
        check_in_at: now,
        check_in_lat: location?.lat ?? null, check_in_lng: location?.lng ?? null,
        pickup_point_id: geofence?.nearestPointId ?? null,
        selfie_in_url: selfiePath, is_location_valid: locationValid, status,
      }
      const { data, error } = await supabase.from('raos_attendance')
        .upsert(payload, { onConflict: 'staff_id,date' })
        .select().single()
      if ((error && isNetworkError(error)) || selfieOffline) {
        const blobs = selfieOffline
          ? { selfie_in_url: { blob: selfieBlob, contentType: 'image/jpeg', targetBucket: 'selfies', pathHint: pendingPath } }
          : undefined
        await enqueue('raos_attendance_in', payload, blobs)
        logActivity('absensi_masuk_offline', `queued ${status} @ ${geofence?.nearestPointName ?? '-'}`)
      } else {
        setToday(data)
        logActivity('absensi_masuk', `${status} @ ${geofence?.nearestPointName ?? 'lokasi tidak terdeteksi'} (valid=${locationValid})`)
      }
    } else {
      const updates = {
        check_out_at: now,
        check_out_lat: location?.lat ?? null, check_out_lng: location?.lng ?? null,
        selfie_out_url: selfiePath,
      }
      const { data, error } = await supabase.from('raos_attendance')
        .update(updates).eq('staff_id', user.id).eq('date', dateStr).select().single()
      if ((error && isNetworkError(error)) || selfieOffline) {
        const blobs = selfieOffline
          ? { selfie_out_url: { blob: selfieBlob, contentType: 'image/jpeg', targetBucket: 'selfies', pathHint: pendingPath } }
          : undefined
        await enqueue('raos_attendance_out', { staff_id: user.id, date: dateStr, ...updates }, blobs)
        logActivity('absensi_pulang_offline', `queued @ ${geofence?.nearestPointName ?? '-'}`)
      } else {
        setToday(data)
        logActivity('absensi_pulang', `@ ${geofence?.nearestPointName ?? 'lokasi tidak terdeteksi'} (valid=${locationValid})`)
      }
    }
    setLoading(false)
    setSelfieBlob(null)
    setStep('success')
  }

  const now = new Date()
  const hasCheckedIn  = !!today?.check_in_at
  const hasCheckedOut = !!today?.check_out_at
  const timeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const dateStr = now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <AppShell>
      {/* HEADER */}
      <div className="bg-secondary text-white px-4 pt-10 pb-5 sticky top-0 z-30">
        <div className="flex items-center gap-3 mb-3">
          <Link href="/dashboard"><ArrowLeft size={22} className="text-white/70" /></Link>
          <div className="flex-1">
            <MenalaLogo size={28} showText />
          </div>
        </div>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-black text-xl tracking-wide">Absensi Staff</h1>
            <p className="text-white/50 text-xs mt-0.5">{dateStr}</p>
          </div>
          <DateTimeStack />
        </div>

        {/* Location badge */}
        <div className={`mt-3 flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-xl
          ${locationValid
            ? 'bg-green-500/20 text-green-300 border border-green-500/30'
            : locationStatus === 'checking'
              ? 'bg-white/10 text-white/60 border border-white/20'
              : 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30'}`}
        >
          <Navigation size={13} className="flex-shrink-0" />
          {locationStatus === 'checking' && 'Mengecek lokasi & geo-fence...'}
          {locationStatus === 'unavailable' && 'GPS tidak terdeteksi — absensi tetap bisa dilakukan'}
          {locationStatus === 'done' && geofence && (
            geofence.isValid
              ? `✓ Lokasi valid — ${geofence.nearestPointName ?? 'lokasi cabang'} (${geofence.distanceMeters ?? 0}m)`
              : geofence.nearestPointName === null || geofence.distanceMeters === null
                ? '⚠ Data pickup point cabang belum di-setup — hubungi admin'
                : `${geofence.nearestPointName} terdekat — ${geofence.distanceMeters}m (di luar radius)`
          )}
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* Shift Card */}
        <div className="card flex items-center gap-3">
          <div className="bg-primary/10 p-3 rounded-xl">
            <Clock size={22} className="text-primary" />
          </div>
          <div className="flex-1">
            <p className="text-[11px] text-gray-500 font-medium">Shift Hari Ini (Otomatis)</p>
            <p className="font-bold text-gray-800">
              {shift ? `${shift.name} — ${formatShiftTime(shift)}` : 'Mendeteksi shift...'}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {(user as any)?.branches?.name ?? 'Menala Airport'}
              {shift && ` • Toleransi telat ${shift.tolerance_minutes} menit`}
            </p>
          </div>
        </div>

        {/* ===== STEP: FORM ===== */}
        {step === 'form' && (
          <>
            {/* Absensi MASUK card */}
            {!hasCheckedIn && (
              <div className="card space-y-4">
                <div className="text-center">
                  <p className="text-xs text-gray-500 font-medium">ABSENSI MASUK</p>
                  <p className="text-3xl font-black text-secondary mt-1">{timeStr} WIB</p>
                  <p className="text-xs text-gray-400 mt-1">{dateStr}</p>
                </div>
                {locationStatus === 'done' && geofence && (
                  <div className={`text-center text-xs font-bold py-1.5 rounded-lg
                    ${geofence.isValid ? 'bg-green-100 text-green-700'
                      : (geofence.overshootMeters ?? 0) > GEOFENCE_TOLERANCE_METERS && user?.role === 'staff'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-yellow-100 text-yellow-700'}`}>
                    {geofence.isValid
                      ? `✓ DALAM AREA — ${geofence.nearestPointName}`
                      : (geofence.overshootMeters ?? 0) > GEOFENCE_TOLERANCE_METERS && user?.role === 'staff'
                        ? `✕ DILUAR RADIUS — ${geofence.nearestPointName} (+${geofence.overshootMeters}m, batas ${GEOFENCE_TOLERANCE_METERS}m)`
                        : `⚠ ${geofence.nearestPointName} — ${geofence.distanceMeters}m dari titik`}
                  </div>
                )}
                <button
                  className="btn-primary !bg-green-600 flex items-center justify-center gap-3"
                  onClick={() => handleAbsensi('in')}
                >
                  <Fingerprint size={20} />
                  ABSENSI MASUK
                </button>
                <p className="text-[10px] text-gray-400 text-center">
                  Anda berada di area yang valid. Pastikan lokasi sesuai sebelum absen.
                </p>
              </div>
            )}

            {/* Status setelah masuk */}
            {hasCheckedIn && (
              <div className="card">
                <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-green-500" />
                  Status Absensi Hari Ini
                </h3>
                <div className="space-y-2">
                  <div className="flex items-center justify-between py-2 border-b border-gray-100">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-green-500" />
                      <span className="text-xs text-gray-600 font-medium">Masuk</span>
                    </div>
                    <span className="text-sm font-black text-green-700">
                      {new Date(today!.check_in_at!).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${hasCheckedOut ? 'bg-primary' : 'bg-gray-300'}`} />
                      <span className="text-xs text-gray-600 font-medium">Pulang</span>
                    </div>
                    <span className={`text-sm font-bold ${hasCheckedOut ? 'text-primary' : 'text-gray-400'}`}>
                      {today?.check_out_at
                        ? `${new Date(today.check_out_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB`
                        : '— Belum absen'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* ABSENSI PULANG button */}
            {hasCheckedIn && !hasCheckedOut && (
              <div className="card space-y-4">
                <div className="text-center">
                  <p className="text-xs text-gray-500 font-medium">ABSENSI PULANG</p>
                  <p className="text-3xl font-black text-secondary mt-1">{timeStr} WIB</p>
                </div>
                <button
                  className="btn-primary flex items-center justify-center gap-3"
                  onClick={() => handleAbsensi('out')}
                >
                  <Fingerprint size={20} />
                  ABSENSI PULANG
                </button>
                <p className="text-[10px] text-gray-400 text-center">
                  Anda berada di area yang valid. Pastikan lokasi sesuai sebelum absen.
                </p>
              </div>
            )}

            {hasCheckedIn && hasCheckedOut && (
              <div className="bg-green-50 border-2 border-green-200 rounded-2xl p-5 text-center space-y-2">
                <CheckCircle2 size={48} className="text-green-500 mx-auto" />
                <p className="font-black text-green-700 text-base">Absensi Hari Ini Selesai</p>
                <p className="text-xs text-green-600">Data absensi tersimpan di server</p>
              </div>
            )}
          </>
        )}

        {/* ===== STEP: CAMERA ===== */}
        {step === 'camera' && (
          <div className="card space-y-4">
            <div className="text-center">
              <Camera size={24} className="text-primary mx-auto mb-2" />
              <p className="font-bold text-gray-800 text-sm">Foto Selfie</p>
              <p className="text-xs text-gray-500 mt-1">
                Ambil foto selfie untuk verifikasi absensi {type === 'in' ? 'masuk' : 'pulang'}
              </p>
              <p className="text-[10px] text-gray-400 mt-0.5">Pastikan wajah terlihat jelas</p>
            </div>
            <SelfieCapture onCapture={blob => setSelfieBlob(blob)} />
            {selfieBlob && (
              <button
                className="btn-primary flex items-center justify-center gap-2"
                onClick={submitAbsensi} disabled={loading}
              >
                <UserCheck size={18} />
                {loading ? 'Menyimpan...' : 'Konfirmasi Absensi'}
              </button>
            )}
            <button className="btn-secondary" onClick={() => { setStep('form'); setSelfieBlob(null) }}>
              Batal
            </button>
          </div>
        )}

        {/* ===== STEP: SUCCESS ===== */}
        {step === 'success' && (
          <div className="card text-center space-y-4">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 size={48} className="text-green-500" />
            </div>
            <div>
              <h2 className="font-black text-gray-800 text-lg">
                Absensi {type === 'in' ? 'Masuk' : 'Pulang'} Berhasil!
              </h2>
              <p className="text-sm text-gray-500 font-medium mt-1">Berhasil Dicatat</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-4 text-left space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Tanggal</span>
                <span className="font-semibold text-gray-800">
                  {now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' })}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Jam</span>
                <span className="font-black text-primary text-base">
                  {now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Lokasi</span>
                <span className="font-semibold text-gray-800">
                  {geofence?.nearestPointName ?? 'Tidak terdeteksi'}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Status Lokasi</span>
                <span className={`font-semibold ${locationValid ? 'text-green-600' : 'text-yellow-600'}`}>
                  {locationValid ? '✓ Dalam Area (Valid)' : 'Di Luar Radius'}
                </span>
              </div>
            </div>
            <button className="btn-primary" onClick={() => setStep('form')}>
              KEMBALI KE DASHBOARD
            </button>
          </div>
        )}

        {/* Riwayat Absensi 7 hari terakhir (spec Absensi.md: Riwayat harian) */}
        {step === 'form' && recentAttendance.length > 0 && (
          <div className="card">
            <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
              <Clock size={16} className="text-primary" />
              Riwayat Absensi
            </h3>
            <div className="space-y-3">
              {recentAttendance.map(att => (
                <div key={att.id} className="border-b border-gray-100 last:border-0 pb-2 last:pb-0">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-bold text-gray-700">
                      {new Date(att.date).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short' })}
                    </p>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full capitalize
                      ${att.status === 'hadir' ? 'bg-green-100 text-green-700'
                        : att.status === 'terlambat' ? 'bg-yellow-100 text-yellow-700'
                        : 'bg-gray-100 text-gray-500'}`}>
                      {att.status}
                    </span>
                  </div>
                  <div className="flex gap-4">
                    <span className="text-[11px] text-gray-500">
                      <span className="text-green-600 font-semibold">Masuk:</span>{' '}
                      {att.check_in_at
                        ? new Date(att.check_in_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB'
                        : '—'}
                    </span>
                    <span className="text-[11px] text-gray-500">
                      <span className="text-primary font-semibold">Pulang:</span>{' '}
                      {att.check_out_at
                        ? new Date(att.check_out_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB'
                        : '—'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer info */}
        <div className="grid grid-cols-3 gap-2 pt-2">
          {[
            { icon: Navigation, label: 'GPS Validation', sub: 'Pastikan di area valid' },
            { icon: Camera, label: 'Foto Selfie', sub: 'Verifikasi wajah & waktu' },
            { icon: CheckCircle2, label: 'Real-Time Sync', sub: 'Data langsung tersimpan' },
          ].map(({ icon: Icon, label, sub }) => (
            <div key={label} className="text-center">
              <div className="bg-gray-100 rounded-xl p-2.5 inline-flex mb-1">
                <Icon size={16} className="text-gray-500" />
              </div>
              <p className="text-[10px] font-bold text-gray-600">{label}</p>
              <p className="text-[9px] text-gray-400">{sub}</p>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  )
}
