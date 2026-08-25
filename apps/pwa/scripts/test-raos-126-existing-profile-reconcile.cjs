const fs = require('fs')
const path = require('path')
const assert = require('assert')

const sql = fs.readFileSync(path.resolve(__dirname, '../../../sql/raos_126_soeta_existing_profile_reconciliation.sql'), 'utf8')

// ---------- Existence / naming ----------
assert(sql.includes('raos_126: Reconcile 43 existing active user_profiles with SOETA SSOT master'), 'migration must be raos_126')
assert(sql.includes('CREATE OR REPLACE FUNCTION public.raos_soeta_reconcile_existing_profiles'), 'must define raos_soeta_reconcile_existing_profiles')
assert(sql.includes('p_apply boolean DEFAULT false'), 'must default to dry-run')

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
assert(!sql.includes('UPDATE public.raos_staff_master SET full_name'), 'must NOT overwrite full_name')
assert(!sql.includes('UPDATE public.raos_staff_master SET email'), 'must NOT overwrite email')
assert(!sql.includes('UPDATE public.raos_staff_master SET phone'), 'must NOT overwrite phone')
assert(!sql.includes('UPDATE public.raos_staff_master SET role'), 'must NOT overwrite role')
assert(!sql.includes('UPDATE public.raos_staff_master SET branch_id'), 'must NOT overwrite branch_id')
assert(!sql.includes('UPDATE public.raos_staff_master SET terminal'), 'must NOT overwrite terminal')

// ---------- Counts / dry-run contract ----------
assert(sql.includes('canonicalMasterCount'), 'must return canonicalMasterCount')
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
assert(sql.includes('RAISE EXCEPTION'), 'must raise on forbidden or duplicate')
assert(sql.includes('forbidden: admin/direksi or service_role required'), 'must require admin/direksi/service_role')
assert(sql.includes('duplicate_profile_staff_id_detected'), 'must fail closed on duplicate staff_id')
assert(sql.includes("NOT r.profile_active"), 'must skip inactive profiles')
assert(sql.includes('profile_role IS DISTINCT FROM r.master_role'), 'must check role match')
assert(sql.includes("r.branch_code = 'SOETA'"), 'must restrict to SOETA branch scope')
assert(sql.includes("r.hub_code = 'SOETA'"), 'must allow T1/T2/T3 under SOETA hub')
assert(sql.includes('m2.auth_user_id = r.profile_id'), 'must guard auth user already linked to another master')

// ---------- Idempotency ----------
assert(sql.includes('WHERE staff_id = r.staff_id'), 'must target by exact staff_id')
assert(sql.includes('AND auth_user_id IS NULL'), 'must only update unlinked rows')

// ---------- No legacy SOETA reconciliation reuse ----------
assert(!sql.includes('SELECT * FROM public.raos_soeta_reconcile_hris_preactivation'), 'must NOT call HRIS preactivation')
assert(!sql.includes('SELECT public.raos_staff_master_link_auth'), 'must NOT call manual activation helper')

console.log('✅ raos_126 SOETA existing profile reconciliation contract passed')
