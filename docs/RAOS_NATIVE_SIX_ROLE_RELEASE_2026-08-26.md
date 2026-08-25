# RAOS Native Six-Role Release — 2026-08-26

## Release identifiers

| Item | Value |
|---|---|
| PR | [#122](https://github.com/menala-Tech/raos-menala/pull/122) — "RAOS: finalize six-role native Android release" |
| Merge commit | `6d89aa8ddd441f93759a21a44e8dfdd9f32d3879` |
| Final `main` SHA | `6d89aa8ddd441f93759a21a44e8dfdd9f32d3879` |
| Production deployment ID | `dpl_5iD4E4w8SVooQYcnfcpnQKPX9KkS` |
| Production URL | https://raos-menala.vercel.app |
| Vercel project | `raos-menala` (`prj_HMJQFxTfF6s9bhTJeT1W0iSqCdCj`) |

## Six role package IDs

| Role | Package | App display name |
|---|---|---|
| Admin | `com.rifim.raos.admin` | RAOS Admin |
| Koordinator | `com.rifim.raos.koordinator` | RAOS Koordinator |
| Staff | `com.rifim.raos.staff` | RAOS Staff |
| Driver | `com.rifim.raos.driver` | RAOS Driver |
| Direksi | `com.rifim.raos.direksi` | RAOS Direksi |
| Management | `com.rifim.raos.management` | RAOS Management |

Verified directly against the built APKs via `aapt dump badging`/`permissions` (package name, app label, launcher icon path, permission set) — not just source inspection.

## Final APK locations

`C:\MENALA\RAOS-APK-RELEASE-FINAL\`
- `RAOS-Admin-FINAL.apk`
- `RAOS-Koordinator-FINAL.apk`
- `RAOS-Staff-FINAL.apk`
- `RAOS-Driver-FINAL.apk`
- `RAOS-Direksi-FINAL.apk`
- `RAOS-Management-FINAL.apk`

Debug-signed, ~11.5MB each. Not committed to git (binaries are gitignored by policy).

## Role-specific icons and app names

Each flavor has its own launcher icon (Menala M mark + gold banner with the role name, e.g. "ADMIN", "KOORDINATOR") generated at all 5 standard mipmap densities under `apps/pwa/android/app/src/<flavor>/res/mipmap-*/ic_launcher{,_round}.png` — a standard Gradle flavor-specific resource override, no shared `main/res` asset touched. Generator: `apps/pwa/scripts/generate-android-role-launcher-icons.js`. App display name is set per flavor in `apps/pwa/android/app/build.gradle` (`resValue "string","app_name","RAOS <Role>"`).

## Cloud-first update policy

RAOS operates cloud-first from this release forward:

**Does NOT require an APK rebuild** (flows through GitHub → Vercel → Supabase, consumed automatically by all six installed apps): UI/dashboard/menu changes, KPI logic, payroll UI/logic, finance UI/logic, schedule UI, target logic, barcode/order logic, saldo logic, API changes, Supabase RPC/view/table/RLS changes, role-access logic inside the PWA, ordinary bug fixes, and any notification logic that is purely web/PWA/server-side.

**DOES require an APK rebuild**: Kotlin/Java native source changes, AndroidManifest permission changes, Capacitor native plugin changes, native WorkManager behavior changes, native notification channel changes, launcher icon changes, app display name changes, package/application ID changes, signing configuration changes, native deep-link implementation changes, or any other code that physically ships inside the APK.

## Native capabilities carried in this release

- FCM push registration + hybrid Web/native push (`nativePush.ts`, `nativePushLifecycle.ts`, `supabase/functions/raos-send-push/fcm.ts`)
- `RaosNotificationChannels` — incl. the `RAOS Jadwal Kerja` schedule-reminder channel and the chat channel
- `RaosAndroidSettingsBridgePlugin` — native Android settings bridge
- `RaosWorkReminderBridgePlugin` / `RaosWorkReminderScheduler` / `RaosWorkReminderWorker` — WorkManager-based Staff work reminders, gated strictly to `role === 'staff'` (verified in `useNativeWorkReminderSync.ts`; no other role receives reminders)
- Camera + microphone bridges
- Weekly (P/S/M/-) schedule UI (`WeeklyScheduleTab.tsx`)
- Supabase migrations `raos_114_push_subscriptions_fcm.sql` and `raos_115_push_subscriptions_fcm_runtime_fix.sql` — push-subscription infrastructure, already part of the reviewed native-push lineage, not newly applied by this release

## Firebase / google-services.json handling

`google-services.json` (with all six client package IDs registered) exists locally at `apps/pwa/android/app/google-services.json`, is git-ignored, and was never committed. It must be present locally for any future native rebuild; it is not part of the repository.

## Security / permission summary

- `AndroidManifest.xml`: `INTERNET`, `ACCESS_NETWORK_STATE`, `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`, `ACCESS_BACKGROUND_LOCATION` (background-location feature), `CAMERA`, `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS`, `FOREGROUND_SERVICE` (+`_LOCATION`), `POST_NOTIFICATIONS`. No `SCHEDULE_EXACT_ALARM`. `RECEIVE_BOOT_COMPLETED`/`WAKE_LOCK`/`com.google.android.c2dm.permission.RECEIVE` are transitively merged in by the WorkManager and FCM libraries respectively (needed for reminder rescheduling after reboot and push delivery) — not explicitly requested by app code, confirmed via `aapt dump permissions` on the built APKs.
- `capacitor.config.ts`: production server URL only (`https://raos-menala.vercel.app`), `cleartext: false`, `allowMixedContent: false` — confirmed both in source and embedded in the built APKs.
- No secrets, tokens, or `google-services.json` committed to git at any point in this release.

## Physical acceptance

Not yet performed as of this document. The six APKs above are ready for install on a physical device for final human acceptance testing.
