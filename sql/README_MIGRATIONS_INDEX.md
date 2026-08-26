# RAOS Migrations Index — 2026-08

Semua migration di-apply via MCP Supabase langsung ke production
`vlievtojpmrbsmzlqswl`. SQL body tersimpan di `supabase_migrations.schema_migrations`.
File `.sql` di folder ini adalah backup/audit trail; kalau tidak ada di sini,
fetch dari Supabase dashboard atau via MCP `execute_sql SELECT statements
FROM supabase_migrations.schema_migrations WHERE name='...'`.

## Owner-approved, not yet applied to QA or production

### 2026-08-26 — Shift Middle attendance windows
- `raos_129_shift_middle_windows.sql` — OWNER-APPROVED; NOT YET APPLIED to QA or production.

## Belum di-commit ke folder sql/ (debt, 2026-08-06)

Semua di-apply Supabase tapi tidak ada di git RAOS/sql/:

### 2026-08-04 — Finance KPI Targets V2 + Payroll
- `raos_070a_kpi_targets_v2_tables` — 4 tabel: kpi_targets_branch, kpi_targets_staff, driver_staff_assignment, raos_payroll
- `raos_070b1_views_only` — raos_target_tercapai_bulan, raos_driver_active_days_bulan
- `raos_070b2_rls_targets_branch` — RLS
- `raos_070b3_rls_targets_staff` — RLS
- `raos_070b4_rls_assignment_payroll` — RLS
- `raos_070c_random_assign_rpc` — RPC raos_random_assign_drivers (Fisher-Yates)
- `raos_070d_compute_payroll_rpc` — RPC raos_compute_payroll_month v1

### 2026-08-04 — HRIS sync + attendance
- `hris_002_resync_employee_id_to_ssot`
- `hris_003_auto_wire_employees_to_user_profiles`
- `hris_004_absensi_summary_late_deduction` — RPC raos_absensi_summary_month

### 2026-08-05 — Document Engine v1 (Rifim OS)
- `docengine_001_core_tables` — 5 tabel doc_* + RLS + immutability trigger
- `docengine_002_audit_rpc` — RPC doc_log_event + doc_get_pending_approvals
- `docengine_003_normalize_hash_algo` — regexp_replace strip whitespace (DEPRECATED by 006)
- `docengine_004_rename_pending_approvals_param` — p_approver → p_approver_id
- `docengine_005_user_profiles_email_sync` — email col + trigger auth.users
- `docengine_006_hash_algo_v4_preserve_string_space` — skip payload dari hash chain

### 2026-08-06 — Bug fixes + HRIS Absensi Overhaul
- `hris_add_pin_column` — fix sync PGRST204 (kolom pin missing di employees)
- `raos_071_attendance_late_deduction_edit` — late_minutes+deduction+override+edit audit + hris_attendance_view + hris_gapok_proporsional_view + RPC hris_attendance_edit
- `raos_072_payroll_late_deduction` — kolom late_deduction_total + thp GENERATED recompute + RPC raos_compute_payroll_month integrate

## Cara extract full SQL body

```sql
SELECT name, statements
FROM supabase_migrations.schema_migrations
WHERE name LIKE 'raos_07%' OR name LIKE 'docengine_%' OR name = 'hris_add_pin_column'
ORDER BY version;
```

Save output per migration ke file `sql/<name>.sql` untuk audit compliance.

## Yang sudah di folder sql/

Sampai `raos_069_user_profiles_source_expand.sql`. Lihat `git log --oneline sql/`
untuk history commit terakhir.
