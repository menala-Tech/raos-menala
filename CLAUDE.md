# CLAUDE.md — RAOS Project
*Panduan Claude Code untuk proyek RAOS*

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
├── gas/               ← 10 Google Apps Script modules
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
Subfolder bulan berikutnya (`2026-08 Agustus`, dst) dibuat sesuai kebutuhan — belum ada
otomasi GAS untuk generate folder bulan baru otomatis, ini next step kalau diperlukan.

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
   `raos_attendance`, `scan_orders`, `branches`, `pickup_points`, `shifts`, `kpi_targets`,
   `chat_rooms`, `chat_messages`, `activity_logs`, `system_logs`, `notifications`, `system_config`

## Modul PWA
| Route | Fungsi |
|---|---|
| `/` | Login |
| `/dashboard` | Beranda + statistik |
| `/scan` | Scan barcode driver |
| `/absensi` | Absensi masuk/pulang + GPS |
| `/riwayat` | History scan & absensi |
| `/chat` | Chat room staff (realtime) |
| `/settings` | Pengaturan akun & app |
