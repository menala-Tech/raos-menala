'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import AppShell from '@/components/layout/AppShell'
import SwipeBackWrapper from '@/components/SwipeBackWrapper'
import MenalaLogo from '@/components/MenalaLogo'
import {
  User, Smartphone, MapPin, Bell, Shield,
  Database, Info, HelpCircle, LogOut, ChevronRight, ChevronLeft,
  MessageCircle, Moon, Wifi, VolumeX, Lock, Eye, EyeOff,
  Trash2, RefreshCcw, CheckCircle2, Loader2
} from 'lucide-react'
import Link from 'next/link'
import clsx from 'clsx'
import type { UserProfile, Branch, PickupPoint } from '@/types'

type Section = null | 'akun' | 'aplikasi' | 'lokasi' | 'notifikasi' | 'keamanan' | 'data'

const ROLE_COLORS: Record<string, string> = {
  staff:       'bg-green-100 text-green-700',
  koordinator: 'bg-blue-100 text-blue-700',
  admin:       'bg-orange-100 text-orange-700',
  direksi:     'bg-purple-100 text-purple-700',
}

/* ===== Preferensi lokal (spec setting.md — persist di perangkat) ===== */
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
  reminderMasuk: string
  reminderPulang: string
  pickupPointId: string | null
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
  reminderMasuk: '07:00',
  reminderPulang: '15:00',
  pickupPointId: null,
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
    setPrefs(loadPrefs())
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/'); return }
      const { data } = await supabase
        .from('user_profiles').select('*, branches(*)').eq('id', session.user.id).single()
      setUser(data ? { ...data, email: session.user.email } as any : data)
    }
    init()
  }, [router])

  const savePrefs = useCallback((next: AppPrefs) => {
    setPrefs(next)
    localStorage.setItem('raos_prefs', JSON.stringify(next))
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }, [])

  async function handleLogout() {
    setLoggingOut(true)
    await supabase.auth.signOut()
    router.push('/')
  }

  /* ============ SUB-VIEW WRAPPER ============ */
  if (section) {
    const TITLES: Record<string, string> = {
      akun: 'Pengaturan Akun', aplikasi: 'Pengaturan Aplikasi',
      lokasi: 'Lokasi & Pickup Point', notifikasi: 'Notifikasi',
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
            {section === 'lokasi'     && <SectionLokasi user={user} prefs={prefs} save={savePrefs} />}
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
    { key: 'lokasi',     icon: MapPin,     label: 'Lokasi & Pickup Point', desc: 'Terminal, pickup point aktif' },
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
            { icon: Info,          label: 'Tentang Aplikasi',   href: null },
            { icon: HelpCircle,    label: 'Panduan Penggunaan', href: null },
            { icon: MessageCircle, label: 'Hubungi Admin',      href: '/chat?room=umum' },
          ].map(({ icon: Icon, label, href }) => (
            href ? (
              <Link key={label} href={href} className="flex items-center gap-3 py-2.5 border-b border-gray-100 last:border-0">
                <Icon size={17} className="text-gray-500" />
                <span className="text-sm text-gray-700 font-medium flex-1">{label}</span>
                <ChevronRight size={14} className="text-gray-300" />
              </Link>
            ) : (
              <button key={label} className="flex items-center gap-3 py-2.5 border-b border-gray-100 last:border-0 w-full text-left">
                <Icon size={17} className="text-gray-500" />
                <span className="text-sm text-gray-700 font-medium flex-1">{label}</span>
                <ChevronRight size={14} className="text-gray-300" />
              </button>
            )
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
  const [phone, setPhone] = useState(user?.phone ?? '')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  async function saveProfile() {
    if (!user) return
    setSaving(true)
    const { error } = await supabase
      .from('user_profiles').update({ phone }).eq('id', user.id)
    setMsg(error ? 'Gagal menyimpan.' : 'Profil tersimpan ✓')
    setSaving(false)
    setTimeout(() => setMsg(''), 2000)
  }

  return (
    <div className="space-y-3">
      <div className="card space-y-3">
        <Field label="Nama Lengkap" value={user?.full_name ?? '—'} readOnly />
        <Field label="Email" value={(user as any)?.email ?? '—'} readOnly />
        <Field label="ID Staff" value={user?.staff_id ?? '—'} readOnly />
        <div>
          <p className="text-xs text-gray-500 font-medium mb-1">No. WhatsApp</p>
          <input
            type="tel" value={phone} onChange={e => setPhone(e.target.value)}
            placeholder="08xx-xxxx-xxxx" className="input"
          />
        </div>
        {msg && <p className="text-xs text-green-600 font-semibold text-center">{msg}</p>}
        <button className="btn-primary" onClick={saveProfile} disabled={saving}>
          {saving ? 'Menyimpan...' : 'Simpan Perubahan'}
        </button>
      </div>

      <p className="text-[10px] text-gray-400 px-1">
        Untuk mengubah nama atau email, hubungi Admin melalui Chat Room.
      </p>

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

/* ================= SECTION: LOKASI & PICKUP POINT ================= */
function SectionLokasi({ user, prefs, save }: {
  user: UserProfile | null; prefs: AppPrefs; save: (p: AppPrefs) => void
}) {
  const [branches, setBranches] = useState<Branch[]>([])
  const [points, setPoints] = useState<PickupPoint[]>([])
  const [activeBranch, setActiveBranch] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const [{ data: br }, { data: pp }] = await Promise.all([
        supabase.from('branches').select('*').eq('is_active', true).order('code'),
        supabase.from('pickup_points').select('*').eq('is_active', true).order('code'),
      ])
      setBranches(br ?? [])
      setPoints(pp ?? [])
      // Default: branch user, atau branch pertama
      setActiveBranch(user?.branch_id ?? br?.[0]?.id ?? null)
    }
    load()
  }, [user])

  const branchPoints = points.filter(p => p.branch_id === activeBranch)

  return (
    <div className="space-y-3">
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm font-bold text-gray-800">Bandara Soekarno-Hatta</p>
            <p className="text-xs text-gray-400">Lokasi aktif operasional</p>
          </div>
          <span className="bg-green-100 text-green-700 text-[10px] font-bold px-2 py-1 rounded-full">Aktif</span>
        </div>

        {/* Terminal tabs */}
        <p className="text-xs text-gray-500 font-medium mb-2">Terminal</p>
        <div className="flex gap-2 mb-4">
          {branches.map(b => (
            <button
              key={b.id}
              onClick={() => setActiveBranch(b.id)}
              className={clsx(
                'flex-1 py-2 rounded-xl text-sm font-bold transition-colors',
                activeBranch === b.id ? 'bg-primary text-secondary' : 'bg-gray-100 text-gray-500'
              )}
            >
              {b.code}
            </button>
          ))}
        </div>

        {/* Pickup points radio */}
        <p className="text-xs text-gray-500 font-medium mb-2">
          Pickup Point — {branches.find(b => b.id === activeBranch)?.name ?? ''}
        </p>
        <div className="space-y-2">
          {branchPoints.length === 0 && (
            <p className="text-xs text-gray-400 py-3 text-center">Tidak ada pickup point aktif di terminal ini</p>
          )}
          {branchPoints.map(p => {
            const selected = prefs.pickupPointId === p.id
            return (
              <button
                key={p.id}
                onClick={async () => {
                  save({ ...prefs, pickupPointId: p.id })
                  // Sinkronkan branch_id user_profiles ke branch pickup point
                  // supaya header dashboard + scan + absensi otomatis tampil
                  // Terminal yang benar (tidak stuck di T1 lama).
                  // Policy user_profiles_update_own memungkinkan user update
                  // baris sendiri, trigger prevent_self_privilege_escalation
                  // tidak blokir branch_id (hanya role/is_active).
                  if (user && user.branch_id !== p.branch_id) {
                    await supabase.from('user_profiles')
                      .update({ branch_id: p.branch_id })
                      .eq('id', user.id)
                    // Reload halaman supaya user prop di parent refresh
                    // (tidak elegan, tapi paling reliable — parent tidak
                    // subscribe realtime user_profiles).
                    window.location.reload()
                  }
                }}
                className={clsx(
                  'w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-colors text-left',
                  selected ? 'border-primary bg-primary/5' : 'border-gray-100 bg-white'
                )}
              >
                <div className={clsx(
                  'w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0',
                  selected ? 'border-primary' : 'border-gray-300'
                )}>
                  {selected && <div className="w-2 h-2 rounded-full bg-primary" />}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-800">{p.name}</p>
                  <p className="text-[10px] text-gray-400">Radius validasi: {p.radius_meters}m</p>
                </div>
                <span className="bg-green-100 text-green-700 text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                  Aktif
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <p className="text-[10px] text-gray-400 px-1">
        Pickup point pilihan dipakai sebagai preferensi tampilan. Validasi absensi &amp; scan tetap
        otomatis mendeteksi pickup point terdekat via GPS geo-fence.
      </p>
    </div>
  )
}

/* ================= SECTION: NOTIFIKASI ================= */
function SectionNotifikasi({ prefs, save }: { prefs: AppPrefs; save: (p: AppPrefs) => void }) {
  return (
    <div className="space-y-3">
      <div className="card">
        <div className="flex items-center justify-between pb-3 border-b border-gray-100">
          <div>
            <p className="text-sm font-bold text-gray-800">Aktifkan Notifikasi</p>
            <p className="text-xs text-gray-400">Toggle master semua notifikasi</p>
          </div>
          <button
            onClick={() => save({ ...prefs, notifMaster: !prefs.notifMaster })}
            className={`w-11 h-6 rounded-full relative transition-colors ${prefs.notifMaster ? 'bg-primary' : 'bg-gray-200'}`}
          >
            <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 shadow transition-all ${prefs.notifMaster ? 'right-0.5' : 'left-0.5'}`} />
          </button>
        </div>

        <p className="text-xs font-bold text-gray-500 uppercase tracking-widest py-3">Jenis Notifikasi</p>
        <div className={clsx('space-y-3', !prefs.notifMaster && 'opacity-40 pointer-events-none')}>
          {Object.entries(prefs.notifJenis).map(([jenis, on]) => (
            <ToggleRow key={jenis} icon={Bell} label={jenis} value={on}
              onChange={v => save({ ...prefs, notifJenis: { ...prefs.notifJenis, [jenis]: v } })} />
          ))}
        </div>
      </div>

      <div className="card">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Waktu Pengingat</p>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600 font-medium">Absen Masuk</span>
            <input
              type="time" value={prefs.reminderMasuk}
              onChange={e => save({ ...prefs, reminderMasuk: e.target.value })}
              className="border border-gray-200 rounded-lg px-2 py-1 text-sm font-bold text-gray-700"
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600 font-medium">Absen Pulang</span>
            <input
              type="time" value={prefs.reminderPulang}
              onChange={e => save({ ...prefs, reminderPulang: e.target.value })}
              className="border border-gray-200 rounded-lg px-2 py-1 text-sm font-bold text-gray-700"
            />
          </div>
        </div>
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
