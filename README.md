# RAOS — Rifim Airport Operation System
**Multi-Cabang PWA untuk operasional 9 cabang RIFIM**

> Real-time • Aman • Scalable • Mobile-First PWA
> v2.5.0-chatrooms (sesi 20 selesai — 26 Juli 2026)

---

## 🌍 Cakupan Cabang (9 aktif)

| # | Slug | Mode Target | Sub-terminal |
|---|---|---|---|
| 1 | ID Rifim Airport Soeta | Order (Scan Valid) | T1 / T2 / T3 |
| 2 | ID Rifim Airport Batam | Saldo (Rp) 45k/95k | — |
| 3 | ID Rifim Airport Jambi | Saldo (Rp) 45k/95k | — |
| 4 | ID Rifim Airport Balikpapan | Saldo (Rp) 45k/95k/145k/195k | — |
| 5 | ID Rifim Airport Manado | Saldo (Rp) 45k/95k | — |
| 6 | ID Rifim Airport Pekanbaru | Saldo (Rp) 45k/95k/145k/195k | — |
| 7 | ID Rifim Airport Makassar | Saldo (Rp) 45k/95k/145k/195k | — |
| 8 | ID Rifim Batam (non-airport) | Saldo (Rp) 45k/95k | — |
| 9 | ID Rifim Jambi Luar | Saldo (Rp) 45k/95k | — |

RLS scope per cabang via `is_branch_in_scope(uuid)` — staff/koord scoped,
admin/mgmt/direksi bypass. Koordinat 5 airport dari rifim-isi-saldo
(radius 1000m). `is_geofence_exempt` untuk role tertentu.

---

## 🧱 Stack

| Layer | Teknologi |
|---|---|
| Frontend | Next.js 14 + TypeScript + Tailwind + PWA (offline queue IndexedDB) |
| Database | Supabase (PostgreSQL + Auth + Realtime + RLS + Edge Function) |
| Automation | Google Apps Script (18 modul) |
| Notification | Web Push VAPID (Edge Function `raos-send-push` v8) |
| Deploy | Vercel (auto dari GitHub `main`) |
| Storage | Google Drive (foto selfie + backup + subfolder per cabang) |

---

## 🗂 Struktur Folder

```
RAOS/
├── apps/pwa/              ← Next.js PWA (frontend utama)
│   ├── public/
│   │   └── icons/         ← 5 variant install (staff/koord/mgmt/direksi/driver)
│   └── src/
│       ├── app/           ← 17 route
│       ├── components/    ← BottomNav, AppShell, SaldoRequestCard, DriverQueueCard,
│       │                    IsiSaldoBottomSheet, MenalaLogo, DateTimeHeader, ...
│       ├── lib/           ← supabase, saldoRequest, driverQueue, offlineQueue, geo,
│       │                    push, pushClient, roleGuard, variantManifest, ...
│       └── types/         ← TypeScript types
├── gas/                   ← 18 GAS modules (config/absensi/order/kpi/notif/sync/saldo/queue)
├── sql/                   ← Schema legacy + reference
├── docs/
│   └── COLLABORATION.md   ← Panduan Claude + Codex paralel
├── .github/workflows/     ← CI (Lint + Type Check)
├── SESSION_PROMPT.md      ← Master resumable prompt (25 poin roadmap)
├── CLAUDE.md              ← Panduan teknis + state fitur
├── RULE_PROJECT.md        ← Rule book operasional
├── STATUS.md              ← Kronologi per sesi
├── KPI_PORT_PLAN.md       ← Blueprint KPI dari HRIS
├── Upgrade Full Cabang.md ← Roadmap 25 poin (source dari user)
└── README.md              ← File ini
```

---

## 📱 Modul PWA (17 route)

| Route | Fungsi | Role |
|---|---|---|
| `/` | Login email + PIN dari SSoT | Semua |
| `/dashboard` | Beranda + statistik + MiniCalendar | Semua |
| `/scan` | Scan barcode (hard-block staff > radius+50m) | Staff |
| `/absensi` | Absensi + GPS tiered + selfie (offline queue) | Semua |
| `/riwayat` | History scan/absensi/isi saldo + pin status (1/7/30 hari) | Semua |
| `/chat` | Chat realtime + 5 slash command + read receipt + mention @ | Semua |
| `/settings` | Preferensi + tema + ukuran teks + toggle 7 kategori notif | Semua |
| `/settings/bantuan` | 8 FAQ + info app + cara install per role | Semua |
| `/admin` | Validasi + kelola staff + branch dropdown + bulk-create room | Admin+ |
| `/admin/barcodes` | Generator QR driver | Admin |
| `/validasi-saldo` | Approve/reject Isi Saldo (RLS cabang scope) | Koord+ |
| `/antrian-driver` | Real-time monitor queue driver + tombol PANGGIL/SELESAI | Semua |
| `/drivers` | View + edit driver (kolom RAOS-only) | Admin |
| `/kpi` | KPI staff dual-mode (Soeta=Order, lainnya=Saldo) | Koord+ |
| `/laporan` | Laporan + export xlsx/PDF | Koord+ |
| `/status` | Status validasi (donut chart) | Semua |
| `/notifications` | Notif list | Semua |

**5 install variant** (Opsi C sesi 18): `raos-menala.vercel.app` (staff default)
+ `?role=koord` / `?role=mgmt` / `?role=direksi` / `?role=driver`. Icon &
manifest dinamis per variant. Role gating via `lib/roleGuard.ts` (allow-list
route per role + defaultLandingForRole).

---

## 💬 Chat Slash Commands + Fitur

### Slash commands
| Command | Fungsi | Constraint |
|---|---|---|
| `/isi saldo 95000` (support `/isisaldo`, spasi/underscore/dash) | Pengajuan isi saldo | Nominal validated per cabang |
| `/antri 172749767` | Driver join queue cabang | Room dengan branch spesifik |
| `/panggil 1` | Staff panggil driver posisi 1 | idem |
| `/selesai 1` | Selesai jemput dari posisi 1 (status called) | idem |
| `/keluar 172749767` | Driver keluar antrean | idem |

### Fitur chat (sesi 20)
- **Read receipt centang 1/2**: `Check` (terkirim), `CheckCheck` abu
  (partial), `CheckCheck` sky (dibaca semua). Tap → modal daftar pembaca.
- **Mention @nama**: dropdown autocomplete Staff + Driver Cabang Ini (icon Truck).
  Klik → insert `@Nama` di text. Push khusus `📣 Anda di-tag` untuk yang di-tag.
- **Hapus per-pesan**: sender atau admin/koord+ via action menu long-press.
  Realtime DELETE listener → auto-hilang di semua user.
- **Hapus semua pesan (untuk Saya)**: semua user boleh, hanya sembunyi di
  device sendiri. Pesan baru setelah cutoff tetap muncul.
- **Retensi pesan**: 7/30/90 hari atau Tidak. Semua PWA bisa ubah.
- **Room global vs per-cabang**: 3 global (Umum/Pengumuman/Absensi
  auto-member semua staff) + 2 per-cabang (Pengisian Saldo + Driver).
- **Pengumuman notif high-level**: bypass filter chat_room supaya sampai
  walau toggle chat off.
- **Wallet toggle Isi Saldo**: muncul di room Pengisian Saldo per-cabang
  → buka `IsiSaldoBottomSheet` (nominal picker + driver dropdown).

---

## 🗄 Supabase Tables — RAOS-only

| Tabel | Isi | Row count (26 Jul) |
|---|---|---|
| `branches` | 9 top-level + 3 sub Soeta (T1/T2/T3) | 12 |
| `user_profiles` | Staff RIFIM dari SSoT (semua cabang, hub multi-PWA) | 29 |
| `raos_drivers` | Driver airport (7 tab) + driver eksternal (2 tab) | 233+ |
| `pickup_points` | 9 pickup point Soetta | 9 |
| `shifts` | Pagi/Siang/Malam | 3 |
| `raos_attendance` | Absensi (GPS, selfie, shift) | — |
| `scan_orders` | Order scan barcode | — |
| `raos_saldo_requests` | Pengajuan isi saldo + driver info | — |
| `raos_driver_queue` | Antrian driver FIFO + realtime | — |
| `kpi_targets` | Target & realisasi KPI dual-mode | 26 |
| `chat_rooms` | 3 global + 2×9 per-cabang (5 stale soft-deleted sesi 20) | ~21 aktif |
| `chat_messages` | Pesan realtime + `mentions uuid[]` (sesi 20) | — |
| `chat_message_reads` | Read receipt per user per message (sesi 20) | — |
| `chat_room_local_clears` | Cutoff hapus lokal per user per room (sesi 20) | — |
| `chat_room_members`, `chat_message_attachments`, `chat_message_reactions`, `chat_polls`, `chat_poll_votes`, `raos_chat_room_reads` | Sub-tabel chat | — |
| `activity_logs`, `system_logs`, `notifications`, `system_config` | Audit + config | — |
| `push_subscriptions` | Web Push VAPID (7 kategori filter) | — |

---

## 🚀 Quick Start

### 1. PWA (Next.js)
```bash
cd apps/pwa
cp .env.local.example .env.local  # isi NEXT_PUBLIC_SUPABASE_URL + ANON_KEY + VAPID_PUBLIC_KEY
npm install
npm run dev
```

### 2. Supabase
- Project: `vlievtojpmrbsmzlqswl`
- URL: `https://vlievtojpmrbsmzlqswl.supabase.co`
- **Migration terakhir: `raos_056_reseed_room_members` (56 total)**
- Edge Function: `raos-send-push v8`, `send-admin-push v4` ACTIVE
- Vault secret `raos_service_role_key` — format `sb_secret_*` (bukan legacy JWT)

### 3. Google Apps Script
- Project name: **RAOS System — Rifim Airport Operation System**
- Script ID: `1iMN1ZGZVM0x2nSWmGMVx_umtEEzR-VQMwDZqK_pgHOzzOKVEprSN91jb`
- Script Properties wajib:
  - `SUPABASE_URL` = `https://vlievtojpmrbsmzlqswl.supabase.co`
  - `SUPABASE_SERVICE_KEY` = service_role
  - `SPREADSHEET_ID` = `1eYS2mM3Sy-BNAVGfp8BUHtsZuLiGDetnJeGw-AWk__8`
  - `BACKUP_FOLDER_ID` = folder Drive backup
- Jalankan sekali: `setupAllTriggers()` + `initSistemConfig()` +
  `initKpiSheetsRAOS()` + `initSheetFormIsiSaldo()`
- 16+ cron trigger aktif (staff sync 6h, driver 10m, KPI 22:00, dst)

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
| Data Staff | `1fcraq3QHqIaD-13Ebzt6stT9aA6j_loTXeAtpNX12kw` — **MASTER DATA STAFF** | Semua staff RIFIM (hub multi-PWA) |
| Driver Airport | `1FEZxyHPx_GCQKw92hLSf6QxxkXgZn5R1sRswOYM_Tlc` — **Database Driver Airport** | 7 tab airport aktif |
| Driver Eksternal | `1suoDC-RsWOgTHiLq4max6iIsWe39Ou-RMddRXl5DVJc` — **Database Driver External** | Batam + Jambi Luar |

Sync satu-arah Google Sheets → Supabase. RAOS **read-only** dari SSoT.
Setelah staff baru sync, admin panggil RPC
`raos_reseed_all_branch_room_members()` untuk auto-add ke semua per-cabang room.

---

## 🔔 Kategori Push Notif (Filter per User)

Setiap call site push WAJIB set `kategori` supaya Edge Function `raos-send-push`
bisa filter target berdasarkan `user_profiles.notification_prefs`.

| Key | Konteks |
|---|---|
| `scan_berhasil` | Hasil scan ke staff pemilik |
| `validasi_koordinator` | Scan pending + pengajuan Isi Saldo baru |
| `pengingat_absen` | Reminder masuk/pulang 6 waktu per shift |
| `pengumuman` | Broadcast + saldo status + bot pribadi progress + mention @ |
| `chat_room` | Pesan chat + broadcast absensi (kecuali user di `NEW.mentions`) |
| `master` | Toggle master — kalau false, SEMUA di-skip |

---

## 📊 Session Resume

Kalau sesi Claude Code habis token, paste isi section **🚀 PROMPT UNTUK PASTE**
dari [SESSION_PROMPT.md](SESSION_PROMPT.md) ke sesi baru — dia lanjut dari
checkpoint terakhir.

Untuk kerja Remote dari HP: buka https://claude.ai/code, pilih repo
`menala-Tech/raos-menala`, paste prompt di atas. Semua file lokal `apps/`,
`gas/`, `docs/`, dokumen root sudah sinkron di GitHub main.

---

## 🛣 Roadmap (25 poin, `Upgrade Full Cabang.md`)

| Phase | Status |
|---|---|
| P1 Foundation Multi-Cabang (schema + RLS + 9 cabang) | ✅ DONE (sesi 17) |
| P2 Isi Saldo via Chat Room + form BottomSheet | ✅ DONE (sesi 17-18, refined sesi 19-20) |
| P3 Antrian Driver via Chat + real-time monitor | ✅ DONE (sesi 17) |
| P4 Opsi C — 1 codebase + role gating + 5 install variant | ✅ DONE (sesi 18) |
| **Chat rooms 5 batch fitur** (read receipt, mention, hapus, retensi, pengumuman) | ✅ DONE (sesi 20) |
| P5 Integrasi rifim-os (PWA pusat) | ⏳ pending |
| P6 Riwayat scope per role + composite index | ⏳ pending |
| P7 KPI multi-cabang test + Storage per cabang | ⏳ pending |

---

*RAOS v2.5.0-chatrooms • © 2026 PT. Rifim Internasional Gemilang*
