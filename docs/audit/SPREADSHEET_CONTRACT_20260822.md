# Spreadsheet Contract — RAOS

**Audit branch:** `audit/reliability-pass-20260822`  
**Date:** 2026-08-22  
**Scope:** All Google Spreadsheets referenced by RAOS PWA, RAOS GAS, and related SSoT sync.

## 1. RAOS Project Spreadsheet (GAS bound + data sink)
| Field | Value |
|---|---|
| File | RAOS — Rifim Airport Operation System |
| ID | `1eYS2mM3Sy-BNAVGfp8BUHtsZuLiGDetnJeGw-AWk__8` |
| Bound GAS project | RAOS GAS (`1iMN1ZGZVM0...`) |
| Main consumer | GAS `01_config.gs` / `15_kpi_engine.gs` / `16_saldo_sync.gs` |

### Tabs / Sheets used by RAOS code
| Tab | Purpose | Consumers |
|---|---|---|
| `Form Isi Saldo` | Sink for `raos_saldo_requests` rows + manual "Sudah Diisi" checkbox | `16_saldo_sync.gs` |
| `TARGET STAFF` | Staff-level saldo target / top-up record | `01_config.gs`, `16_saldo_sync.gs` |
| `MASTER TARGET` | Branch-level order/saldo target (fallback; canonical target is `raos_kpi_targets_branch` in Supabase) | `14_kpi_config.gs`, `15_kpi_engine.gs` |
| `DASHBOARD STAFF` | Auto-generated KPI dashboard per staff | `15_kpi_engine.gs` |
| `RAOS_KPI_MANUAL` | Manual daily KPI inputs (briefing, SOP, pelayanan, etc.) | `15_kpi_engine.gs` |
| `ABSENSI` | Attendance log / mirror | `01_config.gs` |
| `ORDER` | Order/scan log / mirror | `01_config.gs` |
| `DATABASE ORDER` | Order reference data | `01_config.gs` |
| `DATABASE STAFF` | Staff reference data | `01_config.gs` |
| `DATABASE DRIVER` | Driver reference data | `01_config.gs` |
| `SISTEM CONFIG` | Key/value RAOS configuration (mirror of Supabase `system_config`) | `01_config.gs`, `getSistemConfig()` |
| `LOG ACTIVITY` | Activity log | `01_config.gs` |
| `LOG SISTEM` | System log / audit log | `01_config.gs` |

## 2. Staff SSoT (cross-system)
| File | ID | Tab | Purpose |
|---|---|---|---|
| DATABASE STAFF | `1fcraq3QHqIaD-13Ebzt6stT9aA6j_loTXeAtpNX12kw` | `MASTER DATA STAFF` | Single source of truth for all RIFIM staff. RAOS filters cabang Soeta via `ID CABANG`. |

## 3. Driver Airport SSoT
| File | ID | Tabs | Purpose |
|---|---|---|---|
| Database Driver Airport | `1FEZxyHPx_GCQKw92hLSf6QxxkXgZn5R1sRswOYM_Tlc` | `ID Rifim Airport Soeta`, `ID Rifim Airport Batam`, `ID Rifim Airport Jambi`, `ID Rifim Airport Balikpapan`, `ID Rifim Airport Manado`, `ID Rifim Airport Pekanbaru`, `ID Rifim Airport Makassar` | One tab per airport branch. Source for `raos_drivers` and driver auth provisioning. |

## 4. Driver External SSoT (not directly used by RAOS, but related)
| File | ID | Tabs | Purpose |
|---|---|---|---|
| Database Driver External | `1suoDC-RsWOgTHiLq4max6iIsWe39Ou-RMddRXl5DVJc` | `ID Rifim Batam`, `ID Rifim Jambi Luar` | External driver for Batam and Jambi Luar (non-airport). |

## 5. Smart Office Config (RIFIM OS)
| File | ID | Tab | Purpose |
|---|---|---|---|
| RIFIM OS Smart Office DB | `1jHeA-w1bM32S3-AU-ENN2UjiaCb4iLzRhaf4G7y4ozM` | `company_config` | Shared company config + Drive root folder IDs for canonical storage. RAOS reads via `18_canonical_drive_storage.gs`. |

## 6. Finance Sheet (RIFIM OS, not RAOS)
| File | ID | Tabs | Purpose |
|---|---|---|---|
| Pengeluaran dan pemasukan | `1AgpEqhpDU4BUxcN_i_jaF8Ccw6RwptV2TOJjyTCVPSo` | FINANCE, per-cabang, Tagihan, etc. | Ledger for income/expense. RAOS only writes `raos_saldo_requests`; finance team consumes through RIFIM OS. |

## Contract / Rules
- **Direction of truth:** Google Sheets → Supabase is one-way for staff and driver sources (RAOS writes `raos_saldo_requests` back to a sheet tab, but staff/driver are read-only).
- **No new sheet creation:** RAOS must not create a new spreadsheet or a new staff/driver master tab.
- **Tab names are literal strings** in GAS code (e.g. `MASTER TARGET`, `Form Isi Saldo`). Renaming a tab without a matching code update will break cron.
- **Spreadsheet ID comes from** `SPREADSHEET_ID` Script Property with a fallback hard-coded to the RAOS sheet ID.
