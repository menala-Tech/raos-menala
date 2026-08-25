const fs = require('node:fs')
const path = require('node:path')
const { execSync } = require('node:child_process')
const assert = require('node:assert/strict')

const root = path.resolve(__dirname, '..')
const repoRoot = path.resolve(root, '..', '..')

function read(...parts) {
  return fs.readFileSync(path.join(...parts), 'utf8')
}

const manifest = read(repoRoot, 'apps/pwa/android/app/src/main/AndroidManifest.xml')
const mainActivity = read(repoRoot, 'apps/pwa/android/app/src/main/java/com/rifim/raos/MainActivity.java')
const chat = read(root, 'src/app/chat/page.tsx')
const composer = read(root, 'src/components/workspace/WorkspaceComposer.tsx')
const quick = read(root, 'src/components/workspace/WorkspaceQuickAction.tsx')
const micBridge = read(root, 'src/lib/nativeMicrophoneBridge.ts')
const androidSettings = read(root, 'src/lib/nativeAndroidSettings.ts')
const trigger = read(repoRoot, 'sql/raos_113_chat_push_trigger_attach.sql')
const channels = read(repoRoot, 'apps/pwa/android/app/src/main/java/com/rifim/raos/notification/RaosNotificationChannels.kt')

// Microphone permission declared and recorded in main activity.
assert.match(manifest, /android\.permission\.RECORD_AUDIO/)
assert.match(manifest, /android\.permission\.MODIFY_AUDIO_SETTINGS/)
assert.doesNotMatch(manifest, /android\.permission\.READ_PHONE_STATE/)
assert.doesNotMatch(manifest, /android\.permission\.READ_CALL_LOG/)
assert.doesNotMatch(manifest, /android\.permission\.READ_CONTACTS/)
assert.doesNotMatch(manifest, /android\.permission\.BLUETOOTH/)
assert.doesNotMatch(manifest, /android\.permission\.SCHEDULE_EXACT_ALARM/)
assert.match(mainActivity, /RaosMicrophoneBridgePlugin/)
assert.match(mainActivity, /RaosAndroidSettingsBridgePlugin/)
assert.match(mainActivity, /RaosNotificationChannels\.createAll/)

// Android debug builds may opt into a preview URL, while default stays production.
// We spawn a fresh Node process per case to avoid ESM module cache and to fully
// exercise the real config logic.
function resolveServerUrl(envValue) {
  const env = { ...process.env }
  if (envValue === undefined) {
    delete env.RAOS_ANDROID_SERVER_URL
  } else {
    env.RAOS_ANDROID_SERVER_URL = envValue
  }
  const out = execSync(
    'node --experimental-transform-types --input-type=module --eval "import config from \'./capacitor.config.ts\'; console.log(config.server.url)"',
    { cwd: root, env, stdio: 'pipe', encoding: 'utf8' }
  )
  return out.trim()
}

const defaultUrl = resolveServerUrl(undefined)
assert.strictEqual(defaultUrl, 'https://raos-menala.vercel.app')

const previewUrl = resolveServerUrl('https://example-preview.invalid')
assert.strictEqual(previewUrl, 'https://example-preview.invalid')

// Chat page wires mic permission bridge and photo capture.
assert.match(chat, /getMicrophonePermissionStatus/)
assert.match(chat, /requestMicrophonePermission/)
assert.match(chat, /openMicrophoneAppSettings/)
assert.match(chat, /handleCapturePhoto/)
assert.match(chat, /openCameraAppSettings/)
assert.match(chat, /cameraInputRef/)

// Composer exposes a native-camera file input and a reachable attachment menu.
assert.match(composer, /capture="environment"/)
assert.match(composer, /cameraInputRef/)
assert.match(composer, /onCapturePhoto/)
assert.match(quick, /onOpenAttachmentMenu/)
assert.match(quick, /Paperclip/)
assert.match(composer, /attachmentMenuOpen/)
assert.match(composer, /chooseCamera/)
assert.match(composer, /chooseFile/)
assert(composer.includes('<Camera size={18} />'), 'camera icon in attachment menu missing')

// Microphone bridge contract exists.
assert.match(micBridge, /getMicrophonePermissionStatus/)
assert.match(micBridge, /requestMicrophonePermission/)
assert.match(micBridge, /openMicrophoneAppSettings/)

// Consolidated Android settings bridge exposes only real app/notification
// settings actions; sensitive capabilities are not silently requested.
assert.match(androidSettings, /openAndroidNotificationSettings/)
assert.match(androidSettings, /openAndroidChatNotificationSettings/)
assert.match(androidSettings, /requestAndroidNotificationPermission/)

// Chat push trigger is attached idempotently.
assert.match(trigger, /DROP TRIGGER IF EXISTS trg_raos_notify_new_chat_message ON public\.chat_messages/)
assert.match(trigger, /CREATE TRIGGER trg_raos_notify_new_chat_message/)
assert.match(trigger, /AFTER INSERT ON public\.chat_messages/)
assert.match(trigger, /EXECUTE FUNCTION public\.raos_notify_new_chat_message\(\)/)

// Native notification channels for chat and reminders.
assert.match(channels, /raos_chat/)
assert.match(channels, /raos_operational/)
assert.match(channels, /raos_calls/)

console.log('Mobile chat + media + notification foundation: PASS')
