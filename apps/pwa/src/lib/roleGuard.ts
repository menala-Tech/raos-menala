/**
 * Role-based routing helpers (Opsi C — extend PWA + role gating).
 * Pattern: 1 codebase, install variant per role. Setiap role punya landing
 * berbeda + subset route yang boleh diakses. RLS Supabase tetap enforce
 * data-level; helper ini adalah UX/navigation guard.
 */

export type Role = 'staff' | 'koordinator' | 'admin' | 'management' | 'direksi' | 'direktur' | 'driver_manager' | 'driver'
export type InstallVariant = 'staff' | 'koord' | 'mgmt' | 'direksi' | 'driver' | 'dm'

const ROLE_HOME: Record<string, string> = {
  staff:          '/dashboard',
  koordinator:    '/dashboard',
  admin:          '/dashboard',
  management:     '/dashboard',
  direksi:        '/dashboard',
  direktur:       '/dashboard',
  driver_manager: '/dashboard',
  driver:         '/driver-workspace',
}

const ROLE_ROUTES: Record<string, string[]> = {
  staff: [
    '/dashboard', '/scan', '/absensi', '/riwayat', '/chat',
    '/settings', '/settings/bantuan', '/status', '/notifications',
    '/antrian-driver', '/documents', '/reset-password',
  ],
  koordinator: [
    '/dashboard', '/scan', '/absensi', '/riwayat', '/chat',
    '/settings', '/settings/bantuan', '/status', '/notifications',
    '/antrian-driver', '/validasi-saldo', '/kpi', '/laporan',
    '/drivers', '/reset-password',
  ],
  driver_manager: [
    '/dashboard', '/chat', '/settings', '/settings/bantuan',
    '/notifications', '/reset-password',
    '/antrian-driver', '/drivers', '/admin/barcodes',
  ],
  driver: [
    '/driver-workspace', '/chat', '/settings', '/settings/bantuan',
    '/notifications', '/reset-password',
  ],
  admin:      ['*'],
  management: ['*'],
  direksi:    ['*'],
  direktur:   ['*'],
}

const PUBLIC_ROUTES = ['/', '/reset-password']

export function defaultLandingForRole(role: string | null | undefined): string {
  if (!role) return '/dashboard'
  return ROLE_HOME[role] ?? '/dashboard'
}

export function canRoleAccessRoute(role: string | null | undefined, pathname: string): boolean {
  if (PUBLIC_ROUTES.includes(pathname)) return true
  if (!role) return false
  const allowed = ROLE_ROUTES[role]
  if (!allowed) return false
  if (allowed.includes('*')) return true
  return allowed.some(r => pathname === r || pathname.startsWith(r + '/'))
}

export function parseInstallVariant(searchParams: URLSearchParams | null): InstallVariant {
  const raw = String(searchParams?.get('role') ?? '').toLowerCase()
  if (raw === 'koord' || raw === 'koordinator')            return 'koord'
  if (raw === 'mgmt' || raw === 'management')              return 'mgmt'
  if (raw === 'direksi' || raw === 'direktur')             return 'direksi'
  if (raw === 'driver')                                    return 'driver'
  if (raw === 'dm' || raw === 'driver_manager')            return 'dm'
  return 'staff'
}

export const VARIANT_LABEL: Record<InstallVariant, string> = {
  staff:   'Staff',
  koord:   'Koord',
  mgmt:    'Mgmt',
  direksi: 'Direksi',
  driver:  'Driver',
  dm:      'Driver Mgr',
}

export function manifestNameForVariant(v: InstallVariant): { name: string; short: string } {
  const label = VARIANT_LABEL[v]
  return {
    name:  `MENALA RAOS — ${label}`,
    short: `RAOS ${label}`,
  }
}
