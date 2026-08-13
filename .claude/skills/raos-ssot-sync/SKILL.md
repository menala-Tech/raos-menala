---
name: raos-ssot-sync
description: SSoT (Single Source of Truth) sync RAOS satu arah — Google Sheets → Supabase — untuk staff (sheet MASTER DATA STAFF filter ID CABANG='ID Rifim Airport Soeta' → user_profiles via gas/13_staff_sync.gs trigger 10 menit, PIN kolom H → password Supabase Auth, dipakai app lain non-RAOS) dan driver airport (sheet Database Driver Airport tab 'ID Rifim Airport Soeta' → raos_drivers via gas/12_driver_airport_sync.gs trigger 6 jam). Sejak P8 (2026-08-10), login RAOS PWA + Rifim-OS Portal pakai PIN KHUSUS terpisah — kolom "RAOS PIN"/"RAOS ID Staff" di sheet yang sama, sync manual-only via gas/19_raos_credentials_sync.gs syncRaosCredentials() → tabel raos_credentials (bcrypt hash via trigger), diverifikasi RPC raos_verify_login_secret dari Edge Function raos-login-exchange. Kolom source membedakan asal (ssot_master_staff / ssot_driver_airport / manual), trigger prevent_ssot_staff_column_edit blok manual edit kolom SSoT dari client (service_role GAS bypass), staff/driver yang hilang dari sheet SSoT di-nonaktifkan (is_active=false) bukan di-delete supaya histori scan_orders/attendance aman. Gunakan skill ini setiap kali menyentuh sync sheet-Supabase, mapping jabatan ke role, PIN login gagal/salah, atau setup trigger sync.
---

# SSoT Sync — RAOS

## Prinsip

- **Satu arah:** Google Sheets → Supabase (bukan sebaliknya)
- **Filter cabang:** hanya "ID Rifim Airport Soeta" — cabang lain bukan urusan RAOS (multi-cabang phase 3+ akan extend)
- **RAOS pakai sheet SSoT global**, bukan CRUD sendiri di PWA (pelanggaran sesi 13 sudah di-rollback)
- **Kolom `source` membedakan asal data** — sync-only kolom TIDAK BOLEH diedit manual

## Staff Sync — `gas/13_staff_sync.gs`

**SSoT:**
- Spreadsheet "DATABASE STAFF" `1fcraq3QHqIaD-13Ebzt6stT9aA6j_loTXeAtpNX12kw`
- Tab: **"MASTER DATA STAFF"**
- Filter: kolom D `ID CABANG = "ID Rifim Airport Soeta"`
- Reference: `C:\Projects\menala\SSOT_DATA_SOURCES.md`

**Trigger:** `syncStaffFromSSOT()` — otomatis **tiap 10 menit** (dari 6 jam sesi 2026-08-05) + menu manual "🛠️ RAOS System → 👥 Staff → 🔄 Sync Staff Soeta (SSOT)"

**Kolom `user_profiles.source`** (migration `raos_022`):
- `ssot_master_staff` — auto-sync, kolom `staff_id/full_name/role/phone` di-refresh tiap sync + PIN → password Supabase Auth. **Trigger `prevent_ssot_staff_column_edit`** blok manual edit dari client.
- `manual` — akun admin awal (`rifiminternationalgemilang@gmail.com`) yang tidak ada di sheet. Sync tidak pernah menyentuh baris ini.

**Kolom RAOS-only** (TIDAK ada di sheet SSoT — sync tidak menyentuhnya):
- `branch_id` (Terminal T1/T2/T3) — admin set via `/admin` setelah staff muncul dari sync
- `avatar_url`

**Mapping jabatan → role RAOS:**
- STAFF KONTER/PICKUP POINT → `staff`
- KOORDINATOR → `koordinator`
- ADMIN → `admin`
- `direksi` **belum ada di sheet** — debt: perlu tambah kolom Jabatan di HRIS

## PIN (Kolom H Sheet) → Password Supabase Auth

Staff login pakai **email + PIN**. Form login label "PIN", `inputMode="numeric"` tanpa `pattern` strict (supaya admin manual dengan password alfanumerik tetap bisa login).

**Aturan sync PIN:**
- PIN valid (≥6 digit angka): di-set jadi password auth user, di-refresh setiap sync (kalau admin ganti PIN di sheet, propagate max 10 menit)
- PIN kosong / <6 digit / bukan angka: sync **skip password** + log warning. Staff harus pakai "Lupa PIN" di halaman login untuk set sendiri

**RPC helper:** `get_auth_user_id_by_email(email)` (migration `raos_022b`) — service_role only, untuk GAS lookup `auth.users`.

⚠️ **PIN kolom H ini BUKAN lagi yang dipakai untuk login RAOS PWA/Rifim-OS Portal sejak P8** (lihat section berikut) — kolom H sekarang murni untuk Supabase Auth password + PWA lain (`rifim-isi-saldo`, `radms-driver`). Kalau staff RAOS lapor "PIN salah" padahal baru diganti, cek dulu ke kolom **RAOS PIN**, bukan kolom H.

## PIN RAOS Khusus (Kolom "RAOS PIN") — sejak P8, 2026-08-10

Login RAOS PWA (email/RAOS-ID + PIN di halaman `/`) **tidak pakai** `supabase.auth.signInWithPassword` langsung untuk staff — kecuali input berupa ID Driver 6+ digit angka (`loginWithRaosCredential` di `lib/raosAuth.ts`, regex `/^\d{6,}$/` → itu jalur driver, tetap pakai `auth.users` password kolom H). Untuk staff (email/ID biasa), flow-nya:

1. Client kirim `login_id` + `raos_pin` ke Edge Function **`raos-login-exchange`**
2. Edge Function panggil RPC **`raos_verify_login_secret(p_login_id, p_raos_pin)`** (SECURITY DEFINER) — cek `raos_credentials.raos_pin` (bcrypt) via `extensions.crypt()`, rate-limit **5x gagal / 15 menit** (dicatat di `activity_logs` action `raos_login_failed`/`raos_login_success`)
3. Kalau match + akun aktif → generate magic-link token (`admin.auth.admin.generateLink`), return `token_hash`
4. Client `supabase.auth.verifyOtp({token_hash, type:'email'})` → sesi jadi

**Sumber PIN RAOS (SSoT):**
- Sheet **"MASTER DATA STAFF"** (sama dengan staff sync), kolom **"RAOS PIN"** (4-12 digit angka) + **"RAOS ID Staff"/"RAOS ID"** (kode login alternatif, mis. `M040`) — kolom baru, **terpisah dari kolom H**
- Sync: `gas/19_raos_credentials_sync.gs` fungsi `syncRaosCredentials()` → upsert ke tabel `public.raos_credentials` (`user_id`, `raos_staff_code`, `raos_pin`)
- Trigger `trg_raos_credentials_hash_pin` (`raos_hash_pin_before_write()`) auto-hash bcrypt saat insert/update — GAS selalu kirim **plaintext**, DB yang hash. PIN plaintext wajib **≥6 digit** di level trigger (`^[0-9]{6,}$`) — lebih ketat dari validasi GAS (4-12 digit), jadi PIN 4-5 digit akan **gagal upsert** (exception `raos_pin_invalid_shape`) meski lolos validasi sheet

⚠️ **Sync ini TIDAK ADA cron trigger otomatis** — beda dari staff sync (10 menit). Cuma bisa dipicu manual: menu GAS "🛠️ RAOS System → Sync PIN RAOS" atau web API action `sync_raos_credentials` (role admin/direksi, lihat `gas/21_web_api.gs`). **Kalau staff ganti/isi RAOS PIN di sheet, PIN tidak akan aktif sampai ada yang jalankan sync manual ini.**

**Debug "PIN salah" staff RAOS:**
1. Cek `activity_logs` action `raos_login_failed`/`raos_login_success` by `user_id` untuk histori percobaan
2. Cek `raos_credentials.updated_at` untuk user itu — kalau sudah lama (bukan hari ini) berarti sync manual belum pernah/lagi dijalankan sejak PIN diganti di sheet
3. Verifikasi PIN yang di-klaim staff vs stored hash: `select extensions.crypt('<pin_dicoba>', raos_pin) = raos_pin from raos_credentials where user_id=...`
4. Kalau `raos_credentials` tidak ada row sama sekali → staff belum pernah disync (kolom RAOS PIN di sheet kosong saat sync terakhir, atau auth user belum ada — GAS skip dengan warning "auth user belum ada — jalankan Sync Staff dulu")

**Legacy (superseded, JANGAN dipakai):** RPC `raos_verify_and_bridge` + kolom `raos_credentials.ssot_pin` (dari SQL awal `sql/raos_068_raos_credentials_bridge.sql`) — desain lama yang mirror plaintext PIN kolom H buat sign-in transparent. Sudah digantikan `raos_verify_login_secret` + bcrypt saat P8 (EXECUTE legacy RPC di-revoke, "Legacy raos_verify_and_bridge runtime EXECUTE: 0" di reconciliation `sql/p8_production_reconciliation_20260810.sql`). `ssot_pin` kolom masih ada di tabel untuk rollback window tapi tidak dipakai flow aktif.

## Driver Airport Sync — `gas/12_driver_airport_sync.gs`

**SSoT:**
- Spreadsheet "Database Driver Airport" `1FEZxyHPx_GCQKw92hLSf6QxxkXgZn5R1sRswOYM_Tlc`
- Tab: **"ID Rifim Airport Soeta"** (RAOS = Soekarno-Hatta)
- Reference: `C:\Projects\menala\SSOT_DATA_SOURCES.md`

**Trigger:** `syncDriverAirportFromSSOT()` — otomatis tiap 6 jam + menu manual "🛠️ RAOS System → 🚗 Driver → 🔄 Sync Driver Airport Soeta (SSOT)"

**Kolom `raos_drivers.source`** (migration `raos_020`):
- `ssot_driver_airport` — auto-sync `driver_id/name/is_active`, TIDAK BOLEH diedit manual (akan tertimpa)
- `manual` — diinput staff via `/admin` form "Tambah Driver". Sync SSOT tidak menyentuh baris ini.

**Kolom RAOS-only** (TIDAK ada di sheet SSoT):
- `phone`, `vehicle_type`, `vehicle_plate`, `barcode`, `branch_id` — lengkapi manual via `/admin` setelah driver muncul dari sync

## Soft-Delete Pattern

Staff/driver yang hilang dari sheet SSoT di-nonaktifkan (`is_active=false`), **bukan di-delete** — supaya histori `scan_orders`/`raos_attendance` (FK ke `user_profiles.id` / `raos_drivers.id`) aman.

## Script Properties Override

Kalau ID spreadsheet SSoT berubah, override via Script Properties:
- `MASTER_STAFF_SHEET_ID`
- `DRIVER_AIRPORT_SHEET_ID`

Default hardcode ke ID di atas.

## Yang BUKAN Sync SSoT — Kolom RAOS-Only

- **Trigger `prevent_self_privilege_escalation()`** di `user_profiles` (sesi 13, migration `raos_021`) TETAP AKTIF: siapapun (termasuk admin) tidak bisa ubah `role`/`is_active` baris miliknya sendiri kecuali dia sudah admin/direksi — cegah staff biasa self-promote
- **Policy `user_profiles_update_admin`** (migration `raos_021`) TETAP DIPAKAI oleh `/admin` untuk edit `branch_id`/`is_active` staff dari client, tanpa service role key

## `SUPABASE_SERVICE_ROLE_KEY` di PWA — SUDAH TIDAK DIPAKAI

Setelah rollback sesi 14. Hapus dari `.env.local` dan Vercel env vars kalau sempat di-set sesi 13.

**Service role key sekarang hanya di GAS** (`SUPABASE_SERVICE_KEY` di Script Properties, sudah lama ada) untuk buat auth user via `/auth/v1/admin/users`.

## HRIS Sync (Rifim-OS Side)

Rifim-OS punya `automation/apps-script/hrisMasterStaffSync.js` sync sheet MASTER DATA STAFF → `employees` (HRIS), interval 10 menit paralel dengan RAOS user_profiles sync. Lihat CLAUDE.md rifim-os untuk detail.

## Menu Hidden (Pre-SSOT Era)

Menu 🚗 Driver "Isi Data Mock Driver" & "Import Driver ke Supabase" HIDDEN dari `10_menu.gs` — insert `source=manual` bisa duplikat dengan sync SSoT. Fungsi masih ada di `03_order.gs` untuk debug manual dari script editor.

## Debt Manual (User yang Eksekusi)

1. Isi PIN Hendro di sheet MASTER DATA STAFF kolom H (≥6 digit angka)
2. Set `branch_id` (T1/T2/T3) Hendro via `/admin` PWA
3. Tambah kolom Jabatan DIREKSI di HRIS supaya mapping role direksi bisa
4. **Jalankan "Sync PIN RAOS" manual** — `syncRaosCredentials()` belum jalan sejak 2026-08-10, staff yang PIN RAOS-nya diganti di sheet setelah tanggal itu (mis. `yudiultra02@gmail.com` / kode `M040`, login gagal terus sejak 2026-08-13) belum ke-propagate ke `raos_credentials`
5. Pertimbangkan tambah cron trigger otomatis untuk `syncRaosCredentials()` (saat ini manual-only, beda dari staff sync yang 10 menit) — supaya ganti PIN RAOS di sheet tidak butuh admin trigger manual tiap kali
