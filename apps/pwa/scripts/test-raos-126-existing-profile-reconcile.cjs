const fs = require('fs')
const path = require('path')
const assert = require('assert')

const sql = fs.readFileSync(path.resolve(__dirname, '../../../sql/raos_126_soeta_existing_profile_reconciliation.sql'), 'utf8')

// ---------- Existence / naming ----------
assert(sql.includes('raos_126: Reconcile existing active SOETA user_profiles with canonical Staff SSOT master'), 'migration must be raos_126')
assert(!sql.includes('Reconcile 43'), 'must not hardcode 43')
assert(sql.includes('CREATE OR REPLACE FUNCTION public.raos_soeta_reconcile_existing_profiles'), 'must define raos_soeta_reconcile_existing_profiles')
assert(sql.includes('p_apply boolean DEFAULT false'), 'must default to dry-run')

// ---------- Canonical membership from mirror ----------
assert(sql.includes('public.raos_soeta_staff_sheet_mirror'), 'must use mirror as canonical source')
assert(sql.includes('JOIN public.raos_soeta_staff_sheet_mirror sm ON sm.staff_id = m.staff_id'), 'must join master to mirror by staff_id')
assert(!sql.includes("upper(COALESCE(m.airport,'')) = 'SOETA'"), 'must NOT scope by airport text')
assert(!sql.includes("upper(COALESCE(airport,'')) = 'SOETA'"), 'must NOT scope any canonical count by airport text')

// ---------- Safety / no mutation of unrelated tables ----------
assert(!sql.includes('INSERT INTO public.user_profiles'), 'must NOT create user_profiles')
assert(!sql.includes('INSERT INTO auth.users'), 'must NOT create auth users')
assert(!sql.includes('INSERT INTO public.employees'), 'must NOT create employees')
assert(!sql.includes('DELETE FROM public.user_profiles'), 'must NOT delete user_profiles')
assert(!sql.includes('DELETE FROM public.employees'), 'must NOT delete employees')
assert(!sql.includes('DELETE FROM public.raos_staff_master'), 'must NOT delete raos_staff_master')
assert(!sql.includes('UPDATE public.user_profiles'), 'must NOT update user_profiles')

// ---------- Mutation scope ----------
assert(sql.includes('UPDATE public.raos_staff_master'), 'must update raos_staff_master')
assert(sql.includes('SET auth_user_id = r.profile_id'), 'must only link auth_user_id')
assert(sql.includes('is_activated = true'), 'must set is_activated on safe link')
assert(sql.includes('activated_at = now()'), 'must set activated_at on safe link')
assert(!sql.includes('UPDATE public.raos_staff_master SET full_name'), 'must NOT overwrite full_name')
assert(!sql.includes('UPDATE public.raos_staff_master SET email'), 'must NOT overwrite email')
assert(!sql.includes('UPDATE public.raos_staff_master SET phone'), 'must NOT overwrite phone')
assert(!sql.includes('UPDATE public.raos_staff_master SET role'), 'must NOT overwrite role')
assert(!sql.includes('UPDATE public.raos_staff_master SET branch_id'), 'must NOT overwrite branch_id')
assert(!sql.includes('UPDATE public.raos_staff_master SET terminal'), 'must NOT overwrite terminal')

// ---------- Counts / dry-run contract ----------
assert(sql.includes('canonicalMasterCount'), 'must return canonicalMasterCount')
assert(sql.includes('missingMasterCount'), 'must return missingMasterCount')
assert(sql.includes('duplicateMasterCount'), 'must return duplicateMasterCount')
assert(sql.includes('matchingExistingProfileCount'), 'must return matchingExistingProfileCount')
assert(sql.includes('alreadyLinkedCount'), 'must return alreadyLinkedCount')
assert(sql.includes('linkableCount'), 'must return linkableCount')
assert(sql.includes('missingProfileCount'), 'must return missingProfileCount')
assert(sql.includes('duplicateProfileCount'), 'must return duplicateProfileCount')
assert(sql.includes('inactiveProfileCount'), 'must return inactiveProfileCount')
assert(sql.includes('roleMismatchCount'), 'must return roleMismatchCount')
assert(sql.includes('branchMismatchCount'), 'must return branchMismatchCount')
assert(sql.includes('authUserLinkedToOtherCount'), 'must return authUserLinkedToOtherCount')
assert(sql.includes('affectedStaffIds'), 'must return affectedStaffIds')
assert(sql.includes('skippedStaffIds'), 'must return skippedStaffIds')

// ---------- Gating / fail-closed ----------
assert(sql.includes('RAISE EXCEPTION'), 'must raise on forbidden or blockers')
assert(sql.includes('forbidden: admin/direksi or service_role required'), 'must require admin/direksi/service_role')
assert(sql.includes('reconciliation_blocked'), 'must raise reconciliation_blocked on structural blockers')
assert(sql.includes('missing_master=%'), 'must report missing_master in blocker')
assert(sql.includes('duplicate_master=%'), 'must report duplicate_master in blocker')
assert(sql.includes('duplicate_profile=%'), 'must report duplicate_profile in blocker')
assert(sql.includes('role_mismatch=%'), 'must report role_mismatch in blocker')
assert(sql.includes('branch_mismatch=%'), 'must report branch_mismatch in blocker')
assert(sql.includes('auth_linked_to_other=%'), 'must report auth_linked_to_other in blocker')
assert(sql.includes("up.is_active = true\n    AND up.role IS DISTINCT FROM m.role"), 'must check role match for active canonical profiles')
assert(sql.includes("b.code = 'SOETA'"), 'must restrict to SOETA branch scope')
assert(sql.includes("hub.code = 'SOETA'"), 'must allow T1/T2/T3 under SOETA hub')
assert(sql.includes('m2.auth_user_id = up.id'), 'must guard auth user already linked to another master')
assert(sql.includes('m2.staff_id <> sm.staff_id'), 'must compare against other master staff_id')

// ---------- Idempotency ----------
assert(sql.includes('WHERE staff_id = r.staff_id'), 'must target by exact staff_id')
assert(sql.includes('AND auth_user_id IS NULL'), 'must only update unlinked rows')

// ---------- Legacy reconciliation not reused ----------
assert(!sql.includes('SELECT * FROM public.raos_soeta_reconcile_hris_preactivation'), 'must NOT call HRIS preactivation')
assert(!sql.includes('SELECT public.raos_staff_master_link_auth'), 'must NOT call manual activation helper')

// ---------- S001 / S0012 / STAFF002 excluded ----------
assert(!sql.includes("WHERE sm.staff_id = 'S001'"), 'must not explicitly include S001')
assert(!sql.includes("WHERE sm.staff_id = 'S0012'"), 'must not explicitly include S0012')
assert(!sql.includes("WHERE sm.staff_id = 'STAFF002'"), 'must not explicitly include STAFF002')

console.log('✅ raos_126 SOETA existing profile reconciliation contract passed')
