import { ACCESS_POLICY_VERSION, normalizeRole } from './accessPolicy'
import { ROUTE_POLICY_VERSION, canRoleAccessRoute } from './roleGuard'
import {
  RAOS_CANONICAL_CONTRACT_VERSION,
  RAOS_INTEGRATION_STAGE_VERSION,
  RAOS_P3_REQUIRED_REALTIME_TABLES,
} from './canonicalContracts'

export const P3_RUNTIME_DIAGNOSTIC_VERSION = RAOS_INTEGRATION_STAGE_VERSION

export type CanonicalSessionProbe = {
  userId?: string | null
  role?: string | null
  branchId?: string | null
  pathname?: string | null
}

export type IntegrationProbeResult = {
  ok: boolean
  stage: typeof RAOS_INTEGRATION_STAGE_VERSION
  contract: typeof RAOS_CANONICAL_CONTRACT_VERSION
  issues: string[]
}

/**
 * Pure diagnostic only. Authorization remains owned by accessPolicy/roleGuard
 * and backend RLS/RPC. This helper deliberately does not grant permissions.
 */
export function inspectCanonicalSession(probe: CanonicalSessionProbe): IntegrationProbeResult {
  const issues: string[] = []
  const role = normalizeRole(probe.role)
  if (!probe.userId) issues.push('missing-user-id')
  if (!role) issues.push('unknown-role')
  if (role && probe.pathname && !canRoleAccessRoute(role, probe.pathname)) issues.push('route-denied')
  if (role && !['admin','management','direksi','direktur'].includes(role) && role !== 'driver' && !probe.branchId) {
    issues.push('missing-branch-scope')
  }
  return {
    ok: issues.length === 0,
    stage: RAOS_INTEGRATION_STAGE_VERSION,
    contract: RAOS_CANONICAL_CONTRACT_VERSION,
    issues,
  }
}

export function canonicalVersionProbe() {
  return Object.freeze({
    contract: RAOS_CANONICAL_CONTRACT_VERSION,
    stage: RAOS_INTEGRATION_STAGE_VERSION,
    accessPolicy: ACCESS_POLICY_VERSION,
    routePolicy: ROUTE_POLICY_VERSION,
    realtimeTables: [...RAOS_P3_REQUIRED_REALTIME_TABLES],
  })
}
