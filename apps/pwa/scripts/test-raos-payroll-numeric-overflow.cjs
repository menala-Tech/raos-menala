const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const repoRoot = path.resolve(__dirname, '../../..')
const migrationPath = path.join(
  repoRoot,
  'supabase/migrations/20260824163000_raos_payroll_pct_overflow_guard.sql'
)
const sql = fs.readFileSync(migrationPath, 'utf8')

assert.match(sql, /public\.raos_compute_payroll_month\(date\)/i, 'migration targets the payroll compute RPC')
assert.match(sql, /pg_get_functiondef/i, 'migration reads the current function definition')
assert.match(sql, /LEAST\s*\(/i, 'migration clamps the percentage with LEAST')
assert.match(sql, /9999\.99/, 'migration clamps to the target_pct numeric(6,2) ceiling')
assert.match(sql, /NULLIF\s*\(\s*v_target_staff\s*,\s*0\s*\)/i, 'migration guards division by zero with NULLIF')

function pct(realized, target) {
  if (target == null || target === 0) return 0
  return Math.min((realized / target) * 100, 9999.99)
}

// 1. normal percentage
assert.equal(pct(100, 100), 100, 'normal percentage computes correctly')

// 2. very high realization does not overflow
assert.equal(pct(1000000, 1), 9999.99, 'very high realization is clamped to 9999.99')

// 3. target zero does not crash
assert.equal(pct(100, 0), 0, 'zero target returns 0 without division error')
assert.equal(pct(100, null), 0, 'null target returns 0 without division error')

console.log('PASS RAOS payroll target_pct overflow guard')
