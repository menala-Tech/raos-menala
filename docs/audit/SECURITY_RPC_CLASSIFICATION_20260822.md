# SECURITY RPC / SECURITY DEFINER Classification

**Audit branch:** `audit/reliability-pass-20260822`  
**Date:** 2026-08-22  
**Scope:** All SQL functions in `sql/` and `supabase/migrations/` within the RAOS repository that are referenced by the shared Supabase project `vlievtojpmrbsmzlqswl`.  
**Purpose:** Identify which functions are client-callable, which are internal-only, and whether SECURITY DEFINER grants are over-exposed to `authenticated` or `anon`.

## Methodology
1. Grep all `.sql` migration and source files for `CREATE [OR REPLACE] FUNCTION public.<name>`.
2. Capture `SECURITY DEFINER` / `SECURITY INVOKER` declaration.
3. Capture `GRANT EXECUTE` and `REVOKE` statements referencing the function.
4. Heuristically detect role / branch / auth guards inside the function body (e.g. `get_my_role()`, `auth.uid()`, `is_branch_in_scope`, `is_authorized`).
5. Classify each function by expected caller, client-callability, and exposure risk.
6. Mark files with historical `_DRAFT` naming and functions without explicit grants/revokes for review; do not infer live production applied state from the filename alone.

## Summary
- Total functions analyzed: **87**
- SECURITY DEFINER: **80**
- SECURITY INVOKER: **7**
- Client-callable (granted to `authenticated` and/or `anon`): **42**
- Functions with role/branch/auth guard in body: **45**
- Candidate to revoke from `anon`: **2**
- Candidate to review `authenticated` grant on DEFINER function: **11**

## Classification Table

| Function | Domain | Expected Caller | DEFINER | Auth Guard | Client-Callable | Revoke anon? | Review auth? | Risk / Note | Source File |
|---|---|---|---|---|---|---|---|---|---|
| `public.get_my_role()` | system config | Internal / Trigger | Yes | No | No | No | No | no explicit GRANT/REVOKE in source | sql/002_rls.sql |
| `public.get_my_branch()` | system config | Internal / Trigger | Yes | No | No | No | No | no explicit GRANT/REVOKE in source | sql/002_rls.sql |
| `public.raos_cleanup_branch_room_members()` | RAOS (chat) | service_role / GAS / Edge Function | Yes | Yes | No | No | No | - | sql/raos_058_fix_room_scope_chat_visibility_geofence_absensi_selfie.sql |
| `public.seed_room_per_branch(text)` | chat | Internal / Trigger | Yes | Yes | No | No | No | no explicit GRANT/REVOKE in source | sql/raos_058_fix_room_scope_chat_visibility_geofence_absensi_selfie.sql |
| `public.raos_broadcast_absensi_to_chat()` | RAOS (RAOS attendance) | Internal / Trigger | Yes | No | No | No | No | no explicit GRANT/REVOKE in source | sql/raos_058_fix_room_scope_chat_visibility_geofence_absensi_selfie.sql |
| `public.get_chat_rooms_for_user()` | chat | Authenticated PWA client | No | No | Yes | No | No | - | sql/raos_060_branches_rls_select_authenticated.sql |
| `public.raos_saldo_after_processed()` | RAOS (RAOS saldo) | Internal / Trigger | Yes | No | No | No | No | no explicit GRANT/REVOKE in source | sql/raos_062_saldo_no_driver_echo_and_queue_realtime.sql |
| `public.notifications_touch()` | system config | Internal / Trigger | No | No | No | No | No | - | sql/raos_063_notification_engine_foundation.sql |
| `public.raos_create_notification(uuid[],text,text,text,text,text,text,jsonb,text,int,int)` | RAOS (system config) | Authenticated client + service_role | Yes | No | Yes | No | Review | DEFINER exposed to client without body role gate | sql/raos_063_notification_engine_foundation.sql |
| `public.raos_dispatch_push(uuid[],text,text,text,text,text)` | RAOS (system config) | Authenticated client + service_role | Yes | No | Yes | No | Review | DEFINER exposed to client without body role gate | sql/raos_063_notification_engine_foundation.sql |
| `public.raos_mark_notifications_read(uuid[])` | RAOS (system config) | Authenticated PWA client | No | Yes | Yes | No | No | - | sql/raos_063_notification_engine_foundation.sql |
| `public.raos_expire_notifications()` | RAOS (system config) | service_role / GAS / Edge Function | Yes | No | No | No | No | - | sql/raos_063_notification_engine_foundation.sql |
| `public.raos_notification_stats_summary(int)` | RAOS (system config) | Authenticated PWA client | Yes | Yes | Yes | No | No | - | sql/raos_064_notification_stats_view.sql |
| `public.raos_dispatch_push(uuid[],text,text,text,text,text)` | RAOS (system config) | Internal / Trigger | Yes | No | No | No | No | no explicit GRANT/REVOKE in source; system message / push dispatcher should be service_role only | sql/raos_065_fix_dispatch_push_column_id.sql |
| `public.raos_broadcast_new_saldo_request()` | RAOS (RAOS saldo) | Internal / Trigger | Yes | No | No | No | No | no explicit GRANT/REVOKE in source | sql/raos_067_saldo_realtime_broadcast.sql |
| `public.raos_verify_and_bridge(text,text)` | RAOS (system config) | anon + authenticated | Yes | No | Yes | No | Review | anon and authenticated share same grant | sql/raos_068_raos_credentials_bridge.sql |
| `public.raos_random_assign_drivers(uuid,boolean)` | RAOS (RAOS payroll) | Authenticated client + service_role | Yes | Yes | Yes | No | No | - | sql/raos_070c_random_assign_rpc.sql |
| `public.raos_compute_payroll_month(date)` | RAOS (RAOS payroll) | Authenticated client + service_role | Yes | Yes | Yes | No | No | - | sql/raos_070d_compute_payroll_rpc.sql |
| `public.raos_attendance_compute_late()` | RAOS (HRIS) | Internal / Trigger | Yes | No | No | No | No | no explicit GRANT/REVOKE in source | sql/raos_071_attendance_late_deduction_edit.sql |
| `public.hris_attendance_edit(uuid,timestamptz,timestamptz,numeric,text)` | HRIS | Authenticated PWA client | Yes | Yes | Yes | No | No | - | sql/raos_071_attendance_late_deduction_edit.sql |
| `public.raos_saldo_mark_paid(uuid,uuid)` | RAOS (RAOS saldo) | Authenticated client + service_role | Yes | Yes | Yes | No | No | - | sql/raos_074_saldo_mark_paid_rpc.sql |
| `public.raos_saldo_submit(uuid,uuid,numeric,uuid,uuid)` | RAOS (RAOS saldo) | Authenticated PWA client | Yes | Yes | Yes | No | No | - | sql/raos_075_saldo_client_id_idempotency.sql |
| `public.raos_saldo_mark_paid(uuid,uuid)` | RAOS (RAOS saldo) | Internal / Trigger | Yes | Yes | No | No | No | no explicit GRANT/REVOKE in source | sql/raos_076_mark_paid_skip_approval.sql |
| `public.raos_compute_payroll_month(date)` | RAOS (RAOS payroll) | Authenticated client + service_role | Yes | Yes | Yes | No | No | - | sql/raos_077_payroll_auto_prorate_target_staff.sql |
| `public.raos_saldo_after_processed()` | RAOS (RAOS saldo) | Internal / Trigger | Yes | No | No | No | No | no explicit GRANT/REVOKE in source | sql/raos_082_saldo_processed_chat_room_message.sql |
| `public.aist_enqueue_saldo_request_trg()` | AIST | Internal / Trigger | Yes | No | No | No | No | - | sql/raos_083_aist_portable_agent_invoice.sql |
| `public.aist_agent_heartbeat(text,uuid,text,text,text,text,boolean,boolean,timestamptz,text)` | AIST | service_role / GAS / Edge Function | Yes | Yes | No | No | No | - | sql/raos_083_aist_portable_agent_invoice.sql |
| `public.aist_claim_job(text,uuid)` | AIST | service_role / GAS / Edge Function | Yes | Yes | No | No | No | - | sql/raos_083_aist_portable_agent_invoice.sql |
| `public.aist_job_set_running(uuid,text)` | AIST | service_role / GAS / Edge Function | Yes | No | No | No | No | - | sql/raos_083_aist_portable_agent_invoice.sql |
| `public.aist_job_set_verifying(uuid,text,text,jsonb)` | AIST | service_role / GAS / Edge Function | Yes | No | No | No | No | - | sql/raos_083_aist_portable_agent_invoice.sql |
| `public.aist_job_finish(uuid,text,boolean,text,text)` | AIST | service_role / GAS / Edge Function | Yes | No | No | No | No | - | sql/raos_083_aist_portable_agent_invoice.sql |
| `public.aist_mark_sla_timeouts()` | AIST | service_role / GAS / Edge Function | Yes | No | No | No | No | - | sql/raos_083_aist_portable_agent_invoice.sql |
| `public.aist_request_manual(uuid,uuid)` | AIST | service_role / GAS / Edge Function | Yes | Yes | No | No | No | - | sql/raos_083_aist_portable_agent_invoice.sql |
| `public.aist_refresh_invoice_daily(uuid,date)` | AIST | service_role / GAS / Edge Function | Yes | No | No | No | No | - | sql/raos_083_aist_portable_agent_invoice.sql |
| `public.aist_validate_invoice_daily(uuid,text,text)` | AIST | Authenticated PWA client | Yes | Yes | Yes | No | No | - | sql/raos_083_aist_portable_agent_invoice.sql |
| `public.aist_agent_get_operator(text)` | AIST | service_role / GAS / Edge Function | Yes | No | No | No | No | - | sql/raos_083_aist_portable_agent_invoice.sql |
| `public.aist_job_get_for_device(uuid,text)` | AIST | service_role / GAS / Edge Function | Yes | No | No | No | No | - | sql/raos_083_aist_portable_agent_invoice.sql |
| `public.raos_post_system_message(uuid,text,text,jsonb)` | RAOS (chat) | service_role / GAS / Edge Function | Yes | No | No | No | No | - | sql/raos_073_chat_system_message_rpc.sql |
| `public.raos_resolve_saldo_room(uuid)` | RAOS (chat) | Authenticated client + service_role | Yes | No | Yes | No | Review | - | sql/raos_073_chat_system_message_rpc.sql |
| `public.raos_resolve_driver_room(uuid)` | RAOS (chat) | Authenticated client + service_role | Yes | No | Yes | No | Review | - | sql/raos_073_chat_system_message_rpc.sql |
| `public.raos_resolve_announcement_room()` | RAOS (chat) | Authenticated client + service_role | Yes | No | Yes | No | Review | - | sql/raos_073_chat_system_message_rpc.sql |
| `public.raos_resolve_private_room(uuid)` | RAOS (chat) | Authenticated client + service_role | Yes | No | Yes | No | Review | - | sql/raos_073_chat_system_message_rpc.sql |
| `public.get_my_driver_branch()` | system config | Authenticated PWA client | Yes | No | Yes | No | Review | DEFINER exposed to client without body role gate | sql/raos_057_driver_role_login.sql |
| `public.raos_shift_schedule_guard()` | RAOS (Smart Office) | Internal / Trigger | Yes | No | No | No | No | - | sql/raos_088_shift_schedule.sql |
| `public.raos_shift_schedule_board(uuid,date)` | RAOS (Smart Office) | Authenticated PWA client | Yes | No | Yes | No | Review | DEFINER exposed to client without body role gate | sql/raos_088_shift_schedule.sql |
| `public.raos_branch_geofence_scope(uuid)` | RAOS (RAOS attendance) | Authenticated PWA client | Yes | No | Yes | No | Review | DEFINER exposed to client without body role gate; Git source file carries historical DRAFT naming; production state requires live verification | sql/raos_090_attendance_canonical_rpc_DRAFT.sql |
| `public.raos_attendance_check_in(numeric,numeric,text,timestamptz)` | RAOS (RAOS attendance) | Authenticated PWA client | Yes | Yes | Yes | No | No | Git source file carries historical DRAFT naming; production state requires live verification | sql/raos_090_attendance_canonical_rpc_DRAFT.sql |
| `public.raos_attendance_check_out(numeric,numeric,text,timestamptz)` | RAOS (RAOS attendance) | Authenticated PWA client | Yes | Yes | Yes | No | No | Git source file carries historical DRAFT naming; production state requires live verification | sql/raos_090_attendance_canonical_rpc_DRAFT.sql |
| `public.raos_driver_self_join_queue(uuid)` | RAOS (RAOS attendance) | Authenticated PWA client | Yes | Yes | Yes | No | No | Git source file carries historical DRAFT naming; production state requires live verification | sql/raos_091_driver_self_join_queue_DRAFT.sql |
| `public.raos_submit_scan(text,numeric,numeric,text,timestamptz)` | RAOS (RAOS attendance) | Authenticated PWA client | Yes | Yes | Yes | No | No | Git source file carries historical DRAFT naming; production state requires live verification | sql/raos_092_scan_canonical_rpc_DRAFT.sql |
| `public.raos_attendance_check_in(numeric,numeric,text,timestamptz)` | RAOS (RAOS attendance) | Authenticated PWA client | Yes | Yes | Yes | No | No | - | sql/raos_093_attendance_runtime_guards.sql |
| `public.raos_attendance_check_out(numeric,numeric,text,timestamptz)` | RAOS (RAOS attendance) | Authenticated PWA client | Yes | Yes | Yes | No | No | - | sql/raos_093_attendance_runtime_guards.sql |
| `public.raos_attendance_check_in(numeric,numeric,text,timestamptz)` | RAOS (RAOS attendance) | anon + authenticated | Yes | Yes | Yes | Yes | No | anon and authenticated share same grant | sql/raos_095_attendance_shift_record_fix.sql |
| `public.raos_attendance_check_in(numeric,numeric,text,timestamptz)` | RAOS (RAOS attendance) | anon + authenticated | Yes | Yes | Yes | Yes | No | anon and authenticated share same grant | sql/raos_096_attendance_geofence_fk_fix.sql |
| `public.raos_attendance_compute_late()` | RAOS (HRIS) | Internal / Trigger | Yes | No | No | No | No | no explicit GRANT/REVOKE in source | sql/raos_097_attendance_late_timezone_fix.sql |
| `public.mark_chat_room_read(uuid)` | chat | Authenticated PWA client | Yes | Yes | Yes | No | No | - | sql/raos_098_chat_unread_ssot.sql |
| `public.raos_broadcast_absensi_to_chat()` | RAOS (RAOS attendance) | Internal / Trigger | Yes | No | No | No | No | no explicit GRANT/REVOKE in source | sql/raos_099_absensi_chat_branch_timezone.sql |
| `public.raos_assign_driver_barcode(uuid,boolean)` | RAOS (RAOS attendance) | Authenticated PWA client | Yes | Yes | Yes | No | No | - | sql/raos_100_barcode_scan_target_canonical.sql |
| `public.raos_submit_scan(text,numeric,numeric,text,timestamptz)` | RAOS (RAOS attendance) | Authenticated PWA client | Yes | Yes | Yes | No | No | - | sql/raos_100_barcode_scan_target_canonical.sql |
| `public.raos_order_kpi_snapshot()` | RAOS (RAOS payroll) | Authenticated PWA client | Yes | Yes | Yes | No | No | - | sql/raos_100_barcode_scan_target_canonical.sql |
| `public.raos_assign_driver_barcode(uuid,boolean)` | RAOS (RAOS attendance) | Authenticated PWA client | Yes | Yes | Yes | No | No | - | sql/raos_100b_barcode_manager_scope.sql |
| `public.raos_force_admin_head_office()` | RAOS (system config) | Internal / Trigger | No | No | No | No | No | no explicit GRANT/REVOKE in source | sql/raos_102_admin_head_office_kpi.sql |
| `public.raos_admin_branch_kpi_snapshot(uuid)` | RAOS (RAOS payroll) | Authenticated PWA client | Yes | Yes | Yes | No | No | - | sql/raos_102_admin_head_office_kpi.sql |
| `public.raos_saldo_mark_paid(uuid,uuid)` | RAOS (RAOS saldo) | Internal / Trigger | Yes | Yes | No | No | No | Git source file carries historical DRAFT naming, but corresponding production migration was confirmed applied in live Supabase; no explicit GRANT/REVOKE in source | sql/raos_104_saldo_paid_message_dedup.sql |
| `public.raos_saldo_after_processed()` | RAOS (RAOS saldo) | Internal / Trigger | Yes | No | No | No | No | Git source file carries historical DRAFT naming, but corresponding production migration was confirmed applied in live Supabase; no explicit GRANT/REVOKE in source | sql/raos_104_saldo_paid_message_dedup.sql |
| `public.raos_saldo_submit(uuid,uuid,numeric,uuid,uuid)` | RAOS (RAOS saldo) | Internal / Trigger | Yes | Yes | No | No | No | Git source file carries historical DRAFT naming, but corresponding production migration was confirmed applied in live Supabase; no explicit GRANT/REVOKE in source | sql/raos_105_koordinator_operational_parity.sql |
| `public.raos_submit_scan(text,numeric,numeric,text,timestamptz)` | RAOS (RAOS attendance) | Internal / Trigger | Yes | Yes | No | No | No | Git source file carries historical DRAFT naming, but corresponding production migration was confirmed applied in live Supabase; no explicit GRANT/REVOKE in source | sql/raos_105_koordinator_operational_parity.sql |
| `public.raos_attendance_check_in(numeric,numeric,text,timestamptz)` | RAOS (RAOS attendance) | Internal / Trigger | Yes | Yes | No | No | No | Git source file carries historical DRAFT naming, but corresponding production migration was confirmed applied in live Supabase; no explicit GRANT/REVOKE in source | sql/raos_105_koordinator_operational_parity.sql |
| `public.raos_attendance_check_out(numeric,numeric,text,timestamptz)` | RAOS (RAOS attendance) | Internal / Trigger | Yes | Yes | No | No | No | Git source file carries historical DRAFT naming, but corresponding production migration was confirmed applied in live Supabase; no explicit GRANT/REVOKE in source | sql/raos_105_koordinator_operational_parity.sql |
| `public.raos_order_kpi_snapshot()` | RAOS (RAOS payroll) | Internal / Trigger | Yes | Yes | No | No | No | Git source file carries historical DRAFT naming, but corresponding production migration was confirmed applied in live Supabase; no explicit GRANT/REVOKE in source | sql/raos_105_koordinator_operational_parity.sql |
| `public.raos_saldo_kpi_snapshot()` | RAOS (RAOS payroll) | Authenticated client + service_role | Yes | Yes | Yes | No | No | Git source file carries historical DRAFT naming; production state requires live verification | sql/raos_106_koordinator_kpi_branch_target_DRAFT.sql |
| `public.raos_order_kpi_snapshot()` | RAOS (RAOS payroll) | Internal / Trigger | Yes | Yes | No | No | No | Git source file carries historical DRAFT naming; production state requires live verification; no explicit GRANT/REVOKE in source | sql/raos_106_koordinator_kpi_branch_target_DRAFT.sql |
| `public.raos_branch_kpi_breakdown()` | RAOS (RAOS payroll) | Authenticated client + service_role | Yes | Yes | Yes | No | No | Git source file carries historical DRAFT naming; production state requires live verification | sql/raos_106_koordinator_kpi_branch_target_DRAFT.sql |
| `public.raos_branch_kpi_breakdown()` | RAOS (RAOS payroll) | Authenticated client + service_role | Yes | Yes | Yes | No | No | - | sql/raos_107_fix_branch_kpi_breakdown_role_ambiguity.sql |
| `public.raos_saldo_progress_snapshot(uuid)` | RAOS (RAOS payroll) | Authenticated client + service_role | Yes | No | Yes | No | Review | DEFINER exposed to client without body role gate | sql/raos_108_canonical_target_progress_national_consistency.sql |
| `public.raos_admin_branch_kpi_snapshot(uuid)` | RAOS (RAOS payroll) | Internal / Trigger | Yes | Yes | No | No | No | no explicit GRANT/REVOKE in source | sql/raos_108_canonical_target_progress_national_consistency.sql |
| `public.raos_attendance_check_out(numeric,numeric,text,timestamptz)` | RAOS (RAOS attendance) | Authenticated client + service_role | Yes | Yes | Yes | No | No | - | sql/raos_109_pwa_final_operational_guards.sql |
| `public.raos_join_queue_by_barcode(text,uuid,uuid,numeric,numeric)` | RAOS (RAOS attendance) | Authenticated client + service_role | Yes | Yes | Yes | No | No | - | sql/raos_109_pwa_final_operational_guards.sql |
| `public.set_system_config(text,text)` | system config | Authenticated PWA client | Yes | Yes | Yes | No | No | - | supabase/migrations/crm_004_security_hardening.sql |
| `public.log_crm_action(text,text,text,jsonb,jsonb,jsonb)` | other | service_role / GAS / Edge Function | No | No | No | No | No | - | supabase/migrations/crm_004_security_hardening.sql |
| `public.list_system_config()` | system config | Authenticated PWA client | No | No | Yes | No | No | - | supabase/migrations/crm_004_security_hardening.sql |
| `public._trg_crm_contacts_audit()` | other | Internal / Trigger | No | No | No | No | No | - | supabase/migrations/crm_004_security_hardening.sql |
| `public.raos_saldo_mark_paid(uuid,uuid)` | RAOS (RAOS saldo) | Internal / Trigger | Yes | Yes | No | No | No | no explicit GRANT/REVOKE in source | supabase/migrations/raos_103_invoice_coordinator_manual_finance.sql |
| `public.aist_refresh_invoice_for_request_id(uuid)` | AIST | Internal / Trigger | Yes | No | No | No | No | no explicit GRANT/REVOKE in source | supabase/migrations/raos_103_invoice_coordinator_manual_finance.sql |
| `public.aist_invoice_refresh_saldo_trigger()` | AIST | Internal / Trigger | Yes | No | No | No | No | - | supabase/migrations/raos_103_invoice_coordinator_manual_finance.sql |
| `public.aist_invoice_refresh_job_trigger()` | AIST | Internal / Trigger | Yes | No | No | No | No | - | supabase/migrations/raos_103_invoice_coordinator_manual_finance.sql |
| `public.aist_validate_invoice_daily(uuid,text,text)` | AIST | Internal / Trigger | Yes | Yes | No | No | No | no explicit GRANT/REVOKE in source | supabase/migrations/raos_103_invoice_coordinator_manual_finance.sql |

## Recommendations
1. **Revoke `anon` access** from any DEFINER function that is not explicitly a pre-login bridge (only `raos_verify_and_bridge` should have `anon`).
2. **Add role/branch guards** to any DEFINER function marked `Client-Callable = Yes` and `Auth Guard = No`, or change it to SECURITY INVOKER + RLS.
3. **Do not infer production applied state from `_DRAFT` filenames.** Migrations `raos_104`, `raos_105`, and `raos_107` were confirmed already applied in live Supabase. The remaining historically-named DRAFT files (`raos_090`, `raos_091`, `raos_092`, `raos_106`) require live verification before applying or renaming.
4. **System-message / push dispatchers** (`raos_post_system_message`, `raos_create_notification`, `raos_dispatch_push`) should only be executable by `service_role` or trusted backend; audit any `authenticated` grant on these.
5. **Ensure `search_path`** for every DEFINER function explicitly lists only the schemas it needs (typically `public`, plus `auth`, `extensions`, or `realtime` when required).

## Appendix — High-Risk Functions (DEFINER + client callable + no body guard)
- `public.raos_create_notification(uuid[],text,text,text,text,text,text,jsonb,text,int,int)` (sql/raos_063_notification_engine_foundation.sql)
- `public.raos_dispatch_push(uuid[],text,text,text,text,text)` (sql/raos_063_notification_engine_foundation.sql)
- `public.raos_verify_and_bridge(text,text)` (sql/raos_068_raos_credentials_bridge.sql)
- `public.raos_resolve_saldo_room(uuid)` (sql/raos_073_chat_system_message_rpc.sql)
- `public.raos_resolve_driver_room(uuid)` (sql/raos_073_chat_system_message_rpc.sql)
- `public.raos_resolve_announcement_room()` (sql/raos_073_chat_system_message_rpc.sql)
- `public.raos_resolve_private_room(uuid)` (sql/raos_073_chat_system_message_rpc.sql)
- `public.get_my_driver_branch()` (sql/raos_057_driver_role_login.sql)
- `public.raos_shift_schedule_board(uuid,date)` (sql/raos_088_shift_schedule.sql)
- `public.raos_branch_geofence_scope(uuid)` (sql/raos_090_attendance_canonical_rpc_DRAFT.sql)
- `public.raos_saldo_progress_snapshot(uuid)` (sql/raos_108_canonical_target_progress_national_consistency.sql)
