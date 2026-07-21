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

## Debt / Pending Tinggi (per sesi 11 — 22 Juli 2026)

1. ~~Hardening Supabase security~~ — SELESAI (lihat di atas), kecuali:
   - Aktifkan Leaked Password Protection di Auth Settings (manual, 1 klik,
     tidak bisa lewat SQL/migration — perlu Dashboard atau Management API)
2. **Fitur Chat Room Staff — Fase 2-7** (lihat `PROMPT_AI_CHAT_ROOM_STAFF_MENALA.md`):
   - Fase 2: kirim foto/file (bikin bucket `chat_attachments` + tabel `chat_message_attachments`)
   - Fase 3: layar Info Room + Pengaturan Room
   - Fase 4: reaksi emoji + pin message
   - Fase 5: auto-hapus pesan (retention per room via pg_cron)
   - Fase 6: kirim lokasi
   - Fase 7: polling
3. **KPI produksi**: `kpi_targets` masih kosong. Perlu insert target + hitung dari GAS.
4. **logActivity()**: 0 baris di `activity_logs` — logging belum aktif meski helper GAS ada.
5. **CRUD staff** di `/admin`: sekarang cuma view + validasi scan, belum bisa
   create/edit/deactivate staff.
6. **Push Notification (FCM)** & **Offline mode** (SW upgrade): belum ada infra.
