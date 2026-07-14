# RAOS — Rifim Airport Operation System
**Menala Airport Operation System (MENALA SOETA)**

> Sistem terintegrasi untuk operasional Vendor Maxim di Bandara Soekarno-Hatta.  
> Real-time • Aman • Scalable • Mobile-First PWA

---

## Stack Teknologi
| Layer | Teknologi |
|---|---|
| Frontend | Next.js 14 + TypeScript + Tailwind CSS (PWA) |
| Database | Supabase (PostgreSQL + Realtime + Auth + RLS) |
| Automation | Google Apps Script (10 modul) |
| Deploy | Vercel (auto dari GitHub) |
| Storage | Google Drive (backup harian) |

## Alur Data
```
Spreadsheet → GAS → Supabase → Vercel PWA → Google Drive
```

## Struktur Folder
```
RAOS/
├── apps/pwa/          ← Next.js PWA (frontend utama)
│   ├── src/app/       ← Pages (login, dashboard, scan, absensi, riwayat, chat, settings)
│   ├── src/components/← BottomNav, AppShell
│   ├── src/lib/       ← Supabase client
│   └── src/types/     ← TypeScript types
├── gas/               ← 10 Google Apps Script modules
│   ├── 01_config.gs   ← Konfigurasi global
│   ├── 02_absensi.gs  ← Sync & rekap absensi
│   ├── 03_order.gs    ← Import & validasi order
│   ├── 04_kpi.gs      ← Hitung KPI staff
│   ├── 05_notifikasi.gs ← WhatsApp & Email
│   ├── 06_dashboard.gs ← Push data ke Supabase
│   ├── 07_backup.gs   ← Backup ke Google Drive
│   ├── 08_util.gs     ← Fungsi pembantu
│   ├── 09_trigger.gs  ← Trigger otomatis
│   └── 10_menu.gs     ← Menu custom spreadsheet
├── sql/               ← Schema, RLS, Seed
├── .github/workflows/ ← CI/CD ke Vercel
├── vercel.json        ← Konfigurasi deployment
└── CLAUDE.md          ← Panduan AI development

```

## Quick Start

### 1. PWA (Next.js)
```bash
cd apps/pwa
cp .env.local.example .env.local
npm install
npm run dev
```

### 2. Supabase
- Project: `vlievtojpmrbsmzlqswl`
- URL: `https://vlievtojpmrbsmzlqswl.supabase.co`
- Migration sudah di-apply via Supabase MCP

### 3. Google Apps Script
1. Buka Google Spreadsheet RAOS
2. Extensions → Apps Script
3. Copy semua file dari `gas/` ke Apps Script editor
4. Set Script Properties:
   - `SUPABASE_URL` = `https://vlievtojpmrbsmzlqswl.supabase.co`
   - `SUPABASE_SERVICE_KEY` = (dari Supabase Dashboard → Settings → API)
   - `BACKUP_FOLDER_ID` = ID folder Google Drive untuk backup
5. Jalankan `setupAllTriggers()` → semua cron otomatis aktif

### 4. Vercel Deployment
```bash
# Pertama kali
vercel

# Setelah setup project di Vercel:
# Tambah environment variables di Vercel Dashboard
# NEXT_PUBLIC_SUPABASE_URL
# NEXT_PUBLIC_SUPABASE_ANON_KEY
```

### 5. GitHub Secrets (untuk CI/CD)
```
VERCEL_TOKEN       = token dari vercel.com/account/tokens
VERCEL_ORG_ID      = dari .vercel/project.json setelah vercel init
VERCEL_PROJECT_ID  = dari .vercel/project.json setelah vercel init
```

## Modul PWA
| Route | Fungsi | Role |
|---|---|---|
| `/` | Login (Email/Google) | Semua |
| `/dashboard` | Beranda + statistik hari ini | Semua |
| `/scan` | Scan barcode driver (OVS) | Staff |
| `/absensi` | Absensi masuk/pulang + GPS + selfie | Staff |
| `/riwayat` | History scan & absensi + filter | Semua |
| `/chat` | Chat room staff (realtime) | Semua |
| `/settings` | Pengaturan akun & aplikasi | Semua |

## Supabase Tables
| Tabel | Keterangan |
|---|---|
| `drivers` | 422 driver existing (id_maxim, nama_driver, cabang) |
| `employees` | 31 karyawan existing |
| `attendance` | Absensi (extended: GPS, selfie, shift) |
| `user_profiles` | Profil staff RAOS (linked auth.users) |
| `scan_orders` | Order scan barcode OVS |
| `branches` | Terminal 1, 2, 3 |
| `pickup_points` | 9 pickup point Soetta |
| `shifts` | Pagi/Siang/Malam |
| `kpi_targets` | Target & realisasi KPI per staff |
| `chat_rooms` | 6 room default |
| `chat_messages` | Pesan realtime |
| `system_config` | Parameter global sistem |
| `activity_logs` | Audit trail |
| `system_logs` | Log proses otomatis |
| `notifications` | Notifikasi push |

---
*RAOS v1.0.0 • © 2024 MENALA • Rifim Internasional Gemilang*
