'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, ScanLine, Clock, MessageCircle, User } from 'lucide-react'
import clsx from 'clsx'
import { supabase } from '@/lib/supabase'
import { can, normalizeRole, type RaosRole } from '@/lib/accessPolicy'
import { defaultLandingForRole } from '@/lib/roleGuard'

type NavItem = { href: string; icon: typeof Home; label: string }

export default function BottomNav() {
  const path = usePathname()
  const [role, setRole] = useState<RaosRole | null>(null)

  useEffect(() => {
    let alive = true
    async function loadRole() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session || !alive) return
      const { data } = await supabase.from('user_profiles').select('role').eq('id', session.user.id).single()
      if (alive) setRole(normalizeRole(data?.role))
    }
    void loadRole()
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => void loadRole())
    return () => { alive = false; subscription.unsubscribe() }
  }, [])

  const items = useMemo(() => {
    if (!role) return [] as NavItem[]
    const nav: NavItem[] = [
      { href: defaultLandingForRole(role), icon: Home, label: 'Beranda' },
    ]
    if (can(role, 'history:branch:read')) nav.push({ href: '/riwayat-cabang', icon: Clock, label: 'Riwayat' })
    else if (can(role, 'history:self') && role !== 'driver') nav.push({ href: '/riwayat', icon: Clock, label: 'Riwayat' })
    if (can(role, 'scan:create')) nav.push({ href: '/scan', icon: ScanLine, label: 'Scan' })
    nav.push({ href: '/chat', icon: MessageCircle, label: 'Chat' })
    nav.push({ href: '/settings', icon: User, label: 'Profil' })
    return nav
  }, [role])

  if (!role || items.length === 0) return null

  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md
                    bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800
                    shadow-xl z-50 pb-safe">
      <div className="flex items-end h-16 relative">
        {items.map(({ href, icon: Icon, label }) => {
          const active = href === '/riwayat-cabang'
            ? path.startsWith('/riwayat-cabang')
            : href === '/riwayat'
              ? path === '/riwayat' || path.startsWith('/riwayat/')
              : path === href || path.startsWith(href + '/')
          const isScan = href === '/scan'
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                'flex-1 flex flex-col items-center justify-center gap-0.5 h-full min-w-0',
                'text-[10px] font-medium transition-colors active:scale-95',
                active ? 'text-primary' : 'text-gray-400',
                isScan && 'font-bold'
              )}
            >
              <span className={clsx(
                'flex items-center justify-center',
                isScan && 'w-10 h-10 -mt-4 rounded-full bg-secondary shadow-lg ring-4 ring-white dark:ring-gray-900'
              )}>
                <Icon size={isScan ? 24 : 22} className={isScan ? 'text-white' : undefined} strokeWidth={active ? 2.5 : 1.8} />
              </span>
              <span className={clsx(isScan && '-mt-0.5')}>{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}