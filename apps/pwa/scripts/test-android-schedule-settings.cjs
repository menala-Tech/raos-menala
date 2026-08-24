const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')

const root = path.resolve(__dirname, '..')
const repoRoot = path.resolve(root, '..', '..')

function read(...parts) {
  return fs.readFileSync(path.join(...parts), 'utf8')
}

const dashboard = read(root, 'src/app/dashboard/page.tsx')
const settings = read(root, 'src/app/settings/page.tsx')
const schedule = read(root, 'src/components/WeeklyScheduleTab.tsx')
const workflow = read(root, 'src/lib/operationalWorkflow.ts')
const androidSettings = read(root, 'src/lib/nativeAndroidSettings.ts')
const manifest = read(repoRoot, 'apps/pwa/android/app/src/main/AndroidManifest.xml')
const mainActivity = read(repoRoot, 'apps/pwa/android/app/src/main/java/com/rifim/raos/MainActivity.java')
const nativePlugin = read(repoRoot, 'apps/pwa/android/app/src/main/java/com/rifim/raos/settings/RaosAndroidSettingsBridgePlugin.kt')
const sql = read(repoRoot, 'sql/raos_088_shift_schedule.sql')

// Dashboard owns the weekly schedule surface now.
assert.match(dashboard, /activeTab/)
assert.match(dashboard, /useSearchParams/)
assert.match(dashboard, /tab'\) === 'jadwal'/)
assert.match(dashboard, /Jadwal/)
assert.match(dashboard, /WeeklyScheduleTab/)
assert.doesNotMatch(settings, /key:\s*'jadwal'/)
assert.doesNotMatch(settings, /section === 'jadwal'/)
assert.doesNotMatch(settings, /SectionJadwalKerja/)

// Seven-day shift-code contract.
for (const label of ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min']) {
  assert.match(schedule, new RegExp(`label:\\s*['"]${label}['"]`), `missing day ${label}`)
}
assert.match(schedule, /shiftCodeFromName/)
assert.match(schedule, /buildShiftChoices/)
assert.match(schedule, /Pilih Shift/)
assert.match(schedule, /Pagi/)
assert.match(schedule, /Siang/)
assert.match(schedule, /Malam/)
assert.match(schedule, /Libur/)
assert.match(schedule, /P = Pagi/)
assert.match(schedule, /S = Siang/)
assert.match(schedule, /M = Malam/)
assert.match(schedule, /- = Libur/)
assert.match(schedule, /aria-label=.*shift/)
assert.match(schedule, /raos_shift_schedule_board/)
assert.match(schedule, /raos_shift_schedules/)
assert.match(schedule, /tanggal:\s*day\.date/)
assert.match(schedule, /\.update\(\{\s*shift_id:\s*shiftId\s*\}\)/)
assert.match(schedule, /\.delete\(\)\.eq\('id', cell\.schedule_id\)/)
assert.doesNotMatch(schedule, /Checklist/)
assert.doesNotMatch(schedule, /terjadwal/)

// The shared operational workflow keeps schedule as SSOT without creating
// direct schedule -> payroll -> finance shortcuts.
assert.match(workflow, /createWorkReminderPlan/)
assert.match(workflow, /diffWorkReminderPlans/)
assert.match(workflow, /source:\s*'validated_hris_attendance'/)
assert.match(workflow, /financePayableGate/)
assert.doesNotMatch(workflow, /salaryFormula|overtimeMultiplier|deductionRate/)

// Edit authority is not UI-only: frontend mirrors the existing server RLS/RPC.
assert.match(schedule, /user\?\.role === 'admin' \|\| user\?\.role === 'koordinator'/)
assert.match(schedule, /setActiveBranch\(lockedBranch\.id\)/)
assert.match(sql, /CREATE POLICY raos_shift_schedules_write/)
assert.match(sql, /public\.get_my_role\(\) = ANY \(ARRAY\['admin','koordinator'\]\)/)
assert.match(sql, /public\.is_branch_in_scope\(branch_id\)/)
assert.match(sql, /SECURITY DEFINER/)
assert.match(sql, /branch_out_of_scope/)

// Android permission/settings bridge is registered and safe.
assert.match(mainActivity, /RaosAndroidSettingsBridgePlugin/)
assert.match(androidSettings, /getAndroidPermissionSummary/)
assert.match(androidSettings, /openAndroidChatNotificationSettings/)
assert.match(nativePlugin, /ACTION_APP_NOTIFICATION_SETTINGS/)
assert.match(nativePlugin, /ACTION_CHANNEL_NOTIFICATION_SETTINGS/)
assert.match(nativePlugin, /RaosNotificationChannels\.CHANNEL_CHAT/)
assert.match(settings, /Perizinan &amp; Notifikasi HP/)
assert.match(settings, /Notifikasi Chat/)
assert.match(settings, /Suara/)
assert.match(settings, /Getar/)

// Sensitive owner-requested capabilities are represented, not silently granted.
assert.doesNotMatch(manifest, /android\.permission\.READ_PHONE_STATE/)
assert.doesNotMatch(manifest, /android\.permission\.READ_CALL_LOG/)
assert.doesNotMatch(manifest, /android\.permission\.READ_CONTACTS/)
assert.doesNotMatch(manifest, /android\.permission\.BLUETOOTH/)
assert.doesNotMatch(manifest, /android\.permission\.READ_MEDIA_AUDIO/)
assert.doesNotMatch(manifest, /android\.permission\.SCHEDULE_EXACT_ALARM/)
assert.doesNotMatch(manifest, /android\.permission\.QUERY_ALL_PACKAGES/)

console.log('Android settings + weekly schedule contract: PASS')
