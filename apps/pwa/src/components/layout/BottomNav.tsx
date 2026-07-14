'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, ScanLine, Clock, MessageCircle, Settings } from 'lucide-react'
import clsx from 'clsx'

const NAV = [
  { href: '/dashboard',  icon: Home,          label: 'Beranda' },
  { href: '/scan',       icon: ScanLine,      label: 'Scan' },
  { href: '/riwayat',    icon: Clock,         label: 'Riwayat' },
  { href: '/chat',       icon: MessageCircle, label: 'Chat' },
  { href: '/settings',   icon: Settings,      label: 'Setting' },
]

export default function BottomNav() {
  const path = usePathname()
  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md
                    bg-white border-t border-gray-100 shadow-lg z-50
                    pb-safe">
      <div className="flex">
        {NAV.map(({ href, icon: Icon, label }) => {
          const active = path.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                'flex-1 flex flex-col items-center py-2 gap-0.5 text-[10px] font-medium transition-colors',
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
