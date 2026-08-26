const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')

const repoRoot = path.resolve(__dirname, '..', '..', '..')
const migrationPath = path.join(repoRoot, 'sql', 'raos_129_shift_middle_windows.sql')
const migration = fs.readFileSync(migrationPath, 'utf8')

for (const column of [
  'check_in_start',
  'check_in_end',
  'check_out_start',
  'check_out_end',
]) {
  assert.match(
    migration,
    new RegExp(`add column if not exists\\s+${column}\\s+time`, 'i'),
    `missing nullable ${column} column`
  )
}

assert.equal(
  (migration.match(/select 'Middle'/gi) || []).length,
  1,
  'Middle must be inserted exactly once'
)
assert.match(
  migration,
  /select 'Middle',\s*'10:00'::time,\s*'23:00'::time,\s*120,\s*true,\s*'10:00'::time,\s*'12:00'::time,\s*'19:00'::time,\s*'23:00'::time/i
)
assert.match(migration, /coalesce\(v_check_in_end,\s*v_shift_start\)/i)
assert.match(migration, /and check_in_start is null/i)
assert.match(migration, /raise exception 'checkin_before_window'/i)
assert.match(migration, /raise exception 'checkout_before_window'/i)
assert.doesNotMatch(migration, /raise exception 'checkin_after_window'/i)
assert.doesNotMatch(migration, /raise exception 'checkout_after_window'/i)

for (const uuid of [
  '5a335fe8-6864-49c1-9c2c-d7753f21e859',
  '5098582e-6015-4de5-86fc-4b330e8aa02c',
  '45b7af1e-2a6b-4d6b-92b5-d1ef9b2d58aa',
]) {
  assert.doesNotMatch(
    migration,
    new RegExp(`(?:update|delete)[\\s\\S]{0,240}${uuid}`, 'i'),
    `legacy shift ${uuid} must not be updated or deleted`
  )
}

console.log('Shift-window contract: PASS')
