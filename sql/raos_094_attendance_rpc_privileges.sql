-- RAOS 094 — explicit attendance RPC privilege hardening
-- 090/093 revoke PUBLIC, but production retained explicit anon EXECUTE.
-- Fail-close inside the function is preserved; this migration also removes
-- the unnecessary database-level execute privilege from anon.

revoke execute on function public.raos_branch_geofence_scope(uuid) from anon;
revoke execute on function public.raos_attendance_check_in(numeric,numeric,text,timestamptz) from anon;
revoke execute on function public.raos_attendance_check_out(numeric,numeric,text,timestamptz) from anon;

grant execute on function public.raos_branch_geofence_scope(uuid) to authenticated;
grant execute on function public.raos_attendance_check_in(numeric,numeric,text,timestamptz) to authenticated;
grant execute on function public.raos_attendance_check_out(numeric,numeric,text,timestamptz) to authenticated;
