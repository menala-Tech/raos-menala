'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import AppShell from '@/components/layout/AppShell'
import { ArrowLeft, Camera, MapPin, CheckCircle2, Clock, UserCheck } from 'lucide-react'
import Link from 'next/link'
import type { UserProfile, Attendance } from '@/types'

export default function AbsensiPage() {
  const router = useRouter()
  const [user, setUser] = useState<UserProfile | null>(null)
  const [today, setToday] = useState<Attendance | null>(null)
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [locationValid, setLocationValid] = useState(false)
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState<'form' | 'camera' | 'success'>('form')
  const [type, setType] = useState<'in' | 'out'>('in')

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
        .from('attendance')
        .select('*')
        .eq('staff_id', session.user.id)
        .eq('date', dateStr)
        .single()
      setToday(att)

      navigator.geolocation.getCurrentPosition(
        pos => {
          setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude })
          setLocationValid(true)
        },
        () => setLocationValid(false),
        { enableHighAccuracy: true }
      )
    }
    init()
  }, [router])

  async function handleAbsensi(absenType: 'in' | 'out') {
    if (!user || !location) return
    setType(absenType)
    setStep('camera')
  }

  async function submitAbsensi() {
    if (!user || !location) return
    setLoading(true)
    const dateStr = new Date().toISOString().split('T')[0]
    const now = new Date().toISOString()

    if (type === 'in') {
      const { data } = await supabase
        .from('attendance')
        .upsert({
          staff_id: user.id,
          branch_id: user.branch_id,
          date: dateStr,
          check_in_at: now,
          check_in_lat: location.lat,
          check_in_lng: location.lng,
          is_location_valid: locationValid,
          status: 'hadir',
        }, { onConflict: 'staff_id,date' })
        .select()
        .single()
      setToday(data)
    } else {
      const { data } = await supabase
        .from('attendance')
        .update({
          check_out_at: now,
          check_out_lat: location.lat,
          check_out_lng: location.lng,
        })
        .eq('staff_id', user.id)
        .eq('date', dateStr)
        .select()
        .single()
      setToday(data)
    }
    setLoading(false)
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

        {/* Location */}
        <div className={`flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-lg
          ${locationValid ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          <MapPin size={14} />
          {locationValid ? 'Lokasi valid — Area Bandara Soetta' : 'GPS tidak aktif — Aktifkan lokasi'}
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
                disabled={!locationValid}
              >
                <UserCheck size={18} />
                ABSENSI MASUK
              </button>
            )}

            {hasCheckedIn && !hasCheckedOut && (
              <button
                className="btn-primary flex items-center justify-center gap-2"
                onClick={() => handleAbsensi('out')}
                disabled={!locationValid}
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
            <div className="bg-gray-900 rounded-xl h-64 flex flex-col items-center justify-center gap-3">
              <Camera size={48} className="text-primary" />
              <p className="text-white/60 text-sm">Ambil foto selfie untuk verifikasi</p>
            </div>
            <button
              className="btn-primary flex items-center justify-center gap-2"
              onClick={submitAbsensi}
              disabled={loading}
            >
              <Camera size={18} />
              {loading ? 'Menyimpan...' : 'Ambil Foto & Absen'}
            </button>
            <button className="btn-secondary" onClick={() => setStep('form')}>
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
              <p>Lokasi: Terminal 1 — Valid ✓</p>
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
