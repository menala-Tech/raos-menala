const fs = require('node:fs')
const path = require('node:path')
const { execSync } = require('node:child_process')
const assert = require('node:assert/strict')

const root = path.resolve(__dirname, '..')
const repoRoot = path.resolve(root, '..', '..')

function read(...parts) {
  return fs.readFileSync(path.join(...parts), 'utf8')
}

function exists(...parts) {
  return fs.existsSync(path.join(...parts))
}

const migration = read(repoRoot, 'supabase/migrations/raos_114_push_subscriptions_fcm.sql')
const edgeIndex = read(repoRoot, 'supabase/functions/raos-send-push/index.ts')
const edgeFcm = read(repoRoot, 'supabase/functions/raos-send-push/fcm.ts')
const nativePush = read(root, 'src/lib/nativePush.ts')
const useNative = read(root, 'src/lib/useNativePushSubscribe.ts')
const appShell = read(root, 'src/components/layout/AppShell.tsx')
const manifest = read(repoRoot, 'apps/pwa/android/app/src/main/AndroidManifest.xml')

// 1. Schema migration
assert.match(migration, /platform text/)
assert.match(migration, /token text/)
assert.match(migration, /platform IN \('web', 'fcm'\)/)
assert.match(migration, /platform = 'web'.*endpoint IS NOT NULL.*p256dh IS NOT NULL.*auth IS NOT NULL/)
assert.match(migration, /platform = 'fcm'.*token IS NOT NULL/)
assert.match(migration, /CREATE UNIQUE INDEX.*push_subscriptions_token_unique/)

// 2. Edge function hybrid dispatch
assert.match(edgeIndex, /from '\.\/fcm\.ts'/)
assert.match(edgeIndex, /select\('platform, token, endpoint, p256dh, auth, user_id'\)/)
assert.match(edgeIndex, /s\.platform === 'fcm'/)
assert.match(edgeIndex, /await sendFcm\(/)
assert.match(edgeIndex, /'raos_chat'/)

// 3. FCM helper contract and safety
assert.match(edgeFcm, /RAOS_FCM_PROJECT_ID/)
assert.match(edgeFcm, /RAOS_FCM_CLIENT_EMAIL/)
assert.match(edgeFcm, /RAOS_FCM_PRIVATE_KEY/)
assert.match(edgeFcm, /https:\/\/fcm\.googleapis\.com\/v1\/projects/)
assert.match(edgeFcm, /channelId/)
assert.doesNotMatch(edgeFcm, /console\.log\(.*token/)

// 4. Client native registration
assert.match(nativePush, /from '@capacitor\/push-notifications'/)
assert.match(nativePush, /platform: 'fcm'/)
assert.match(nativePush, /onConflict: 'token'/)
assert.doesNotMatch(nativePush, /console\.log\(.*token/)
assert.doesNotMatch(nativePush, /console\.warn\(.*token/)

// 5. Auto-subscribe hook wired
assert.match(useNative, /subscribeNativePush/)
assert.match(appShell, /useNativePushSubscribe\(\)/)

// 6. Android permission already present
assert.match(manifest, /android\.permission\.POST_NOTIFICATIONS/)

// 7. No fake google-services.json checked in
assert(!exists(repoRoot, 'apps/pwa/android/app/google-services.json'), 'google-services.json must not be committed; it is owner-provided')

// 8. No hardcoded service account private key in source
const privateKeyPattern = /-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/
const suspectFiles = [
  edgeFcm,
  nativePush,
  useNative,
  edgeIndex,
]
for (const content of suspectFiles) {
  assert.doesNotMatch(content, privateKeyPattern, 'private key must not be embedded in source')
}

// 9. Runtime FCM HTTP v1 token classification (executes the real classifyFcmError).
const fcmFnDir = path.resolve(repoRoot, 'supabase/functions/raos-send-push')
const classifierRuntime = `
import { classifyFcmError } from './fcm.ts';
const cases = [
  {
    name: 'UNREGISTERED FcmError',
    status: 404,
    json: { error: { status: 'NOT_FOUND', message: 'Requested entity was not found.', details: [{ '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError', errorCode: 'UNREGISTERED' }] } },
    invalid: true,
  },
  {
    name: 'generic UNAVAILABLE',
    status: 503,
    json: { error: { status: 'UNAVAILABLE', message: 'Service unavailable', details: [{ '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError', errorCode: 'UNAVAILABLE' }] } },
    invalid: false,
  },
  {
    name: 'INVALID_ARGUMENT without token evidence',
    status: 400,
    json: { error: { status: 'INVALID_ARGUMENT', message: 'The message payload is invalid.', details: [] } },
    invalid: false,
  },
  {
    name: 'INVALID_ARGUMENT with token-specific evidence',
    status: 400,
    json: { error: { status: 'INVALID_ARGUMENT', message: 'The registration token is invalid.', details: [{ '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError', errorCode: 'INVALID_ARGUMENT' }] } },
    invalid: true,
  },
  {
    name: '5xx server failure',
    status: 500,
    json: { error: { status: 'INTERNAL', message: 'Internal server error' } },
    invalid: false,
  },
  {
    name: 'malformed non-JSON',
    status: 503,
    json: null,
    invalid: false,
  },
];
for (const c of cases) {
  const got = classifyFcmError(c.status, c.json);
  if (got.invalid !== c.invalid) {
    throw new Error('classifier case ' + c.name + ': expected invalid=' + c.invalid + ', got invalid=' + got.invalid + ', reason=' + got.reason);
  }
}
console.log('FCM classifier runtime: PASS');
`
execSync(
  `node --experimental-transform-types --input-type=module --eval "${classifierRuntime}"`,
  { cwd: fcmFnDir, stdio: 'inherit' }
)

console.log('RAOS hybrid push (Web + FCM) contract: PASS')
