'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { canRoleAccessRoute, defaultLandingForRole } from '@/lib/roleGuard'

/**
 * Nav-level role guard (Opsi C). Wrap route/component yang perlu role
 * check. Kalau user role tidak boleh akses pathname sekarang, redirect
 * ke landing default role-nya.
 *
 * BUKAN pengganti RLS Supabase — ini cuma UX guard supaya user tidak
 * lihat halaman yang tidak relevan. RLS tetap enforce data-level.
 */
export default function RoleGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [checking, setChecking] = useState(true)
  const [allowed, setAllowed] = useState(false)

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.replace('/'); return }
      const { data: profile } = await supabase.from('user_profiles')
        .select('role').eq('id', session.user.id).single()
      const role = profile?.role
      if (!role) { router.replace('/'); return }
      if (!canRoleAccessRoute(role, pathname)) {
        router.replace(defaultLandingForRole(role))
        return
      }
      setAllowed(true)
      setChecking(false)
    })()
  }, [pathname, router])

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-xs text-gray-400">Memeriksa akses...</p>
      </div>
    )
  }
  if (!allowed) return null
  return <>{children}</>
}
