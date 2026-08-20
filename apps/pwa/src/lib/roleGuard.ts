export const ROUTE_POLICY_VERSION = 'p2.3-koordinator-attendance' as const
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
  // Koordinator = Staff + branch supervisor. Route-level policy must mirror
  // personal operational capabilities from accessPolicy.ts; otherwise the
  // app-wide RoleGuard redirects a valid dashboard tile before page render.
  koordinator: ['/dashboard','/scan','/absensi','/riwayat','/riwayat-cabang','/status','/antrian-driver','/drivers','/kpi','/laporan','/validasi-saldo','/chat','/settings','/notifications'],
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