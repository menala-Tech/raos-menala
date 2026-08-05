---
name: raos-push-notification
description: Push Notification RAOS (Web Push VAPID, BUKAN Firebase/FCM) — Edge Function raos-send-push v5 dengan filter kategori (master, scan_berhasil, scan_pending, validasi_koordinator, pengingat_absen, pengumuman, chat_room), RPC raos_dispatch_push SECURITY DEFINER + search_path=public,extensions,vault pakai raos_service_role_key dari vault (WAJIB sb_secret_* bukan JWT legacy), tabel push_subscriptions, VAPID env RAOS_VAPID_* prefix (isolate dari PWA lain shared Supabase), SW handler public/sw-push.js dengan requireInteraction+vibrate, useAutoPushSubscribe hook di AppShell (auto-heal push_subscriptions=0), trigger otomatis chat_messages + raos_attendance + saldo processed. Gunakan skill ini setiap kali menulis fitur baru yang butuh push, debug notif tidak sampai, filter kategori, atau setup Edge Function baru.
---

# Push Notification — RAOS (Web Push VAPID)

## Prinsip

Full stack Web Push standard. **JANGAN pakai Firebase/FCM**. Pattern mengikuti isi-saldo.

## Env & Secrets

**Vercel:**
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (public, aman di-embed client)

**Supabase Edge Function secrets:**
- `RAOS_VAPID_PUBLIC_KEY`
- `RAOS_VAPID_PRIVATE_KEY`
- `RAOS_VAPID_SUBJECT`

**Prefix `RAOS_` — isolate** dari PWA lain yang share Supabase project (mereka pakai `VAPID_*` tanpa prefix untuk keypair sendiri).

**Supabase Vault:**
- `raos_service_role_key` — WAJIB format `sb_secret_*` (BUKAN JWT legacy `eyJhbGci...`) — untuk DB trigger yang panggil Edge Function via `pg_net` HTTP

SET via SQL editor (bukan direct UPDATE ke `vault.secrets` yang di-blok):
```sql
SELECT vault.update_secret(
  (SELECT id FROM vault.secrets WHERE name = 'raos_service_role_key'),
  'sb_secret_XXXXXXXXXX',
  'raos_service_role_key',
  'Secret API key untuk RPC raos_dispatch_push'
);
```

## Komponen

**Tabel `push_subscriptions`** (migration `raos_029`):
- RLS: user CRUD own, admin/mgmt/direksi read all

**Edge Function `raos-send-push` v5 ACTIVE** (verify_jwt=true):
- Payload: `{user_ids[], title, body, url, tag, kategori}`
- Role guard admin/mgmt/direksi — kecuali caller service_role (bypass untuk system trigger)
- Baca `body.kategori` → query `user_profiles.notification_prefs` → skip yang `master=false` atau `[kategori]=false`
- Response `filtered_out` count untuk debugging

**Auth pattern Edge Function (WAJIB):**
```ts
const userClient = createClient(SUPABASE_URL, ANON_KEY, {
  global: { headers: { Authorization: authHeader } }
})
await userClient.auth.getUser()  // tanpa argumen
```
**JANGAN** pakai `admin.auth.getUser(token)` — bug "Auth session missing!".

**SW handler `public/sw-push.js`** — inject via `next.config.js`:
```js
workboxOptions.importScripts: ['/sw-push.js']
```
`showNotification` dengan `requireInteraction: true` + `vibrate: [200,100,200,100,500]` supaya muncul di lock screen Android/iOS + suara + getar.

**Client `lib/push.ts`:**
- `subscribePush()` — pakai `getSession()` konsisten (BUKAN `getUser()` yang bisa timeout Auth server)
- `unsubscribePush()`
- `isPushSupported()`

Toggle master Notifikasi di Settings panggil ini.

**Client `lib/pushClient.ts`:**
- `invokePush({user_ids, title, body, url, tag})` fire-and-forget dari admin/koord/direksi PWA (staff biasa 403)

**RPC `public.raos_dispatch_push(user_ids[], title, body, url, tag, p_kategori text DEFAULT NULL)`:**
- SECURITY DEFINER + `SET search_path=public,extensions,vault`
- Baca `vault.decrypted_secrets` name=`'raos_service_role_key'`
- Panggil Edge Function via `net.http_post`
- Dipakai DB trigger

## Filter Kategori (7 field di user_profiles.notification_prefs)

Migration `raos_033`:
- `master` — kill switch
- `scan_berhasil`
- `scan_pending`
- `validasi_koordinator`
- `pengingat_absen`
- `pengumuman`
- `chat_room`

**Mapping call site → kategori** (RULE_PROJECT.md §5.5):
- `/admin` validate scan → `'scan_berhasil'`
- GAS reminder masuk/pulang → `'pengingat_absen'`
- GAS `notifyPendingScansKoordinator` → `'validasi_koordinator'`
- DB trigger `chat_messages` → `'chat_room'`
- Test push admin → SKIP kategori (bypass filter)

**End-to-end verified:** filter ON → send terkirim. Filter OFF → `filtered_out=1` (no send).

## Trigger Otomatis Aktif

Migration `raos_030/031/032`:
- `trg_raos_notify_new_chat_message` AFTER INSERT `chat_messages` → push ke semua member room lain (broadcast chat, preview per type)
- `trg_raos_broadcast_absensi_to_chat` AFTER INSERT/UPDATE `raos_attendance` → post pesan WA-style ke room 'Absensi' (chain: pesan chat → push notif ke member room Absensi)
- `raos_saldo_after_processed` BEFORE UPDATE saat `is_processed` false→true dispatch push staff + auto-chat "Terima kasih..." ke room driver cabang

## Trigger dari Client PWA

- `/admin validateScan` → `invokePush` ke `scan.staff_id` (notif divalidasi/ditolak)

## Trigger Cron GAS (via `invokePushFromGas_` pakai service_role)

- `reminderShiftDispatcher` — tiap 5 menit, cek WIB clock vs 6 target time (06:30/14:30/22:30 masuk + 15:00/23:00/07:00 pulang). Dedup Script Properties cache per hari.
- `notifyPendingScansKoordinator` — tiap 15 menit. Scan pending >15m → push ke koord/admin/mgmt/direksi.

## Auto-heal Push Subscriptions (Sesi 21)

**Root cause:** default `notifMaster: true` di localStorage bikin toggle terlihat aktif tanpa pernah panggil `subscribePush()`.

**Fix:** hook `useAutoPushSubscribe()` di AppShell — kalau permission granted + `notifMaster !== false` + belum ada sub → auto call `subscribePush()` diam-diam. Guard sessionStorage `raos_push_heal_v1`.

File: `apps/pwa/src/lib/useAutoPushSubscribe.ts`.

## Reminder Absensi 6 Waktu per Shift

**AppPrefs:** `reminderPagi/Siang/Malam` objek `{masuk, pulang}` (bukan `reminderMasuk/Pulang` flat lama).

**Default:**
- Pagi 06:30 / 15:00
- Siang 14:30 / 23:00
- Malam 22:30 / 07:00

**UI Settings > Notifikasi:** 3 group per shift (🌅☀️🌙) × 2 time input.

**GAS:** 6 fungsi `reminderMasuk/Pulang{Pagi/Siang/Malam}` + dispatcher `reminderShiftDispatcher` tiap 5 menit. Backward-compat alias `kirimReminderAbsensi/kirimReminderPulang` tetap ada.

Alasan pakai dispatcher (bukan 6 cron `atHour`): GAS `ScriptApp` hanya support jam bulat. Dispatcher granular per-menit + dedup cache.

## PENTING

Kalau bikin fitur baru yang butuh push:
- **JANGAN buat Edge Function baru** — pakai `raos-send-push` yang sudah ada
- Kalau butuh dari client staff biasa (role_not_allowed), pakai DB trigger + RPC `raos_dispatch_push` (bypass role via service_role di vault)
