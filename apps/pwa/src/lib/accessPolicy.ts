export const ACCESS_POLICY_VERSION = 'p2.1-unified' as const
export const ACCESS_POLICY_HARDENING_VERSION = 'p4.0-security-operational' as const
export type RaosRole =
  | 'staff'
  | 'koordinator'
  | 'admin'
  | 'management'
  | 'direksi'
  | 'direktur'
  | 'driver_manager'
  | 'driver'

export type Capability =
  | 'scan:create'
  | 'attendance:self'
  | 'history:self'
  | 'history:branch:read'
  | 'saldo:branch:read'
  | 'saldo:submit'
  | 'saldo:mutate'
  | 'queue:operate'
  | 'queue:branch:read'
  | 'driver:read'
  | 'driver:mutate'
  | 'staff:read'
  | 'staff:mutate'
  | 'report:read'
  | 'kpi:self'
  | 'kpi:branch:read'
  | 'admin:panel'
  | 'driver:barcode:manage'
  | 'chat:moderate'
  | 'announcement:broadcast'

const CAPS: Record<RaosRole, ReadonlySet<Capability>> = {
  staff: new Set(['scan:create','attendance:self','history:self','saldo:submit','queue:operate','queue:branch:read','driver:read','kpi:self']),
  koordinator: new Set(['history:branch:read','saldo:branch:read','queue:branch:read','driver:read','staff:read','report:read','kpi:self','kpi:branch:read']),
  admin: new Set(['history:branch:read','saldo:branch:read','saldo:mutate','queue:operate','queue:branch:read','driver:read','driver:mutate','staff:read','staff:mutate','report:read','kpi:branch:read','admin:panel','driver:barcode:manage','chat:moderate','announcement:broadcast']),
  management: new Set(['history:branch:read','saldo:branch:read','queue:branch:read','driver:read','staff:read','report:read','kpi:branch:read']),
  direksi: new Set(['history:branch:read','saldo:branch:read','saldo:mutate','queue:operate','queue:branch:read','driver:read','driver:mutate','staff:read','staff:mutate','report:read','kpi:branch:read','admin:panel','driver:barcode:manage','chat:moderate','announcement:broadcast']),
  direktur: new Set(['history:branch:read','saldo:branch:read','saldo:mutate','queue:operate','queue:branch:read','driver:read','driver:mutate','staff:read','staff:mutate','report:read','kpi:branch:read','admin:panel','driver:barcode:manage','chat:moderate','announcement:broadcast']),
  driver_manager: new Set(['queue:operate','queue:branch:read','driver:read','driver:barcode:manage']),
  driver: new Set(['history:self']),
}

export function normalizeRole(role: string | null | undefined): RaosRole | null {
  const v = String(role ?? '').trim().toLowerCase()
  return v in CAPS ? v as RaosRole : null
}
export function can(role: string | null | undefined, capability: Capability): boolean {
  const r = normalizeRole(role)
  return !!r && CAPS[r].has(capability)
}
export function isAdministrativeWriter(role: string | null | undefined): boolean {
  const r = normalizeRole(role)
  return r === 'admin' || r === 'direksi' || r === 'direktur'
}
export function isReadOnlyOperationalRole(role: string | null | undefined): boolean {
  const r = normalizeRole(role)
  return r === 'management' || r === 'koordinator'
}
