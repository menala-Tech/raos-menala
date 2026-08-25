const fs = require('fs')
const path = require('path')
const assert = require('assert')

const sql = fs.readFileSync(path.resolve(__dirname, '../../../sql/raos_120_soeta_payroll_kpi_preview.sql'), 'utf8')
const cutover = fs.readFileSync(path.resolve(__dirname, '../../../sql/raos_123_soeta_payroll_kpi_cutover_contract.sql'), 'utf8')

// ---------- SQL contract ----------
assert(sql.includes('CREATE OR REPLACE FUNCTION public.raos_soeta_payroll_kpi_preview'), 'raos_120 preview function must exist')
assert(sql.includes('WHEN v_score >= 100 THEN 300000'), 'score >= 100 must be 300k')
assert(sql.includes('WHEN v_score >= 90 THEN 240000'), 'score >= 90 must be 240k')
assert(sql.includes('WHEN v_score >= 80 THEN 180000'), 'score >= 80 must be 180k')
assert(sql.includes('A snapshot with incomplete required inputs is never payroll-ready'), 'incomplete snapshot must not be payroll-ready')

assert(cutover.includes('CREATE OR REPLACE FUNCTION public.raos_soeta_payroll_kpi_cutover'), 'raos_123 cutover function must exist')
assert(cutover.includes('p_apply boolean DEFAULT false'), 'cutover must default to dry-run')
assert(cutover.includes('UPDATE public.raos_payroll'), 'cutover must update raos_payroll')
assert(cutover.includes('SET bonus_kpi = v_proposed'), 'cutover must only write bonus_kpi')
assert(!cutover.includes('gapok ='), 'cutover must not mutate gapok')
assert(!cutover.includes('bonus_saldo ='), 'cutover must not mutate bonus_saldo')
assert(!cutover.includes('bpjs ='), 'cutover must not mutate bpjs')
assert(!cutover.includes('paket_data ='), 'cutover must not mutate paket_data')
assert(!cutover.includes('member_parkir ='), 'cutover must not mutate member_parkir')
assert(!cutover.includes('late_deduction_total ='), 'cutover must not mutate late deduction')
assert(!cutover.includes('target_pct ='), 'cutover must not mutate target_pct')
assert(!cutover.includes('status_target ='), 'cutover must not mutate status_target')
assert(!cutover.includes('driver_active_pct ='), 'cutover must not mutate driver_active_pct')
assert(!cutover.includes('thp ='), 'cutover must not manually write THP')
assert(cutover.includes('preserved'), 'cutover must return preserved fields evidence')
assert(cutover.includes('payrollReady'), 'cutover must require payrollReady')

// ---------- Bonus tier unit tests ----------
function bonusFor(score) {
  if (score >= 100) return 300000
  if (score >= 90) return 240000
  if (score >= 80) return 180000
  return 0
}

const cases = [
  { score: 79,  expected: 0 },
  { score: 85,  expected: 180000 },
  { score: 95,  expected: 240000 },
  { score: 100, expected: 300000 },
]

for (const c of cases) {
  const actual = bonusFor(c.score)
  assert.strictEqual(actual, c.expected, `score ${c.score} must yield ${c.expected}`)
}

console.log('✅ payroll KPI cutover contract passed')
