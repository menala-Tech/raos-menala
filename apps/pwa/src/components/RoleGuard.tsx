'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'
import { supabase } from '@/lib/supabase'
import { canRoleAccessRoute, defaultLandingForRole } from '@/lib/roleGuard'

const PUBLIC = new Set(['/','/reset-password','/offline'])

const INSTALL_ALLOWED: Record<string, string[]> = {
  'com.rifim.raos.staff': ['staff'],
  'com.rifim.raos.driver': ['driver'],
  'com.rifim.raos.koordinator': ['koordinator'],
  'com.rifim.raos.management': ['management'],
  'com.rifim.raos.admin': ['admin'],
  'com.rifim.raos.direksi': ['direksi', 'direktur'],
}

function labelForPackage(id: string): string {
  const suffix = id.replace('com.rifim.raos.', '')
  const map: Record<string, string> = {
    staff: 'Staff', driver: 'Driver', koordinator: 'Koordinator',
    management: 'Management', admin: 'Admin', direksi: 'Direksi',
  }
  return map[suffix] || suffix
}

export default function RoleGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [checking, setChecking] = useState(true)
  const [allowed, setAllowed] = useState(false)
  const [installLock, setInstallLock] = useState<{ expected: string } | null>(null)

  useEffect(() => {(async () => {
    setChecking(true); setAllowed(false); setInstallLock(null)
    if (PUBLIC.has(pathname)) { setAllowed(true); setChecking(false); return }

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.replace('/'); return }
    const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', session.user.id).single()
    const role = String(profile?.role ?? '').toLowerCase()
    if (!role) { router.replace('/'); return }

    // Native install variant lock: the APK package must match the authenticated role.
    if (Capacitor.isNativePlatform()) {
      try {
        const info = await App.getInfo()
        const allowedForInstall = INSTALL_ALLOWED[info.id]
        if (allowedForInstall && !allowedForInstall.includes(role)) {
          setInstallLock({ expected: labelForPackage(info.id) })
          setChecking(false)
          return
        }
      } catch {
        // If App.getInfo() fails, fall through to normal role routing.
      }
    }

    if (role === 'koordinator' && pathname === '/riwayat') {
      router.replace('/riwayat-cabang')
      return
    }

    if (!canRoleAccessRoute(role, pathname)) { router.replace(defaultLandingForRole(role)); return }
    setAllowed(true); setChecking(false)
  })()}, [pathname, router])

  if (checking) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><p className="text-xs text-gray-400">Memeriksa akses...</p></div>
  if (installLock) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-6 text-center">
      <p className="text-lg font-black text-gray-800 mb-2">Aplikasi ini khusus untuk role {installLock.expected}.</p>
      <p className="text-sm text-gray-600">Silakan gunakan aplikasi sesuai jabatan Anda.</p>
    </div>
  )
  if (!allowed) return null
  return <>{children}</>
}
