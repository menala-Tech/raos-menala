const fs = require('node:fs')
const path = require('node:path')
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
assert.match(mainActivity, /RaosNotificationChannels\.createAll/)

// Chat page wires mic permission bridge and photo capture.
assert.match(chat, /getMicrophonePermissionStatus/)
assert.match(chat, /requestMicrophonePermission/)
assert.match(chat, /handleCapturePhoto/)
assert.match(chat, /cameraInputRef/)

// Composer exposes a native-camera file input and camera quick-action.
assert.match(composer, /capture="environment"/)
assert.match(composer, /cameraInputRef/)
assert.match(composer, /onCapturePhoto/)
assert.match(quick, /onCapturePhoto/)
assert(quick.includes('<Camera size={20} />'), 'camera icon quick action missing')

// Microphone bridge contract exists.
assert.match(micBridge, /getMicrophonePermissionStatus/)
assert.match(micBridge, /requestMicrophonePermission/)
assert.match(micBridge, /openMicrophoneAppSettings/)

// Chat push trigger is attached idempotently.
assert.match(trigger, /DROP TRIGGER IF EXISTS trg_raos_notify_new_chat_message ON public\.chat_messages/)
assert.match(trigger, /CREATE TRIGGER trg_raos_notify_new_chat_message/)
assert.match(trigger, /AFTER INSERT ON public\.chat_messages/)
assert.match(trigger, /EXECUTE FUNCTION public\.raos_notify_new_chat_message\(\)/)

// Native notification channels for chat and reminders.
assert.match(channels, /raos_chat/)
assert.match(channels, /raos_reminders/)

console.log('Mobile chat + media + notification foundation: PASS')
