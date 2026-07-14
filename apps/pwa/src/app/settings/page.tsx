'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import AppShell from '@/components/layout/AppShell'
import {
  User, Smartphone, MapPin, Bell, Shield,
  Database, Info, HelpCircle, LogOut, ChevronRight
} from 'lucide-react'
import type { UserProfile } from '@/types'

type Section = null | 'akun' | 'aplikasi' | 'lokasi' | 'notifikasi' | 'keamanan' | 'data'

export default function SettingsPage() {
  const router = useRouter()
  const [user, setUser] = useState<UserProfile | null>(null)
  const [section, setSection] = useState<Section>(null)

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
  }, [router])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/')
  }

  const MENUS = [
    { key: 'akun',       icon: User,       label: 'Pengaturan Akun',        desc: 'Profil, email, password' },
    { key: 'aplikasi',   icon: Smartphone, label: 'Pengaturan Aplikasi',    desc: 'Tema, bahasa, suara' },
    { key: 'lokasi',     icon: MapPin,     label: 'Lokasi & Pickup Point',  desc: 'Terminal & pickup point' },
    { key: 'notifikasi', icon: Bell,       label: 'Notifikasi',             desc: 'Atur jenis notifikasi' },
    { key: 'keamanan',   icon: Shield,     label: 'Keamanan',               desc: 'PIN, fingerprint, sesi' },
    { key: 'data',       icon: Database,   label: 'Data & Sync',            desc: 'Backup, cache, sinkronisasi' },
  ] as const

  return (
    <AppShell>
      <div className="bg-secondary text-white px-4 pt-10 pb-4">
        <h1 className="font-bold text-base">Pengaturan</h1>
      </div>

      {/* Profile Card */}
      {user && (
        <div className="card mx-4 mt-4 flex items-center gap-3">
          <div className="w-12 h-12 bg-primary rounded-full flex items-center justify-center text-white font-bold text-lg">
            {user.full_name?.charAt(0)}
          </div>
          <div>
            <p className="font-bold text-gray-800">{user.full_name}</p>
            <p className="text-xs text-gray-500 capitalize">
              {user.role} • {(user as any)?.branches?.name ?? ''}
            </p>
            <p className="text-xs text-gray-400">Online</p>
          </div>
        </div>
      )}

      {/* Quick Toggles */}
      <div className="mx-4 mt-4 card">
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Mode Gelap', value: false },
            { label: 'Hemat Data', value: true },
            { label: 'Auto Sync', value: true },
            { label: 'Jangan Ganggu', value: false },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between py-1">
              <span className="text-xs text-gray-600">{label}</span>
              <div className={`w-10 h-5 rounded-full relative transition-colors ${value ? 'bg-primary' : 'bg-gray-200'}`}>
                <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-all ${value ? 'right-0.5' : 'left-0.5'}`} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Menu List */}
      <div className="px-4 py-3 space-y-1">
        {MENUS.map(({ key, icon: Icon, label, desc }) => (
          <button
            key={key}
            onClick={() => setSection(key as Section)}
            className="card w-full flex items-center gap-3 text-left"
          >
            <div className="bg-gray-50 p-2 rounded-xl">
              <Icon size={18} className="text-gray-600" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-800">{label}</p>
              <p className="text-xs text-gray-400">{desc}</p>
            </div>
            <ChevronRight size={16} className="text-gray-300" />
          </button>
        ))}

        <div className="card">
          <div className="space-y-3 text-sm">
            <button className="flex items-center gap-3 w-full text-gray-600">
              <Info size={18} /> <span>Tentang Aplikasi</span>
            </button>
            <button className="flex items-center gap-3 w-full text-gray-600">
              <HelpCircle size={18} /> <span>Bantuan & Panduan</span>
            </button>
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="card w-full flex items-center gap-3 text-red-600"
        >
          <LogOut size={18} />
          <span className="font-medium">Keluar dari Akun</span>
        </button>

        <p className="text-center text-xs text-gray-400 py-2">
          RAOS v1.0.0 (Build 25) • © 2024 MENALA
        </p>
      </div>
    </AppShell>
  )
}
