---
name: raos-multi-cabang
description: Multi-cabang RAOS (9 cabang aktif sesi 17) — 1 ID Rifim Airport Soeta (T1/T2/T3 sub-terminal, mode Order/scan valid) + 8 cabang saldo (Batam/Jambi/PKU/BPN/Manado/Makassar + Rifim Batam non-airport + Jambi Luar), helper is_branch_in_scope(uuid) SECURITY DEFINER (admin/mgmt/direksi bypass, staff/koord scoped ke cabang + descendant/parent), 5 room per cabang (3 global branch_id NULL: Umum/Pengumuman/Absensi + 2 per-cabang: Pengisian Saldo/Driver), branches.saldo_nominal_options JSONB per cabang (4 opsi BPN/PKU/MKS, 2 opsi BTH/JBI/MDC/Rifim Batam/JBI Luar, Soeta [] khusus order), raos_saldo_requests pipeline dengan branch context activeRoomBranch (bukan user.branch), 4 RPC driver queue (raos_join_queue/call/complete/leave). Gunakan skill ini setiap kali kerja dengan multi-cabang scope, seed room per branch, RLS branch, isi saldo per cabang, atau antrian driver.
---

# Multi-Cabang — RAOS

## 9 Cabang Aktif

1. **ID Rifim Airport Soeta** (T1/T2/T3 sub-terminal) — mode **Order** (scan valid)
2. ID Rifim Airport Batam — mode Saldo
3. ID Rifim Airport Jambi — mode Saldo
4. ID Rifim Airport Balikpapan — mode Saldo
5. ID Rifim Airport Manado — mode Saldo
6. ID Rifim Airport Pekanbaru — mode Saldo
7. ID Rifim Airport Makassar — mode Saldo
8. ID Rifim Batam (non-airport) — mode Saldo
9. ID Rifim Jambi Luar — mode Saldo

Cabang non-Soeta khusus **Saldo** (Rp nominal) — 8 cabang pakai `raos_saldo_requests` pipeline (chat command `/isisaldo` + admin centang di sheet Form Isi Saldo).

## Phase 1 Foundation

**Migration `raos_037`** extend `branches`:
- `slug/timezone/lat/lng/default_radius_meters/parent_branch_id/branch_type`
- Seed 9 cabang aktif dengan koordinat bandara real
- T1/T2/T3 di-set `parent_branch_id` = Soeta

**Migration `raos_038`** — helper `is_branch_in_scope(uuid)` SECURITY DEFINER:
- Admin/mgmt/direksi → bypass, lihat semua
- Staff/koord → scoped ke branch sendiri + descendant/parent

**Updated RLS** 4 tabel pakai helper ini.

## Chat Room Multi-Cabang

`chat_rooms.branch_id` nullable:
- **NULL** = global (Umum/Pengumuman/Absensi) — semua staff.is_active auto-member
- **UUID** = per-cabang scope

**5 room wajib per cabang** (setup via bulk-create):
- Global: Umum, Pengumuman, Absensi
- Per-cabang: Pengisian Saldo — <Cabang>, Driver — <Cabang>

**RLS `rooms_read_member`** filter dengan `is_branch_in_scope` — staff/koord non-admin hanya lihat 3 global + 2 cabang sendiri.

**Bulk-create room per cabang** via RPC `seed_room_per_branch` (SECURITY DEFINER, idempotent, auto-add member semua staff cabang + admin/mgmt/direksi).

**`/admin`** — CreateProyekRoomModal punya branch dropdown ("Semua Cabang Global" default vs cabang spesifik). Extend `create_proyek_room` RPC dengan `p_branch_id`.

**Stale rooms** (soft-delete sesi 20): Soetta T1/T2/T3 — Ops, Dukungan Driver.

## Phase 2 Isi Saldo

**Migration `raos_039`** — tabel `raos_saldo_requests` + RLS scope.

**`branches.saldo_nominal_options` JSONB per cabang:**
- 4 opsi: Balikpapan, Pekanbaru, Makassar
- 2 opsi: Batam, Jambi, Manado, Rifim Batam, Jambi Luar
- Soeta: `[]` (khusus order, tidak pakai saldo)

**Migration `raos_040`** — kolom `is_processed/processed_at/processed_by/auto_chat_posted`. Trigger `raos_saldo_after_processed` BEFORE UPDATE saat `is_processed` false→true dispatch push staff + auto-chat "Terima kasih..." ke room driver cabang.

**`lib/saldoRequest.ts`** parse `/isisaldo <nominal>` (support suffix `k`), submit validate `allowedNominals` + insert + post chat message JSON.

**Branch context WAJIB `activeRoomBranch`** (bukan `user.branch`) — fetch `branches` by `activeRoom.branch_id`. Alasan: direksi/admin dengan branch T1 atau tanpa branch (`saldo_nominal_options=[]`) tidak boleh hilang tombol saat buka room cabang lain. RLS `raos_saldo_requests_staff_insert` cukup cek `staff_id`, tidak batasi `branch_id` → safe direksi submit ke cabang mana pun.

**`/validasi-saldo`** — total per status + filter + inline actions (koord+ approve/reject).

**`/riwayat` tab Isi Saldo** — pin kuning/hijau/merah.

**GAS 16 `syncSaldoRequestsToSheet`** cron 5-menit → tab **Form Isi Saldo** (15 kolom gabungan format lama + baru).

**GAS `handleSaldoCheckboxEdit_`** onEdit trigger: admin centang kolom I "Sudah Diisi" → PATCH `is_processed=true` → DB trigger dispatch semua efek.

**GAS `updateTargetStaffPencapaian_`** tambah nominal ke sheet TARGET STAFF kolom `pencapaian_gmv` bulan berjalan.

**GAS `reminderSaldoBelumDiisi`** cron 5-menit — request >5 menit belum diisi post WA-style pesan ke room "Pengisian Saldo" cabang + mark kolom M+N di sheet.

**`chat_messages.type`** extend `'saldo_request'`. `client_id UUID` untuk idempotency offline replay (migration `raos_036`).

## Phase 3 Antrian Driver

**Migration `raos_043`** — tabel `raos_driver_queue` FIFO:
- `position/status/joined_at/called_at/completed_at`
- UNIQUE index partial (driver aktif per cabang)
- 4 RPC SECURITY DEFINER: `raos_join_queue`, `raos_call_driver`, `raos_complete_queue`, `raos_leave_queue`
- RLS scope `is_branch_in_scope`

**`chat_messages.type`** extend `'driver_queue'`.

**Realtime publication:** `raos_driver_queue` ditambahkan ke `supabase_realtime`.

**`lib/driverQueue.ts`** parse 4 command:
- `/antri` — join queue
- `/panggil` — koord+ call driver (auto post announce)
- `/selesai` — driver mark done
- `/keluar` — driver leave queue

Command **hanya jalan di room dengan `branch_id` spesifik** (global room tolak).

**`components/DriverQueueCard.tsx`** bubble per event:
- Amber `joined`
- Blue `called`
- Green `completed`
- Gray `left`
+ box posisi

**`/antrian-driver`** page — real-time monitor per cabang dengan tombol PANGGIL/SELESAI/Keluar inline + subscribe Postgres changes.

## GAS Support Multi-Cabang

**`13_staff_sync.gs`** extend `RAOS_ALLOWED_BRANCHES` = 10 cabang (9 + Head Office). `kpiBranchMap_()` slug → `branch_id` auto-set saat sync.

**`12_driver_airport_sync.gs`** loop 7 tab airport, per-tab `branch_id` auto-map.

## KPI Dual-Mode

Detail di skill `raos-kpi-payroll-v2`.

## SISTEM CONFIG Refactor

`initSistemConfig` refresh 20 entries:
- `KPI_PILAR_1_ORDER_MAX`
- `KPI_PILAR_1_SALDO_MAX`
- `KPI_AKTIF_TINGGI_MIN`
- `SALDO_REMINDER_MENIT`
- `GEOFENCE_TOLERANCE_METER`
- `SSOT_STAFF_SHEET_ID`
- `SSOT_DRIVER_SHEET_ID`
- dst

`markDeprecatedSheets` menu — banner merah "DEPRECATED" di TARGET STAFF, DATABASE STAFF, DATABASE DRIVER.

## Aturan Wajib Baru (RULE_PROJECT.md §1.-1 dan §1.-2)

1. Setiap upgrade WAJIB sinkron ke spreadsheet RAOS `1eYS2mM3Sy...` — antar sheet DASHBOARD STAFF/MASTER TARGET/Form Isi Saldo/LOG SISTEM/DATABASE ORDER/SISTEM CONFIG saling terintegrasi. Tab baru auto-create via menu GAS.
2. Wajib gunakan semua MCP tersedia (Supabase, Vercel, GitHub, Context7). Jangan fallback manual shell.
