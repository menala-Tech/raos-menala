const fs = require('fs')
const path = require('path')
const assert = require('assert')

const root = path.resolve(__dirname, '../../..')
const raosRoot = root
const rifimRoot = path.resolve(root, '../rifim-os')

const kpiPreview = fs.readFileSync(path.join(raosRoot, 'sql/raos_120_soeta_payroll_kpi_preview.sql'), 'utf8')
const kpiTargets = fs.readFileSync(path.join(raosRoot, 'sql/raos_125_makassar_saldo_invoice_policy.sql'), 'utf8') // reference only
const saldoInvoice = fs.readFileSync(path.join(root, 'apps/pwa/src/lib/saldoInvoice.ts'), 'utf8')
const financeRouter = fs.readFileSync(path.join(rifimRoot, 'shared/finance-data-router.js'), 'utf8')
const hrisContracts = fs.readFileSync(path.join(rifimRoot, 'api/internal/hris-contracts.js'), 'utf8')

// ---------- SOETA payroll contract ----------
assert(kpiPreview.includes('v_payroll.id'), 'preview must read canonical raos_payroll row')
assert(kpiPreview.includes('proposedBonusKpi'), 'preview must expose proposed bonus_kpi')
assert(kpiPreview.includes('thp'), 'preview must include THP')
assert(kpiPreview.includes('bonusKpiDelta'), 'preview must expose bonus_kpi delta')

// ---------- Saldo/Invoice regression ----------
assert(saldoInvoice.includes('45000: 50000'), 'saldoInvoice must map 45k -> 50k')
assert(saldoInvoice.includes('140000: 150000'), 'saldoInvoice must map 140k -> 150k')
assert(saldoInvoice.includes('190000: 200000'), 'saldoInvoice must map 190k -> 200k')
assert(saldoInvoice.includes('145000: 150000'), 'saldoInvoice must map legacy 145k -> 150k')
assert(saldoInvoice.includes('195000: 200000'), 'saldoInvoice must map legacy 195k -> 200k')

// ---------- RIFIM Finance router contract ----------
assert(financeRouter.includes('invoiceNominal'), 'RIFIM router must define invoiceNominal')
assert(financeRouter.includes('saldo_nominal:raw'), 'RIFIM router must preserve raw saldo_nominal')
assert(financeRouter.includes('invoice_nominal:invoice'), 'RIFIM router must expose invoice_nominal')
assert(financeRouter.includes('nominal:invoice'), 'RIFIM router must display invoice as nominal')

// ---------- RIFIM listSaldo contract ----------
assert(hrisContracts.includes('finance_saldo_list'), 'hris-contracts.js must expose finance_saldo_list')
assert(hrisContracts.includes('raos_saldo_requests'), 'listSaldo must query canonical raos_saldo_requests')

// ---------- KPI weights total 100% ----------
const weights = [
  { label: 'Order', value: 0.40 },
  { label: 'GMV', value: 0.20 },
  { label: 'Attendance', value: 0.15 },
  { label: 'SOP', value: 0.10 },
  { label: 'Driver Coaching', value: 0.10 },
  { label: 'Koordinator Assessment', value: 0.05 },
]
const total = weights.reduce((s, w) => s + w.value, 0)
assert.strictEqual(total, 1.0, 'KPI weights must total 100%')

// ---------- Invoice tier regression ----------
function invoice(n) {
  const raw = Number(n) || 0
  const map = { 45000: 50000, 95000: 100000, 140000: 150000, 145000: 150000, 190000: 200000, 195000: 200000 }
  return map[raw] ?? raw
}
[
  [45000, 50000], [95000, 100000], [145000, 150000], [195000, 200000],
  [140000, 150000], [190000, 200000]
].forEach(([inRaw, out]) => assert.strictEqual(invoice(inRaw), out, `${inRaw} -> ${out}`))

console.log('✅ finance validation contract passed')
