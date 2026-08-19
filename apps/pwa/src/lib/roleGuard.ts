export const ROUTE_POLICY_VERSION = 'p2.2-riwayat-cabang' as const
import { normalizeRole, type RaosRole } from './accessPolicy'
export type Role = RaosRole
export type InstallVariant = 'staff'|'koord'|'admin'|'mgmt'|'direksi'|'driver'|'dm'
export const VARIANT_LABEL: Record<InstallVariant,string> = {
  staff:'Staff', koord:'Koord', admin:'Admin', mgmt:'Mgmt', direksi:'Direksi', driver:'Driver', dm:'Driver Mgr'
}
export function manifestNameForVariant(v:InstallVariant){
  const label=VARIANT_LABEL[v]
  return {name:`MENALA RAOS — ${label}`,short:`RAOS ${label}`}
}
export function parseInstallVariant(searchParams:URLSearchParams|null):InstallVariant{
  const raw=String(searchParams?.get('role')??'').toLowerCase()
  if(raw==='koord'||raw==='koordinator')return 'koord'
  if(raw==='admin')return 'admin'
  if(raw==='mgmt'||raw==='management')return 'mgmt'
  if(raw==='direksi'||raw==='direktur')return 'direksi'
  if(raw==='driver')return 'driver'
  if(raw==='dm'||raw==='driver_manager')return 'dm'
  return 'staff'
}

const HOME: Partial<Record<Role,string>> = { driver:'/driver-workspace' }
const PUBLIC = new Set(['/','/reset-password'])

export const ROLE_ROUTES: Readonly<Record<Role, readonly string[]>> = {
  staff: ['/dashboard','/scan','/absensi','/riwayat','/status','/antrian-driver','/drivers','/kpi','/chat','/settings','/notifications'],
  // '/scan' added 2026-08-20 (PR #102 koordinator-parity follow-up): this
  // ROUTE-LEVEL matrix is separate from accessPolicy.ts's capability CAPS
  // (which PR #102 updated) -- RoleGuard (mounted app-wide in
  // app/layout.tsx) gates on THIS list before it ever renders {children},
  // so granting koordinator the `scan:create` capability there was
  // necessary but not sufficient: the dashboard tile correctly appeared,
  // but every visit to /scan (click or direct URL) hit RoleGuard's
  // `!canRoleAccessRoute(role,pathname)` branch and got silently
  // `router.replace(defaultLandingForRole(role))` -> '/dashboard' before
  // ScanPage's children (including BarcodeScanner) ever mounted -- a
  // deterministic, 100%-reproducible client-side redirect, not a crash,
  // matching "no server runtime error" and "/scan never becomes usable"
  // exactly. Confirmed via code read of components/RoleGuard.tsx: it
  // renders a loading state until `allowed===true`, never `{children}`
  // otherwise, so this is the actual root cause independent of any
  // BarcodeScanner lifecycle behavior.
  koordinator: ['/dashboard','/scan','/riwayat','/riwayat-cabang','/status','/antrian-driver','/drivers','/kpi','/laporan','/validasi-saldo','/chat','/settings','/notifications'],
  admin: ['*'],
  management: ['/dashboard','/riwayat','/riwayat-cabang','/status','/antrian-driver','/drivers','/kpi','/laporan','/validasi-saldo','/chat','/settings','/notifications'],
  direksi: ['*'],
  direktur: ['*'],
  driver_manager: ['/dashboard','/antrian-driver','/drivers','/admin/barcodes','/chat','/settings','/notifications'],
  driver: ['/driver-workspace','/chat','/settings','/notifications'],
}

export function defaultLandingForRole(role: string | null | undefined) {
  const r = normalizeRole(role)
  return r ? (HOME[r] ?? '/dashboard') : '/'
}
export function canRoleAccessRoute(role: string | null | undefined, pathname: string) {
  if (PUBLIC.has(pathname)) return true
  const r = normalizeRole(role)
  if (!r) return false
  const a = ROLE_ROUTES[r]
  if (a.includes('*')) return true
  return a.some(x => pathname === x || pathname.startsWith(x + '/'))
}
