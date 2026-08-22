# Migration / SSoT Gap Reconciliation

**Audit branch:** `audit/reliability-pass-20260822`  
**Date:** 2026-08-22  
**Scope:** Compare `sql/` (source of truth schema) against `supabase/migrations/` (Supabase CLI / hosted migration history).

## Methodology
1. List `.sql` files in `sql/` and `supabase/migrations/`.
2. Assume each applied production migration should have a matching source file in `sql/`.
3. Flag `supabase/migrations/` files not present in `sql/` as **deployment drift**.
4. Flag `sql/` files with `_DRAFT` in the name as **not production-ready**.
5. Report candidate missing production files and sequence gaps.

## Summary
- `sql/` total files: **68**
- `supabase/migrations/` total files: **4**
- DRAFT files in `sql/`: **4**
- `supabase/migrations/` files also present in `sql/`: **0**
- `supabase/migrations/` files **NOT** in `sql/` (drift): **4**
- Highest `raos_` number seen in `sql/`: `raos_112`

## sql/ files
- `001_schema.sql`
- `002_rls.sql`
- `003_seed.sql`
- `p8_production_reconciliation_20260810.sql`
- `raos_056_role_driver_manager.sql`
- `raos_057_driver_role_login.sql`
- `raos_058_fix_room_scope_chat_visibility_geofence_absensi_selfie.sql`
- `raos_059_chat_pribadi_rls_strict.sql`
- `raos_060_branches_rls_select_authenticated.sql`
- `raos_062_saldo_no_driver_echo_and_queue_realtime.sql`
- `raos_063_notification_engine_foundation.sql`
- `raos_064_notification_stats_view.sql`
- `raos_065_fix_dispatch_push_column_id.sql`
- `raos_066_riwayat_admin_delete_policies.sql`
- `raos_067_driver_type_column.sql`
- `raos_067_saldo_realtime_broadcast.sql`
- `raos_068_raos_credentials_bridge.sql`
- `raos_068_user_profiles_gaji.sql`
- `raos_069_user_profiles_source_expand.sql`
- `raos_070a_kpi_targets_v2_tables.sql`
- `raos_070b1_views_only.sql`
- `raos_070b2_rls_targets_branch.sql`
- `raos_070b3_rls_targets_staff.sql`
- `raos_070b4_rls_assignment_payroll.sql`
- `raos_070c_random_assign_rpc.sql`
- `raos_070d_compute_payroll_rpc.sql`
- `raos_071_attendance_late_deduction_edit.sql`
- `raos_072_payroll_late_deduction.sql`
- `raos_073_chat_system_message_rpc.sql`
- `raos_074_saldo_mark_paid_rpc.sql`
- `raos_075_saldo_client_id_idempotency.sql`
- `raos_076_mark_paid_skip_approval.sql`
- `raos_077_payroll_auto_prorate_target_staff.sql`
- `raos_078_saldo_last_reminded_at.sql`
- `raos_079_soeta_parent_scope_payroll.sql`
- `raos_082_saldo_processed_chat_room_message.sql`
- `raos_083_aist_portable_agent_invoice.sql`
- `raos_083b_aist_rpc_grant_hardening.sql`
- `raos_083c_aist_trigger_execute_revoke.sql`
- `raos_088_shift_schedule.sql`
- `raos_088b_shift_schedule_grant_hardening.sql`
- `raos_090_attendance_canonical_rpc_DRAFT.sql`
- `raos_091_driver_self_join_queue_DRAFT.sql`
- `raos_092_scan_canonical_rpc_DRAFT.sql`
- `raos_093_attendance_runtime_guards.sql`
- `raos_094_attendance_rpc_privileges.sql`
- `raos_095_attendance_shift_record_fix.sql`
- `raos_096_attendance_geofence_fk_fix.sql`
- `raos_097_attendance_late_timezone_fix.sql`
- `raos_098_chat_unread_ssot.sql`
- `raos_098b_mark_chat_room_read_anon_revoke_fix.sql`
- `raos_098c_cutover_table_grant_fix.sql`
- `raos_099_absensi_chat_branch_timezone.sql`
- `raos_099z_scan_insert_transition.sql`
- `raos_100_barcode_scan_target_canonical.sql`
- `raos_100b_barcode_manager_scope.sql`
- `raos_100c_user_profiles_branch_reader.sql`
- `raos_101_scan_staff_direct_insert_lockdown.sql`
- `raos_102_admin_head_office_kpi.sql`
- `raos_104_saldo_paid_message_dedup.sql`
- `raos_105_koordinator_operational_parity.sql`
- `raos_106_koordinator_kpi_branch_target_DRAFT.sql`
- `raos_107_fix_branch_kpi_breakdown_role_ambiguity.sql`
- `raos_108_canonical_target_progress_national_consistency.sql`
- `raos_109_pwa_final_operational_guards.sql`
- `raos_110_notification_engine_v2_role_filter.sql`
- `raos_111_driver_ssot_mirror_rpc.sql`
- `raos_112_background_location_ingest.sql`

## supabase/migrations/ files
- `crm_004_security_hardening.sql` **[DRIFT — not in sql/]**
- `raos_084_hris_target_roster_rule.sql` **[DRIFT — not in sql/]**
- `raos_103_invoice_coordinator_manual_finance.sql` **[DRIFT — not in sql/]**
- `smart_office_089_direksi_only_approval_hardening.sql` **[DRIFT — not in sql/]**

## DRAFT migrations (do not apply to production)
- `raos_090_attendance_canonical_rpc_DRAFT.sql`
- `raos_091_driver_self_join_queue_DRAFT.sql`
- `raos_092_scan_canonical_rpc_DRAFT.sql`
- `raos_106_koordinator_kpi_branch_target_DRAFT.sql`

## Deployment drift details
- `supabase/migrations/crm_004_security_hardening.sql` exists but `sql/crm_004_security_hardening.sql` does not. Either the source file was deleted, or the migration was generated locally and not back-ported to `sql/`.
- `supabase/migrations/raos_084_hris_target_roster_rule.sql` exists but `sql/raos_084_hris_target_roster_rule.sql` does not. Either the source file was deleted, or the migration was generated locally and not back-ported to `sql/`.
- `supabase/migrations/raos_103_invoice_coordinator_manual_finance.sql` exists but `sql/raos_103_invoice_coordinator_manual_finance.sql` does not. Either the source file was deleted, or the migration was generated locally and not back-ported to `sql/`.
- `supabase/migrations/smart_office_089_direksi_only_approval_hardening.sql` exists but `sql/smart_office_089_direksi_only_approval_hardening.sql` does not. Either the source file was deleted, or the migration was generated locally and not back-ported to `sql/`.

## Recommendations
1. **Back-port or move drifted migration files** from `supabase/migrations/` into `sql/` so the schema source-of-truth remains complete.
2. **Apply DRAFT migrations only after renaming** and validating their role guards and search paths.
3. **Document any intentionally one-off file** such as `p8_production_reconciliation_20260810.sql` and why it does not need a `supabase/migrations/` counterpart.
4. Consider adding a CI check that warns when `supabase/migrations/` contains a filename not present in `sql/`.
