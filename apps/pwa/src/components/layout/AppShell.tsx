'use client'

import BottomNav from './BottomNav'
import SwipeBackWrapper from '../SwipeBackWrapper'
import OnlineStatusBanner from '../OnlineStatusBanner'

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <OnlineStatusBanner />
      <SwipeBackWrapper>
        <main className="flex-1 pb-20">
          {children}
        </main>
      </SwipeBackWrapper>
      <BottomNav />
    </div>
  )
}
