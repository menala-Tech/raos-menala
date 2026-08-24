'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { updateMyNotificationPrefs } from '@/lib/profilePreferences'
import { cacheClearAll } from '@/lib/apiCache'
import { clearOfflineReadCache, clearOfflineReadScope} from '@/lib/offlineReadCache'
import AppShell from '@/components/layout/AppShell'
import SwipeBackWrapper from '@/components/SwipeBackWrapper'
import MenalaLogo from '@/components/MenalaLogo'
import {
  User, Smartphone, Bell, Shield,
  Database, Info, HelpCircle, LogOut, ChevronRight, ChevronLeft,
  MessageCircle, Moon, Wifi, VolumeX, Lock, Eye, EyeOff,
  Trash2, RefreshCcw, CheckCircle2, Loader2,
  Camera, Mic, Volume2, Vibrate, Image, Phone, Music, Contact,
  Bluetooth, AlarmClock, PictureInPicture
} from 'lucide-react'
import Link from 'next/link'
import clsx from 'clsx'
import type { UserProfile } from '@/types'

type Section = null | 'akun' | 'aplikasi' | 'notifikasi' | 'keamanan' | 'data'

const ROLE_COLORS: Record<string, string> = {
  staff:       'bg-green-100 text-green-700',
  koordinator: 'bg-blue-100 text-blue-700',
  admin:       'bg-orange-100 text-orange-700',
  direksi:     'bg-purple-100 text-purple-700',
}

/* ===== Preferensi lokal (spec setting.md — persist di perangkat) ===== */
interface ShiftReminder {
  masuk: string  // "HH:mm" 24h
  pulang: string
}

interface AppPrefs {
  bahasa: string
  tema: 'terang' | 'gelap'
  ukuranTeks: 'kecil' | 'sedang' | 'besar'
  suara: boolean
  getaran: boolean
  scanMode: 'otomatis' | 'manual'
  simpanFoto: 'perangkat' | 'cloud'
  notifMaster: boolean
  notifJenis: Record<string, boolean>
  reminderPagi: ShiftReminder
  reminderSiang: ShiftReminder
  reminderMalam: ShiftReminder
}

const DEFAULT_PREFS: AppPrefs = {
  bahasa: 'Bahasa Indonesia',
  tema: 'terang',
  ukuranTeks: 'sedang',
  suara: true,
  getaran: true,
  scanMode: 'manual',
  simpanFoto: 'perangkat',
  notifMaster: true,
  notifJenis: {
    'Scan Berhasil': true, 'Scan Pending': true, 'Validasi Koordinator': true,
    'Pengingat Absen': true, 'Pengumuman': true, 'Chat Room': true,
  },
  // Reminder time per shift — sesuai spec user (30 menit sebelum shift +
  // tepat di jam pulang). Cron GAS baca ini via user-config atau hardcode
  // di setupAllTriggers. Kalau user ubah di sini, cron GAS TIDAK auto
  // ikut ubah (perlu re-run setupAllTriggers manual dari script editor).
  reminderPagi:  { masuk: '06:30', pulang: '15:00' },
  reminderSiang: { masuk: '14:30', pulang: '23:00' },
  reminderMalam: { masuk: '22:30', pulang: '07:00' },
}

function loadPrefs(): AppPrefs {
  if (typeof window === 'undefined') return DEFAULT_PREFS
  try {
    const raw = localStorage.getItem('raos_prefs')
    return raw ? { ...DEFAULT_PREFS, ...JSON.parse(raw) } : DEFAULT_PREFS
  } catch { return DEFAULT_PREFS }
}

export default function SettingsPage() {
  const router = useRouter()
  const [user, setUser] = useState<UserProfile | null>(null)
  const [section, setSection] = useState<Section>(null)
  const [loggingOut, setLoggingOut] = useState(false)
  const [prefs, setPrefs] = useState<AppPrefs>(DEFAULT_PREFS)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const local = loadPrefs()
    setPrefs(local)
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/'); return }
      const { data } = await supabase
        .from('user_profiles').select('*, branches(*)').eq('id', session.user.id).single()
      setUser(data ? { ...data, email: session.user.email } as any : data)
      // Merge notification_prefs dari DB kalau ada — DB adalah source of truth
      // untuk filter Edge Function. Local storage cache untuk UI cepat load.
      const dbPrefs = (data as any)?.notification_prefs
      if (dbPrefs && typeof dbPrefs === 'object') {
        const merged: AppPrefs = {
          ...local,
          notifMaster: dbPrefs.master !== false,
          suara:       dbPrefs.suara   !== false,
          getaran:     dbPrefs.getaran !== false,
          notifJenis: {
            'Scan Berhasil':        dbPrefs.scan_berhasil        !== false,
            'Scan Pending':         dbPrefs.scan_pending         !== false,
            'Validasi Koordinator': dbPrefs.validasi_koordinator !== false,
            'Pengingat Absen':      dbPrefs.pengingat_absen      !== false,
            'Pengumuman':           dbPrefs.pengumuman           !== false,
            'Chat Room':            dbPrefs.chat_room            !== false,
          },
        }
        setPrefs(merged)
        localStorage.setItem('raos_prefs', JSON.stringify(merged))
      }
    }
    init()
  }, [router])

  // Mapping label UI (Indonesia) → key kategori snake_case di DB & Edge Function.
  const LABEL_TO_KEY: Record<string, string> = {
    'Scan Berhasil':        'scan_berhasil',
    'Scan Pending':         'scan_pending',
    'Validasi Koordinator': 'validasi_koordinator',
    'Pengingat Absen':      'pengingat_absen',
    'Pengumuman':           'pengumuman',
    'Chat Room':            'chat_room',
  }

  // Sync notifMaster + notifJenis ke user_profiles.notification_prefs.
  // Fire-and-forget: local storage sudah nyimpen dulu, DB dipush async.
  const syncNotifPrefsToDB = useCallback(async (p: AppPrefs) => {
    if (!user) return
    const dbPrefs: Record<string, boolean> = {
      master: p.notifMaster,
      suara: p.suara,
      getaran: p.getaran,
    }
    for (const [label, on] of Object.entries(p.notifJenis)) {
      const key = LABEL_TO_KEY[label]
      if (key) dbPrefs[key] = on
    }
    const result=await updateMyNotificationPrefs(dbPrefs)
    if(!result.ok) console.warn('[settings] notification prefs not persisted:',result.error)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  const savePrefs = useCallback((next: AppPrefs) => {
    setPrefs(prev => {
      // Kalau notifMaster / notifJenis berubah → sync ke DB (fire-and-forget).
      const notifChanged =
        prev.notifMaster !== next.notifMaster ||
        prev.suara !== next.suara ||
        prev.getaran !== next.getaran ||
        JSON.stringify(prev.notifJenis) !== JSON.stringify(next.notifJenis)
      if (notifChanged) { void syncNotifPrefsToDB(next) }
      return next
    })
    localStorage.setItem('raos_prefs', JSON.stringify(next))
    window.dispatchEvent(new Event('raos:prefs-changed'))
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('dark', next.tema === 'gelap')
      document.documentElement.setAttribute('data-text-size', next.ukuranTeks)
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }, [syncNotifPrefsToDB])

  async function handleLogout() {
    setLoggingOut(true)
    cacheClearAll()
    await clearOfflineReadScope(user?.id)
    await clearOfflineReadCache()
    localStorage.removeItem('raos_install_variant')
    // A8: no-ops on the browser PWA — stops the Android foreground
    // tracking service (if running) and clears the native session bridge
    // before the Supabase session itself is torn down.
    await (await import('@/lib/nativeLocationBridge')).stopTrackingOnLogout()
    await supabase.auth.signOut()
    router.push('/')
  }

  /* ============ SUB-VIEW WRAPPER ============ */
  if (section) {
    const TITLES: Record<string, string> = {
      akun: 'Pengaturan Akun', aplikasi: 'Pengaturan Aplikasi',
      notifikasi: 'Notifikasi',
      keamanan: 'Keamanan', data: 'Data & Sync',
    }
    return (
      // Wrap SwipeBackWrapper WITH onBack — register di module-level guard
      // supaya AppShell luar (fallback router.back) skip. Swipe back di
      // sub-menu Pengaturan → setSection(null) → balik ke main Settings
      // (BUKAN lompat ke /dashboard).
      <SwipeBackWrapper onBack={() => setSection(null)}>
        <AppShell noSwipe>
          <div className="bg-secondary text-white px-4 pt-10 pb-4 flex items-center gap-3 sticky top-0 z-30">
            <button onClick={() => setSection(null)} className="text-white/70">
              <ChevronLeft size={24} />
            </button>
            <h1 className="font-black text-lg flex-1">{TITLES[section]}</h1>
            <MenalaLogo size={26} showText={false} />
          </div>

          {saved && (
            <div className="mx-4 mt-3 bg-green-50 border border-green-200 rounded-xl px-3 py-2
                            flex items-center gap-2 text-green-700 text-xs font-semibold">
              <CheckCircle2 size={14} /> Perubahan tersimpan
            </div>
          )}

          <div className="px-4 py-4">
            {section === 'akun'       && <SectionAkun user={user} onLogout={handleLogout} />}
            {section === 'aplikasi'   && <SectionAplikasi prefs={prefs} save={savePrefs} />}
            {section === 'notifikasi' && <SectionNotifikasi prefs={prefs} save={savePrefs} />}
            {section === 'keamanan'   && <SectionKeamanan />}
            {section === 'data'       && <SectionData />}
          </div>
        </AppShell>
      </SwipeBackWrapper>
    )
  }

  /* ============ MAIN MENU ============ */
  const MENUS = [
    { key: 'akun',       icon: User,       label: 'Pengaturan Akun',       desc: 'Profil, email, password, foto' },
    { key: 'aplikasi',   icon: Smartphone, label: 'Pengaturan Aplikasi',   desc: 'Tema, bahasa, ukuran teks, suara' },
    { key: 'notifikasi', icon: Bell,       label: 'Notifikasi',            desc: 'Jenis notifikasi & waktu pengingat' },
    { key: 'keamanan',   icon: Shield,     label: 'Keamanan',              desc: 'Password, sesi, perangkat' },
    { key: 'data',       icon: Database,   label: 'Data & Sync',           desc: 'Backup, cache, sinkronisasi' },
  ] as const

  return (
    <AppShell>
      <div className="bg-secondary text-white px-4 pt-10 pb-5 sticky top-0 z-30">
        <div className="flex items-center gap-3 mb-4">
          <Link href="/dashboard" className="text-white/70">
            <ChevronLeft size={24} />
          </Link>
          <div className="flex-1"><MenalaLogo size={28} showText /></div>
          <Bell size={18} className="text-white/50" />
        </div>
        <h1 className="font-black text-xl">Pengaturan</h1>
        <p className="text-white/50 text-xs mt-0.5">Kelola preferensi &amp; konfigurasi akun</p>
      </div>

      {/* Profile Card */}
      {user && (
        <div className="mx-4 -mt-3 relative z-10">
          <div className="bg-white rounded-2xl shadow-lg p-4 flex items-center gap-4">
            <div className="w-14 h-14 bg-primary rounded-full flex items-center justify-center
                            text-secondary font-black text-xl shadow-md flex-shrink-0">
              {user.full_name?.charAt(0) ?? '?'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-black text-gray-800 text-base truncate">{user.full_name}</p>
              <p className="text-xs text-gray-500 truncate mt-0.5">{(user as any).email ?? ''}</p>
              <div className="flex items-center gap-2 mt-1.5">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full capitalize
                  ${ROLE_COLORS[user.role] ?? 'bg-gray-100 text-gray-600'}`}>
                  {user.role}
                </span>
                <span className="text-[10px] text-gray-400">{(user as any)?.branches?.name ?? ''}</span>
                <span className="bg-green-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">Online</span>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="px-4 py-4 space-y-3 mt-1">
        {/* Quick Toggles — fungsional, tersimpan ke prefs */}
        <div className="card">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Pintasan Setting</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            <ToggleRow icon={Moon} label="Mode Gelap"
              value={prefs.tema === 'gelap'}
              onChange={v => savePrefs({ ...prefs, tema: v ? 'gelap' : 'terang' })} />
            <ToggleRow icon={VolumeX} label="Suara"
              value={prefs.suara}
              onChange={v => savePrefs({ ...prefs, suara: v })} />
            <ToggleRow icon={Bell} label="Notifikasi"
              value={prefs.notifMaster}
              onChange={v => savePrefs({ ...prefs, notifMaster: v })} />
            <ToggleRow icon={Wifi} label="Getaran"
              value={prefs.getaran}
              onChange={v => savePrefs({ ...prefs, getaran: v })} />
          </div>
        </div>

        {/* Native-only background location tracking card */}
        <SectionTrackingLokasi
          userId={user?.id}
          branchId={user?.branch_id}
          role={user?.role}
        />

        <SectionHpPermissions />

        {/* Menu List */}
        <div className="space-y-1">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-widest px-1 pt-1">Menu Pengaturan</p>
          {MENUS.map(({ key, icon: Icon, label, desc }) => (
            <button
              key={key}
              onClick={() => setSection(key as Section)}
              className="card w-full flex items-center gap-3 text-left active:scale-[0.99] transition-transform"
            >
              <div className="bg-secondary/5 p-2.5 rounded-xl">
                <Icon size={18} className="text-secondary" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-gray-800">{label}</p>
                <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
              </div>
              <ChevronRight size={16} className="text-gray-300 flex-shrink-0" />
            </button>
          ))}
        </div>

        {/* Bantuan */}
        <div className="card space-y-0.5">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Bantuan &amp; Panduan</p>
          {[
            { icon: Info,          label: 'Tentang Aplikasi',   href: '/settings/bantuan' },
            { icon: HelpCircle,    label: 'Panduan Penggunaan', href: '/settings/bantuan' },
            { icon: MessageCircle, label: 'Hubungi Admin',      href: '/chat?room=umum' },
          ].map(({ icon: Icon, label, href }) => (
            <Link key={label} href={href} className="flex items-center gap-3 py-2.5 border-b border-gray-100 last:border-0">
              <Icon size={17} className="text-gray-500" />
              <span className="text-sm text-gray-700 font-medium flex-1">{label}</span>
              <ChevronRight size={14} className="text-gray-300" />
            </Link>
          ))}
        </div>

        {/* Logout */}
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="card w-full flex items-center gap-3 text-red-600 border border-red-100 disabled:opacity-50"
        >
          <div className="bg-red-50 p-2.5 rounded-xl">
            <LogOut size={18} className="text-red-500" />
          </div>
          <span className="font-bold text-sm">{loggingOut ? 'Keluar...' : 'Keluar dari Akun'}</span>
        </button>

        {/* App info footer */}
        <div className="pt-2 pb-6">
          <div className="flex items-center justify-center mb-3">
            <MenalaLogo size={28} showText={false} />
          </div>
          <p className="text-center text-[11px] text-gray-400 font-semibold">MENALA STAFF</p>
          <p className="text-center text-[10px] text-gray-300 mt-0.5">Versi 1.0.0 (Build 25) • © 2024 MENALA</p>
          <p className="text-center text-[9px] text-gray-300 mt-1">
            Aplikasi operasional untuk validasi order Maxim di bandara
          </p>
        </div>
      </div>
    </AppShell>
  )
}

/* ================= KOMPONEN BERSAMA ================= */

function ToggleRow({ icon: Icon, label, value, onChange }: {
  icon: any; label: string; value: boolean; onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Icon size={14} className="text-gray-400" />
        <span className="text-xs text-gray-600 font-medium">{label}</span>
      </div>
      <button
        onClick={() => onChange(!value)}
        className={`w-10 h-5 rounded-full relative transition-colors ${value ? 'bg-primary' : 'bg-gray-200'}`}
      >
        <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 shadow-sm transition-all ${value ? 'right-0.5' : 'left-0.5'}`} />
      </button>
    </div>
  )
}

function OptionPicker<T extends string>({ label, options, value, onChange }: {
  label: string; options: { key: T; label: string }[]; value: T; onChange: (v: T) => void
}) {
  return (
    <div className="py-3 border-b border-gray-100 last:border-0">
      <p className="text-xs text-gray-500 font-medium mb-2">{label}</p>
      <div className="flex gap-2 flex-wrap">
        {options.map(o => (
          <button
            key={o.key}
            onClick={() => onChange(o.key)}
            className={clsx(
              'px-3 py-1.5 rounded-full text-xs font-semibold transition-colors',
              value === o.key ? 'bg-secondary text-white' : 'bg-gray-100 text-gray-500'
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

/* ================= SECTION: AKUN ================= */
function SectionAkun({ user, onLogout }: { user: UserProfile | null; onLogout: () => void }) {
  const isSSoT = user?.source === 'ssot_master_staff'

  return (
    <div className="space-y-3">
      <div className="card space-y-3">
        <Field label="Nama Lengkap" value={user?.full_name ?? '—'} readOnly />
        <Field label="Email" value={(user as any)?.email ?? '—'} readOnly />
        <Field label="ID Staff" value={user?.staff_id ?? '—'} readOnly />
        <Field label="No. WhatsApp" value={user?.phone ?? '—'} readOnly />
      </div>

      {isSSoT ? (
        <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          Akun Anda tersinkron dari sheet MASTER DATA STAFF (SSoT). Perubahan
          nama, email, No. WhatsApp, atau ID Staff harus dilakukan di sheet
          oleh admin — bukan di sini. Sinkronisasi berikutnya (max 1 jam)
          otomatis update ke sistem.
        </p>
      ) : (
        <p className="text-[10px] text-gray-400 px-1">
          Data identitas akun dikelola oleh Admin. Hubungi Admin melalui Chat Room untuk perubahan data.
        </p>
      )}

      <button onClick={onLogout}
        className="w-full bg-red-500 text-white font-bold py-3 rounded-xl active:scale-95 transition-all">
        Keluar dari Akun
      </button>
    </div>
  )
}

function Field({ label, value, readOnly }: { label: string; value: string; readOnly?: boolean }) {
  return (
    <div>
      <p className="text-xs text-gray-500 font-medium mb-1">{label}</p>
      <div className="input bg-gray-50 text-gray-600">{value}</div>
    </div>
  )
}

/* ================= SECTION: APLIKASI ================= */
function SectionAplikasi({ prefs, save }: { prefs: AppPrefs; save: (p: AppPrefs) => void }) {
  const [cacheSize, setCacheSize] = useState<string>('—')
  const [clearing, setClearing] = useState(false)

  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'storage' in navigator && navigator.storage.estimate) {
      navigator.storage.estimate().then(est => {
        const mb = ((est.usage ?? 0) / 1024 / 1024).toFixed(1)
        setCacheSize(`${mb} MB`)
      })
    }
  }, [])

  async function clearCache() {
    setClearing(true)
    try {
      if ('caches' in window) {
        const keys = await caches.keys()
        await Promise.all(keys.map(k => caches.delete(k)))
      }
      setCacheSize('0.0 MB')
    } finally {
      setClearing(false)
    }
  }

  return (
    <div className="card">
      <OptionPicker label="Bahasa"
        options={[{ key: 'Bahasa Indonesia', label: 'Bahasa Indonesia' }, { key: 'English', label: 'English' }]}
        value={prefs.bahasa as any} onChange={v => save({ ...prefs, bahasa: v })} />
      <OptionPicker label="Tema Aplikasi"
        options={[{ key: 'terang', label: 'Mode Terang' }, { key: 'gelap', label: 'Mode Gelap' }]}
        value={prefs.tema} onChange={v => save({ ...prefs, tema: v })} />
      <OptionPicker label="Ukuran Teks"
        options={[{ key: 'kecil', label: 'Kecil' }, { key: 'sedang', label: 'Sedang' }, { key: 'besar', label: 'Besar' }]}
        value={prefs.ukuranTeks} onChange={v => save({ ...prefs, ukuranTeks: v })} />
      <OptionPicker label="Scan Barcode (default saat buka halaman Scan)"
        options={[{ key: 'otomatis', label: 'Kamera Otomatis' }, { key: 'manual', label: 'Manual' }]}
        value={prefs.scanMode} onChange={v => save({ ...prefs, scanMode: v })} />
      <OptionPicker label="Simpan Foto Scan"
        options={[{ key: 'perangkat', label: 'Di Perangkat' }, { key: 'cloud', label: 'Cloud' }]}
        value={prefs.simpanFoto} onChange={v => save({ ...prefs, simpanFoto: v })} />

      <div className="py-3 space-y-3">
        <ToggleRow icon={VolumeX} label="Suara" value={prefs.suara}
          onChange={v => save({ ...prefs, suara: v })} />
        <ToggleRow icon={Smartphone} label="Getaran" value={prefs.getaran}
          onChange={v => save({ ...prefs, getaran: v })} />
      </div>

      <div className="pt-3 border-t border-gray-100">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-700">Bersihkan Cache</p>
            <p className="text-xs text-gray-400">Penyimpanan terpakai: {cacheSize}</p>
          </div>
          <button
            onClick={clearCache} disabled={clearing}
            className="flex items-center gap-1.5 bg-gray-100 text-gray-600 text-xs font-bold
                       px-3 py-2 rounded-xl disabled:opacity-50"
          >
            <Trash2 size={13} />
            {clearing ? 'Membersihkan...' : 'Bersihkan'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ================= SECTION: NOTIFIKASI ================= */
function SectionNotifikasi({ prefs, save }: { prefs: AppPrefs; save: (p: AppPrefs) => void }) {
  const [pushMsg, setPushMsg] = useState('')
  const [busy, setBusy] = useState(false)

  async function toggleMaster() {
    const next = !prefs.notifMaster
    save({ ...prefs, notifMaster: next })
    setBusy(true); setPushMsg('')
    if (next) {
      // Aktifkan → minta izin browser + subscribe Web Push (VAPID)
      const { subscribePush } = await import('@/lib/push')
      const r = await subscribePush()
      if (!r.ok) {
        if (r.reason === 'permission_denied') {
          setPushMsg('Izin notifikasi ditolak browser. Aktifkan lewat pengaturan browser HP.')
        } else if (r.reason === 'vapid_public_key_missing') {
          setPushMsg('Server belum konfigurasi VAPID key. Hubungi admin sistem.')
        } else if (r.reason === 'unsupported') {
          setPushMsg('Browser tidak mendukung Push Notification.')
        } else {
          setPushMsg('Gagal aktifkan push: ' + r.reason)
        }
      } else {
        setPushMsg('✓ Notifikasi aktif. Akan muncul di lock screen HP.')
      }
    } else {
      const { unsubscribePush } = await import('@/lib/push')
      await unsubscribePush()
      setPushMsg('Notifikasi dinonaktifkan.')
    }
    setBusy(false)
    setTimeout(() => setPushMsg(''), 5000)
  }

  return (
    <div className="space-y-3">
      <div className="card">
        <div className="flex items-center justify-between pb-3 border-b border-gray-100">
          <div className="flex-1">
            <p className="text-sm font-bold text-gray-800">Aktifkan Notifikasi</p>
            <p className="text-xs text-gray-400">Toggle master + minta izin browser</p>
          </div>
          <button
            onClick={toggleMaster}
            disabled={busy}
            className={`w-11 h-6 rounded-full relative transition-colors disabled:opacity-50 ${prefs.notifMaster ? 'bg-primary' : 'bg-gray-200'}`}
          >
            <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 shadow transition-all ${prefs.notifMaster ? 'right-0.5' : 'left-0.5'}`} />
          </button>
        </div>
        {pushMsg && (
          <p className={clsx(
            'text-[11px] text-center py-2 rounded-lg mt-3',
            pushMsg.startsWith('✓') ? 'bg-green-50 text-green-700' : 'bg-yellow-50 text-yellow-700'
          )}>{pushMsg}</p>
        )}

        <p className="text-xs font-bold text-gray-500 uppercase tracking-widest py-3">Jenis Notifikasi</p>
        <div className={clsx('space-y-3', !prefs.notifMaster && 'opacity-40 pointer-events-none')}>
          {Object.entries(prefs.notifJenis).map(([jenis, on]) => (
            <ToggleRow key={jenis} icon={Bell} label={jenis} value={on}
              onChange={v => save({ ...prefs, notifJenis: { ...prefs.notifJenis, [jenis]: v } })} />
          ))}
        </div>
      </div>

      <div className="card">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Waktu Pengingat per Shift</p>
        <div className="space-y-4">
          {([
            { key: 'reminderPagi' as const,  label: '🌅 Shift Pagi',  hint: 'default 06:30 masuk, 15:00 pulang' },
            { key: 'reminderSiang' as const, label: '☀️ Shift Siang', hint: 'default 14:30 masuk, 23:00 pulang' },
            { key: 'reminderMalam' as const, label: '🌙 Shift Malam', hint: 'default 22:30 masuk, 07:00 pulang' },
          ]).map(({ key, label, hint }) => {
            const val = prefs[key]
            return (
              <div key={key}>
                <p className="text-xs font-semibold text-gray-700 mb-1">{label}</p>
                <p className="text-[10px] text-gray-400 mb-2">{hint}</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-gray-500">Reminder MASUK</label>
                    <input
                      type="time" value={val.masuk}
                      onChange={e => save({ ...prefs, [key]: { ...val, masuk: e.target.value } })}
                      className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm font-bold text-gray-700 w-full"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-500">Reminder PULANG</label>
                    <input
                      type="time" value={val.pulang}
                      onChange={e => save({ ...prefs, [key]: { ...val, pulang: e.target.value } })}
                      className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm font-bold text-gray-700 w-full"
                    />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
        <p className="text-[10px] text-amber-600 bg-amber-50 rounded-lg px-3 py-2 mt-3">
          ⚠️ Waktu di sini adalah preferensi tampilan. Cron server-side GAS pakai
          jadwal fixed sesuai default. Kalau Anda ubah, minta admin re-configure
          trigger GAS supaya sinkron.
        </p>
      </div>
    </div>
  )
}

/* ================= SECTION: KEAMANAN ================= */
function SectionKeamanan() {
  const [pass1, setPass1] = useState('')
  const [pass2, setPass2] = useState('')
  const [show, setShow] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [signingOutAll, setSigningOutAll] = useState(false)
  const router = useRouter()

  async function changePassword(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    if (pass1.length < 8) { setMsg({ ok: false, text: 'Password minimal 8 karakter.' }); return }
    if (pass1 !== pass2)  { setMsg({ ok: false, text: 'Konfirmasi password tidak sama.' }); return }
    setSaving(true)
    const { error } = await supabase.auth.updateUser({ password: pass1 })
    if (error) {
      setMsg({ ok: false, text: 'Gagal mengubah password. Coba login ulang lalu ulangi.' })
    } else {
      setMsg({ ok: true, text: 'Password berhasil diubah ✓' })
      setPass1(''); setPass2('')
    }
    setSaving(false)
  }

  async function signOutAllDevices() {
    setSigningOutAll(true)
    cacheClearAll()
    const { data: { user: currentUser } = { user: null } } = await supabase.auth.getUser()
    await clearOfflineReadScope(currentUser?.id)
    await clearOfflineReadCache()
    localStorage.removeItem('raos_install_variant')
    await (await import('@/lib/nativeLocationBridge')).stopTrackingOnLogout()
    await supabase.auth.signOut({ scope: 'global' })
    router.push('/')
  }

  return (
    <div className="space-y-3">
      {/* Ubah Password */}
      <div className="card">
        <p className="text-sm font-bold text-gray-800 mb-1 flex items-center gap-2">
          <Lock size={15} className="text-primary" /> Ubah Password
        </p>
        <p className="text-xs text-gray-400 mb-3">Gunakan minimal 8 karakter</p>
        <form onSubmit={changePassword} className="space-y-3">
          <div className="relative">
            <input
              type={show ? 'text' : 'password'} placeholder="Password baru"
              value={pass1} onChange={e => setPass1(e.target.value)}
              className="input pr-10" autoComplete="new-password"
            />
            <button type="button" onClick={() => setShow(!show)}
              className="absolute right-3 top-3.5 text-gray-400">
              {show ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <input
            type={show ? 'text' : 'password'} placeholder="Ulangi password baru"
            value={pass2} onChange={e => setPass2(e.target.value)}
            className="input" autoComplete="new-password"
          />
          {msg && (
            <p className={clsx('text-xs text-center py-2 rounded-lg font-semibold',
              msg.ok ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500')}>
              {msg.text}
            </p>
          )}
          <button type="submit" className="btn-primary" disabled={saving || !pass1}>
            {saving ? 'Menyimpan...' : 'Simpan Password Baru'}
          </button>
        </form>
      </div>

      {/* Login & Aktivitas */}
      <div className="card space-y-1">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Login &amp; Aktivitas</p>
        <button
          onClick={signOutAllDevices}
          disabled={signingOutAll}
          className="flex items-center gap-3 py-2.5 w-full text-left border-b border-gray-100"
        >
          <LogOut size={16} className="text-red-500" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-600">
              {signingOutAll ? 'Memproses...' : 'Keluar dari Semua Perangkat'}
            </p>
            <p className="text-[10px] text-gray-400">Sesi di semua perangkat lain akan berakhir</p>
          </div>
        </button>
        <div className="flex items-center gap-3 py-2.5">
          <Shield size={16} className="text-gray-400" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-gray-700">Aktivitas Login</p>
            <p className="text-[10px] text-gray-400">Semua login tercatat otomatis untuk audit sistem</p>
          </div>
          <CheckCircle2 size={15} className="text-green-500" />
        </div>
      </div>

      <p className="text-[10px] text-gray-400 px-1">
        Jangan bagikan akun kepada siapapun. Logout setelah selesai menggunakan sistem.
        Hubungi Admin jika mengalami kendala login.
      </p>
    </div>
  )
}

/* ================= SECTION: PERIZINAN HP ================= */
type HpCapabilityStatus =
  | 'Diizinkan'
  | 'Tidak diizinkan'
  | 'Atur di HP'
  | 'Belum digunakan'
  | 'Tidak berlaku'
  | 'Memerlukan akses khusus'

function SectionHpPermissions() {
  const [native, setNative] = useState(false)
  const [summary, setSummary] = useState<{ camera: string; microphone: string; notifications: string } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const m = await import('@/lib/nativeAndroidSettings')
    const isNative = m.isNativeAndroidShell()
    setNative(isNative)
    const s = await m.getAndroidPermissionSummary()
    setSummary({ camera: s.camera, microphone: s.microphone, notifications: s.notifications })
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  async function run(key: string, action: () => Promise<void>) {
    setBusy(key)
    try {
      await action()
      await refresh()
    } finally {
      setBusy(null)
    }
  }

  const permissionLabel = (status?: string): HpCapabilityStatus => status === 'granted' ? 'Diizinkan' : 'Tidak diizinkan'
  const osSettings = native ? 'Atur di HP' : 'Tidak berlaku'
  const rows: Array<{
    key: string
    icon: typeof Bell
    label: string
    status: HpCapabilityStatus
    purpose: string
    actionLabel?: string
    action?: () => Promise<void>
  }> = [
    {
      key: 'camera',
      icon: Camera,
      label: 'Kamera',
      status: permissionLabel(summary?.camera),
      purpose: 'Ambil foto di chat, scan, dan selfie absensi.',
      actionLabel: native ? 'Buka Pengaturan HP' : undefined,
      action: native ? async () => (await import('@/lib/nativeAndroidSettings')).openAndroidAppSettings() : undefined,
    },
    {
      key: 'microphone',
      icon: Mic,
      label: 'Mikrofon',
      status: permissionLabel(summary?.microphone),
      purpose: 'Rekam pesan suara di room chat saat tombol mic ditekan.',
      actionLabel: native ? 'Buka Pengaturan HP' : undefined,
      action: native ? async () => (await import('@/lib/nativeAndroidSettings')).openAndroidAppSettings() : undefined,
    },
    {
      key: 'notifications',
      icon: Bell,
      label: 'Notifikasi',
      status: permissionLabel(summary?.notifications),
      purpose: 'Menampilkan notifikasi RAOS di notification shade Android.',
      actionLabel: native ? (summary?.notifications === 'granted' ? 'Pengaturan Notifikasi HP' : 'Minta Izin') : undefined,
      action: native
        ? async () => {
            const m = await import('@/lib/nativeAndroidSettings')
            if (summary?.notifications === 'granted') await m.openAndroidNotificationSettings()
            else await m.requestAndroidNotificationPermission()
          }
        : undefined,
    },
    {
      key: 'chat-notifications',
      icon: MessageCircle,
      label: 'Notifikasi Chat',
      status: osSettings,
      purpose: 'Channel Android raos_chat untuk pesan group dan mention.',
      actionLabel: native ? 'Pengaturan Chat' : undefined,
      action: native ? async () => (await import('@/lib/nativeAndroidSettings')).openAndroidChatNotificationSettings() : undefined,
    },
    { key: 'sound', icon: Volume2, label: 'Suara', status: osSettings, purpose: 'Dikontrol oleh channel notifikasi Android.', actionLabel: native ? 'Pengaturan Chat' : undefined, action: native ? async () => (await import('@/lib/nativeAndroidSettings')).openAndroidChatNotificationSettings() : undefined },
    { key: 'vibration', icon: Vibrate, label: 'Getar', status: osSettings, purpose: 'Dikontrol oleh channel notifikasi Android.', actionLabel: native ? 'Pengaturan Chat' : undefined, action: native ? async () => (await import('@/lib/nativeAndroidSettings')).openAndroidChatNotificationSettings() : undefined },
    { key: 'photos', icon: Image, label: 'Foto & Video', status: 'Belum digunakan', purpose: 'Chat memakai photo picker/file picker modern tanpa baca galeri luas.' },
    { key: 'phone', icon: Phone, label: 'Telepon', status: 'Belum digunakan', purpose: 'Tidak ada fitur panggilan telepon native saat ini.' },
    { key: 'calllog', icon: Phone, label: 'Log Panggilan', status: 'Belum digunakan', purpose: 'Tidak dibaca dan tidak diminta karena izin sensitif.' },
    { key: 'audio', icon: Music, label: 'Musik & Audio', status: 'Belum digunakan', purpose: 'Voice message merekam mikrofon; tidak membaca pustaka audio.' },
    { key: 'contacts', icon: Contact, label: 'Kontak', status: 'Belum digunakan', purpose: 'Direktori RAOS berasal dari Supabase, bukan kontak HP.' },
    { key: 'nearby', icon: Bluetooth, label: 'Perangkat Sekitar', status: 'Belum digunakan', purpose: 'Tidak ada fitur Bluetooth/perangkat sekitar saat ini.' },
    {
      key: 'alarms',
      icon: AlarmClock,
      label: 'Alarm & Pengingat',
      status: osSettings,
      purpose: 'Pengingat Jadwal Kerja memakai channel Android RAOS Jadwal Kerja.',
      actionLabel: native ? 'Pengaturan Pengingat' : undefined,
      action: native ? async () => (await import('@/lib/nativeAndroidSettings')).openAndroidWorkReminderNotificationSettings() : undefined,
    },
    {
      key: 'pip',
      icon: PictureInPicture,
      label: 'Gambar dalam Gambar',
      status: 'Tidak berlaku',
      purpose: 'Belum ada fitur video/call PiP di RAOS.',
      actionLabel: native ? 'Pengaturan PiP' : undefined,
      action: native ? async () => (await import('@/lib/nativeAndroidSettings')).openAndroidPictureInPictureSettings() : undefined,
    },
  ]

  return (
    <div className="card space-y-3">
      <div>
        <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Perizinan &amp; Notifikasi HP</p>
        <p className="mt-1 text-[11px] text-gray-400">
          Preferensi RAOS tetap di menu Notifikasi; suara/getar mengikuti channel Android.
        </p>
      </div>
      <div className="divide-y divide-gray-100">
        {rows.map(({ key, icon: Icon, label, status, purpose, actionLabel, action }) => (
          <div key={key} className="flex items-center gap-3 py-2.5">
            <Icon size={17} className="text-gray-500 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-gray-800">{label}</p>
                <span className={clsx(
                  'rounded-full px-2 py-0.5 text-[9px] font-bold',
                  status === 'Diizinkan' ? 'bg-green-50 text-green-700'
                    : status === 'Tidak diizinkan' ? 'bg-red-50 text-red-600'
                    : 'bg-gray-100 text-gray-500'
                )}>
                  {status}
                </span>
              </div>
              <p className="mt-0.5 text-[10px] text-gray-400">{purpose}</p>
            </div>
            {action && actionLabel && (
              <button
                type="button"
                disabled={busy === key}
                onClick={() => run(key, action)}
                className="rounded-lg bg-gray-100 px-2 py-1.5 text-[10px] font-bold text-gray-600 disabled:opacity-50"
              >
                {busy === key ? '...' : actionLabel}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

/* ================= SECTION: PELACAKAN LOKASI (Android native shell only) ================= */
// A7: minimal UI integration point for the Android background-location
// bridge (android/app/src/main/java/com/rifim/raos/location/). Renders
// nothing at all in the browser PWA — isNativeAndroidShell() is false
// there, so this whole block is invisible/no-op for every existing user.
const ALLOWED_TRACKING_ROLES = new Set(['staff', 'koordinator', 'driver_manager', 'driver'])

function SectionTrackingLokasi({
  userId,
  branchId,
  role,
}: {
  userId?: string | null
  branchId?: string | null
  role?: string | null
}) {
  const [native, setNative] = useState(false)
  const [status, setStatus] = useState<{ tracking: boolean; hasValidSession: boolean; hasRequiredPermissions: boolean; queuedPointCount: number } | null>(null)
  const [tracking, setTracking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    let mounted = true
    import('@/lib/nativeLocationBridge').then(async (m) => {
      if (!mounted) return
      const isNative = m.isNativeAndroidShell()
      setNative(isNative)
      if (isNative) {
        const s = await m.getBackgroundTrackingStatus()
        if (!mounted) return
        setStatus(s)
        setTracking(!!s?.tracking)
      }
    })
    return () => { mounted = false }
  }, [])

  if (!native || !role || !ALLOWED_TRACKING_ROLES.has(role.toLowerCase())) return null

  async function toggle() {
    if (!userId) return
    setBusy(true); setMsg('')
    const m = await import('@/lib/nativeLocationBridge')
    try {
      if (tracking) {
        await m.stopBackgroundTracking()
        setTracking(false)
      } else {
        const perm = await m.requestLocationPermissions()
        if (!perm.granted) { setMsg('Izin lokasi ditolak — buka Pengaturan Android untuk mengizinkan.'); setBusy(false); return }
        const res = await m.startBackgroundTracking(userId, branchId)
        setTracking(res.tracking)
      }
      setStatus(await m.getBackgroundTrackingStatus())
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card space-y-3">
      <p className="font-bold text-gray-700 text-xs">Pelacakan Lokasi</p>
      <InfoRow label="Status" value={tracking ? 'Aktif' : 'Tidak aktif'} />
      <InfoRow label="Izin Lokasi" value={status?.hasRequiredPermissions ? 'Diberikan' : 'Belum diberikan'} />
      <InfoRow label="Titik Tertunda" value={String(status?.queuedPointCount ?? 0)} />
      <button onClick={toggle} disabled={busy || !userId} className={tracking ? 'btn-secondary' : 'btn-primary'}>
        {busy ? <Loader2 size={16} className="animate-spin mx-auto" /> : tracking ? 'Hentikan Pelacakan' : 'Aktifkan Pelacakan'}
      </button>
      {msg && <p className="text-[10px] text-red-500">{msg}</p>}
      <p className="text-[10px] text-gray-400">
        Notifikasi tracking akan tetap tampil selama aktif — ini wajib dari Android, bukan bug.
      </p>
    </div>
  )
}

/* ================= SECTION: DATA & SYNC ================= */
function SectionData() {
  const [storageInfo, setStorageInfo] = useState<{ used: string; quota: string }>({ used: '—', quota: '—' })
  const [lastSync, setLastSync] = useState<string>('—')
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
      navigator.storage.estimate().then(est => {
        setStorageInfo({
          used: `${((est.usage ?? 0) / 1024 / 1024).toFixed(1)} MB`,
          quota: `${((est.quota ?? 0) / 1024 / 1024 / 1024).toFixed(1)} GB`,
        })
      })
    }
    setLastSync(new Date().toLocaleString('id-ID', {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    }) + ' WIB')
  }, [])

  async function syncNow() {
    setSyncing(true)
    // Ping ringan ke Supabase untuk konfirmasi koneksi data
    await supabase.from('branches').select('id').limit(1)
    setLastSync(new Date().toLocaleString('id-ID', {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    }) + ' WIB')
    setSyncing(false)
  }

  return (
    <div className="space-y-3">
      <div className="card space-y-3">
        <InfoRow label="Mode Sync" value="Real-time (Supabase)" />
        <InfoRow label="Sync Terakhir" value={lastSync} />
        <InfoRow label="Penyimpanan Terpakai" value={storageInfo.used} />
        <InfoRow label="Kuota Perangkat" value={storageInfo.quota} />
        <InfoRow label="Backup Otomatis" value="Setiap hari 02:00 WIB (via GAS)" />
      </div>

      <button
        onClick={syncNow} disabled={syncing}
        className="btn-primary flex items-center justify-center gap-2"
      >
        {syncing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCcw size={16} />}
        {syncing ? 'Sinkronisasi...' : 'Sync Sekarang'}
      </button>

      <p className="text-[10px] text-gray-400 px-1">
        Data scan &amp; absensi tersimpan real-time ke database pusat. Backup otomatis harian
        dijalankan oleh sistem ke Google Drive perusahaan.
      </p>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="text-xs font-bold text-gray-800 text-right">{value}</span>
    </div>
  )
}
