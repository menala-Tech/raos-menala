---
name: raos-kpi-payroll-v2
description: KPI Targets V2 + Payroll RAOS (Fase Cross-Repo integration sesi 2026-08-04) — 4 tabel baru raos_kpi_targets_branch (target per cabang + mode saldo/order) + raos_kpi_targets_staff (override per-staff + member_parkir) + raos_driver_staff_assignment (driver_id UNIQUE, 1 driver = 1 staff, management-only) + raos_payroll (gapok/bonus_saldo/bpjs/paket/member_parkir/bonus_kpi/thp GENERATED/status_target), 2 view security_invoker (raos_target_tercapai_bulan sum saldo, raos_driver_active_days_bulan count distinct hari), 2 RPC SECURITY DEFINER (raos_random_assign_drivers Fisher-Yates + round-robin, raos_compute_payroll_month tier formula). Cross-repo: UI di rifim-os/modules/finance/index.html + hris/index.html + bookmarklet AIST v2. Gunakan skill ini setiap kali menyentuh KPI target, payroll compute, driver assignment, bonus saldo/KPI, atau tier formula.
---

# KPI Targets V2 + Payroll — RAOS

## Migration `raos_070` (4 sub-migration applied)

### `raos_070a_kpi_targets_v2_tables` — 4 tabel baru

**`raos_kpi_targets_branch`** — target per cabang bulanan
- `branch_id`, `effective_month`, `target_cabang`, `target_staff_default`, `mode` = `'saldo'|'order'`

**`raos_kpi_targets_staff`** — override individual + optional member parkir
- `staff_id`, `effective_month`, `target_saldo`, `member_parkir_amount`

**`raos_driver_staff_assignment`** — random assignment
- `driver_id` **UNIQUE**, `staff_id`, `branch_id`
- 1 driver = 1 staff, management-only edit

**`raos_payroll`** — payroll bulanan hasil compute
- `staff_id`, `effective_month`
- `gapok`, `bonus_saldo`, `bpjs`, `paket_data`, `member_parkir`, `bonus_kpi`
- **`thp` GENERATED** (SUM above)
- `target_pct`, `driver_active_pct`, `status_target` (enum `belum/tercapai/na`)

### `raos_070b1_views_only` — 2 view `security_invoker=true`

**`raos_target_tercapai_bulan`** — SUM nominal `raos_saldo_requests` group by staff+bulan (WHERE `is_processed=true`)

**`raos_driver_active_days_bulan`** — COUNT DISTINCT hari driver assigned isi saldo ≥1x per bulan

### `raos_070b2/b3/b4` — RLS

- Staff → read own
- Koord → read cabang
- Admin+ → read all
- Write management/direksi only untuk assignment

### `raos_070c_random_assign_rpc`

**`raos_random_assign_drivers(p_branch_id uuid, p_force boolean DEFAULT false)`** SECURITY DEFINER, management/direksi only.

Fisher-Yates shuffle + round-robin distribute. `p_force=true` reset semua assignment cabang dulu.

### `raos_070d_compute_payroll_rpc`

**`raos_compute_payroll_month(p_month date)`** SECURITY DEFINER, admin/mgmt/direksi.

Loop semua staff aktif dengan `branch_id`, hitung tier Bonus Saldo + Bonus KPI + `status_target`, UPSERT ke `raos_payroll`.

## Tier Formula (Hardcoded di RPC)

### Bonus Saldo (max 1.5jt staff / 2jt koord)

**Gate:** ≥80% staff cabang capai target + individu capai

| Achievement | Bonus |
|---|---|
| `<80%` | 0 |
| `80-89%` | 60% × max |
| `90-99%` | 80% × max |
| `≥100%` | max |

### Bonus KPI (max 300rb)

**Gate:** ≥80% driver assigned aktif ≥25 hari/bulan

| Achievement | Bonus |
|---|---|
| `<80%` | 0 |
| `80-89%` | 180rb |
| `90-99%` | 240rb |
| `≥100%` | 300rb |

### Excluded Cabang

Slug ILIKE `'%soeta%'` OR `'%makassar%'`: `bonus_saldo=0` + `status_target='na'`. Bonus KPI tetap dihitung (pakai driver assignment).

## PWA RAOS Side

**`/admin`** tombol **🎲 Random Assign Driver → Staff**:
- Dropdown `branch_id` prompt + confirm force rebalance
- Panggil RPC `raos_random_assign_drivers`
- RLS enforce management/direksi — kalau admin biasa/koord/staff coba, alert error explicit

## Cross-Repo Integration (UI di Rifim-OS)

**UI Finance/HRIS bukan di RAOS PWA** — ada di **Rifim-OS Portal** (`rifim-os.vercel.app/finance` + `/hris`).

Lihat CLAUDE.md rifim-os section "Sesi 2026-08-04 sore" untuk:
- 3 tab baru Finance (🎯 Target Cabang, 👤 Target Staff, 🚗 DB Driver)
- 2 kolom baru HRIS Payroll (Bonus Saldo/KPI RAOS)
- 10 endpoint baru di `crmApi.js`

## Bookmarklet AIST v2

Source di `rifim-os/automation/aist-bookmarklet/aist-fill-v2.source.js` + install page `install.html`.

- Baca langsung `raos_saldo_requests` (bukan sheet lama)
- Auto-refresh 30s
- Auto-mark `is_processed=true` via endpoint `finance_saldo_raos_mark_paid`

## Data Source of Truth per Pipeline

| Modul | Sumber data | Update trigger |
|---|---|---|
| Pengajuan Saldo | `raos_saldo_requests` PWA RAOS chat `/isisaldo` | User submit |
| Riwayat Saldo | `raos_saldo_requests` | Realtime subscribe |
| Finance Tab Isi Saldo | `raos_saldo_requests` proxy via crmApi | Broadcast `raos-saldo-new` |
| KPI Target Cabang | `raos_kpi_targets_branch` | Manual edit tab Finance |
| KPI Target Staff | `raos_kpi_targets_staff` (override) + view | Manual edit tab Finance |
| Payroll Bonus | `raos_payroll` | RPC `raos_compute_payroll_month` (manual/cron) |
| HRIS Payroll UI | `payroll` tabel HRIS + fetch bonus dari `raos_payroll` | Manual + Auto-fill button |

## KPI Pipeline Existing (`gas/14_kpi_config.gs` + `15_kpi_engine.gs`)

- `kpiGetTargetByCabang_(slug)` return `{order, saldo, mode}` — Soeta mode='order' (Pilar 1 = `scan_orders` count), cabang lain mode='saldo' (Pilar 1 = SUM `raos_saldo_requests.nominal` WHERE `is_processed=true`)
- `kpiGetActiveStaff_` join branches, group per cabang, hitung Target Staff per cabang (Target Cabang / jumlah staff × bobot jabatan)
- `kpiWriteDashboard_` header 15 kolom termasuk Cabang + Mode Target
- `initKpiSheetsRAOS` seed 9 cabang di MASTER TARGET dgn 2 kolom (Target Order + Target Saldo Rp)

**Blocker sesungguhnya:** sheet MASTER TARGET belum diisi angka target per cabang (semua skip dengan warning di `system_logs`). Sheet RAOS_KPI_MANUAL juga belum diisi bulanan. **User yang isi manual**, lalu run "▶️ Update KPI Bulan Ini" dari menu GAS.

## Debt

- **Auto-compute payroll saat saldo di-approve** — sekarang manual click "⚙️ Recompute Payroll Bulan Ini" di Finance. Trigger AFTER UPDATE `raos_saldo_requests` risiko performance (loop semua staff cabang per event). Solusi tunda: cron GAS harian 22:00 panggil RPC.
- **Bookmarklet AIST selector heuristic** — `findInputByLabel(['Amount','Driver login',...])`. Kalau AIST DOM berubah label, edit array di source.
- **Sync `raos_payroll` → sheet spreadsheet** (Rule §1.-1) — belum dibuat GAS sheet counterpart untuk `raos_payroll`. Tab MASTER TARGET masih pakai schema lama (target Order/target Saldo per cabang, bukan gabungan V2).
