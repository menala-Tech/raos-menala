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
RAOS (Rifim Airport Operation System) adalah PWA untuk operasional Vendor Maxim di Bandara Soekarno-Hatta.

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
   `leave_balances`, `payroll`, `users` (bukan `user_profiles`)
8. **Tabel MILIK RAOS (aman dipakai/diextend):** `user_profiles`, `raos_drivers`,
   `raos_attendance`, `raos_chat_room_reads`, `scan_orders`, `branches`, `pickup_points`,
   `shifts`, `kpi_targets`, `chat_rooms`, `chat_messages`, `chat_room_members`,
   `activity_logs`, `system_logs`, `notifications`, `system_config`

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

## Modul PWA
| Route | Fungsi |
|---|---|
| `/` | Login |
| `/dashboard` | Beranda + statistik |
| `/scan` | Scan barcode driver |
| `/absensi` | Absensi masuk/pulang + GPS |
| `/riwayat` | History scan & absensi |
| `/chat` | Chat room staff (realtime, last-msg preview, unread badge, filter tab, search) |
| `/settings` | Pengaturan akun & app |
| `/admin` | Panel admin (validasi scan + kelola staff) |
| `/admin/barcodes` | Generator QR code driver |
| `/kpi` | KPI staff |
| `/laporan` | Laporan & analitik + export xlsx/PDF |
| `/status` | Status validasi (donut chart) |
| `/drivers` | Kendaraan & driver |
| `/notifications` | Notifikasi list |
| `/reset-password` | Set password baru dari magic link recovery |

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

## Debt / Pending Tinggi (per akhir sesi 14 — 22 Juli 2026)

1. **KPI pipeline REFACTOR BESAR** (belum pernah jalan). `updateAllKpiThisMonth`
   loop `staff_id` TEXT dari sheet, tapi `kpi_targets.staff_id` FK UUID →
   insert selalu gagal. `kpi_targets` masih 0 baris. Butuh: sheet TARGET STAFF
   diisi + refactor pipe pakai `user_profiles` Supabase UUID + rekap absensi
   dari `raos_attendance` (bukan sheet ABSENSI lokal).
2. **Hard-block scan/absensi di luar radius** (staff & koordinator). Sekarang
   masih non-blocking. Interpretasi persis "50m di luar radius" perlu dipilih:
   (A) jarak > radius + 50m tolerance, (B) jarak > 50m fix ignore radius,
   (C) hard block kalau di luar radius, 50m cuma display threshold.
3. **Chat gap sesi 15**:
   - Create Room (proyek/multi-member) via `/admin` — perlu INSERT policy +
     modal + member picker.
   - Voice message (MediaRecorder + bucket mime `audio/webm` + type baru
     `'audio'` di `chat_messages` + UI record/play).
4. Aktifkan Leaked Password Protection di Supabase Auth Settings (manual, 1
   klik, tidak bisa lewat SQL).
5. Ganti password admin (masih `Menala2026!`).
6. Set `branch_id` (T1/T2/T3) untuk Hendro (staff Soeta) via `/admin` — sync
   SSOT tidak isi otomatis karena kolom itu RAOS-only.
7. Isi PIN Hendro di sheet MASTER DATA STAFF (kolom H, minimal 6 digit
   angka). Sync berikutnya (max 1 jam) propagate ke password Supabase Auth.
8. Hapus `SUPABASE_SERVICE_ROLE_KEY` dari Vercel env vars kalau sempat
   di-set sesi 13 (tidak dipakai lagi di PWA).
9. Tambah kolom "Jabatan DIREKSI" di HRIS — mapping role direksi belum ada
   di sheet.
10. `logActivity()`: 0 baris di `activity_logs` — logging GAS belum aktif
    meski helper ada.
11. Offline mode (Service Worker upgrade cache-first strategy) + push
    notification (FCM) — belum ada infra.
6. **Push Notification (FCM)** & **Offline mode** (SW upgrade): belum ada infra.
