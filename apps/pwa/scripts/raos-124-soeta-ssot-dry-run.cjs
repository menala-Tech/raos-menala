const fs = require('fs')
const path = require('path')

const input = process.argv[2] || process.env.SOETA_SSOT_PAYLOAD
if (!input) {
  console.error('Usage: node raos-124-soeta-ssot-dry-run.cjs <payload.json>')
  console.error('   or: SOETA_SSOT_PAYLOAD=path node raos-124-soeta-ssot-dry-run.cjs')
  process.exit(1)
}

const raw = fs.readFileSync(path.resolve(input), 'utf8')
const records = JSON.parse(raw)

if (!Array.isArray(records)) {
  throw new Error('Payload must be a JSON array of records')
}

function normRole(jabatan) {
  const s = String(jabatan || '').trim().toUpperCase()
  if (s.includes('KOORD')) return 'koordinator'
  if (s.includes('ADMIN')) return 'admin'
  if (s.includes('DIREKSI')) return 'direksi'
  if (s.includes('MANAGEMENT')) return 'management'
  if (s.includes('DRIVER MANAGER') || s.includes('DRIVER MGR')) return 'driver_manager'
  if (s.includes('DRIVER')) return 'driver'
  if (s.includes('STAFF') || s.includes('PICKUP')) return 'staff'
  return null
}

const seen = new Map()
const terminalMap = new Map()
const errors = []

for (const r of records) {
  const staffId = String(r.staff_id || r['ID Staff'] || '').trim().toUpperCase()
  const fullName = String(r.full_name || r.Nama || '').trim()
  const jabatan = String(r.jabatan || r.Jabatan || '').trim()
  const terminal = String(r.terminal || r.Terminal || '').trim().toUpperCase() || null

  if (!staffId && !fullName) continue
  if (!staffId || !fullName) {
    errors.push(`Row with name='${fullName}' missing staff_id`)
    continue
  }

  if (seen.has(staffId)) {
    errors.push(`Duplicate staff_id ${staffId} (rows ${seen.get(staffId)} and current)`)
  } else {
    seen.set(staffId, r.source_row || '?')
  }

  const role = normRole(jabatan)
  if (!role) errors.push(`Staff ${staffId}: unmapped jabatan '${jabatan}'`)

  if (terminal && !['T1', 'T2', 'T3'].includes(terminal)) {
    errors.push(`Staff ${staffId}: invalid terminal '${terminal}'`)
  }

  if (terminal) {
    if (terminalMap.has(staffId) && terminalMap.get(staffId) !== terminal) {
      errors.push(`Staff ${staffId}: conflicting terminals ${terminalMap.get(staffId)} vs ${terminal}`)
    }
    terminalMap.set(staffId, terminal)
  }
}

const terminalOnly = []
for (const [staffId, terminal] of terminalMap.entries()) {
  if (!seen.has(staffId)) {
    terminalOnly.push(`${staffId} (${terminal})`)
  }
}
if (terminalOnly.length) {
  errors.push(`Terminal-only IDs not in master tab: ${terminalOnly.join(', ')}`)
}

const payload = records
  .filter(r => {
    const staffId = String(r.staff_id || r['ID Staff'] || '').trim().toUpperCase()
    const fullName = String(r.full_name || r.Nama || '').trim()
    return staffId && fullName
  })
  .map((r, idx) => {
    const staffId = String(r.staff_id || r['ID Staff'] || '').trim().toUpperCase()
    const fullName = String(r.full_name || r.Nama || '').trim()
    const jabatan = String(r.jabatan || r.Jabatan || '').trim()
    const emailRaw = String(r.email || r.Email || '').trim().toLowerCase()
    const phoneRaw = String(r.phone || r['No WA Staff'] || r['No WA'] || '').trim()
    const gajiRaw = r.gaji_staff || r['Gaji Staff']
    const terminal = String(r.terminal || r.Terminal || '').trim().toUpperCase() || null

    const gaji = (() => {
      if (gajiRaw === null || gajiRaw === undefined || gajiRaw === '') return null
      if (typeof gajiRaw === 'number') return gajiRaw
      const n = Number(String(gajiRaw).replace(/rp/ig, '').replace(/[.\s]/g, '').replace(',', '.'))
      return isFinite(n) && n >= 0 ? n : null
    })()

    return {
      staff_id: staffId,
      full_name: fullName,
      email: emailRaw || null,
      phone: phoneRaw ? phoneRaw.replace(/\D/g, '') : null,
      role: normRole(jabatan),
      jabatan: jabatan || null,
      gaji_staff: gaji,
      terminal: terminal,
      source_row: r.source_row || idx + 2
    }
  })

if (errors.length) {
  console.error('\n❌ validation failed:')
  errors.forEach(e => console.error('  -', e))
  process.exit(1)
}

console.log('\n✅ payload valid')
console.log('  incoming:', payload.length)
console.log('  unique:', new Set(payload.map(r => r.staff_id)).size)
console.log('  terminal assigned:', payload.filter(r => r.terminal).length)

// Reference SQL for dry-run. The actual sync is done via
// SELECT public.raos_soeta_staff_sheet_sync(payload_jsonb, sheet_id, revision, now()::timestamptz, false);
console.log('\nDry-run SQL (copy into Supabase SQL Editor, set <revision> to ISO timestamp):')
console.log(`SELECT public.raos_soeta_staff_sheet_sync(`)
console.log(`  ${JSON.stringify(JSON.stringify(payload))}::jsonb,`)
console.log(`  '13aVdbdeS0UOZ1pnfu3J-bJ99oLn4ugdYwFPd9tbg_dQ'::text,`)
console.log(`  '<revision>'::text,`)
console.log(`  now()::timestamptz,`)
console.log(`  false -- dry-run`)
console.log(`);`)
