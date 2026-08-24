const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const repoRoot = path.resolve(__dirname, '../../..')
const migrationPath = path.join(
  repoRoot,
  'supabase/migrations/20260824091309_raos_order_payroll_canonical.sql'
)
const sql = fs.readFileSync(migrationPath, 'utf8')

assert.match(sql, /v_mode\s*=\s*'order'[\s\S]*public\.scan_orders/i)
assert.match(sql, /s\.status\s*=\s*'valid'/i)
assert.match(sql, /s\.scanned_at\s*>=\s*v_order_start_ts/i)
assert.match(sql, /s\.scanned_at\s*<\s*v_order_end_ts/i)
assert.match(sql, /staff_target\.target_order|st\.target_order|st2\.target_order/i)
assert.match(sql, /else[\s\S]*raos_target_tercapai_bulan/i)
assert.match(sql, /on conflict\s*\(\s*staff_id\s*,\s*effective_month\s*\)\s*do update/i)

function moneyBonus(role, branchPct, staffPct) {
  const max = role === 'koordinator' ? 2000000 : 1500000
  if (branchPct >= 100 && staffPct >= 100) return max
  if (branchPct >= 90 && staffPct >= 90) return Math.trunc(max * 0.8)
  if (branchPct >= 80 && staffPct >= 80) return Math.trunc(max * 0.6)
  return 0
}

function pct(realized, target) {
  return target > 0 ? (realized / target) * 100 : 0
}

function inMonth(scannedAt, start, end) {
  const t = new Date(scannedAt).getTime()
  return t >= new Date(start).getTime() && t < new Date(end).getTime()
}

function effectiveTarget({ mode, staffTarget, branchTarget, activePeople }) {
  if (mode === 'order' && staffTarget.target_order != null) return staffTarget.target_order
  if (mode === 'saldo' && staffTarget.target_saldo != null) return staffTarget.target_saldo
  if (branchTarget.target_staff_default != null) return branchTarget.target_staff_default
  return activePeople > 0 ? Math.ceil(branchTarget.target_cabang / activePeople) : 0
}

function computePayroll({ staffId, role = 'staff', branchId, scopeIds, mode, monthStart, monthEnd, branchTarget, staffTargets = {}, saldo = [], scans = [], payrollRows = new Map() }) {
  const scopedStaff = Object.keys(staffTargets).filter(id => scopeIds.includes(staffTargets[id].branch_id))
  const activePeople = scopedStaff.length
  const staffTarget = staffTargets[staffId] || {}
  const target = effectiveTarget({ mode, staffTarget, branchTarget, activePeople })
  const realization = mode === 'order'
    ? scans.filter(s =>
        s.staff_id === staffId &&
        s.status === 'valid' &&
        scopeIds.includes(staffTargets[s.staff_id]?.branch_id) &&
        inMonth(s.scanned_at, monthStart, monthEnd)
      ).length
    : saldo.find(s => s.staff_id === staffId && s.effective_month === monthStart.slice(0, 10))?.realisasi_saldo || 0

  const staffPct = pct(realization, target)
  const branchReached = scopedStaff.filter(id => {
    const st = staffTargets[id] || {}
    const t = effectiveTarget({ mode, staffTarget: st, branchTarget, activePeople })
    const r = mode === 'order'
      ? scans.filter(s =>
          s.staff_id === id &&
          s.status === 'valid' &&
          scopeIds.includes(staffTargets[s.staff_id]?.branch_id) &&
          inMonth(s.scanned_at, monthStart, monthEnd)
        ).length
      : saldo.find(s => s.staff_id === id && s.effective_month === monthStart.slice(0, 10))?.realisasi_saldo || 0
    return t > 0 && r >= t
  }).length
  const branchPct = pct(branchReached, activePeople)
  const row = {
    staff_id: staffId,
    effective_month: monthStart.slice(0, 10),
    target_pct: staffPct,
    bonus_saldo: moneyBonus(role, branchPct, staffPct),
  }
  payrollRows.set(`${row.staff_id}:${row.effective_month}`, row)
  return row
}

const monthStart = '2026-08-01T00:00:00+08:00'
const monthEnd = '2026-09-01T00:00:00+08:00'
const branchTargetSaldo = { target_cabang: 4000000, target_staff_default: 1000000 }
const branchTargetOrder = { target_cabang: 4, target_staff_default: 2 }
const staffTargets = {
  staffA: { branch_id: 'branchA', target_saldo: null, target_order: null },
  staffB: { branch_id: 'branchA', target_saldo: null, target_order: 2 },
  staffWrongBranch: { branch_id: 'branchB', target_saldo: null, target_order: 1 },
}

const saldo = [
  { staff_id: 'staffA', effective_month: '2026-08-01', realisasi_saldo: 1000000 },
  { staff_id: 'staffB', effective_month: '2026-08-01', realisasi_saldo: 5000000 },
]
const scans = [
  { staff_id: 'staffA', status: 'valid', scanned_at: '2026-08-01T01:00:00+08:00' },
  { staff_id: 'staffA', status: 'valid', scanned_at: '2026-08-15T11:00:00+08:00' },
  { staff_id: 'staffA', status: 'pending', scanned_at: '2026-08-16T11:00:00+08:00' },
  { staff_id: 'staffA', status: 'rejected', scanned_at: '2026-08-17T11:00:00+08:00' },
  { staff_id: 'staffB', status: 'valid', scanned_at: '2026-08-20T11:00:00+08:00' },
  { staff_id: 'staffB', status: 'valid', scanned_at: '2026-08-21T11:00:00+08:00' },
  { staff_id: 'staffWrongBranch', status: 'valid', scanned_at: '2026-08-22T11:00:00+08:00' },
  { staff_id: 'staffA', status: 'valid', scanned_at: '2026-09-01T00:00:00+08:00' },
]

const payrollRows = new Map()

const saldoRow = computePayroll({
  staffId: 'staffA',
  branchId: 'branchA',
  scopeIds: ['branchA'],
  mode: 'saldo',
  monthStart,
  monthEnd,
  branchTarget: branchTargetSaldo,
  staffTargets,
  saldo,
  scans,
  payrollRows,
})
assert.equal(saldoRow.target_pct, 100, 'saldo-mode payroll remains based on saldo realization')
assert.equal(saldoRow.bonus_saldo, 1500000, 'saldo-mode bonus rule remains unchanged')

const orderRow = computePayroll({
  staffId: 'staffA',
  branchId: 'branchA',
  scopeIds: ['branchA'],
  mode: 'order',
  monthStart,
  monthEnd,
  branchTarget: branchTargetOrder,
  staffTargets,
  saldo,
  scans,
  payrollRows,
})
assert.equal(orderRow.target_pct, 100, 'order mode counts valid scans only')
assert.equal(orderRow.bonus_saldo, 1500000, 'order bonus follows target tier from valid scans')

const staffBOrder = computePayroll({
  staffId: 'staffB',
  branchId: 'branchA',
  scopeIds: ['branchA'],
  mode: 'order',
  monthStart,
  monthEnd,
  branchTarget: branchTargetOrder,
  staffTargets,
  saldo,
  scans,
  payrollRows,
})
assert.equal(staffBOrder.target_pct, 100, 'staff target_order override is respected')

const noValidScans = computePayroll({
  staffId: 'staffA',
  branchId: 'branchA',
  scopeIds: ['branchA'],
  mode: 'order',
  monthStart,
  monthEnd,
  branchTarget: branchTargetOrder,
  staffTargets,
  saldo,
  scans: scans.filter(s => s.status !== 'valid'),
  payrollRows: new Map(),
})
assert.equal(noValidScans.target_pct, 0, 'pending/rejected scans are excluded')
assert.equal(noValidScans.bonus_saldo, 0, 'saldo events cannot inflate order-mode bonus')

const wrongStaffOnly = computePayroll({
  staffId: 'staffA',
  branchId: 'branchA',
  scopeIds: ['branchA'],
  mode: 'order',
  monthStart,
  monthEnd,
  branchTarget: branchTargetOrder,
  staffTargets,
  saldo,
  scans: scans.filter(s => s.staff_id !== 'staffA'),
  payrollRows: new Map(),
})
assert.equal(wrongStaffOnly.target_pct, 0, 'wrong staff scans are excluded')

const wrongBranchOnly = computePayroll({
  staffId: 'staffWrongBranch',
  branchId: 'branchB',
  scopeIds: ['branchA'],
  mode: 'order',
  monthStart,
  monthEnd,
  branchTarget: branchTargetOrder,
  staffTargets,
  saldo,
  scans,
  payrollRows: new Map(),
})
assert.equal(wrongBranchOnly.target_pct, 0, 'wrong branch scans are excluded')

const wrongMonthOnly = computePayroll({
  staffId: 'staffA',
  branchId: 'branchA',
  scopeIds: ['branchA'],
  mode: 'order',
  monthStart,
  monthEnd,
  branchTarget: branchTargetOrder,
  staffTargets,
  saldo,
  scans: scans.filter(s => s.scanned_at.startsWith('2026-09')),
  payrollRows: new Map(),
})
assert.equal(wrongMonthOnly.target_pct, 0, 'wrong month scans are excluded')

computePayroll({
  staffId: 'staffA',
  branchId: 'branchA',
  scopeIds: ['branchA'],
  mode: 'order',
  monthStart,
  monthEnd,
  branchTarget: branchTargetOrder,
  staffTargets,
  saldo,
  scans,
  payrollRows,
})
computePayroll({
  staffId: 'staffA',
  branchId: 'branchA',
  scopeIds: ['branchA'],
  mode: 'order',
  monthStart,
  monthEnd,
  branchTarget: branchTargetOrder,
  staffTargets,
  saldo,
  scans,
  payrollRows,
})
assert.equal(
  [...payrollRows.keys()].filter(k => k === 'staffA:2026-08-01').length,
  1,
  'upsert remains idempotent for staff_id/effective_month'
)

console.log('PASS RAOS canonical order payroll source contract')
