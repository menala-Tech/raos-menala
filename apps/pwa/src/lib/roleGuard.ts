/**
 * Role-based routing helpers (Opsi C — extend PWA + role gating).
 * Pattern: 1 codebase, 5 install variant via ?role=<x> URL. Setiap role
 * punya landing berbeda + subset route yang boleh diakses.
 *
 * Icon per install: manifest.ts dynamic serve icon variant based on
 * query param.
 */

export type Role = 'staff' | 'koordinator' | 'admin' | 'management' | 'direksi' | 'driver_manager' | 'driver'
export type InstallVariant = 'staff' | 'koord' | 'mgmt' | 'direksi' | 'driver' | 'dm'

const ROLE_HOME: Record<string, string> = {
  staff:          '/dashboard',
  koordinator:    '/dashboard',
  admin:          '/dashboard',
  management:     '/dashboard',
  direksi:        '/dashboard',
  driver_manager: '/dashboard',
  driver:         '/driver-workspace',
}

// Route mana yang boleh diakses per role. Kalau route tidak match, redirect
// ke landing role-nya. RLS Supabase tetap enforce data-level, ini cuma UX
// nav guard.
const ROLE_ROUTES: Record<string, string[]> = {
  staff: [
    '/dashboard', '/scan', '/absensi', '/riwayat', '/chat',
    '/settings', '/settings/bantuan', '/status', '/notifications',
    '/antrian-driver', // staff bisa lihat monitor antrian (dan panggil)
    '/reset-password',
  ],
  koordinator: [
    '/dashboard', '/scan', '/absensi', '/riwayat', '/chat',
    '/settings', '/settings/bantuan', '/status', '/notifications',
    '/antrian-driver', '/validasi-saldo', '/kpi', '/laporan',
    '/drivers', '/reset-password',
  ],
  // driver_manager: fokus driver + antrean, tidak akses saldo/absensi/KPI
  driver_manager: [
    '/dashboard', '/chat', '/settings', '/settings/bantuan',
    '/notifications', '/reset-password',
    '/antrian-driver', '/drivers', '/admin/barcodes',
  ],
  // driver: read-only workspace untuk melihat antrean sendiri, riwayat saldo,
  // chat room driver cabang. Tidak akses staff/admin apapun.
  driver: [
    '/driver-workspace', '/chat', '/settings', '/settings/bantuan',
    '/notifications', '/reset-password',
  ],
  // admin, management, direksi punya akses semua route
  admin:      ['*'],
  management: ['*'],
  direksi:    ['*'],
}

const PUBLIC_ROUTES = ['/', '/reset-password']

/** Landing default per role setelah login. */
export function defaultLandingForRole(role: string | null | undefined): string {
  if (!role) return '/dashboard'
  return ROLE_HOME[role] ?? '/dashboard'
}

/** Cek apakah role boleh akses route tertentu. */
export function canRoleAccessRoute(role: string | null | undefined, pathname: string): boolean {
  if (PUBLIC_ROUTES.includes(pathname)) return true
  if (!role) return false
  const allowed = ROLE_ROUTES[role]
  if (!allowed) return false
  if (allowed.includes('*')) return true
  return allowed.some(r => pathname === r || pathname.startsWith(r + '/'))
}

/** Baca install variant dari query param `?role=` — dipakai manifest.ts. */
export function parseInstallVariant(searchParams: URLSearchParams | null): InstallVariant {
  const raw = String(searchParams?.get('role') ?? '').toLowerCase()
  if (raw === 'koord' || raw === 'koordinator')            return 'koord'
  if (raw === 'mgmt' || raw === 'management')              return 'mgmt'
  if (raw === 'direksi')                                   return 'direksi'
  if (raw === 'driver')                                    return 'driver'
  if (raw === 'dm' || raw === 'driver_manager')            return 'dm'
  return 'staff' // default
}

/** Human-readable label per install variant (untuk manifest name + icon overlay). */
export const VARIANT_LABEL: Record<InstallVariant, string> = {
  staff:   'Staff',
  koord:   'Koord',
  mgmt:    'Mgmt',
  direksi: 'Direksi',
  driver:  'Driver',
  dm:      'Driver Mgr',
}

/** App name per variant untuk manifest. */
export function manifestNameForVariant(v: InstallVariant): { name: string; short: string } {
  const label = VARIANT_LABEL[v]
  return {
    name:  `MENALA RAOS — ${label}`,
    short: `RAOS ${label}`,
  }
}
