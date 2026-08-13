-- raos_088b: lock down EXECUTE grants left over from Supabase's default
-- privileges (which auto-grant anon+authenticated EXECUTE on new public
-- functions regardless of REVOKE ALL FROM PUBLIC in raos_088).

-- Trigger function must never be directly callable by anon/authenticated.
REVOKE EXECUTE ON FUNCTION public.raos_shift_schedule_guard() FROM PUBLIC, anon, authenticated;

-- Roster RPC: authenticated only (it internally enforces is_branch_in_scope,
-- but anon has no session/role to be in scope of anyway — no reason to expose it).
REVOKE EXECUTE ON FUNCTION public.raos_shift_schedule_board(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.raos_shift_schedule_board(uuid, date) TO authenticated;
