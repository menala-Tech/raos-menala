-- P8 production reconciliation history
-- ALREADY APPLIED TO PRODUCTION ON 2026-08-10
-- DO NOT REAPPLY MANUALLY
-- repository reconciliation only
--
-- This file is intentionally NON-EXECUTABLE history metadata. The original P8 V2 SQL
-- bodies were frozen in the retained P8 preproduction package; SHA-256 values below
-- allow exact source verification without introducing a second runnable migration set.
-- Production migration history is the canonical applied-state record.

-- Supabase production project: vlievtojpmrbsmzlqswl
-- Applied migrations:
-- 20260810052258 p8_00_targeted_rollback_snapshot_20260810
-- 20260810052404 p8_00_migration_buffer
-- 20260810054428 p8_01_foundation_safe_rpc
-- 20260810054513 p8_02_live_data_repair
-- 20260810054616 p8_03_strict_rls_cutover
-- 20260810054649 p8_04_realtime_and_grants
-- 20260810054733 p8_05_credential_compat_prep
-- 20260810054814 p8_06_credential_finalize
-- 20260810055038 p8_08_cross_module_role_matrix_hotfix

-- Targeted rollback schema retained in production: p8_rollback_20260810
-- Snapshot objects:
--   chat_room_members_before
--   constraints_before
--   credential_state_before
--   function_defs_before
--   indexes_before
--   migration_buffer
--   policies_before
--   publication_before
--   raos_driver_queue_before
--   routine_privileges_before
--   triggers_before

-- Frozen P8 V2 source checksums:
-- 91c6f0c3327cc5c8b833dec89d0c4ccb7bb09eb3190496daab41dda7f2b3f080  P8_01_FOUNDATION_SAFE_RPC_NOT_APPLIED.sql
-- de728c3895d75cf95724e10c73407020bc367ca4e7c11526e7e3a95228182507  P8_02_LIVE_DATA_REPAIR_NOT_APPLIED.sql
-- d2827582ef911ebdead37cee932f4c68bf276f63fa62d18bf13ec67601776d20  P8_03_STRICT_RLS_CUTOVER_NOT_APPLIED.sql
-- cf7ead10a2844a62064c1a91439bc7deb191a4892b4703545b4700ed22524f1d  P8_04_REALTIME_AND_GRANTS_NOT_APPLIED.sql
-- 0e68d1bee27260fa66ba102ecc8568b48bbd7842ce63d8afabf95576edd3795c  P8_05_CREDENTIAL_COMPAT_PREP_NOT_APPLIED.sql
-- d22203c3a7cd5191927a5a57a6072df795736f665ad97941545af8b30a04ec42  P8_06_CREDENTIAL_FINALIZE_NOT_APPLIED.sql

-- P8_08 exact final-policy representation (historical; COMMENTED OUT).
-- The six legacy writer policies found during postverify were rewritten so only
-- Admin/Direksi/Direktur can mutate. Management is read-only; Koordinator is read-only
-- and branch-scoped where a branch scope exists.
/*
begin;
drop policy if exists crm_contacts_write on public.crm_contacts;
create policy crm_contacts_write on public.crm_contacts for all to authenticated
using (public.get_my_role() = any (array['admin'::text,'direksi'::text,'direktur'::text]))
with check (public.get_my_role() = any (array['admin'::text,'direksi'::text,'direktur'::text]));

drop policy if exists doc_approvals_insert on public.doc_approvals;
create policy doc_approvals_insert on public.doc_approvals for insert to authenticated
with check (public.get_my_role() = any (array['admin'::text,'direksi'::text,'direktur'::text]));

drop policy if exists doc_documents_insert on public.doc_documents;
create policy doc_documents_insert on public.doc_documents for insert to authenticated
with check (public.get_my_role() = any (array['admin'::text,'direksi'::text,'direktur'::text]));

drop policy if exists doc_documents_update on public.doc_documents;
create policy doc_documents_update on public.doc_documents for update to authenticated
using (public.get_my_role() = any (array['admin'::text,'direksi'::text,'direktur'::text]))
with check (public.get_my_role() = any (array['admin'::text,'direksi'::text,'direktur'::text]));

drop policy if exists doc_revisions_insert on public.doc_revisions;
create policy doc_revisions_insert on public.doc_revisions for insert to authenticated
with check (public.get_my_role() = any (array['admin'::text,'direksi'::text,'direktur'::text]));

drop policy if exists kpi_admin_all on public.kpi_targets;
create policy kpi_admin_all on public.kpi_targets for all to authenticated
using (public.get_my_role() = any (array['admin'::text,'direksi'::text,'direktur'::text]))
with check (public.get_my_role() = any (array['admin'::text,'direksi'::text,'direktur'::text]));
commit;
*/

-- Final production invariants recorded at closure:
-- Realtime canonical: 14/14
-- Credentials: 35 bcrypt / 0 non-bcrypt
-- Membership gap: 0
-- Unauthorized Pengumuman writer: 0
-- Direct Queue mutation policies: 0
-- Direct Saldo mutation policies: 0
-- Management write policies: 0
-- Koordinator write policies: 0
-- Legacy raos_verify_and_bridge runtime EXECUTE: 0
-- ssot_pin retained for rollback window; do not remove in P8 closure.
