# SESSION PROMPT — RAOS Multi-Cabang Upgrade

> **Cara pakai file ini:** buka sesi baru Claude Code di folder
> `C:\Projects\menala\RAOS`. Paste seluruh isi section
> [🚀 PROMPT UNTUK PASTE](#-prompt-untuk-paste) ke Claude → dia baca
> file ini + lanjutkan pekerjaan tepat dari checkpoint terakhir.
> Update terakhir: 2026-07-25 (sesi 18 — P4 Opsi C DONE + advisor lockdown + hub multi-PWA)

---

## 🚀 PROMPT UNTUK PASTE

```
Mulai sesi lanjutan: RAOS Multi-Cabang Upgrade

Folder lokal  : C:\Projects\menala\RAOS
Repo root     : C:\Projects\menala\RAOS
URL live      : https://raos-menala.vercel.app
GitHub        : https://github.com/menala-Tech/raos-menala
Vercel projId : prj_HMJQFxTfF6s9bhTJeT1W0iSqCdCj
Supabase      : vlievtojpmrbsmzlqswl
GAS scriptId  : 1iMN1ZGZVM0x2nSWmGMVx_umtEEzR-VQMwDZqK_pgHOzzOKVEprSN91jb

Baca 6 file wajib SEBELUM eksekusi apapun:
1. SESSION_PROMPT.md — roadmap 25 poin, status per poin, checkpoint terakhir
2. CLAUDE.md — panduan teknis + state fitur
3. RULE_PROJECT.md — rule book (SSoT, boundary, konvensi)
4. STATUS.md — kronologi sesi
5. Upgrade Full Cabang.md — sumber roadmap 25 poin
6. KPI_PORT_PLAN.md — KPI pipeline

Baca juga:
- C:\Projects\menala\SSOT_DATA_SOURCES.md — sumber data lintas PWA
- 3 codebase referensi yang akan di-integrate:
  - C:\Projects\menala\rifim-isi-saldo (isi saldo feature source)
  - C:\Projects\menala\radms-driver (antrian driver + geofencing multi-cabang)
  - C:\Projects\menala\rifim-os (PWA pusat, RAOS bakal jadi salah satu modul)

Lalu:
1. Cek section "Progress Tracker" di SESSION_PROMPT.md untuk tahu
   phase mana yang sudah selesai + phase apa yang next
2. Lanjutkan dari phase pertama yang belum ✅ COMPLETED
3. Update SESSION_PROMPT.md checkpoint setiap kali selesai satu poin
4. Commit + push tiap milestone

Aturan yang wajib dipatuhi:
- Jangan menghilangkan/mengurangi fungsi existing (poin 24)
- Sinkron ke spreadsheet RAOS 1eYS2mM3Sy... saja (poin 22, jangan ke spreadsheet lain)
- Storage di Google Drive folder 136ItduoAa_abdiYpOSJS1G3X7ti0YUrU (poin 22b)
- Validasi user sebelum ubah Blueprint/Rule/Claude/SSoT (poin 23)
- Update file lokal harus di-push ke GitHub (poin 25)
```

---

## 📋 Roadmap 25 Poin (dari Upgrade Full Cabang.md)

Sumber: `Upgrade Full Cabang.md`. Tiap poin dikelompokkan ke phase.

### Phase 1 — Foundation Multi-Cabang (schema + RLS)

- **P1.1** Extend `branches` table: timezone, geofence coordinates, radius,
  cabang_slug (7 cabang aktif: Batam, Jambi, Balikpapan, Manado,
  Pekanbaru, Makassar, Soeta). Poin 4, 5.
- **P1.2** Migration RLS: `user_profiles.branch_id` scope per cabang untuk
  staff/koord; admin/mgmt/direksi bypass. Applied ke `raos_attendance`,
  `scan_orders`, `raos_drivers`, `chat_rooms/messages` (kecuali Umum/
  Pengumuman). Poin 1, 2, 3, 6, 10, 11, 12, 13.
- **P1.3** Seed 7 branches baru + backfill existing. Koordinat + radius +
  timezone dari radms-driver reference.
- **P1.4** Update `user_profiles` sync SSoT: staff/koord auto-set
  `branch_id` dari kolom D "ID CABANG" (mapping 8 cabang ke UUID). Poin 1.

### Phase 2 — Feature: Isi Saldo via Chat Room

- **P2.1** Reference clone: baca `rifim-isi-saldo/` untuk UI/UX + schema
  form pengisian saldo. Poin 1.
- **P2.2** Tabel `raos_saldo_requests` di Supabase (request ID, staff_id,
  branch_id, jumlah, status, chat_message_id link). RLS per cabang.
- **P2.3** Endpoint chat: pengajuan via slash command `/isisaldo <jumlah>`
  di chat room khusus staff. Auto-post pesan format + save request.
- **P2.4** Approval flow: koord/admin approve/reject via button in-chat.
- **P2.5** Sinkron ke sheet **Form Isi Saldo** di spreadsheet RAOS
  (sesi berikutnya perlu buat tab ini). Poin 22.

### Phase 3 — Feature: Antrian Driver via Chat Room

- **P3.1** Reference clone: baca `radms-driver/` untuk model antrian
  + panggilan. Poin 15.
- **P3.2** Tabel `raos_driver_queue` (branch_id, driver_id, joined_at,
  status: waiting/called/served/cancelled).
- **P3.3** Chat command: driver `/antri`, staff `/panggil <nomor>` di
  Room Driver cabang. Auto-broadcast + notif push.
- **P3.4** Monitoring: koord lihat antrian real-time via `/queue-status`.

### Phase 4 — Split ke 5 PWA (Staff/Koord/Mgmt/Direksi/Driver)

- **P4.1** Analysis + arsitektur: monorepo dengan shared lib, atau 5 repo?
  Rekomendasi awal: monorepo `apps/pwa-staff`, `apps/pwa-koord`, dst,
  shared `packages/core` (Supabase client, types, komponen).
  Butuh validasi user sebelum coding.
- **P4.2** Split codebase current `apps/pwa` → jadi `apps/pwa-staff` (basis).
  Poin 16-20.
- **P4.3** 4 PWA lain: fork struktur + hide/show fitur per role.
- **P4.4** Icon per PWA: M besar + label "Staff/Koord/Mgmt/Direksi/Driver".
  Generate 5 set icons pakai `scripts/generate-icons.js`. Poin 17.
- **P4.5** 5 Vercel projects atau 1 project multi-domain? Butuh validasi.

### Phase 5 — Integrasi ke rifim-os (PWA Pusat)

- **P5.1** Reference clone: baca `rifim-os/` untuk pattern integrasi
  modul + auth SSO.
- **P5.2** RAOS jadi modul di rifim-os (deep link + shared auth Supabase).
- **P5.3** Update dashboard direksi rifim-os untuk consume metric RAOS.

### Phase 6 — Riwayat & Scope per Role

- **P6.1** Filter riwayat 1/7/30 hari per PWA (Staff = own, Koord = cabang,
  Admin/Mgmt/Direksi = all). Poin 18, 19, 20.
- **P6.2** Query optimized index Supabase (composite branch_id+created_at).

### Phase 7 — Polish & Konvensi

- **P7.1** Update KPI Engine (14/15_kpi_*.gs) untuk multi-cabang.
- **P7.2** Storage Drive: subfolder per cabang di
  `136ItduoAa_abdiYpOSJS1G3X7ti0YUrU`. Poin 22b.
- **P7.3** Chat room Umum/Pengumuman/Absensi: default member semua staff
  lintas cabang. Room "Chat Cabang [X]" per cabang: member cabang itu saja.
  Poin 21.
- **P7.4** Admin di /admin bisa validasi scan lintas cabang; koord hanya
  scan cabang-nya. Poin 21.

---

## 📊 Progress Tracker

Legenda: ⬜ pending · 🟨 in progress · ✅ done · ⚠️ blocked

Kolom `Owner` (baru sesi 18) — pilih AI yang eksekusi:
- `Claude` — Claude Code (frontend PWA default per Model A)
- `Codex` — Codex atau AI lain (backend GAS + Supabase default per Model A)
- `User` — task yang butuh user manual (test HP, run menu, dst)
- `Both` — pair programming Model D

Baca panduan lengkap di [docs/COLLABORATION.md](docs/COLLABORATION.md).

| Phase | Poin | Owner | Status | Commit terakhir |
|---|---|---|---|---|
| P1.1 | Extend branches schema + seed 9 cabang | Claude | ✅ | mig raos_037 + `pending-p1` |
| P1.2 | RLS scope per cabang + is_branch_in_scope | ✅ | mig raos_038 + `pending-p1` |
| P1.3 | Seed 9 branches (merged ke P1.1) | ✅ | mig raos_037 |
| P1.4 | Sync SSoT auto-map branch_id (staff + driver) | ✅ | `pending-p1` |
| P2.1 | Baca `rifim-isi-saldo` codebase | ✅ | — |
| P2.2 | Tabel `raos_saldo_requests` + RLS | ✅ | mig raos_039 |
| P2.3 | Chat command `/isisaldo` | ✅ | pending-p2 |
| P2.4 | Approval flow in-chat | ✅ | pending-p2 |
| P2.5 | Sync ke tab "Form Isi Saldo" spreadsheet RAOS | ✅ | pending-p2 |
| P3.1 | Baca `radms-driver` codebase | ✅ | — |
| P3.2 | Tabel `raos_driver_queue` + RLS + 4 RPC | ✅ | mig raos_043 |
| P3.3 | Chat command `/antri` `/panggil` `/selesai` `/keluar` | ✅ | pending-p3 |
| P3.4 | Monitoring `/antrian-driver` real-time | ✅ | pending-p3 |
| P4.1 | **Opsi C** — role gating + install variant | ✅ | pending-p4 |
| P4.2 | 5 icon variant + dynamic manifest per role | ✅ | pending-p4b |
| P4.3 | 4 PWA lain — TIDAK BERLAKU (Opsi C = 1 codebase) | ✅ | — |
| P4.4 | Icon per PWA (5 set) | ✅ | pending-p4b |
| P4.5 | Vercel projects — 1 project (Opsi C) | ✅ | existing |
| P5.1 | Baca `rifim-os` codebase | ⬜ | — |
| P5.2 | RAOS jadi modul rifim-os (deep link + SSO) | ⬜ | — |
| P5.3 | Dashboard direksi consume metric RAOS | ⬜ | — |
| P6.1 | Filter riwayat 1/7/30 hari per PWA | ⬜ | — |
| P6.2 | Composite index Supabase | ⬜ | — |
| P7.1 | KPI Engine multi-cabang | ⬜ | — |
| P7.2 | Storage Drive subfolder per cabang | ⬜ | — |
| P7.3 | Chat room global vs per-cabang wiring | ⬜ | — |
| P7.4 | Admin/koord split di `/admin` | ⬜ | — |

---

## 🎯 Checkpoint Terakhir

**Sesi 16 lanjutan (24 Juli 2026 sore)**

Yang selesai sebelum Phase 1 dimulai:
- ✅ 5 fitur landed (hard-block A, KPI blueprint→infra, Toggle Suara/
  Getaran, Bantuan/FAQ, Ukuran Teks)
- ✅ Offline queue MVP → PENUH (4 kind: attendance in/out + scan + chat
  + selfie blob) + conflict resolver
- ✅ KPI refactor Soeta khusus Order (bukan Rp saldo) — commit `46b2929`
- ✅ RULE_PROJECT.md §1.0 catat cakupan RAOS = Soeta only (untuk sesi
  ini; upgrade full cabang ini yang mau expand)
- ✅ SESSION_PROMPT.md dibuat (file ini)

**Phase 1 FULLY DONE**:
- P1.1/P1.3: Migration `raos_037` — extend branches schema + seed 9 cabang
  aktif RIFIM (7 airport + 2 non-airport) + T1/T2/T3 sub-Soeta.
- P1.2: Migration `raos_038` — helper `is_branch_in_scope(uuid)` +
  updated RLS: `raos_attendance_koord_select`, `scan_orders_staff_select`,
  `raos_drivers_read_scoped`, `rooms_read_member`. `chat_rooms.branch_id`
  nullable (NULL = global room).
- P1.4: GAS `13_staff_sync.gs` — RAOS_ALLOWED_BRANCHES extend jadi 9 cabang +
  Head Office. Auto-map slug ID CABANG → branch_id UUID via
  `kpiBranchMap_()` helper. GAS `12_driver_airport_sync.gs` — extend loop
  ke 7 tab airport, auto-set branch_id per driver dari mapping tab-slug.

**Phase 2 (Isi Saldo) FULLY DONE + REFINEMENT** (12 poin user requirement):
- Nominal exact per cabang (sesuai user):
  * 4 opsi (45k/95k/145k/195k): Balikpapan, Pekanbaru, Makassar
  * 2 opsi (45k/95k): Batam Airport, Jambi Airport, Manado, Rifim Batam, Rifim Jambi Luar
  * Soeta: `[]` (khusus Order, tidak ada isi saldo)
- Migration `raos_040_saldo_processing`: kolom `is_processed`, `processed_at`,
  `processed_by`, `auto_chat_posted`. Trigger `raos_saldo_after_processed`
  BEFORE UPDATE — saat `is_processed` false→true dispatch push notif ke
  staff + auto-post chat "Terima kasih..." ke room driver cabang
- GAS 16 real-time sync per 5-menit + `handleSaldoCheckboxEdit_` onEdit
  handler untuk checkbox "Sudah Diisi" kolom G di sheet Form Isi Saldo
  → PATCH `is_processed=true` → trigger DB fire semua efek
- GAS `reminderSaldoBelumDiisi` cron 5-menit: post WA-style pesan ke
  room Pengisian Saldo cabang untuk request >5 menit belum diisi
- GAS `updateTargetStaffPencapaian_` — tambah nominal ke sheet TARGET
  STAFF kolom pencapaian_gmv bulan berjalan
- `/riwayat` tab **Isi Saldo** baru — pin kuning (belum) / hijau (sudah) /
  merah (ditolak). Include di list "Semua"
- `/validasi-saldo` page baru untuk koord/admin — total per status
  (Menunggu/Sudah/Ditolak) + filter tab + tombol Setujui/Tolak (RLS
  scope by cabang)
- Poin user 3: sync sheet real-time (5-menit cron) + manual button
  (menu 💰 Isi Saldo → 🔄 Sync ke Sheet)
- Poin user 4: koord approve/reject TIDAK mempengaruhi sheet — hanya
  admin centang "Sudah Diisi" yang mengubah status final
- P2.1: `rifim-isi-saldo` codebase pattern: sheet-based, nominal
  45k/95k/145k/195k (Balikpapan/Pekanbaru) atau 45k/95k (cabang lain).
  Adaptasi RAOS: chat command + Supabase + sync ke sheet Form Isi Saldo.
- P2.2: Migration `raos_039_saldo_requests` — tabel + RLS scope cabang
  (staff insert own, koord+/admin approve scope). Kolom
  `branches.saldo_nominal_options` JSONB default per cabang.
  `chat_messages.type` diperluas dengan `'saldo_request'`.
- P2.3: `lib/saldoRequest.ts` parse `/isisaldo <nominal>` (support `45k`
  suffix), submit dengan validasi allowedNominals branch. Wire di
  `chat/page.tsx sendMessage` sebagai short-circuit sebelum text insert.
- P2.4: `components/SaldoRequestCard.tsx` render bubble type
  `saldo_request` dengan chip status + tombol Setujui/Tolak (koord/admin
  scope by RLS). Rejection reason inline input.
- P2.5: `gas/16_saldo_sync.gs` `syncSaldoRequestsToSheet()` — pull
  request `synced_to_sheet_at IS NULL`, tulis ke tab "Form Isi Saldo"
  (auto-create kalau belum ada), patch synced timestamp. Trigger 15 menit
  ditambah `09_trigger.gs`. Menu 💰 Isi Saldo → 🔄 Sync ke Sheet.

**Refinement lanjutan sesi Isi Saldo (7 poin user)**:
- P2.11: Docs rule sinkronisasi spreadsheet + wajib MCP masuk di
  RULE_PROJECT §1.-1, §1.-2, CLAUDE.md aturan 0/0b, SESSION_PROMPT
  aturan 0/0b
- P2.12: MASTER TARGET seed 9 cabang dengan 2 kolom (Target Order
  scan valid + Target Saldo Rp). Engine dual-mode: cabang Soeta pakai
  Order, cabang lain pakai Saldo (dari `raos_saldo_requests` yang
  `is_processed=true`). Staff group by cabang → Target Staff =
  Target Cabang / jumlah staff cabang × bobot jabatan. DASHBOARD STAFF
  header extend jadi 15 kolom (tambah Cabang + Mode Target)
- P2.13: Menu `initSheetFormIsiSaldo` bikin tab Form Isi Saldo
  idempotent

**Next**: P3.1 — baca `C:\Projects\menala\radms-driver\` codebase untuk
pahami model antrian driver + panggilan staff. Adaptasi jadi
`raos_driver_queue` + chat command `/antri` (driver) + `/panggil <nomor>`
(staff) di Room Driver cabang.

---

## 🧩 Reference Codebase Paths

| Repo | Path lokal | Live URL | Peran di roadmap |
|---|---|---|---|
| rifim-isi-saldo | `C:\Projects\menala\rifim-isi-saldo` | https://isisaldo.vercel.app | Source pattern Isi Saldo (P2) |
| radms-driver | `C:\Projects\menala\radms-driver` | https://radms-driver.vercel.app | Source antrian driver + geofence multi-airport (P3) |
| rifim-os | `C:\Projects\menala\rifim-os` | https://rifim-os.vercel.app | PWA pusat, RAOS akan jadi modul (P5) |

---

## 📌 Aturan Wajib dari Roadmap

0. **[BARU] Setiap upgrade WAJIB sinkron ke spreadsheet RAOS**
   `1eYS2mM3Sy...`. Antar sheet (DASHBOARD STAFF, MASTER TARGET, Form
   Isi Saldo, LOG SISTEM, DATABASE ORDER, SISTEM CONFIG) harus
   terintegrasi. Tab baru auto-create via menu GAS 🛠️ RAOS System,
   jangan suruh user bikin manual.
0b. **[BARU] Wajib gunakan semua MCP** yang tersedia (Supabase, Vercel,
   GitHub, Context7, dsb). Kalau operasi bisa dilakukan via MCP, JANGAN
   fallback manual shell/copy-paste.
1. **Poin 22**: SEMUA sync ke spreadsheet RAOS `1eYS2mM3Sy...` saja.
   Jangan bikin/pakai spreadsheet lain untuk data RAOS.
2. **Poin 22b**: Storage terpusat di Google Drive folder
   `136ItduoAa_abdiYpOSJS1G3X7ti0YUrU`. Subfolder dibuat kalau perlu.
3. **Poin 23**: Sebelum ubah Blueprint/Rule/Claude/SSoT, VALIDASI ke
   user. Jangan asumsi.
4. **Poin 24**: JANGAN kurangi/hilangkan fungsi existing di PWA/GitHub/
   GAS/Vercel/Supabase.
5. **Poin 25**: Update file lokal → PUSH ke GitHub. Terutama file ini
   (`SESSION_PROMPT.md`) supaya sesi berikutnya sinkron.

---

## 🔧 Cara Update File Ini

Setiap milestone selesai:
1. Update kolom `Status` di Progress Tracker (⬜ → 🟨 → ✅)
2. Isi kolom `Commit terakhir` dengan SHA
3. Update section "Checkpoint Terakhir" dengan ringkasan singkat
4. Commit `docs(session-prompt): checkpoint <milestone>` + push

Kalau sesi habis token mid-work, checkpoint terakhir ini adalah panduan
untuk sesi berikutnya. Jangan skip update.
