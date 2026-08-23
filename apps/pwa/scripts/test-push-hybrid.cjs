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
const nativePushLifecycle = read(root, 'src/lib/nativePushLifecycle.ts')
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
assert.match(nativePushLifecycle, /platform: 'fcm'/)
assert.match(nativePushLifecycle, /onConflict: 'token'/)
assert.doesNotMatch(nativePushLifecycle, /console\.log\(.*token/)
assert.doesNotMatch(nativePushLifecycle, /console\.warn\(.*token/)

// 5. Auto-subscribe hook wired
assert.match(useNative, /subscribeNativePush/)
assert.match(appShell, /useNativePushSubscribe\(\)/)

// 6. Android permission already present
assert.match(manifest, /android\.permission\.POST_NOTIFICATIONS/)

// 7. google-services.json may exist locally for Android builds, but must be
// ignored and never committed.
const gsPath = 'apps/pwa/android/app/google-services.json'
if (exists(repoRoot, gsPath)) {
  try {
    execSync(`git check-ignore -q ${gsPath}`, { cwd: repoRoot })
  } catch {
    assert.fail(`${gsPath} must be ignored or not committed`)
  }
}

// 8. No hardcoded service account private key in source
const privateKeyPattern = /-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/
const suspectFiles = [
  edgeFcm,
  nativePush,
  nativePushLifecycle,
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

// 10. Executable native push auth-transition and registration-persistence test.
const runtimeTestFile = path.join(__dirname, '.native-push-lifecycle.runtime.test.ts')
const runtimeTest = `
import { createNativePushHealer, createNativePushSubscriber } from '../src/lib/nativePushLifecycle.ts';

// CASE A: initial unauthenticated should not mark throttle.
const storage = {
  _data: new Map<string, string>(),
  getItem(k: string) { return this._data.get(k) ?? null },
  setItem(k: string, v: string) { this._data.set(k, v) },
};
const runningRef = { current: false };

let authCallback: ((event: string, session: unknown) => void) | null = null;
const fakeSupabase = {
  auth: {
    onAuthStateChange(cb: (event: string, session: unknown) => void) {
      authCallback = cb;
      return { data: { subscription: { unsubscribe() {} } } };
    },
    async getSession() { return { data: { session: { user: null } } }; },
  },
  from() { return null },
};

let calls: number[] = [];
const fakeSubscribe = async () => {
  const n = calls.length + 1;
  calls.push(n);
  if (n === 1) return { ok: false, reason: 'not_authenticated' };
  if (n === 2) return { ok: true };
  return { ok: false, reason: 'already_done' };
};

const healer = createNativePushHealer({
  runningRef,
  subscribeNativePush: fakeSubscribe,
  supabaseClient: fakeSupabase,
  storage,
});

await healer.heal();
if (calls.length !== 1) throw new Error('CASE A: heal should call subscribe once, got ' + calls.length);
if (storage.getItem('raos_native_push_heal_v2') !== null) {
  throw new Error('CASE A: not_authenticated must not mark throttle/retry completion');
}

// CASE B: SIGNED_IN reruns subscribeNativePush.
if (!authCallback) throw new Error('CASE B: auth callback not registered');
authCallback('SIGNED_IN', {});
await new Promise(r => setTimeout(r, 20));
if (calls.length !== 2) throw new Error('CASE B: SIGNED_IN must rerun subscribeNativePush, got ' + calls.length);
if (storage.getItem('raos_native_push_heal_v2') === null) {
  throw new Error('CASE B: successful registration should mark throttle completion');
}

// CASE C: repeated SIGNED_IN inside the throttle window must be skipped.
// The first SIGNED_IN succeeded and already wrote the throttle timestamp, so
// an immediate second SIGNED_IN should not re-trigger subscribeNativePush.
authCallback('SIGNED_IN', {});
await new Promise(r => setTimeout(r, 20));
if (calls.length !== 2) throw new Error('CASE C: repeated SIGNED_IN inside throttle must be skipped, got ' + calls.length);

// CASE 4: once the throttle has expired, a fresh SIGNED_IN may retry.
storage.setItem('raos_native_push_heal_v2', String(Date.now() - 6 * 60 * 1000));
authCallback('SIGNED_IN', {});
await new Promise(r => setTimeout(r, 20));
if (calls.length !== 3) throw new Error('CASE 4: SIGNED_IN after throttle expiry must retry, got ' + calls.length);

// CASE D: registration callback reaches persistence path.
let upsertCall: { table: string; values: Record<string, unknown>; opts: Record<string, unknown> } | null = null;
const fakeSupabase2 = {
  auth: {
    onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; },
    async getSession() { return { data: { session: { user: { id: 'u-1' } } } }; },
  },
  from(table: string) {
    return {
      select() {
        return {
          eq() {
            return {
              single: async () => ({ data: { role: 'admin', is_active: true }, error: null }),
            };
          },
        };
      },
      upsert(values: Record<string, unknown>, opts: Record<string, unknown>) {
        upsertCall = { table, values, opts };
        return { error: null };
      },
    };
  },
};

let regCallback: ((payload: { value: string }) => void) | null = null;
const fakePush = {
  async requestPermissions() { return { receive: 'granted' }; },
  async removeAllListeners() {},
  addListener(event: string, cb: (payload: any) => void) {
    if (event === 'registration') regCallback = cb;
  },
  async register() {},
};

const subscriber = createNativePushSubscriber({
  supabaseClient: fakeSupabase2,
  pushNotifications: fakePush,
  isNativePlatform: () => true,
  getUserAgent: () => 'test-agent',
  isNotificationEligibleRole: () => true,
});

const subResult = await subscriber();
if (!subResult.ok) throw new Error('CASE D: subscribeNativePush should succeed, got ' + subResult.reason);
if (!regCallback) throw new Error('CASE D: registration listener not added');

regCallback({ value: 'TEST_TOKEN_FOR_PERSISTENCE' });
await new Promise(r => setTimeout(r, 30));
if (!upsertCall) throw new Error('CASE D: registration callback did not reach persistFcmToken');
if (upsertCall.values.platform !== 'fcm') throw new Error('CASE D: platform should be fcm');
if (upsertCall.values.user_id !== 'u-1') throw new Error('CASE D: user_id mismatch');
if (upsertCall.values.user_agent !== 'test-agent') throw new Error('CASE D: user_agent mismatch');
if ((upsertCall.opts as any).onConflict !== 'token') throw new Error('CASE D: onConflict should be token');

// CASE E: executable log safety. No FCM token, session/access token, refresh
// token, or JWT sentinel may reach console output.
const SENTINELS = [
  'FCM_TOKEN_SENTINEL_12345',
  'ACCESS_TOKEN_SENTINEL_67890',
  'REFRESH_TOKEN_SENTINEL_abcde',
  'JWT_SESSION_SENTINEL_fghij',
];

const originalLog = console.log;
const originalWarn = console.warn;
const originalError = console.error;
const captured: unknown[][] = [];

console.log = (...args: unknown[]) => captured.push(args);
console.warn = (...args: unknown[]) => captured.push(args);
console.error = (...args: unknown[]) => captured.push(args);

try {
  const fakeSupabase3 = {
    auth: {
      onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; },
      async getSession() {
        return {
          data: {
            session: {
              user: { id: 'u-2' },
              access_token: SENTINELS[1],
              refresh_token: SENTINELS[2],
              jwt: SENTINELS[3],
            },
          },
        };
      },
    },
    from(table: string) {
      return {
        select() {
          return {
            eq() {
              return {
                single: async () => ({ data: { role: 'admin', is_active: true }, error: null }),
              };
            },
          };
        },
        upsert() {
          return { error: { message: SENTINELS[2] } };
        },
      };
    },
  };

  let regCb2: ((payload: { value: string }) => void) | null = null;
  let regErrCb2: ((error: unknown) => void) | null = null;
  const fakePush2 = {
    async requestPermissions() { return { receive: 'granted' }; },
    async removeAllListeners() {},
    addListener(event: string, cb: (payload: any) => void) {
      if (event === 'registration') regCb2 = cb;
      if (event === 'registrationError') regErrCb2 = cb;
    },
    async register() { throw new Error(SENTINELS[3]); },
  };

  const unsafeSubscriber = createNativePushSubscriber({
    supabaseClient: fakeSupabase3,
    pushNotifications: fakePush2,
    isNativePlatform: () => true,
    getUserAgent: () => 'test-agent',
    isNotificationEligibleRole: () => true,
  });

  // Trigger register exception path (logs fixed message only).
  await unsafeSubscriber();

  if (!regCb2 || !regErrCb2) throw new Error('CASE E: listeners not attached');

  // Trigger registration persistence and registration-error callbacks.
  regCb2({ value: SENTINELS[0] });
  regErrCb2({ value: SENTINELS[0], session: { access_token: SENTINELS[1] } });
  await new Promise(r => setTimeout(r, 30));

  const flat = JSON.stringify(captured);
  for (const sentinel of SENTINELS) {
    if (flat.includes(sentinel)) throw new Error('CASE E: secret sentinel leaked to console: ' + sentinel[0] + '...');
  }
} finally {
  console.log = originalLog;
  console.warn = originalWarn;
  console.error = originalError;
}

console.log('Native push lifecycle executable: PASS');
`;

fs.writeFileSync(runtimeTestFile, runtimeTest);
try {
  execSync(`node --experimental-transform-types "${runtimeTestFile}"`, { cwd: __dirname, stdio: 'inherit' });
} finally {
  try { fs.unlinkSync(runtimeTestFile) } catch {}
}

console.log('RAOS hybrid push (Web + FCM) contract: PASS')
