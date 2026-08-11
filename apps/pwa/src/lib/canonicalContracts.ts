/**
 * RAOS canonical cross-stage contract.
 *
 * P2 established the canonical engines. P3 hardens integration around those
 * engines; it MUST NOT fork auth/RBAC/cache/realtime/KPI/timezone/storage.
 */
export const P5_HARDENING_VERSION = 'p5.0-full-integration' as const
export const RAOS_CANONICAL_CONTRACT_VERSION = 'p2.1-unified' as const
export const P3_INTEGRATION_LAYER_VERSION = 'p3.1-reaudit-fix' as const
export const RAOS_INTEGRATION_STAGE_VERSION = 'p3.1-reaudit-fix' as const
export const P4_SECURITY_OPERATIONAL_LAYER_VERSION = 'p4.0-security-operational' as const

export const RAOS_CANONICAL_ENGINES = Object.freeze({
  accessPolicy: '@/lib/accessPolicy',
  routeGuard: '@/lib/roleGuard',
  branchTime: '@/lib/branchTime',
  networkStatus: '@/lib/useNetworkStatus',
  realtimeRefresh: '@/lib/useRealtimeRefresh',
  systemConfig: '@/lib/useSystemConfig',
  canonicalKpi: '@/lib/useCanonicalKpi',
  offlineReadCache: '@/lib/offlineReadCache',
  credentialClient: '@/lib/raosAuth',
  credentialExchange: 'supabase/functions/raos-login-exchange',
  roleManifest: '@/components/PwaRoleManifestSync',
  driveStorage: 'Canonical Drive Storage V4',
} as const)

export const RAOS_CANONICAL_OWNERSHIP = Object.freeze({
  staffIdentity: 'MASTER DATA STAFF -> System/CRM Staff Sync -> auth.users + user_profiles',
  raosCredential: 'MASTER DATA STAFF RAOS ID/PIN -> raos_credentials -> secure RAOS login exchange',
  driverIdentity: 'Database Driver Airport/External -> GAS driver sync -> raos_drivers -> Driver Auth/profile',
  attendance: 'RAOS PWA -> raos_attendance -> HRIS -> payroll',
  saldo: 'Staff submit -> raos_saldo_requests(pending) -> Finance -> Admin/Direksi mark paid -> realtime/history',
  kpi: 'Finance/HRIS -> raos_kpi_targets_branch -> parent/terminal inheritance -> raos_kpi_targets_staff -> realization -> payroll',
  payrollRoster: 'Staff + Koordinator + Admin + Management; Direksi/Driver excluded unless policy changes explicitly',
  systemConfig: 'SISTEM CONFIG Sheet -> System/CRM sync -> Supabase system_config -> RAOS consumer',
  drive: 'company_config -> Canonical Drive Storage V4',
  document: 'Smart Office -> doc_documents/doc_revisions -> approval -> generate -> canonical Drive',
} as const)

export const RAOS_P3_INTEGRATION_SCOPE = Object.freeze([
  'full-route-wiring',
  'role-route-action-data-scope',
  'identity-login-e2e',
  'saldo-finance-e2e',
  'driver-queue-e2e',
  'attendance-hris-payroll-e2e',
  'kpi-target-e2e',
  'realtime-lifecycle',
  'cache-session-isolation',
  'branch-timezone',
  'notifications',
  'system-config',
  'canonical-drive',
  'explicit-errors-no-false-success',
  'loading-mobile-render',
  'full-build-gate',
  'sql-rpc-compatibility',
  'regression-no-gap',
] as const)

export const RAOS_NEXT_STAGE_GATES = Object.freeze([
  'reuse-canonical-access-policy',
  'reuse-canonical-route-guard',
  'reuse-canonical-realtime-hook',
  'reuse-user-scoped-cache',
  'reuse-branch-timezone',
  'reuse-canonical-kpi-contract',
  'reuse-secure-raos-credential-exchange',
  'reuse-canonical-drive-storage-v4',
  'no-saldo-approval-flow',
  'saldo-submit-staff-only-ui-and-rpc',
  'saldo-terminal-parent-room-contract',
  'saldo-rpc-only-finance-lifecycle',
  'saldo-driver-branch-consistency',
  'no-legacy-kpi-primary-owner',
  'management-koordinator-admin-mutation-denied',
  'driver-own-data-only',
  'driver-manager-no-master-driver-crud',
  'chat-message-membership-scoped',
  'raos-credential-sync-independent-of-legacy-pin',
  'cache-host-from-deployment-config',
  'safe-profile-projection-before-broad-profile-policy-removal',
  'user-profile-self-update-whitelist-only',
  'management-koordinator-chat-admin-mutation-denied',
  'chat-moderation-admin-direksi-only',
  'announcement-broadcast-admin-direksi-only',
  'chat-message-membership-read-write',
  'chat-read-receipt-membership-scoped',
  'p3-full-build-before-production',
  'p3-role-page-action-scope-e2e-before-production',
  'p3-no-false-success-on-critical-mutation',
] as const)

/** Tables that P3 operational screens expect to invalidate from Realtime.
 * Chat messages / notifications / attendance / queue already existed in the
 * historical deployment; this complete set is used by the P3 SQL proposal so
 * a fresh or drifted environment cannot silently miss one dependency.
 */


export const RAOS_P4_SCOPE = Object.freeze([
  'safe-profile-policy-cutover',
  'self-profile-update-hardening',
  'management-koordinator-readonly-admin-actions',
  'chat-moderation-admin-direksi-only',
  'announcement-broadcast-admin-direksi-only',
  'chat-message-membership-read-write',
  'chat-read-receipt-membership-integrity',
  'saldo-history-safe-labels',
  'canonical-kpi-page-enforcement',
  'scoped-report-cache-and-timezone',
  'notification-own-mutation',
  'role-manifest-authenticated-source',
  'security-regression-and-p5-handoff',
] as const)
export const RAOS_P3_REQUIRED_REALTIME_TABLES = Object.freeze([
  'branches',
  'user_profiles',
  'system_config',
  'scan_orders',
  'raos_attendance',
  'raos_drivers',
  'raos_driver_queue',
  'raos_saldo_requests',
  'raos_kpi_targets_branch',
  'raos_kpi_targets_staff',
  'chat_rooms',
  'chat_room_members',
  'chat_messages',
  'notifications',
] as const)

export const RAOS_P3_DEFINITION_OF_DONE = Object.freeze([
  'p2.1-contract-preserved',
  'route-action-data-scope-audited',
  'secure-login-wiring-preserved',
  'saldo-direct-finance-flow-only',
  'driver-queue-shared-realtime',
  'driver-and-queue-own-data-rls',
  'chat-message-room-membership-rls',
  'chat-safe-profile-projection',
  'chat-saldo-json-is-immutable-snapshot',
  'staff-family-raos-credential-provisioning',
  'attendance-hris-payroll-contract-preserved',
  'canonical-kpi-errors-are-explicit',
  'canonical-kpi-order-realization-exact-count',
  'realtime-reconnect-hardening',
  'scope-versioned-offline-cache',
  'branch-timezone-safe-operational-displays',
  'notifications-user-scoped',
  'system-config-consumer-only',
  'drive-storage-v4-only',
  'no-false-success-critical-mutations',
  'safe-user-facing-runtime-errors',
  'no-blank-first-render-on-patched-core-pages',
  'full-build-gate-required-on-complete-checkout',
  'sql-rpc-compatibility-audited',
  'regression-and-no-gap-audit',
  'next-stage-handoff-generated',
] as const)

export type RaosCanonicalEngine = keyof typeof RAOS_CANONICAL_ENGINES
export type RaosOwnershipDomain = keyof typeof RAOS_CANONICAL_OWNERSHIP
