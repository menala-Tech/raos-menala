const fs = require('fs')
const path = require('path')
const assert = require('assert')

const root = path.resolve(__dirname, '../../..')

const sql = fs.readFileSync(path.join(root, 'sql/raos_127_soeta_kpi_payroll_final_readiness.sql'), 'utf8')
const aist = fs.readFileSync(path.join(root, 'sql/raos_aist_mismatch_audit.sql'), 'utf8')

// ---------- raos_127 ----------
assert(sql.includes('raos_kpi_targets_branch_upsert'), 'must define branch target upsert')
assert(sql.includes('raos_kpi_targets_staff_upsert'), 'must define staff target upsert')
assert(sql.includes('raos_soeta_kpi_manual_inputs_upsert'), 'must define manual KPI inputs upsert')

assert(sql.includes("CREATE OR REPLACE FUNCTION public.raos_kpi_targets_branch_upsert"), 'must create branch upsert RPC')
assert(sql.includes("CREATE OR REPLACE FUNCTION public.raos_kpi_targets_staff_upsert"), 'must create staff upsert RPC')
assert(sql.includes("CREATE OR REPLACE FUNCTION public.raos_soeta_kpi_manual_inputs_upsert"), 'must create manual inputs RPC')

assert(sql.includes("p_mode text"), 'branch upsert must accept mode')
assert(sql.includes("p_target_cabang bigint"), 'branch upsert must accept target_cabang')
assert(sql.includes("p_target_staff_default bigint"), 'branch upsert must accept target_staff_default')
assert(sql.includes("p_target_gmv numeric"), 'branch upsert must accept target_gmv')
assert(sql.includes("p_target_order bigint"), 'staff upsert must accept target_order')
assert(sql.includes("p_target_gmv numeric"), 'staff upsert must accept target_gmv')
assert(sql.includes("p_sop_score numeric"), 'manual inputs must accept sop_score')
assert(sql.includes("p_coaching_score numeric"), 'manual inputs must accept coaching_score')
assert(sql.includes("p_coordinator_score numeric"), 'manual inputs must accept coordinator_score')

assert(sql.includes("p_mode NOT IN ('saldo','order')"), 'branch upsert must validate mode')
assert(sql.includes('sop_score_out_of_range'), 'manual inputs must validate sop 0-100')
assert(sql.includes('coaching_score_out_of_range'), 'manual inputs must validate coaching 0-100')
assert(sql.includes('coordinator_score_out_of_range'), 'manual inputs must validate coordinator 0-100')

assert(sql.includes('forbidden: admin/management/direksi'), 'branch upsert must guard role')
assert(sql.includes('forbidden: admin/direksi'), 'manual inputs must guard role')

assert(sql.includes("ON CONFLICT (branch_id, effective_month)"), 'branch upsert must be idempotent')
assert(sql.includes("ON CONFLICT (staff_id, effective_month)"), 'staff upsert must be idempotent')
assert(sql.includes("ON CONFLICT (staff_id, effective_month)"), 'manual inputs must be idempotent')

assert(!sql.includes('INSERT INTO public.raos_payroll'), 'raos_127 must not fabricate payroll')
assert(!sql.includes('UPDATE public.raos_payroll'), 'raos_127 must not mutate payroll')
assert(!sql.includes('DELETE FROM public.raos_payroll'), 'raos_127 must not delete payroll')

// ---------- AIST mismatch audit ----------
assert(aist.includes('mismatch_category'), 'AIST audit must classify mismatch')
assert(aist.includes('operational_note'), 'AIST audit must include operational note')
assert(aist.includes('no_aist_job'), 'AIST audit must flag missing aist job')
assert(aist.includes('nominal_mismatch'), 'AIST audit must flag nominal mismatch')
assert(aist.includes('driver_login_mismatch'), 'AIST audit must flag driver login mismatch')
assert(aist.includes('branch_mismatch'), 'AIST audit must flag branch mismatch')
assert(!aist.includes('UPDATE public.aist_jobs'), 'AIST audit must be read-only')
assert(!aist.includes('DELETE FROM'), 'AIST audit must be read-only')

console.log('✅ SOETA KPI/Payroll final readiness contract passed')
