# RAOS — Rifim Airport Operation System
**Multi-Cabang PWA untuk operasional 9 cabang RIFIM**

> Real-time • Aman • Scalable • Mobile-First PWA
> v2.0.0-multicabang (sesi 17 — 25 Juli 2026)

---

## 🌍 Cakupan Cabang (9 aktif)

| # | Slug | Mode Target | Sub-terminal |
|---|---|---|---|
| 1 | ID Rifim Airport Soeta | Order (Scan Valid) | T1 / T2 / T3 |
| 2 | ID Rifim Airport Batam | Saldo (Rp) | — |
| 3 | ID Rifim Airport Jambi | Saldo (Rp) | — |
| 4 | ID Rifim Airport Balikpapan | Saldo (Rp) | — |
| 5 | ID Rifim Airport Manado | Saldo (Rp) | — |
| 6 | ID Rifim Airport Pekanbaru | Saldo (Rp) | — |
| 7 | ID Rifim Airport Makassar | Saldo (Rp) | — |
| 8 | ID Rifim Batam (non-airport) | Saldo (Rp) | — |
| 9 | ID Rifim Jambi Luar | Saldo (Rp) | — |

RLS scope per cabang via `is_branch_in_scope(uuid)` — staff/koord scoped,
admin/mgmt/direksi bypass.

---

## 🧱 Stack

| Layer | Teknologi |
|---|---|
| Frontend | Next.js 14 + TypeScript + Tailwind + PWA (offline queue IndexedDB) |
| Database | Supabase (PostgreSQL + Auth + Realtime + RLS + Edge Function) |
| Automation | Google Apps Script (17 modul) |
| Notification | Web Push VAPID (Edge Function `raos-send-push` v8) |
| Deploy | Vercel (auto dari GitHub) |
| Storage | Google Drive (foto selfie + backup) |

---

## 🗂 Struktur Folder

```
RAOS/
├── apps/pwa/              ← Next.js PWA (frontend utama)
│   └── src/
│       ├── app/           ← 15 route
│       ├── components/    ← BottomNav, AppShell, SaldoRequestCard, DriverQueueCard, ...
│       ├── lib/           ← supabase, saldoRequest, driverQueue, offlineQueue, geo, ...
│       └── types/         ← TypeScript types
├── gas/                   ← 17 GAS modules (config/absensi/order/kpi/notif/sync/saldo)
├── sql/                   ← Schema legacy + reference
├── .github/workflows/     ← CI (Lint + Type Check)
├── SESSION_PROMPT.md      ← Master resumable prompt (25 poin roadmap)
├── CLAUDE.md              ← Panduan teknis + state fitur
├── RULE_PROJECT.md        ← Rule book operasional
├── STATUS.md              ← Kronologi per sesi
├── KPI_PORT_PLAN.md       ← Blueprint KPI dari HRIS
├── Upgrade Full Cabang.md ← Roadmap 25 poin (source)
└── README.md              ← File ini
```

---

## 📱 Modul PWA (17 route)

| Route | Fungsi | Role |
|---|---|---|
| `/` | Login email + PIN dari SSoT | Semua |
| `/dashboard` | Beranda + statistik | Semua |
| `/scan` | Scan barcode (hard-block staff > radius+50m) | Staff |
| `/absensi` | Absensi + GPS + selfie (offline queue) | Semua |
| `/riwayat` | History scan/absensi/isi saldo + pin status | Semua |
| `/chat` | Chat realtime + 5 slash command | Semua |
| `/settings` | Preferensi + tema + ukuran teks | Semua |
| `/settings/bantuan` | FAQ collapsible | Semua |
| `/admin` | Validasi + kelola staff + branch dropdown + bulk-create room | Admin+ |
| `/admin/barcodes` | Generator QR driver | Admin |
| `/validasi-saldo` | **Baru sesi 17** — approve/reject Isi Saldo | Koord+ |
| `/antrian-driver` | **Baru sesi 17** — real-time monitor queue | Semua |
| `/drivers` | View + edit driver | Admin |
| `/kpi` | KPI staff | Koord+ |
| `/laporan` | Laporan + export xlsx/PDF | Koord+ |
| `/status` | Status validasi | Semua |
| `/notifications` | Notif list | Semua |

---

## 💬 Chat Slash Commands

| Command | Fungsi | Constraint |
|---|---|---|
| `/isisaldo 45000` atau `/isisaldo 45k` | Pengajuan isi saldo (per cabang, nominal validated) | Semua staff |
| `/antri 172749767` | Driver join queue cabang | Room dengan branch spesifik |
| `/panggil 1` | Staff panggil driver posisi 1 | idem |
| `/selesai 1` | Selesai jemput dari posisi 1 (status called) | idem |
| `/keluar 172749767` | Driver keluar antrean | idem |

---

## 🗄 Supabase Tables — RAOS-only (25+ table)

| Tabel | Isi | Row count (25 Jul) |
|---|---|---|
| `branches` | 9 top-level + 3 sub Soeta (T1/T2/T3) | 12 |
| `user_profiles` | Staff RIFIM dari SSoT MASTER DATA STAFF | 27 |
| `raos_drivers` | Driver airport dari 7 tab SSoT | 233 |
| `pickup_points` | 9 pickup point Soetta | 9 |
| `shifts` | Pagi/Siang/Malam | 3 |
| `raos_attendance` | Absensi (GPS, selfie, shift) | 3 |
| `scan_orders` | Order scan barcode | 0 |
| `raos_saldo_requests` | **Baru** — pengajuan isi saldo | 0 |
| `raos_driver_queue` | **Baru** — antrian driver FIFO | 0 |
| `kpi_targets` | Target & realisasi KPI | 26 |
| `chat_rooms` | Room chat (9 default + per-cabang) | 9 |
| `chat_messages` | Pesan realtime + saldo_request + driver_queue | 46 |
| `chat_room_members`, `chat_message_attachments`, `chat_message_reactions`, `chat_polls`, `chat_poll_votes`, `raos_chat_room_reads` | Sub-tabel chat | — |
| `activity_logs`, `system_logs`, `notifications`, `system_config` | Audit + config | — |
| `push_subscriptions` | Web Push VAPID | 1 |
| `admin_push_subscriptions` | Push proyek lain (jangan disentuh) | 4 |

---

## 🚀 Quick Start

### 1. PWA (Next.js)
```bash
cd apps/pwa
cp .env.local.example .env.local  # isi NEXT_PUBLIC_SUPABASE_URL + ANON_KEY
npm install
npm run dev
```

### 2. Supabase
- Project: `vlievtojpmrbsmzlqswl`
- URL: `https://vlievtojpmrbsmzlqswl.supabase.co`
- Migration terakhir: `raos_044_system_bot_fallback` (44 total)
- Edge Function: `raos-send-push v8`, `send-admin-push v4` ACTIVE

### 3. Google Apps Script
- Project name: **RAOS System — Rifim Airport Operation System**
- Script ID: `1iMN1ZGZVM0x2nSWmGMVx_umtEEzR-VQMwDZqK_pgHOzzOKVEprSN91jb`
- Script Properties wajib:
  - `SUPABASE_URL` = `https://vlievtojpmrbsmzlqswl.supabase.co`
  - `SUPABASE_SERVICE_KEY` = service_role
  - `SPREADSHEET_ID` = `1eYS2mM3Sy-BNAVGfp8BUHtsZuLiGDetnJeGw-AWk__8`
  - `BACKUP_FOLDER_ID` = folder Drive backup
- Jalankan sekali: `setupAllTriggers()` + `initSistemConfig()` + `initKpiSheetsRAOS()` + `initSheetFormIsiSaldo()`

### 4. Vercel
- Team: `team_PpkAToo3Pg1CgnG0vefYMO52`
- Project: `prj_HMJQFxTfF6s9bhTJeT1W0iSqCdCj` (`raos-menala`)
- URL: https://raos-menala.vercel.app
- Auto-deploy dari branch `main` GitHub

---

## 📋 SSoT Data Sources (WAJIB)

Lihat `C:\Projects\menala\SSOT_DATA_SOURCES.md` untuk detail. Ringkasan:

| Domain | Sheet ID | Cakupan |
|---|---|---|
| Data Staff | `1fcraq3QHqIaD-13Ebzt6stT9aA6j_loTXeAtpNX12kw` — **MASTER DATA STAFF** | Semua staff RIFIM |
| Driver Airport | `1FEZxyHPx_GCQKw92hLSf6QxxkXgZn5R1sRswOYM_Tlc` — **Database Driver Airport** | 7 tab airport aktif |
| Driver Eksternal | `1suoDC-RsWOgTHiLq4max6iIsWe39Ou-RMddRXl5DVJc` — **Database Driver External** | Batam + Jambi Luar |

Sync satu-arah Google Sheets → Supabase. RAOS **read-only** dari SSoT.

---

## 📊 Session Resume

Kalau sesi Claude Code habis token, paste isi section **🚀 PROMPT UNTUK PASTE**
dari [SESSION_PROMPT.md](SESSION_PROMPT.md) ke sesi baru — dia lanjut dari
checkpoint terakhir.

---

## 🛣 Roadmap (25 poin, `Upgrade Full Cabang.md`)

| Phase | Status |
|---|---|
| P1 Foundation Multi-Cabang | ✅ DONE (sesi 17) |
| P2 Isi Saldo via Chat | ✅ DONE (sesi 17) |
| P3 Antrian Driver via Chat | ✅ DONE (sesi 17) |
| P4 Split 5 PWA (Staff/Koord/Mgmt/Direksi/Driver) | ⏳ Perlu validasi arsitektur |
| P5 Integrasi rifim-os (PWA pusat) | ⏳ |
| P6 Riwayat per role scope 1/7/30 hari | ⏳ |
| P7 KPI multi-cabang test + Storage per cabang | ⏳ |

---

*RAOS v2.0.0-multicabang • © 2026 PT. Rifim Internasional Gemilang*
