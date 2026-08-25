const fs = require('fs')
const path = require('path')
const assert = require('assert')

const sql = fs.readFileSync(path.resolve(__dirname, '../../../sql/raos_e2e_qa_checklist.sql'), 'utf8')

assert(sql.includes('Target Cabang/Staff'), 'checklist must include Target Cabang/Staff')
assert(sql.includes('Scan Order/GMV'), 'checklist must include Scan Order/GMV')
assert(sql.includes('Attendance'), 'checklist must include Attendance')
assert(sql.includes('KPI Snapshot'), 'checklist must include KPI Snapshot')
assert(sql.includes('Payroll'), 'checklist must include Payroll')
assert(sql.includes('Duplicates'), 'checklist must include duplicate check')
assert(sql.includes('Branch/Terminal'), 'checklist must include branch/terminal')
assert(sql.includes('raos_payroll'), 'checklist must query raos_payroll')
assert(sql.includes('scan_orders'), 'checklist must query scan_orders')
assert(sql.includes('raos_attendance'), 'checklist must query raos_attendance')
assert(sql.includes('raos_soeta_kpi_staff_snapshot'), 'checklist must call KPI snapshot')

console.log('✅ SOETA E2E QA framework contract passed')
