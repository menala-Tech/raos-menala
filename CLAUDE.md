# CLAUDE.md — RAOS Project
*Panduan Claude Code untuk proyek RAOS*

## Lokasi Lokal (setelah relokasi 2026-07-18)
```
C:\Projects\menala\
├── RAOS\          ← git repo ini (working dir: RAOS\apps\pwa)
├── .claude\       ← Claude Code project config (launch.json, settings.local.json)
├── docs\          ← dokumen referensi & prompt AI
└── assets\        ← brand assets (logo, mockup, screenshot)
```

## Konteks Proyek
RAOS (Rifim Airport Operation System) adalah PWA operasional Vendor Maxim
di 9 cabang aktif RIFIM (sesi 17 multi-cabang):

1. ID Rifim Airport Soeta (T1/T2/T3 sub-terminal) — khusus Order (scan valid)
2. ID Rifim Airport Batam
3. ID Rifim Airport Jambi
4. ID Rifim Airport Balikpapan
5. ID Rifim Airport Manado
6. ID Rifim Airport Pekanbaru
7. ID Rifim Airport Makassar
8. ID Rifim Batam (non-airport)
9. ID Rifim Jambi Luar

Cabang non-Soeta khusus **Saldo** (Rp nominal) — 8 cabang pakai
`raos_saldo_requests` pipeline (chat command `/isisaldo` + admin centang
di sheet Form Isi Saldo).

## Stack
- **Frontend:** Next.js 14 + TypeScript + Tailwind CSS (PWA)
- **Backend:** Supabase (PostgreSQL + Auth + Realtime + RLS)
- **Automation:** Google Apps Script (GAS)
- **Deploy:** Vercel (frontend) + GitHub Actions (CI/CD)
- **Storage:** Google Drive (backup)

## Supabase Project
- **URL:** https://vlievtojpmrbsmzlqswl.supabase.co
- **Project ID:** vlievtojpmrbsmzlqswl

## Struktur Folder
```
RAOS/
├── apps/pwa/          ← Next.js PWA (sumber utama frontend)
├── gas/               ← 11 Google Apps Script modules
├── sql/               ← Schema, RLS, Seed data
├── .github/workflows/ ← CI/CD pipeline
├── vercel.json        ← Konfigurasi Vercel
└── CLAUDE.md          ← File ini
```

## ⚠️ Lokasi Penyimpanan Google Drive (WAJIB — arahkan ke sini setiap butuh simpan file)

Project Supabase RAOS **dipakai bersama proyek lain**. Google Drive di bawah ini adalah
lokasi resmi RAOS — SELALU simpan file baru (foto, PDF, backup) ke folder yang sesuai,
JANGAN buat folder baru sembarangan di tempat lain.

### 1. Foto Absensi Selfie
Folder induk: https://drive.google.com/drive/folders/1Aq-tMtVm89krrt1WNSpEy9k_cxAlsTfh

Struktur: `[Pickup Point]/[Bulan]/nama-file.jpg`
```
T1 - Pickup Point 1/2026-07 Juli/
T1 - Pickup Point 2/2026-07 Juli/
T1 - Pickup Point 3/2026-07 Juli/
T2 - Pickup Point 1/2026-07 Juli/
T2 - Pickup Point 2/2026-07 Juli/
T2 - Pickup Point 3/2026-07 Juli/
T3 - Pickup Point 1/2026-07 Juli/
T3 - Pickup Point 2/2026-07 Juli/
```
Subfolder bulan berikutnya (`2026-08 Agustus`, dst) dibuat OTOMATIS oleh GAS
(`gas/11_drive_sync.gs` → `getOrCreateSubfolder()`) saat pertama kali dibutuhkan.

**Sync otomatis aktif:** Foto selfie diupload dari PWA ke Supabase Storage (bucket `selfies`),
lalu `gas/11_drive_sync.gs` (`syncSelfiePhotosToGDrive`, trigger tiap 30 menit) memindahkan
salinannya ke folder Pickup Point/Bulan yang sesuai secara otomatis. Kolom
`selfie_in_drive_synced`/`selfie_out_drive_synced` di `raos_attendance` menandai foto yang
sudah tersync (hindari duplikat).

### 2. File Spreadsheet RAOS
Folder: https://drive.google.com/drive/folders/1o9PTsBtN7eb8U4xLyWe3zq1nQXufm_oL
(Lokasi Google Spreadsheet sumber data GAS — ABSENSI, ORDER, DATABASE STAFF, dst)

### 3. Backup Bulanan
Folder induk: https://drive.google.com/drive/folders/1i_gSb1iCq9gV2qvxbsCxDcndp_28jMUA

Struktur: `[Jenis Backup]/[Bulan]/nama-file`
```
Backup Spreadsheet/2026-07 Juli/   ← hasil backupHarian() GAS (XLSX)
Backup Laporan PDF/2026-07 Juli/   ← hasil exportLaporanBulanan() GAS (PDF)
Backup Database/2026-07 Juli/      ← reserved untuk backup Supabase (belum dipakai)
```

## Aturan Kerja
0. **WAJIB sync ke spreadsheet RAOS** (`1eYS2mM3Sy...`) setiap upgrade
   yang menghasilkan/mengubah data agregat. Antar sheet (DASHBOARD
   STAFF, MASTER TARGET, Form Isi Saldo, LOG SISTEM, DATABASE ORDER,
   SISTEM CONFIG) HARUS terintegrasi. Tab baru auto-create via menu GAS.
0b. **WAJIB gunakan semua MCP** yang tersedia (Supabase, Vercel, GitHub,
   Context7, dsb) — jangan fallback manual kalau MCP available.
1. Selalu update STATUS.md setelah selesai sesi
2. Jangan hardcode credential — pakai .env.local atau Supabase Secrets
3. Semua tabel Supabase wajib punya RLS policy
4. Commit format: `feat(scope): deskripsi` / `fix(scope): deskripsi`
5. Test fitur di browser sebelum lapor selesai
6. **SEBELUM reuse/extend tabel Supabase manapun**, cek dulu skema kolomnya — kalau ada
   kolom gaya lain (mis. `employee_id` text bukan `staff_id` UUID) itu tanda tabel MILIK
   PROYEK LAIN (lihat daftar di bawah). Buat tabel baru berprefix `raos_` alih-alih extend.
7. **Tabel MILIK PROYEK LAIN — JANGAN disentuh sama sekali:** `drivers`, `employees`,
   `employee_contracts`, `attendance` (bukan `raos_attendance`), `leave_requests`,
   `leave_balances`, `payroll`, `users` (bukan `user_profiles`), `saldo_events`
8. **Tabel MILIK RAOS (aman dipakai/diextend):** `user_profiles`, `raos_drivers`,
   `raos_attendance`, `raos_chat_room_reads`, `raos_saldo_requests`, `raos_driver_queue`,
   `scan_orders`, `branches`, `pickup_points`, `shifts`, `kpi_targets`, `chat_rooms`,
   `chat_messages`, `chat_room_members`, `chat_message_attachments`,
   `chat_message_reactions`, `chat_polls`, `chat_poll_votes`, `activity_logs`,
   `system_logs`, `notifications`, `system_config`, `push_subscriptions`

## Chat Rooms — sesi 20 (25-26 Juli 2026): 5 batch fitur

Post-user-feedback screenshot chat rooms:

### Migration & schema baru sesi 20
- `raos_051_room_cleanup_and_pengumuman_notif` — soft-delete 4 room stale
  (Soetta T1/T2/T3, Dukungan Driver) + helper `raos_ensure_global_rooms_members()`
  auto-attach semua user_profiles.is_active ke 3 room global (Umum/Pengumuman/
  Absensi) + extend trigger `raos_notify_new_chat_message` untuk detect room
  Pengumuman → kategori `'pengumuman'` + title "📢 Pengumuman Baru".
- `raos_052_chat_message_reads` — tabel `chat_message_reads` UNIQUE(message_id,
  user_id) + 3 RPC: `mark_messages_read(uuid[])`, `get_message_read_summary(uuid[])`,
  `get_message_readers(uuid)` + realtime publication.
- `raos_053_chat_retention_and_delete_rpc` — 3 RPC:
  * `set_chat_room_retention(uuid, int)` — SECURITY DEFINER, bypass RLS
    admin-only. Otorisasi member OR global room OR scope. Validasi 1-365.
  * `delete_chat_message(uuid)` — sender OR admin/mgmt/koord/direksi.
  * `clear_chat_room_messages(uuid)` — admin/mgmt/direksi only (destructive,
    UI tidak panggil lagi setelah batch D).
- `raos_054_chat_local_clear` — tabel `chat_room_local_clears` + RPC
  `clear_chat_room_for_me(uuid)`. Pattern WhatsApp "clear chat for me" —
  hanya sembunyi di device pemanggil, user lain tetap lihat pesan.
- `raos_055_chat_message_mentions` — kolom `chat_messages.mentions uuid[]` +
  GIN index partial + extend trigger push khusus untuk mentioned users
  (kategori `'pengumuman'` bypass filter chat_room, title "📣 Anda di-tag").

### Konvensi client chat baru

- **Read receipt centang**: `Check` (1 abu, terkirim), `CheckCheck` abu (partial),
  `CheckCheck` sky-300 (dibaca semua). Tap tombol → modal "Dibaca oleh" via
  `get_message_readers`. State: `readSummary` map + `markedReadRef` Set untuk
  cegah RPC ganda. Realtime `chat_message_reads INSERT` → `+1 read_count`.
- **Retensi Pesan**: chip button (Tidak/7/30/90 hari) tampil untuk SEMUA role
  (tidak lagi gate PIN_ROLES). Panggil RPC `set_chat_room_retention` (bukan
  direct table update, karena RLS admin-only masih ada untuk direct update).
- **Hapus per-pesan**: action menu tombol Trash2 red, visible untuk sender OR
  admin/mgmt/koord/direksi. Realtime `DELETE chat_messages` listener auto-remove
  dari state di semua user yang lagi buka room.
- **Hapus semua pesan (lokal)**: tombol "Hapus Semua Pesan (untuk Saya)" tampil
  untuk semua user. Panggil RPC `clear_chat_room_for_me`. `loadMessages` fetch
  cutoff dari `chat_room_local_clears` dulu → filter `created_at > cleared_before_at`.
- **Info Room daftar anggota lengkap**: hapus `.limit(30)` di fetch, hapus
  `.slice(5)` di render. List scrollable max-h-[280px]. Klik nama → RPC
  `get_or_create_pribadi_room` + `setActiveRoom(pribadiRoom)`.
- **Mention @nama**: input onChange handler deteksi regex
  `(?:^|\s)@([\w.\-]*)$` sebelum caret → dropdown autocomplete filter
  `roomMembers` by full_name, max 6. Klik pilihan → insert `@<Full Name> `
  di posisi caret + push user_id ke `mentionsPending`. sendMessage validate
  mentions yang masih ada di text lalu include di payload
  `chat_messages.mentions`. Bubble render split regex mention → wrap `@Nama`
  dalam `<span>` primary color + bg tint.

### Fix Wallet toggle di room Pengisian Saldo (sesi 20 batch B)

- Tombol Wallet + `IsiSaldoBottomSheet` sekarang cek `activeRoomBranch`
  (fetch `branches` by `activeRoom.branch_id`) bukan `user.branches`
  (cabang user login).
- Alasan: direksi/admin/user dengan branch T1 atau tanpa branch
  (`saldo_nominal_options=[]`) tidak boleh hilang tombol saat buka room
  cabang lain. RLS raos_saldo_requests_staff_insert cukup cek staff_id,
  tidak batasi branch_id → safe direksi submit ke cabang mana pun.

### Room global vs per-cabang (sesi 20 batch A)

5 room wajib per cabang:
- **Global (branch_id NULL, semua staff auto-member)**: Umum, Pengumuman, Absensi.
- **Per-cabang (branch_id = cabang UUID, member dari `seed_room_per_branch`)**:
  Pengisian Saldo — <Cabang>, Driver — <Cabang>.

Untuk staff/koord non-admin: RLS `rooms_read_member` filter dengan
`is_branch_in_scope` → hanya lihat 3 global + 2 cabang sendiri.
Admin/mgmt/direksi bypass → lihat semua.

Stale rooms yang di-soft-delete sesi 20: Soetta T1/T2/T3 — Ops, Dukungan Driver.

## Multi-cabang Phase 1-3 — sesi 17, 24-25 Juli 2026

### Phase 1 Foundation
- Migration `raos_037` extend `branches` dengan slug/timezone/lat/lng/
  `default_radius_meters`/`parent_branch_id`/`branch_type`. Seed 9 cabang
  aktif dengan koordinat bandara real. T1/T2/T3 di-set parent Soeta.
- Migration `raos_038` helper `is_branch_in_scope(uuid)` SECURITY DEFINER.
  Admin/mgmt/direksi bypass, staff/koord scoped ke branch sendiri +
  descendant/parent. Updated RLS 4 tabel.
- `chat_rooms.branch_id` nullable — NULL = global (Umum/Pengumuman/Absensi),
  UUID = per-cabang scope.
- GAS `13_staff_sync.gs` extend `RAOS_ALLOWED_BRANCHES` = 10 cabang (9 +
  Head Office). `kpiBranchMap_()` slug → branch_id auto-set saat sync.
- GAS `12_driver_airport_sync.gs` loop 7 tab airport, per-tab branch_id
  auto-map.

### Phase 2 Isi Saldo
- Migration `raos_039` tabel `raos_saldo_requests` + RLS scope.
  `branches.saldo_nominal_options` JSONB per cabang (4 opsi Balikpapan/
  Pekanbaru/Makassar, 2 opsi Batam/Jambi/Manado/Rifim Batam/Jambi Luar,
  Soeta `[]`).
- Migration `raos_040` kolom `is_processed`/`processed_at`/`processed_by`/
  `auto_chat_posted`. Trigger `raos_saldo_after_processed` BEFORE UPDATE
  saat `is_processed` false→true dispatch push staff + auto-chat "Terima
  kasih..." ke room driver cabang.
- Migration `raos_044` helper `raos_get_system_bot_id()` fallback
  sender_id (admin/direksi pertama).
- `lib/saldoRequest.ts` parse `/isisaldo <nominal>` (support suffix `k`),
  submit validate allowedNominals + insert + post chat message JSON.
- `components/SaldoRequestCard.tsx` chip status per event + tombol
  Setujui/Tolak (koord+).
- `/validasi-saldo` page — total per status + filter + inline actions.
- `/riwayat` tab **Isi Saldo** dengan pin kuning/hijau/merah.
- GAS 16 `syncSaldoRequestsToSheet` cron 5-menit → tab **Form Isi Saldo**
  (15 kolom gabungan format lama + baru).
- GAS `handleSaldoCheckboxEdit_` onEdit trigger: admin centang kolom I
  "Sudah Diisi" → PATCH `is_processed=true` → DB trigger dispatch semua
  efek.
- GAS `updateTargetStaffPencapaian_` tambah nominal ke sheet TARGET STAFF
  kolom `pencapaian_gmv` bulan berjalan.
- GAS `reminderSaldoBelumDiisi` cron 5-menit — request >5 menit belum
  diisi post WA-style pesan ke room "Pengisian Saldo" cabang + mark
  kolom M+N di sheet.
- `chat_messages.type` diperluas dengan `'saldo_request'`.
- `chat_messages.client_id` UUID untuk idempotency saat offline replay
  (migration `raos_036`).

### Phase 3 Antrian Driver
- Migration `raos_043` tabel `raos_driver_queue` FIFO
  (position/status/joined_at/called_at/completed_at) + UNIQUE index
  partial (driver aktif per cabang) + 4 RPC SECURITY DEFINER:
  `raos_join_queue`, `raos_call_driver`, `raos_complete_queue`,
  `raos_leave_queue`. RLS scope `is_branch_in_scope`.
- `chat_messages.type` diperluas dengan `'driver_queue'`.
- Realtime publication: `raos_driver_queue` ditambahkan ke
  `supabase_realtime`.
- `lib/driverQueue.ts` parse 4 command `/antri` `/panggil` `/selesai`
  `/keluar`. Command hanya jalan di room dengan `branch_id` spesifik
  (global room tolak).
- `components/DriverQueueCard.tsx` bubble per event (amber joined, blue
  called, green completed, gray left) + box posisi.
- `/antrian-driver` page real-time monitor per cabang dengan tombol
  PANGGIL/SELESAI/Keluar inline + subscribe Postgres changes.

### Multi-cabang: PWA modul UI-side
- `/admin` — CreateProyekRoomModal punya branch dropdown ("Semua Cabang
  Global" default vs cabang spesifik). Extend `create_proyek_room` RPC
  dengan `p_branch_id`. Bulk-create room "Pengisian Saldo" + "Driver"
  per cabang lewat RPC `seed_room_per_branch` (SECURITY DEFINER,
  idempotent, auto-add member semua staff cabang + admin/mgmt/direksi).

### KPI dual-mode
- `gas/14_kpi_config.gs` hapus BOBOT_SCAN/HARI (tidak perlu Rp konversi).
- `gas/15_kpi_engine.gs` `kpiGetTargetByCabang_(slug)` return
  `{order, saldo, mode}`. Soeta → mode='order' (Pilar 1 = scan_orders
  count), cabang lain → mode='saldo' (Pilar 1 = SUM
  raos_saldo_requests.nominal WHERE is_processed=true).
- `kpiGetActiveStaff_` join branches, group per cabang, hitung Target
  Staff per cabang (Target Cabang / jumlah staff × bobot jabatan).
- `kpiWriteDashboard_` header 15 kolom termasuk Cabang + Mode Target.
- `initKpiSheetsRAOS` seed 9 cabang di MASTER TARGET dengan 2 kolom
  (Target Order + Target Saldo Rp).

### SISTEM CONFIG refactor
- `initSistemConfig` refresh 20 entries: `KPI_PILAR_1_ORDER_MAX`,
  `KPI_PILAR_1_SALDO_MAX`, `KPI_AKTIF_TINGGI_MIN`, `SALDO_REMINDER_MENIT`,
  `GEOFENCE_TOLERANCE_METER`, `SSOT_STAFF_SHEET_ID`, `SSOT_DRIVER_SHEET_ID`,
  dst.
- `markDeprecatedSheets` menu baru — banner merah "DEPRECATED" di
  TARGET STAFF, DATABASE STAFF, DATABASE DRIVER.

### SESSION_PROMPT.md
Master resumable prompt di root: 25 poin roadmap `Upgrade Full Cabang.md`
+ progress tracker + checkpoint. Paste isi section "🚀 PROMPT UNTUK
PASTE" ke sesi baru Claude untuk resume tepat dari checkpoint terakhir.

### Aturan WAJIB baru (RULE_PROJECT.md §1.-1 dan §1.-2)
1. Setiap upgrade WAJIB sinkron ke spreadsheet RAOS `1eYS2mM3Sy...`
   (antar sheet DASHBOARD STAFF/MASTER TARGET/Form Isi Saldo/LOG SISTEM/
   DATABASE ORDER/SISTEM CONFIG saling terintegrasi, tab baru auto-create
   via menu GAS).
2. Wajib gunakan semua MCP tersedia (Supabase, Vercel, GitHub, Context7).
   Jangan fallback manual shell.

## Sync Staff (SSoT) — sesi 14, 22 Juli 2026

RAOS **wajib** ambil daftar staff dari SSOT global, bukan CRUD sendiri di PWA
(pelanggaran sesi 13 sudah di-rollback):
- SSOT: spreadsheet "DATABASE STAFF"
  (`1fcraq3QHqIaD-13Ebzt6stT9aA6j_loTXeAtpNX12kw`), tab **"MASTER DATA STAFF"**,
  lihat `C:\Projects\menala\SSOT_DATA_SOURCES.md`
- Filter RAOS: kolom D `ID CABANG = "ID Rifim Airport Soeta"` — cabang lain
  bukan urusan RAOS
- Arah sync: **satu arah** Google Sheets → Supabase, via `gas/13_staff_sync.gs`
  (`syncStaffFromSSOT()`), trigger otomatis tiap 1 jam + menu manual
  🛠️ RAOS System → 👥 Staff → 🔄 Sync Staff Soeta (SSOT)
- Kolom `user_profiles.source` (migration `raos_022`) membedakan asal data:
  - `ssot_master_staff` — auto-sync, kolom `staff_id`/`full_name`/`role`/`phone`
    di-refresh tiap sync + PIN → password Supabase Auth, TIDAK BOLEH diedit
    manual dari PWA (trigger `prevent_ssot_staff_column_edit` memblokir)
  - `manual` — akun admin awal (`rifiminternationalgemilang@gmail.com`) yang
    tidak ada di sheet, sync tidak pernah menyentuh baris ini
- Kolom milik RAOS sendiri (`branch_id` = Terminal T1/T2/T3, `avatar_url`)
  TIDAK ada di sheet SSOT — sync tidak pernah mengisinya, admin set via
  `/admin` setelah staff muncul dari sync
- Mapping jabatan → role RAOS: STAFF KONTER/PICKUP POINT → `staff`,
  KOORDINATOR → `koordinator`, ADMIN → `admin`. `direksi` belum ada di sheet
  — perlu ditambah kolom Jabatan di HRIS
- **PIN (kolom H sheet)** dipakai sebagai password login Supabase Auth
  (staff login pakai email + PIN). Aturan sync:
  - PIN valid (≥6 digit angka): di-set jadi password auth user, di-refresh
    setiap sync (kalau admin ganti PIN di sheet, propagate max 1 jam)
  - PIN kosong / <6 digit / bukan angka: sync skip password + log warning,
    staff harus pakai "Lupa PIN" di halaman login untuk set sendiri
- Staff `ssot_master_staff` yang hilang dari sheet SSOT di-nonaktifkan
  (`is_active=false`), bukan di-delete — supaya histori scan_orders/attendance
  (FK ke `user_profiles.id`) aman
- `MASTER_STAFF_SHEET_ID` bisa di-override via Script Properties kalau ID
  spreadsheet SSOT berubah; default hardcode ke ID di atas

### Yang BUKAN sync SSoT — kolom RAOS-only

- Trigger `prevent_self_privilege_escalation()` di `user_profiles` (sesi 13,
  migration `raos_021`) TETAP AKTIF: siapapun (termasuk admin) tidak bisa
  ubah `role`/`is_active` baris miliknya sendiri kecuali dia sudah
  admin/direksi — cegah staff biasa self-promote jadi admin
- Policy `user_profiles_update_admin` (sesi 13, migration `raos_021`) TETAP
  DIPAKAI oleh `/admin` untuk edit `branch_id`/`is_active` staff dari client,
  tanpa service role key
- **`SUPABASE_SERVICE_ROLE_KEY` di PWA sudah TIDAK dipakai** setelah rollback
  sesi 14. Hapus dari `.env.local` dan Vercel env vars kalau sudah sempat
  di-set sesi 13. Service role key sekarang hanya dipakai GAS
  (`SUPABASE_SERVICE_KEY` di Script Properties, sudah lama ada) untuk buat
  auth user via `/auth/v1/admin/users`

## Filter Kategori Push — sesi 15 sore (23 Juli 2026)

- Migration `raos_033_notification_prefs`:
  - Kolom `user_profiles.notification_prefs` jsonb, default 7 field
    all-true: `master, scan_berhasil, scan_pending, validasi_koordinator,
    pengingat_absen, pengumuman, chat_room`
  - Update RPC `raos_dispatch_push(p_kategori text DEFAULT NULL)` — kalau
    di-set, di-sisipkan ke body Edge Function
  - Update trigger `raos_notify_new_chat_message` pass `'chat_room'`
- **Edge Function `raos-send-push` v5 ACTIVE** — baca `body.kategori`,
  query `user_profiles.notification_prefs` untuk `user_ids` target,
  skip yang `master=false` atau `[kategori]=false`. Response body punya
  `filtered_out` count untuk debugging.
- **Client `settings/page.tsx`**:
  - Load `notification_prefs` dari DB saat mount, merge ke `AppPrefs`
  - `savePrefs()` deteksi kalau `notifMaster` atau `notifJenis` berubah
    → fire-and-forget upsert ke `user_profiles.notification_prefs`
    (mapping label UI → key snake_case via `LABEL_TO_KEY`)
- **Mapping call site → kategori** (lihat RULE_PROJECT.md §5.5):
  - `/admin` validate scan → `'scan_berhasil'`
  - GAS reminder masuk/pulang → `'pengingat_absen'`
  - GAS `notifyPendingScansKoordinator` → `'validasi_koordinator'`
  - DB trigger chat_messages → `'chat_room'`
  - Test push admin → SKIP kategori (bypass filter)
- **End-to-end verified**: filter ON → send terkirim, filter OFF →
  filtered_out=1 (no send), all melalui `raos_dispatch_push` + response
  200 dari `raos-send-push`

### Vault secret raos_service_role_key — pakai `sb_secret_*` bukan JWT

Supabase project RAOS sudah migrate ke new API keys system. Isi vault
secret harus **Secret API key baru** format `sb_secret_...` (di Dashboard
→ Project Settings → API Keys → tab "Publishable and secret API keys" →
section Secret keys → `default`).

**JANGAN paste legacy service_role JWT** (format `eyJhbGci...` di halaman
"Legacy API keys") — akan gagal 401 "invalid_token: missing sub claim"
karena Edge Function `SUPABASE_SERVICE_ROLE_KEY` env sekarang sudah
di-rotate ke `sb_secret_*`.

Set via SQL editor (bukan direct UPDATE ke `vault.secrets` yang di-blok):
```sql
SELECT vault.update_secret(
  (SELECT id FROM vault.secrets WHERE name = 'raos_service_role_key'),
  'sb_secret_XXXXXXXXXX',
  'raos_service_role_key',
  'Secret API key untuk RPC raos_dispatch_push'
);
```

## Fix bug chat retensi pesan — sesi 15 sore

- **Migration `raos_034`** — extend RPC `get_chat_rooms_for_user` return
  `auto_delete_days`. Sebelumnya RPC tidak return field ini →
  `activeRoom.auto_delete_days` selalu `undefined` di client → dropdown
  reset ke "Tidak" meski DB tersimpan 7/30/90.
- **Chip button** menggantikan native `<select>` di Pengaturan Room
  Retensi Pesan. Native picker di Android dismiss dengan back gesture →
  consume `pushState` dummy di `useEffect activeRoom` → `popstate` →
  `setActiveRoom(null)` → user keluar dari room ke list chat. Chip button
  = 4 tombol horizontal (Tidak/7/30/90 hari), tap langsung tanpa native
  picker.

## Fix push subscribe not_authenticated — sesi 15 sore

`lib/push.ts` `subscribePush()` sebelumnya pakai `supabase.auth.getUser()`
yang query ke Auth server (bisa timeout/fail meski session valid di
localStorage). Ganti ke `getSession()` konsisten dengan pattern
`lib/pushClient.ts`, `admin/page.tsx`.

## Push Notification (Web Push VAPID) — sesi 14 dinihari-pagi 23 Juli

Full stack Web Push (BUKAN Firebase/FCM). Pattern mengikuti isi-saldo.

**Env & secrets:**
- Vercel `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (public, aman di-embed client)
- Supabase Edge Function secrets: `RAOS_VAPID_PUBLIC_KEY`,
  `RAOS_VAPID_PRIVATE_KEY`, `RAOS_VAPID_SUBJECT` (prefix RAOS_ — isolate
  dari PWA lain yang share Supabase project, mereka pakai `VAPID_*` tanpa
  prefix untuk keypair sendiri)
- Supabase Vault `raos_service_role_key` — untuk DB trigger yang panggil
  Edge Function via `pg_net` HTTP (chat broadcast). SET via Vault UI,
  BUKAN SQL insert (permission crypto denied).

**Komponen:**
- Tabel `public.push_subscriptions` (RLS: user CRUD own, admin/mgmt/direksi
  read all). Migration `raos_029`.
- Edge Function `raos-send-push` (v3 ACTIVE, verify_jwt=true). Payload
  `{user_ids[], title, body, url, tag}`. Role guard admin/mgmt/direksi
  kecuali caller service_role (bypass untuk system trigger).
- Auth pattern Edge Function: `createClient(SUPABASE_URL, ANON_KEY,
  { global: { headers: { Authorization: authHeader } }})` +
  `userClient.auth.getUser()` tanpa arg. JANGAN pakai
  `admin.auth.getUser(token)` — bug "Auth session missing!".
- SW handler `public/sw-push.js` inject via next.config.js
  `workboxOptions.importScripts:['/sw-push.js']`. `showNotification`
  dengan `requireInteraction:true`+`vibrate:[200,100,200,100,500]` supaya
  muncul di lock screen Android/iOS + suara + getar.
- `lib/push.ts`: `subscribePush()` / `unsubscribePush()` /
  `isPushSupported()`. Toggle master Notifikasi di Settings call ini.
- `lib/pushClient.ts`: `invokePush({user_ids, title, body, url, tag})`
  fire-and-forget dari admin/koord/direksi PWA (staff biasa 403).
- RPC `public.raos_dispatch_push(user_ids[], title, body, url, tag)` —
  SECURITY DEFINER + `SET search_path=public,extensions,vault`. Baca
  `vault.decrypted_secrets` name='raos_service_role_key', panggil Edge
  Function via `net.http_post`. Dipakai DB trigger.

**Trigger otomatis yang aktif** (migration `raos_030`/`raos_031`/`raos_032`):
- `trg_raos_notify_new_chat_message` AFTER INSERT `chat_messages` →
  push ke semua member room lain (broadcast chat, preview per type).
- `trg_raos_broadcast_absensi_to_chat` AFTER INSERT/UPDATE
  `raos_attendance` → post pesan format WA-style ke room 'Absensi'
  (chain: pesan chat → push notif ke member room Absensi).

**Trigger dari client PWA:**
- `/admin` validateScan → `invokePush` ke `scan.staff_id` (notif
  divalidasi/ditolak).

**Trigger cron GAS** (via `invokePushFromGas_` pakai service_role):
- Dispatcher `reminderShiftDispatcher` fire tiap 5 menit, cek WIB clock
  vs 6 target time (06:30/14:30/22:30 masuk + 15:00/23:00/07:00 pulang).
  Dedup via Script Properties cache per hari.
- `notifyPendingScansKoordinator` tiap 15 menit — scan pending > 15m
  → push ke koord/admin/mgmt/direksi.

**PENTING**: kalau bikin fitur baru yang butuh push, JANGAN buat Edge
Function baru — pakai `raos-send-push` yang sudah ada. Kalau butuh dari
client staff biasa (role_not_allowed), pakai DB trigger + RPC
`raos_dispatch_push` (bypass role via service_role di vault).

## Reminder Absensi 6 Waktu per Shift — sesi 14 pagi 23 Juli

- AppPrefs: `reminderPagi/Siang/Malam` objek `{masuk, pulang}` (bukan
  `reminderMasuk/Pulang` flat lama). Default:
  - Pagi 06:30/15:00, Siang 14:30/23:00, Malam 22:30/07:00
- UI Settings > Notifikasi: 3 group per shift (🌅☀️🌙) × 2 time input.
- GAS: 6 fungsi `reminderMasuk/Pulang{Pagi/Siang/Malam}` + dispatcher
  `reminderShiftDispatcher` tiap 5 menit. Backward-compat alias
  `kirimReminderAbsensi/kirimReminderPulang` tetap ada.
- Alasan pakai dispatcher (bukan 6 cron `atHour`): GAS ScriptApp cuma
  support jam bulat. Dispatcher granular per-menit + dedup cache.

## Broadcast Absensi ke Room Chat — sesi 14 pagi 23 Juli

- Room chat kategori 'proyek' bernama 'Absensi' (ID `9bdd3316-1c81-4943-943f-cc9d76cf97e9`).
  Bisa lain sepanjang `lower(name) = 'absensi'` — trigger case-insensitive.
- Room WAJIB punya member (query manual: `INSERT INTO chat_room_members
  SELECT room_id, id FROM user_profiles WHERE is_active`). Kalau kosong,
  pesan tetap post tapi push tidak kirim ke siapa-siapa.
- Format pesan WA-style: ✅ ABSEN MASUK / 🏁 ABSEN PULANG + Nama +
  Cabang + Shift + Jam WIB + Tanggal + Lokasi + footer PT.
- Sender_id = staff yang absen. Bubble di sisi kanan mereka kalau buka
  room.
- Chain: pesan chat INSERT → `trg_raos_notify_new_chat_message` push
  notif ke member room lain.

## Sync Driver Airport (SSOT) — sesi 12, 22 Juli 2026

RAOS **wajib** ambil roster driver dari sumber SSOT global, bukan input manual/mock:
- SSOT: spreadsheet "Database Driver Airport"
  (`1FEZxyHPx_GCQKw92hLSf6QxxkXgZn5R1sRswOYM_Tlc`), lihat
  `C:\Projects\menala\SSOT_DATA_SOURCES.md`
- RAOS hanya tarik 1 tab: **"ID Rifim Airport Soeta"** (RAOS = Bandara
  Soekarno-Hatta, cabang lain bukan urusan RAOS)
- Arah sync: **satu arah** Google Sheets → Supabase, via `gas/12_driver_airport_sync.gs`
  (`syncDriverAirportFromSSOT()`), trigger otomatis tiap 6 jam + menu manual
  🛠️ RAOS System → 🚗 Driver → 🔄 Sync Driver Airport Soeta (SSOT)
- Kolom `raos_drivers.source` (migration `raos_020`) membedakan asal data:
  - `ssot_driver_airport` — auto-sync, kolom `driver_id`/`name`/`is_active`
    di-refresh tiap sync, TIDAK BOLEH diedit manual (akan tertimpa)
  - `manual` — diinput staff via `/admin` form "Tambah Driver", sync SSOT
    tidak pernah menyentuh baris ini
- Kolom milik RAOS sendiri (`phone`, `vehicle_type`, `vehicle_plate`, `barcode`,
  `branch_id`) TIDAK ada di sheet SSOT — sync tidak pernah mengisi/menimpanya,
  harus dilengkapi manual via `/admin` setelah driver muncul dari sync
- Driver yang hilang dari sheet SSOT di-nonaktifkan (`is_active=false`), bukan
  di-delete — supaya histori `scan_orders` (FK ke `raos_drivers.id`) aman
- `DRIVER_AIRPORT_SHEET_ID` bisa di-override via Script Properties kalau ID
  spreadsheet SSOT berubah; default hardcode ke ID di atas

## Modul PWA (sesi 17 multi-cabang)
| Route | Fungsi | Role |
|---|---|---|
| `/` | Login (email + PIN dari SSoT sheet) | Semua |
| `/dashboard` | Beranda + statistik | Semua |
| `/scan` | Scan barcode driver (hard-block staff > radius+50m) | Staff/Koord |
| `/absensi` | Absensi masuk/pulang + GPS + selfie | Semua |
| `/riwayat` | History scan/absensi/isi saldo — pin kuning/hijau/merah | Semua |
| `/chat` | Chat room realtime + slash command `/isisaldo` `/antri` `/panggil` `/selesai` `/keluar` | Semua |
| `/settings` | Preferensi + Bantuan/FAQ + Ukuran Teks | Semua |
| `/admin` | Validasi scan + kelola staff + branch dropdown + bulk-create room per cabang | Admin/Direksi/Mgmt |
| `/admin/barcodes` | Generator QR code driver | Admin |
| `/validasi-saldo` | Approve/reject pengajuan Isi Saldo per cabang scope | Koord+ |
| `/antrian-driver` | Real-time monitor queue driver + tombol Panggil/Selesai/Keluar | Semua |
| `/kpi` | KPI staff | Koord+ |
| `/laporan` | Laporan & analitik + export xlsx/PDF | Koord+ |
| `/status` | Status validasi (donut chart) | Semua |
| `/drivers` | Kendaraan & driver | Admin |
| `/notifications` | Notifikasi list | Semua |
| `/settings/bantuan` | 8 FAQ collapsible + info app | Semua |
| `/reset-password` | Set password baru dari magic link | Semua |

## Konvensi Frontend Penting (per sesi 7 — 17 Juli 2026)

- **Header sticky wajib**: semua halaman utama pakai `sticky top-0 z-30` di div header
  supaya header hitam tidak ikut scroll (dashboard, chat list, riwayat, absensi,
  settings main + section). Room chat view sudah pakai `flex flex-col h-screen` +
  `flex-shrink-0` di header — jangan diubah.
- **BottomNav** (`components/layout/BottomNav.tsx`): 4 tab (Beranda, Riwayat | Chat, Profil)
  + **center FAB Scan** elevated (`-top-8 w-16 h-16 ring-white`). Jangan ganti balik ke
  5-tab flat — sudah di-approve user.
- **`MenalaLogo` component** (`components/MenalaLogo.tsx`): reusable logo dengan 2 variant
  (`header` = kecil di navbar, `splash` = besar di login). Baca dari
  `public/images/logo-menala.png`. Kalau logo diganti, cukup replace file itu +
  `node scripts/generate-icons.js` regenerate icons PWA multi-size.
- **Optimistic append + realtime dedup** (chat pattern): saat insert, langsung
  append ke local state; realtime handler dedup by `id`. Contoh di `chat/page.tsx
  sendMessage()`.
- **RPC pattern untuk query kompleks**: kalau perlu join >2 tabel + agregasi,
  bikin RPC di Postgres (contoh `get_chat_rooms_for_user`), pakai `supabase.rpc(...)`
  dari client. Lebih efisien dari fetch berjenjang.
- **ESLint rule `react-hooks/set-state-in-effect` di-OFF** di project-level
  (`eslint.config.mjs`) — rule Next 16 baru terlalu agresif untuk pola fetch-data.
  Jangan reaktifkan tanpa refactor semua efek fetch-data ke pattern lain.

## Realtime Supabase — WAJIB publish tabel dulu

Publication `supabase_realtime` **awalnya kosong**. Tabel yang subscribe pakai
`.on('postgres_changes', ...)` di client harus di-`ALTER PUBLICATION supabase_realtime
ADD TABLE public.<nama>` dulu, atau event tidak akan pernah fire.

Sudah di-enable:
- `chat_messages` (migration `raos_014`)

Kalau tambah tabel baru yang perlu realtime, JANGAN lupa ADD TABLE.

## RPC Functions RAOS (SECURITY INVOKER, authenticated only)

- `get_chat_rooms_for_user()` → rooms + last_message + unread_count untuk `auth.uid()`
- `mark_chat_room_read(p_room_id UUID)` → upsert last_read_at
- `email_is_registered_staff(email TEXT)` → validasi email sebelum magic link
- `get_my_role()`, `get_my_branch()` → helper untuk RLS

**Security hardening sesi 11 (22 Juli 2026) — migration `raos_019`:**
- `get_my_role()` & `get_my_branch()`: sudah `SET search_path=public` (ternyata
  sudah diset di migration sebelumnya), dan sekarang `REVOKE EXECUTE FROM PUBLIC`
  + `GRANT EXECUTE TO authenticated` saja — tidak bisa lagi dipanggil `anon`.
- `email_is_registered_staff` SENGAJA tetap bisa dipanggil `anon` (dipakai
  validasi email sebelum magic link) — jangan revoke.
- Storage policy `chat_attachments_select` (SELECT di `storage.objects`) di-DROP:
  bucket `chat_attachments` sudah `public=true` dan app cuma pakai
  `getPublicUrl()` (bukan `.list()`/`.download()` API), jadi policy itu cuma
  membuka celah listing semua file lewat Storage API tanpa pernah dipakai app.
- `function_search_path_mutable` pada `cleanup_old_saldo_events` **BUKAN
  fungsi RAOS** (kemungkinan milik proyek isi-saldo/monitor-saldo lain di
  Supabase project yang sama) — JANGAN disentuh dari sesi RAOS.
- Sisa 1 WARN yang **tidak perlu difix**: `get_my_role`/`get_my_branch` masih
  tercatat sebagai "SECURITY DEFINER callable by authenticated" — ini memang
  desain: keduanya dipanggil authenticated user untuk RLS helper, aman.

## Update Sesi 14 (22 Juli 2026 — dinihari s/d pagi)

### Chat — kontak pribadi + gap Fase 3/5 ditutup

- **RPC `get_or_create_pribadi_room(other_user_id)`** (migration `raos_024`) —
  SECURITY DEFINER, idempotent. Return room `pribadi` existing kalau sudah ada
  antara caller + other, atau bikin baru + auto-tambah 2 member. Dipakai
  ikon Users di header chat list → sheet Kontak Staff → tap staff → open chat.
- **Policy `chat_room_members_delete_own` + `chat_rooms_update_admin`**
  (migration `raos_023`) — user boleh leave room (delete row miliknya) +
  admin/koordinator/direksi boleh update `chat_rooms.auto_delete_days`
  (dropdown retensi 7/30/90 hari di Pengaturan Room).
- **PostgREST embed ambigu FK** — `chat_messages` punya 2 FK ke
  `user_profiles` (`sender_id_fkey` + `pinned_by_fkey`, yang kedua ditambah
  Fase 4). SEMUA query embed harus eksplisit:
  `user_profiles!chat_messages_sender_id_fkey(...)`. Kalau tambah embed
  baru di chat/page.tsx atau file lain, WAJIB pakai FK name eksplisit.

### SSoT Staff — sudah aktif

- Sync satu-arah spreadsheet MASTER DATA STAFF → Supabase `user_profiles`
  via `gas/13_staff_sync.gs`, trigger 1 jam, filter
  `ID CABANG = "ID Rifim Airport Soeta"`. Migration `raos_022` tambah kolom
  `source` (`manual` | `ssot_master_staff`) + `ssot_synced_at` + trigger
  `prevent_ssot_staff_column_edit` (blok edit `full_name`/`role`/`phone`/
  `staff_id` dari client, service_role GAS di-bypass).
- **Login PIN**: PIN kolom H sheet → password Supabase Auth. Form login
  label "PIN", `inputMode="numeric"` tanpa `pattern` strict (supaya admin
  manual dengan password alfanumerik tetap bisa login).
- **RPC `get_auth_user_id_by_email`** (migration `raos_022b`) — helper
  GAS untuk lookup auth.users by email, service_role only.
- **Rollback sesi 13**: `POST /api/admin/staff` + `lib/supabaseAdmin.ts` +
  tombol Tambah Staff DIHAPUS. `SUPABASE_SERVICE_ROLE_KEY` **tidak lagi
  dipakai di PWA** — service role hanya di GAS (`SUPABASE_SERVICE_KEY`
  Script Property). Kalau sempat di-set di `.env.local`/Vercel, hapus.

### GPS tiered — scan & absensi cepat

- `lib/gps.ts` `requestLocationTiered({ onFix, onUnavailable })`:
  - Fase COARSE (`enableHighAccuracy:false, timeout:3s, maximumAge:15s`)
    — wifi/cell trilateration, 0.5-2 detik, cukup untuk validasi geofence.
  - Fase REFINE (`enableHighAccuracy:true, timeout:8s, maximumAge:15s`)
    — GPS asli, non-blocking, cuma overwrite kalau accuracy turun ≥30m.
  - Dua fase dilempar paralel dari mount (bukan berurutan).
- Dipakai di `/scan` & `/absensi` — waktu ke UI-siap turun 10-30s → 0.5-2s
  (terutama indoor terminal Soeta yang atapnya struktur baja).

### BarcodeScanner — jangan restart tiap parent re-render

- `BarcodeScanner` useEffect **hanya** depend ke `[active]`, BUKAN
  `[active, onDetected]`. `onDetected` disimpan di ref (`onDetectedRef`)
  supaya reference berubah (mis. dari `useCallback([location, geofence])`
  saat GPS refine) TIDAK memicu stop/start html5-qrcode. Race stop/start
  bertumpuk = page crash → "This page couldn't load".
- Pola sama harus dipakai kalau bikin komponen kamera lain nanti.

### PWA — SW skipWaiting

- `next.config.js` `workboxOptions: { skipWaiting: true, clientsClaim: true }`
  → SW baru langsung take over tanpa nunggu semua tab RAOS ditutup. Update
  code (mis. fix bug) langsung aktif setelah refresh, tidak nyangkut di
  bundle lama.
- **First-time upgrade**: user perlu clear cache PWA sekali secara manual
  (long-press icon → Info aplikasi → Hapus data) karena SW versi lama
  belum tahu `skipWaiting`. Update setelah ini otomatis.

### UI konvensi tambahan (sesi 14)

- **`SwipeBackWrapper` attach ke `containerRef`** (BUKAN `document`) —
  cegah wrapper luar (AppShell) + wrapper dalam (room chat) sama-sama
  fire. Plus `e.stopPropagation()` di `onTouchEnd`.
- **Modal bottom-sheet di halaman ber-BottomNav**: harus pakai
  `paddingBottom: 'calc(96px + env(safe-area-inset-bottom))'` di container
  scroll — bukan `p-6` flat — supaya tombol CTA (Simpan, dll) tidak
  ketutup BottomNav 90px. Contoh: modal Edit Staff di `/admin`, modal
  Tambah/Edit Driver di `/drivers`.
- **`DateTimeHeader` component** (`src/components/DateTimeHeader.tsx`) —
  chip tanggal+jam WIB realtime (tick 1s). Dipakai di header dashboard,
  chat, absensi, scan, riwayat. Variant `compact` untuk kanan atas.
- **`MiniCalendar` component** (`src/components/MiniCalendar.tsx`) —
  grid bulanan Sen-Min di dashboard, highlight hari ini primary bg.
- **`Logo Menala.png` baru** dari `Branding/` folder (horizontal 1200×268
  mark + wordmark navy + tagline). Split di build-time:
  `public/images/logo-menala.png` = mark cropped 360×268 (dipakai
  MenalaMark + generate-icons.js), `logo-menala-full.png` = horizontal
  bundled (dipakai kalau nanti perlu di surface bg terang, mis. laporan
  PDF). `MenalaLogo` component render mark PNG + teks manual tone-aware
  (default onNavy = putih untuk header/splash bg navy).

### GAS out-of-sync yang sudah difix

- `kirimReminderAbsensi()` sekarang fetch dari Supabase `user_profiles?is_active=eq.true`
  (bukan sheet lokal DATABASE STAFF yang sudah tidak dipakai post-SSOT).
- Menu 🚗 Driver **"Isi Data Mock Driver"** & **"Import Driver ke Supabase"**
  HIDDEN dari menu 10_menu.gs (pre-SSOT era, insert `source=manual` bisa
  duplikat dengan sync SSOT). Fungsi masih ada di `03_order.gs` kalau
  perlu dipanggil manual dari script editor untuk debug.

## Debt / Pending Tinggi (per akhir sesi 21 — 31 Juli 2026)

### Sudah selesai sesi 21 (baru saja)
- ~~**Hard-block scan/absensi di luar radius**~~ — `GEOFENCE_TOLERANCE_METERS`
  di [lib/geo.ts](apps/pwa/src/lib/geo.ts) di-set 500m (dari 1000m sebelumnya).
  Interpretasi final: `jarak > radius + 500m` → block staff (koord/direksi/
  exempt bypass). Infra `shouldBlockByGeofence()` sudah ada sejak sesi 17.
- ~~**Push subscription = 0 orang**~~ — root cause: default `notifMaster: true`
  di localStorage bikin toggle terlihat aktif tanpa pernah panggil
  `subscribePush()`. Fix: hook `useAutoPushSubscribe()` di AppShell — kalau
  permission granted + notifMaster !== false + belum ada sub → auto call
  `subscribePush()` diam-diam. Guard sessionStorage `raos_push_heal_v1`.
  File baru: [lib/useAutoPushSubscribe.ts](apps/pwa/src/lib/useAutoPushSubscribe.ts).
- ~~**Debt #7 SUPABASE_SERVICE_ROLE_KEY di Vercel**~~ — cek via Vercel MCP,
  ternyata tidak pernah ada di env vars project `raos-menala`. Clean.
- ~~**Legacy table `public.drivers`**~~ — di-rename ke
  `drivers_deprecated_20260731` (migration `raos_064`) setelah audit
  0 FK/view/function/policy/kode. Drop candidate 2026-08-21.
- ~~**2 SECURITY DEFINER views + 1 mutable search_path**~~ — migration
  `raos_065` set `security_invoker=true` di `raos_notification_stats_daily`
  + `raos_geofence_points`, dan `SET search_path=public` di
  `notifications_touch`. Semua ERROR advisor bersih.

### False positive — sudah done tapi CLAUDE.md tidak sync
- **KPI pipeline refactor** — teknis SEMUA sudah done sesi 17: `staff_id`
  UUID, `updateAllKpiRAOS()` pakai `user_profiles` Supabase, absensi dari
  `raos_attendance`, saldo dari `raos_saldo_requests`, cron 22:00 forward
  via `updateAllKpiThisMonth` → `updateAllKpiRAOS`. `kpi_targets` sudah
  26 rows dengan UUID valid. **Blocker sesungguhnya**: sheet MASTER TARGET
  belum diisi angka target per cabang (semua cabang skip dengan warning
  di `system_logs`). Sheet RAOS_KPI_MANUAL juga belum diisi bulanan.
  Solusi: kamu isi 2 sheet tsb, run manual "▶️ Update KPI Bulan Ini" dari
  menu GAS, cron 22:00 otomatis lanjut.
- **Chat CreateRoom modal proyek/multi-member** — sudah ada
  `CreateProyekRoomModal` di [admin/page.tsx:391](apps/pwa/src/app/admin/page.tsx#L391)
  dengan branch dropdown + member picker + search. RPC `create_proyek_room`
  SECURITY DEFINER (bypass RLS INSERT chat_rooms — INSERT policy sengaja
  tidak ada, harus lewat RPC).
- **Chat voice message** — sudah lengkap di
  [chat/page.tsx:865-960](apps/pwa/src/app/chat/page.tsx#L865): MediaRecorder,
  upload bucket `chat_attachments`, insert `chat_messages` type='audio'.
  UI record button di [WorkspaceComposer.tsx:235](apps/pwa/src/components/workspace/WorkspaceComposer.tsx#L235).
  Player di [TimelineMessage.tsx:73-77](apps/pwa/src/components/workspace/TimelineMessage.tsx#L73).

### Debt manual (kamu yang eksekusi — aku tidak bisa)
1. **Enable Leaked Password Protection** — 1 klik di
   [Auth Dashboard](https://supabase.com/dashboard/project/vlievtojpmrbsmzlqswl/auth/policies).
2. **Ganti password admin** (`Menala2026!`) — reset via Auth Dashboard →
   Users → admin user → "Send password recovery", atau kirim password baru
   ke Claude untuk `UPDATE auth.users` SQL.
3. **Set branch_id (T1/T2/T3) Hendro** via `/admin` PWA (kolom RAOS-only,
   tidak di-sync SSOT).
4. **Isi PIN Hendro** di sheet MASTER DATA STAFF kolom H (≥6 digit angka).
   Sync jam berikutnya propagate ke password Supabase Auth.
5. **Isi sheet MASTER TARGET** — kolom B target order (Soeta), kolom C
   target saldo Rp (cabang lain) supaya KPI pipeline bisa hitung.
6. **Isi sheet RAOS_KPI_MANUAL** bulanan — briefing, edukasi, problem,
   pelayanan, kerapian, pelanggaran per staff.

### Debt yang masih relevan (BUKAN done)
- **Tambah kolom "Jabatan DIREKSI" di HRIS** — mapping role direksi belum
  ada di sheet SSOT MASTER DATA STAFF.
- **Service Worker cache-first strategy untuk offline READ** — infra
  offline WRITE sudah lengkap ([lib/offlineQueue.ts](apps/pwa/src/lib/offlineQueue.ts)
  + [lib/offlineSyncer.ts](apps/pwa/src/lib/offlineSyncer.ts) + banner),
  tapi kalau user buka dashboard/riwayat/chat offline masih putih.
  Butuh tune `next-pwa` runtime caching di `next.config.js` (Workbox
  strategies per route).

### False positive tambahan (sudah done, CLAUDE.md tidak sync)
- **Offline mode WRITE** — 4 kind action (attendance_in/out, scan_order,
  chat_message) sudah lengkap dengan IndexedDB queue via `idb`, conflict
  resolver server-authoritative, idempotency via UNIQUE keys, blob upload
  chain, driver lookup deferred, app-open flush, polling 30s.
- **activity_logs coverage** — 6 event ter-hook: scan, absensi in/out,
  validasi admin, chat moderation, login, isi saldo submit. Row count
  rendah bukan karena bug — memang usage prod masih minim (`scan_orders=0`,
  `raos_attendance=3` di dev).
