const fs = require('fs')
const path = require('path')
const assert = require('assert')

const root = path.resolve(__dirname, '../../..')
const pwa = path.resolve(__dirname, '..')

const sqlPath = path.join(root, 'sql/raos_125_makassar_saldo_invoice_policy.sql')
const saldoInvoice = path.join(pwa, 'src/lib/saldoInvoice.ts')
const coordinatorHistory = path.join(pwa, 'src/components/CoordinatorSaldoHistory.tsx')
const validasiSaldo = path.join(pwa, 'src/app/validasi-saldo/page.tsx')
const riwayatCabang = path.join(pwa, 'src/app/riwayat-cabang/page.tsx')
const financeRouter = path.join(root, '../rifim-os/shared/finance-data-router.js')
const financeHtml = path.join(root, '../rifim-os/modules/finance/index.html')

const sql = fs.readFileSync(sqlPath, 'utf8')
const ts = fs.readFileSync(saldoInvoice, 'utf8')
const coordSrc = fs.readFileSync(coordinatorHistory, 'utf8')
const valSrc = fs.readFileSync(validasiSaldo, 'utf8')
const riwSrc = fs.readFileSync(riwayatCabang, 'utf8')
const routerSrc = fs.readFileSync(financeRouter, 'utf8')
const htmlSrc = fs.readFileSync(financeHtml, 'utf8')

// Canonical client-side helper (same as lib/saldoInvoice.ts)
function saldoInvoiceNominal(branchCode, nominal) {
  const raw = Number(nominal) || 0
  const map = { 45000: 50000, 95000: 100000, 140000: 150000, 145000: 150000, 190000: 200000, 195000: 200000 }
  return map[raw] ?? raw
}

// ---------- SQL contract ----------
assert(sql.includes('UPDATE public.branches'), 'must update branch saldo options')
assert(sql.includes("WHERE code = 'UPG'"), 'must target UPG (Makassar) only')
assert(sql.includes("SET saldo_nominal_options = '[45000,95000,140000,190000]'"), 'Makassar raw options must be 45/95/140/190')
assert(sql.includes('CREATE OR REPLACE FUNCTION public.raos_saldo_invoice_nominal'), 'SQL invoice round function must exist')
assert(sql.includes('WHEN 45000 THEN 50000'), '45k -> 50k mapping')
assert(sql.includes('WHEN 95000 THEN 100000'), '95k -> 100k mapping')
assert(sql.includes('WHEN 140000 THEN 150000'), '140k -> 150k mapping')
assert(sql.includes('WHEN 145000 THEN 150000'), '145k -> 150k mapping')
assert(sql.includes('WHEN 190000 THEN 200000'), '190k -> 200k mapping')
assert(sql.includes('WHEN 195000 THEN 200000'), '195k -> 200k mapping')
assert(sql.includes('CREATE OR REPLACE FUNCTION public.aist_refresh_invoice_daily'), 'aist daily refresh must be redefined')
assert(sql.includes('sum(public.raos_saldo_invoice_nominal(r.branch_id,r.nominal))'), 'daily total must sum rounded invoice nominal')
assert(sql.includes('j.nominal IS DISTINCT FROM r.nominal'), 'AIST mismatch must still compare raw nominal values')
assert(!sql.includes('UPDATE public.raos_saldo_requests'), 'must not mutate raw request nominal')
assert(!sql.includes('UPDATE public.aist_jobs'), 'must not mutate raw aist job nominal')

// ---------- TS helper contract ----------
assert(ts.includes('export function saldoInvoiceNominal'), 'saldoInvoice.ts must export saldoInvoiceNominal')
assert(ts.includes('export function isInvoiceRounded'), 'saldoInvoice.ts must export isInvoiceRounded')
assert(ts.includes('45000: 50000'), 'TS helper must map 45k -> 50k')
assert(ts.includes('140000: 150000'), 'TS helper must map 140k -> 150k')

// ---------- UI usage contract ----------
assert(coordSrc.includes("import { saldoInvoiceNominal } from '@/lib/saldoInvoice'"), 'CoordinatorSaldoHistory must import helper')
assert(coordSrc.includes('saldoInvoiceNominal(branchCode, Number(row.nominal))'), 'CoordinatorSaldoHistory must display rounded invoice')
assert(valSrc.includes("import { saldoInvoiceNominal } from '@/lib/saldoInvoice'"), 'validasi-saldo must import helper')
assert(valSrc.includes('saldoInvoiceNominal(null, r.nominal)'), 'validasi-saldo totals must use rounded invoice')
assert(valSrc.includes('saldoInvoiceNominal(null, req.nominal)'), 'validasi-saldo row must display rounded invoice')
assert(riwSrc.includes("import { saldoInvoiceNominal } from '@/lib/saldoInvoice'"), 'riwayat-cabang must import helper')
assert(riwSrc.includes('saldoInvoiceNominal(null, r.nominal)'), 'riwayat-cabang must display rounded invoice')

// ---------- RIFIM Finance contract ----------
assert(routerSrc.includes('function invoiceNominal'), 'finance-data-router.js must define invoiceNominal')
assert(routerSrc.includes('rows=rows.map(function(r){var raw=Number(r.nominal)||0,invoice=invoiceNominal(raw);return Object.assign({},r,{saldo_nominal:raw,invoice_nominal:invoice,nominal:invoice})})'), 'finance router must expose raw+invoice and present invoice as nominal')
assert(htmlSrc.includes('${fmtRp(r.nominal)}'), 'finance saldo table must display rounded r.nominal')

// ---------- Mapping unit tests ----------
const cases = [
  { in: 45000,  out: 50000,  label: 'BPN 45 -> 50' },
  { in: 95000,  out: 100000, label: 'BPN 95 -> 100' },
  { in: 145000, out: 150000, label: 'BPN 145 -> 150' },
  { in: 195000, out: 200000, label: 'BPN 195 -> 200' },
  { in: 140000, out: 150000, label: 'UPG 140 -> 150' },
  { in: 190000, out: 200000, label: 'UPG 190 -> 200' },
  { in: 145000, out: 150000, label: 'UPG legacy 145 -> 150' },
  { in: 195000, out: 200000, label: 'UPG legacy 195 -> 200' },
  { in: 50000,  out: 50000,  label: 'unknown 50k unchanged' },
  { in: 100000, out: 100000, label: 'unknown 100k unchanged' },
]
for (const c of cases) {
  const actual = saldoInvoiceNominal(null, c.in)
  assert.strictEqual(actual, c.out, `${c.label}: expected ${c.out}, got ${actual}`)
}

// Negative assertions
assert.strictEqual(saldoInvoiceNominal('UPG', null), 0, 'null returns 0')
assert.strictEqual(saldoInvoiceNominal('BPN', undefined), 0, 'undefined returns 0')
assert.strictEqual(saldoInvoiceNominal('MKS', 'not a number'), 0, 'non-numeric returns 0')

console.log('✅ all makassar saldo invoice contracts passed')
