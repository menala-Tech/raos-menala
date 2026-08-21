'use client'

import BottomNav from './BottomNav'
import SwipeBackWrapper from '../SwipeBackWrapper'
import OnlineStatusBanner from '../OnlineStatusBanner'
import PwaMaintenancePanel from '../PwaMaintenancePanel'
import { useAutoPushSubscribe } from '@/lib/useAutoPushSubscribe'
import { usePwaUpdateManager } from '@/lib/usePwaUpdateManager'
import { useNativeLocationAuthBridge } from '@/lib/nativeLocationBridge'

interface AppShellProps {
  children: React.ReactNode
  /** Skip SwipeBackWrapper default (mis. dipakai kalau parent sudah wrap
   *  dengan SwipeBackWrapper sendiri, seperti /settings sub-view). */
  noSwipe?: boolean
}

export default function AppShell({ children, noSwipe }: AppShellProps) {
  useAutoPushSubscribe()
  usePwaUpdateManager()
  useNativeLocationAuthBridge()

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <OnlineStatusBanner />
      {noSwipe ? (
        <main className="flex-1 pb-20">{children}</main>
      ) : (
        <SwipeBackWrapper>
          <main className="flex-1 pb-20">{children}</main>
        </SwipeBackWrapper>
      )}
      <PwaMaintenancePanel />
      <BottomNav />
    </div>
  )
}
