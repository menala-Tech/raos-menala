const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')

const root = path.resolve(__dirname, '..')
const repoRoot = path.resolve(root, '..', '..')

function read(...parts) {
  return fs.readFileSync(path.join(...parts), 'utf8')
}

const policy = read(root, 'src/lib/notificationPolicy.ts')
const push = read(root, 'src/lib/push.ts')
const heal = read(root, 'src/lib/useAutoPushSubscribe.ts')
const maintenance = read(root, 'src/lib/pwaMaintenance.ts')
const sw = read(root, 'public/sw-push.js')
const edge = read(repoRoot, 'supabase/functions/raos-send-push/index.ts')
const migration = read(repoRoot, 'sql/raos_110_notification_engine_v2_role_filter.sql')

// Client policy is an explicit allowlist, not a blacklist.
for (const role of ['staff', 'koordinator', 'admin', 'driver']) {
  assert.match(policy, new RegExp(`['\"]${role}['\"]`), `eligible role missing: ${role}`)
}
for (const role of ['management', 'direksi', 'direktur']) {
  assert.doesNotMatch(
    policy.match(/NOTIFICATION_ELIGIBLE_ROLES\s*=\s*\[[\s\S]*?\]/)?.[0] ?? '',
    new RegExp(`['\"]${role}['\"]`),
    `excluded role leaked into client allowlist: ${role}`,
  )
}

assert.match(push, /isNotificationEligibleRole\(profile\.role\)/)
assert.match(push, /role_not_eligible/)
assert.match(heal, /visibilitychange/)
assert.match(heal, /controllerchange/)
assert.match(heal, /online/)

// Server boundaries must independently enforce the same allowlist.
assert.match(edge, /ELIGIBLE_RECIPIENT_ROLES\s*=\s*new Set\(\['staff', 'koordinator', 'admin', 'driver'\]\)/)
assert.match(edge, /role_filtered_out/)
assert.match(migration, /ARRAY\['staff','koordinator','admin','driver'\]/)
assert.match(migration, /REVOKE ALL ON FUNCTION public\.raos_dispatch_push/)
assert.match(migration, /JOIN public\.user_profiles up ON up\.id = crm\.user_id/)

// Lock-screen push + safe click routing.
assert.match(sw, /requireInteraction:\s*true/)
assert.match(sw, /vibrate/)
assert.match(sw, /notificationclick/)
assert.match(sw, /normalizeTargetUrl/)
assert.match(sw, /client\.navigate\(targetUrl\)/)

// Cache cleaner must never wipe the whole browser storage where Supabase auth
// and identity preferences live.
assert.doesNotMatch(maintenance, /localStorage\.clear\s*\(/)
assert.doesNotMatch(maintenance, /sessionStorage\.clear\s*\(/)
assert.match(maintenance, /cacheClearAll\(\)/)
assert.match(maintenance, /clearOfflineReadCache\(\)/)
assert.match(maintenance, /registration\.update\(\)/)

console.log('Notification Engine V2 contract: PASS')
