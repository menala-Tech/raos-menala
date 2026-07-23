'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, ScanLine, Clock, MessageCircle, User } from 'lucide-react'
import clsx from 'clsx'

const NAV_LEFT = [
  { href: '/dashboard', icon: Home,          label: 'Beranda' },
  { href: '/riwayat',   icon: Clock,         label: 'Riwayat' },
]
const NAV_RIGHT = [
  { href: '/chat',      icon: MessageCircle, label: 'Chat' },
  { href: '/settings',  icon: User,          label: 'Profil' },
]

export default function BottomNav() {
  const path = usePathname()
  const scanActive = path.startsWith('/scan')

  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md
                    bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800
                    shadow-xl z-50 pb-safe">
      <div className="flex items-end h-16 relative">

        {NAV_LEFT.map(({ href, icon: Icon, label }) => {
          const active = path.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                'flex-1 flex flex-col items-center justify-center gap-0.5 h-full',
                'text-[10px] font-medium transition-colors',
                active ? 'text-primary' : 'text-gray-400'
              )}
            >
              <Icon size={22} strokeWidth={active ? 2.5 : 1.8} />
              {label}
            </Link>
          )
        })}

        {/* Center FAB — Scan (elevated di atas nav bar) */}
        <div className="flex-1 flex flex-col items-center justify-end pb-1 relative">
          <Link
            href="/scan"
            className={clsx(
              'absolute -top-8 w-16 h-16 rounded-full flex items-center justify-center',
              'shadow-[0_6px_24px_rgba(0,0,0,0.35)] transition-transform active:scale-95',
              scanActive
                ? 'bg-primary ring-4 ring-primary/30'
                : 'bg-secondary ring-4 ring-white dark:ring-gray-900'
            )}
          >
            <ScanLine size={30} className="text-white" strokeWidth={2.2} />
          </Link>
          <span className={clsx(
            'text-[10px] font-medium mt-8',
            scanActive ? 'text-primary' : 'text-gray-500'
          )}>
            Scan
          </span>
        </div>

        {NAV_RIGHT.map(({ href, icon: Icon, label }) => {
          const active = path.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                'flex-1 flex flex-col items-center justify-center gap-0.5 h-full',
                'text-[10px] font-medium transition-colors',
                active ? 'text-primary' : 'text-gray-400'
              )}
            >
              <Icon size={22} strokeWidth={active ? 2.5 : 1.8} />
              {label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
