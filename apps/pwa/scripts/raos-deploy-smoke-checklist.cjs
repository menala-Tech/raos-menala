const raosChecks = [
  { area: 'Auth', check: 'PWA login (email + RAOS PIN) succeeds for a linked SOETA staff' },
  { area: 'Auth', check: 'PWA login fails gracefully for staff whose profile is not linked' },
  { area: 'Staff SOETA', check: 'Staff SOETA visibility — list shows only canonical SOETA staff from raos_soeta_staff_sheet_mirror' },
  { area: 'Staff SOETA', check: 'S001 / S0012 / STAFF002 do not appear as canonical SOETA staff' },
  { area: 'Staff SOETA', check: 'Linked 43 staff show is_activated=true and auth_user_id populated' },
  { area: 'Staff SOETA', check: 'Missing 7 staff remain is_activated=false and auth_user_id NULL' },
  { area: 'HRIS/preactivation', check: 'employees table row count unchanged' },
  { area: 'HRIS/preactivation', check: 'raos_staff_master pre-activation rows preserve source=google_sheet:ssot:database_staff_soeta' },
  { area: 'Saldo', check: 'Coordinator saldo history loads without P0/P1 errors' },
  { area: 'Saldo', check: 'Admin saldo history loads without P0/P1 errors' },
  { area: 'Saldo', check: 'validasi-saldo displays rounded invoice for non-Makassar branches' },
  { area: 'Saldo', check: 'riwayat-cabang displays rounded invoice for all branches' },
  { area: 'Saldo', check: 'Makassar raw options = 45k / 95k / 140k / 190k' },
  { area: 'Saldo', check: 'Invoice rounding: 45->50, 95->100, 140/145->150, 190/195->200' },
  { area: 'KPI', check: 'SOETA KPI workspace loads without P0/P1 errors' },
  { area: 'KPI', check: 'Target Cabang / Target Staff values reflect SOETA order mode' },
  { area: 'SSOT', check: 'GAS "Sync Staff SOETA (SSOT Database Staff Soeta)" runs as dry-run' },
  { area: 'Reconciliation', check: 'raos_soeta_reconcile_existing_profiles(false) returns linkableCount=0 after apply' },
  { area: 'Runtime', check: 'No uncaught 500 / P0 / P1 runtime errors in Sentry or Vercel Functions' },
]

const rifimChecks = [
  { area: 'Portal', check: 'Portal login loads' },
  { area: 'HRIS', check: 'HRIS staff list unchanged' },
  { area: 'KPI', check: 'SOETA KPI dashboard loads' },
  { area: 'Finance', check: 'Finance module loads' },
  { area: 'Finance', check: 'Saldo invoice display rounds correctly (45->50, 95->100, etc.)' },
  { area: 'Finance', check: 'Target Staff values match canonical payroll' },
  { area: 'Finance', check: 'Payroll display shows canonical SOETA bonus_kpi values' },
  { area: 'Vercel', check: 'RIFIM serverless function count <= 12' },
  { area: 'Runtime', check: 'No P0/P1 runtime errors' },
]

function print(title, items) {
  console.log(`\n## ${title}`)
  for (const i of items) {
    console.log(`- [ ] ${i.area} — ${i.check}`)
  }
}

console.log('# RAOS + RIFIM Production Deploy Smoke Checklist')
console.log('Run after PR #119 is merged and deployed.')
print('RAOS PWA', raosChecks)
print('RIFIM OS', rifimChecks)
console.log('\n✅ smoke checklist prepared')
