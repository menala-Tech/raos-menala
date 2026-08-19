'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import AppShell from '@/components/layout/AppShell'

/**
 * Fix A (2026-08-19): /status used to be a standalone aggregate-only Scan
 * dashboard (Valid/Pending/Rejected donut + today/7d/30d range) with no
 * date filter, no search, no detail drill-down, and no other record types.
 * /riwayat is the richer canonical operational history UI (Semua/Scan/
 * Absensi/Isi Saldo/Antrian tabs, date range + status filters, search,
 * per-row detail, summary) and fully supersedes it -- the Dashboard
 * shortcut to /status was removed (see app/dashboard/page.tsx).
 *
 * Kept as a redirect, not deleted, for backward compatibility: any
 * bookmark, deep link, or notification URL still pointing at /status
 * lands on /riwayat in the Scan tab instead of a 404 or a stale page.
 */
export default function StatusPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/riwayat?tab=scan')
  }, [router])

  return (
    <AppShell>
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-xs text-gray-400">Mengalihkan ke Riwayat...</p>
      </div>
    </AppShell>
  )
}
