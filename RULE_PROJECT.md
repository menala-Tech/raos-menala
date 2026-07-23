# RULE_PROJECT.md — RAOS

Aturan operasional & konvensi kode yang **wajib** dipatuhi setiap sesi
Claude Code (atau developer manusia) yang menyentuh proyek RAOS.

Berbeda dari `STATUS.md` (kronologi per sesi) dan `CLAUDE.md` (panduan
teknis + state fitur). File ini murni **rule book**: aturan yang tidak
berubah lintas sesi, hanya bertambah kalau ada policy baru.

Update terakhir: **2026-07-23 (akhir sesi 14 dinihari-pagi — push notif live)**

---

## 1. Sumber Data Wajib (SSoT) — Lintas PWA RIFIM

Referensi lengkap: `C:\Projects\menala\SSOT_DATA_SOURCES.md`. Ringkasan
untuk RAOS:

### 1.1 Staff — MASTER DATA STAFF
- Spreadsheet: `1fcraq3QHqIaD-13Ebzt6stT9aA6j_loTXeAtpNX12kw`, tab
  **"MASTER DATA STAFF"**.
- Filter RAOS: kolom D `ID CABANG = "ID Rifim Airport Soeta"`. Cabang lain
  BUKAN urusan RAOS.
- Arah sync: **satu-arah** Google Sheets → Supabase `user_profiles`, via
  `gas/13_staff_sync.gs` (`syncStaffFromSSOT`), trigger 1 jam.
- Kolom SSoT (`full_name`, `role`, `phone`, `staff_id`) di-refresh tiap
  sync. Trigger DB `prevent_ssot_staff_column_edit` blok edit kolom-kolom
  ini dari client — hanya bisa diubah di sheet. Service role (GAS)
  di-bypass.
- PIN (kolom H sheet) → password Supabase Auth. Login pakai email + PIN.
- Kolom RAOS-only (`branch_id` = Terminal T1/T2/T3, `avatar_url`,
  `is_active`) TIDAK ada di sheet. Sync tidak mengisi/menimpa. Admin set
  manual via `/admin`.
- Baris `source = 'manual'` (mis. akun admin awal) tidak pernah disentuh
  sync.
- Staff `ssot_master_staff` yang hilang dari sheet → `is_active=false`
  (soft-delist), TIDAK DELETE (jaga FK ke `scan_orders`/`raos_attendance`).

### 1.2 Driver Airport — Database Driver Airport
- Spreadsheet: `1FEZxyHPx_GCQKw92hLSf6QxxkXgZn5R1sRswOYM_Tlc`.
- RAOS hanya tarik tab **"ID Rifim Airport Soeta"**.
- Arah sync: satu-arah Sheets → Supabase `raos_drivers` via
  `gas/12_driver_airport_sync.gs` (`syncDriverAirportFromSSOT`), trigger
  6 jam.
- Kolom SSoT (`driver_id`, `name`, `is_active`) di-refresh tiap sync.
- Kolom RAOS-only (`phone`, `vehicle_type`, `vehicle_plate`, `barcode`,
  `branch_id`) tidak disentuh. Admin lengkapi via `/admin` atau `/drivers`.
- Baris `source = 'manual'` tidak disentuh sync.

### 1.3 LARANGAN keras
- **DILARANG** bikin sheet/tab/file spreadsheet baru sebagai "database
  staff" atau "database driver" untuk RAOS.
- **DILARANG** ubah kolom SSoT (`full_name`/`role`/`phone`/`staff_id` di
  user_profiles; `name`/`driver_id`/`is_active` di raos_drivers) dari
  PWA client.
- **DILARANG** bikin CRUD staff/driver di `/admin` untuk kolom SSoT
  (pelanggaran sesi 13 sudah di-rollback sesi 14).

---

## 2. Boundary Tabel Supabase (Shared Project)

Supabase project `vlievtojpmrbsmzlqswl` dipakai proyek lain juga. Aturan
pemisahan:

### 2.1 Tabel MILIK PROYEK LAIN — JANGAN DISENTUH sama sekali
Bahkan JANGAN tambah kolom, JANGAN INSERT, JANGAN edit RLS:
- `drivers` (bukan `raos_drivers`) — HR/vendor legacy
- `employees`, `employee_contracts`
- `attendance` (bukan `raos_attendance`) — HR payroll
- `leave_requests`, `leave_balances`, `payroll`
- `users` (bukan `user_profiles`)
- Function `cleanup_old_saldo_events` (milik proyek isi-saldo)

### 2.2 Tabel MILIK RAOS
Aman dipakai & di-extend:
- `user_profiles`, `raos_drivers`, `raos_attendance`, `scan_orders`,
  `branches`, `pickup_points`, `shifts`, `kpi_targets`
- `chat_rooms`, `chat_messages`, `chat_room_members`,
  `chat_message_attachments`, `chat_message_reactions`, `chat_polls`,
  `chat_poll_votes`, `raos_chat_room_reads`
- `activity_logs`, `system_logs`, `notifications`, `system_config`

### 2.3 Sebelum reuse tabel apapun
Cek dulu skema kolom (`information_schema.columns`). Kalau ada kolom
gaya lain (mis. `employee_id text` bukan `staff_id uuid`), itu tanda
tabel milik proyek lain. Bikin tabel baru berprefix `raos_` alih-alih
extend.

---

## 3. Storage Google Drive

Referensi: bagian "Lokasi Penyimpanan Google Drive" di `CLAUDE.md`.
Ringkasan folder resmi:

- **Foto Absensi Selfie**: `1Aq-tMtVm89krrt1WNSpEy9k_cxAlsTfh` →
  `[Pickup Point]/[Bulan]/`. Sync otomatis via `gas/11_drive_sync.gs`
  tiap 30 menit dari Supabase Storage bucket `selfies`.
- **File Spreadsheet RAOS**: `1o9PTsBtN7eb8U4xLyWe3zq1nQXufm_oL`.
- **Backup Bulanan**: `1i_gSb1iCq9gV2qvxbsCxDcndp_28jMUA` → subfolder
  Spreadsheet / Laporan PDF / Database (belum aktif).

**DILARANG** bikin folder baru di lokasi lain sebagai penyimpanan resmi
RAOS. Kalau butuh subfolder baru untuk bulan/tahun berikutnya, biarkan
GAS `getOrCreateSubfolder()` buat otomatis, jangan manual.

---

## 4. Kredensial & Kunci

- **`SUPABASE_SERVICE_ROLE_KEY` DI PWA = TIDAK DIPAKAI** (post sesi 14
  rollback). Kalau ada di `.env.local`/Vercel env vars, hapus.
- **`SUPABASE_SERVICE_KEY` DI GAS Script Properties** = wajib untuk
  buat auth user via `/auth/v1/admin/users` (sync SSoT staff). Rahasia,
  jangan commit.
- **`.env.local`** wajib di `.gitignore`. Hanya boleh berisi:
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- **Password admin awal `Menala2026!`** = HARUS diganti setelah login
  pertama (pending sesi 15).
- **SMTP Gmail** aktif untuk magic link + reset PIN. App Password
  disimpan di Supabase Auth Settings (bukan di repo).
- **VAPID keypair Web Push** (sesi 14 dinihari 23 Juli):
  - Vercel env `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (public, aman)
  - Supabase Edge Function Secrets `RAOS_VAPID_PUBLIC_KEY`,
    `RAOS_VAPID_PRIVATE_KEY`, `RAOS_VAPID_SUBJECT` (prefix RAOS_ WAJIB
    supaya tidak konflik dengan `VAPID_*` PWA lain di project Supabase
    yang sama)
  - Vault secret `raos_service_role_key` untuk RPC `raos_dispatch_push`
    yang panggil Edge Function dari DB trigger. SET via Vault UI Dashboard,
    BUKAN SQL insert (permission `_crypto_aead_det_noncegen` denied).
  - Pair public key di Vercel HARUS MATCH private key di Supabase Secrets.
    Kalau tidak match, push subscribe di client sukses tapi Edge Function
    signing fail (401 dari FCM/push service).

---

## 5. Konvensi Kode Frontend

### 5.1 Wajib
- Semua halaman utama pakai `sticky top-0 z-30` di header supaya tidak
  ikut scroll.
- BottomNav: 4 tab + center FAB Scan (elevated). Jangan ganti balik ke
  5-tab flat.
- Modal bottom-sheet di halaman ber-BottomNav: pakai
  `paddingBottom: 'calc(96px + env(safe-area-inset-bottom))'` di
  container scroll — jangan `p-6` flat. Tanpa ini tombol CTA bawah
  ketutup BottomNav 90px.
- Realtime Supabase: tabel harus di-`ALTER PUBLICATION supabase_realtime
  ADD TABLE` dulu sebelum bisa subscribe. Sudah publish: `chat_messages`,
  `chat_message_reactions`, `chat_polls`, `chat_poll_votes`.
- PostgREST embed FK: kalau tabel punya >1 FK ke tabel yang sama (mis.
  `chat_messages.sender_id` + `chat_messages.pinned_by` sama-sama ke
  `user_profiles`), WAJIB eksplisit FK name:
  `user_profiles!chat_messages_sender_id_fkey(...)`.
- Komponen kamera / long-lived resource: callback prop (mis. `onDetected`)
  disimpan di `ref`, useEffect start/stop hanya depend ke state yang
  benar-benar butuh restart. Pola `useRef(onCb); useEffect(() => { ref.current = onCb })`.
- Modal Edit untuk data SSoT: field kolom SSoT (nama/role/HP/staff_id)
  di-disable dengan banner peringatan "harus diubah di sheet". Hanya
  kolom RAOS-only (branch_id, is_active) yang editable.

### 5.2 Larangan
- ESLint rule `react-hooks/set-state-in-effect` di-OFF project-level
  (Next 16 baru). Jangan reaktifkan tanpa refactor semua efek fetch-data.
- Jangan hardcode credential di kode. Pakai `.env.local` atau
  Supabase Secrets.
- Jangan import `lib/supabaseAdmin.ts` (sudah dihapus sesi 14) atau
  bikin ulang. Service role tidak dipakai di PWA lagi.
- Jangan attach touch/mouse listener ke `document` di komponen wrapper
  (mis. SwipeBackWrapper) — pakai `containerRef.current` supaya nested
  wrapper tidak double-fire.
- Jangan pakai `pattern` HTML strict di input password/PIN — cegah admin
  manual dengan password alfanumerik terblokir. `inputMode="numeric"` OK
  (hanya hint keypad, tidak validasi).

### 5.3 Component conventions
- Import `MenalaLogo` dari `@/components/MenalaLogo`. Prop `showText`
  default true. Prop `tone` default `onNavy` (teks putih). Untuk surface
  bg terang pakai `tone="onLight"`.
- Import `DateTimeHeader` dari `@/components/DateTimeHeader` untuk chip
  tanggal+jam realtime. Prop `compact` untuk kanan atas header.
- Import `DateTimeStack` dari `@/components/DateTimeHeader` (bukan default)
  untuk kotak vertikal tanggal atas + jam bold + WIB bawah. Dipakai di
  header dashboard/scan/chat/riwayat/absensi (tone onNavy).
- Import `MiniCalendar` dari `@/components/MiniCalendar` — grid bulanan
  dengan highlight hari ini.
- Import `OnlineStatusBanner` sudah otomatis wrap AppShell — banner top
  reactive ke `navigator.onLine`.

### 5.4 Push Notification (Web Push VAPID, bukan Firebase)
- Kalau butuh trigger push dari client PWA (admin/koord/direksi only):
  `import { invokePush } from '@/lib/pushClient'`. Fire-and-forget.
- Kalau butuh trigger push dari client staff biasa (mis. mention chat):
  JANGAN pakai `invokePush` (akan 403). Pakai DB trigger + RPC
  `raos_dispatch_push` (bypass role via service_role di vault).
- Kalau butuh trigger dari GAS cron: pakai helper `invokePushFromGas_`
  di `gas/02_absensi.gs` (auto pakai `CONFIG.SUPABASE_KEY` service role
  → bypass role di Edge Function).
- JANGAN buat Edge Function push baru — pakai `raos-send-push` yang
  sudah ada. Kalau butuh custom payload structure, extend payload di
  client dan handle di SW `public/sw-push.js`.
- SW push handler `showNotification` HARUS include: `requireInteraction:
  true` + `vibrate: [...]` + `tag` + `data: {url}` supaya konsisten dengan
  lock-screen behavior yang diharapkan user.

---

## 6. Konvensi GAS

- `CONFIG.SHEETS.DB_STAFF` (sheet lokal DATABASE STAFF di spreadsheet
  RAOS) **sudah tidak dipakai** sebagai sumber staff (post-SSoT sesi 14).
  Semua akses staff pakai Supabase `user_profiles?is_active=eq.true`.
- Menu "Isi Data Mock Driver" & "Import Driver ke Supabase" di
  `10_menu.gs` HIDDEN sejak sesi 14. Fungsi masih ada di `03_order.gs`
  untuk debug manual dari script editor, tapi TIDAK BOLEH dipakai
  operasional (bisa buat baris duplikat dengan hasil sync SSoT).
- Trigger operasional yang HARUS aktif (setelah setiap perubahan
  `setupAllTriggers`, jalankan ulang):
  - `importAbsensiFromSupabase` — 30 menit
  - `importOrderFromSupabase` — 1 jam
  - `syncSelfiePhotosToGDrive` — 30 menit
  - `syncDriverAirportFromSSOT` — 6 jam
  - `syncStaffFromSSOT` — **1 jam** (baru sesi 14)
  - `pushDashboardToSupabase` — 15 menit
  - `reminderShiftDispatcher` — tiap 5 menit (dispatcher 6 waktu reminder
    per shift, sesi 14 pagi 23 Juli). Menggantikan `kirimReminderAbsensi`
    single trigger. Alias `kirimReminderAbsensi/kirimReminderPulang` tetap
    ada untuk backward-compat.
  - `notifyPendingScansKoordinator` — tiap 15 menit (F, sesi 14 dinihari)
  - `updateAllKpiThisMonth` — jam 22:00 harian (BROKEN sampai KPI refactor)
  - `kirimLaporanHarianAdmin` — jam 21:00 harian
  - `backupHarian` — jam 02:00 harian
  - `autoHapusRiwayatLama` — tanggal 2 tiap bulan jam 01:00

### 6.1 Helper GAS untuk push notification (sesi 14 dinihari)
- `invokePushFromGas_(userIds, title, body, url, tag)` di `02_absensi.gs`
  — panggil Edge Function `raos-send-push` pakai `CONFIG.SUPABASE_KEY`
  (service_role, bypass role check). Return `{sent, failed, total}`.
- Kalau tambah reminder/notif baru dari GAS, pakai helper ini.
  JANGAN direct fetch ke Edge Function tanpa helper (kehilangan error
  handling + log ke LOG SISTEM).

---

## 7. Commit & Deploy

- Commit format: `feat(scope): deskripsi` / `fix(scope): deskripsi` /
  `docs(scope): deskripsi` / `perf(scope): deskripsi`.
- Selalu update `STATUS.md` setelah sesi selesai (rangkuman komit).
- Test fitur di browser sebelum lapor selesai. Untuk UI change, jangan
  cuma andalkan build pass — verifikasi visual di HP (screenshot).
- **PWA Service Worker `skipWaiting: true`** sudah aktif sejak sesi 14.
  Update code otomatis take-over setelah refresh. First-time upgrade
  butuh clear cache PWA sekali (long-press icon → Info aplikasi → Hapus
  data) karena SW lama belum tahu skipWaiting.
- Kalau push GAS, WAJIB `clasp push` dari folder `gas/` lokal
  supaya script editor sinkron. Jangan edit langsung di script editor
  (akan overwrite lokal saat push berikutnya).

---

## 8. Migration Naming

- Prefix `raos_XXX_snake_case_description` (mis. `raos_022_staff_ssot_sync_columns`).
- Nomor urut kontinyu — cek `list_migrations` sebelum pilih nomor baru.
- Migration terakhir per sesi 14: `raos_024`.
- Migration selalu idempotent (`CREATE OR REPLACE`, `DROP IF EXISTS`,
  `ADD COLUMN IF NOT EXISTS`).
- Fungsi SECURITY DEFINER wajib `SET search_path = public` di body.
- Fungsi yang di-panggil dari client authenticated: `REVOKE ALL FROM
  PUBLIC` + `GRANT EXECUTE TO authenticated`.
- Fungsi yang hanya boleh service_role (GAS): tambahan check
  `IF auth.role() <> 'service_role' THEN RAISE EXCEPTION ...` di body.

---

## 9. Boundary Fitur Antar-Halaman

- `/admin` = validasi scan pending + edit staff (branch_id/is_active saja)
  + link ke `/admin/barcodes`.
- `/admin/barcodes` = generator QR code driver (jangan pindah ke `/drivers`,
  tetap sub-route admin karena role-gated).
- `/drivers` = view daftar driver + edit kolom RAOS-only (phone, vehicle,
  barcode, branch_id) + tombol Tambah Driver (untuk driver non-SSOT) +
  shortcut QR ke `/admin/barcodes`.
- `/chat` list view = wrapped `<AppShell>` (BottomNav tampil).
- `/chat` room view (activeRoom truthy) = TIDAK wrapped AppShell (chat
  full screen, BottomNav hilang). Swipe back kembali ke list, bukan
  dashboard.
- `/kpi`, `/laporan`, `/status` = role-gated (admin/koordinator/direksi).

---

## 10. Escalation & Klarifikasi

Kalau sesi berikutnya ragu tentang salah satu aturan di atas, atau
menemukan konflik antara STATUS/CLAUDE/RULE_PROJECT:

1. **RULE_PROJECT.md** (file ini) menang untuk aturan operasional.
2. **CLAUDE.md** menang untuk teknis kode & state fitur.
3. **STATUS.md** murni kronologi — tidak dipakai sebagai rule.
4. **`SSOT_DATA_SOURCES.md` (root workspace)** menang mutlak untuk
   aturan sumber data staff/driver.

Kalau tetap ragu → konfirmasi ke user sebelum coding, jangan asumsi.
