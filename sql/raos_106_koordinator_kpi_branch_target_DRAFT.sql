-- raos_106_koordinator_kpi_branch_target — DRAFT, NOT APPLIED
-- Architect task (2026-08-20): Koordinator KPI target + branch target
-- visibility. KOORDINATOR = STAFF + BRANCH SUPERVISOR, so Koordinator needs
-- TWO KPI layers on /kpi: (A) personal target/realisasi exactly like Staff,
-- and (B) a separate branch-aggregate + Staff+Koordinator breakdown view,
-- own branch only.
--
-- AUDIT FINDING (root cause of "Target Saldo = Rp0, Target belum diset" for
-- Siti Regita Cahyani, koordinator, Bandara Batam):
--
-- 1. Bandara Batam is a SALDO-mode branch (raos_kpi_targets_branch.mode=
--    'saldo'). apps/pwa/src/lib/useCanonicalKpi.ts's saldo-mode path does
--    NOT call an RPC at all -- it queries raos_kpi_targets_staff and
--    raos_target_tercapai_bulan directly from the client, filtered by
--    staff_id=<current user>. That path only has a TWO-tier fallback
--    (staff_override -> branch_default) -- there is no third
--    derived-equal-share tier at all, unlike raos_order_kpi_snapshot()
--    (the ORDER-mode RPC), which already has all three tiers
--    (staff_override -> branch_default -> derived_equal_share, and since
--    the PR #102/raos_105 koordinator-parity fix, the derived_equal_share
--    denominator already correctly counts Staff+Koordinator). Confirmed
--    via pg_get_functiondef against production that raos_105 IS applied.
--    Since no row exists in raos_kpi_targets_staff for Siti AND Bandara
--    Batam's branch_target.target_staff_default is unset this month, her
--    target falls through both tiers to 0 -- this reproduces for ANY
--    role, not something koordinator-specific about the bug's mechanics,
--    but the fix requested (adding the missing third tier, matching
--    order-mode's already-existing pattern) explicitly needs Koordinator
--    included in the tier-3 denominator per the business rule.
--
-- 2. Why this needs a NEW RPC rather than adding the tier client-side in
--    useCanonicalKpi.ts directly: the tier-3 fallback needs a COUNT of
--    active Staff+Koordinator in the branch. Confirmed via pg_policy that
--    user_profiles' branch-scope SELECT policy
--    (user_profiles_select_branch_readers) only grants 'koordinator' and
--    'management' -- NOT 'staff'. A client-side count query would silently
--    return 1 (only the caller's own row, via user_profiles_select_own)
--    for a Staff caller, making the derived share meaningless for Staff.
--    This is exactly why raos_order_kpi_snapshot() is itself a SECURITY
--    DEFINER RPC in the first place (bypasses RLS to get the correct
--    branch-wide count for Staff too) -- raos_saldo_kpi_snapshot() below
--    mirrors that same, already-established architecture rather than
--    inventing a new pattern.
--
-- 3. Koordinator additionally needs the BRANCH-AGGREGATE view (item B in
--    the business rule) as a SEPARATE section from their personal KPI --
--    "KPI Saya = personal; branch monitoring is a separate supervisory
--    view" (this exact principle was already established for order-mode
--    in the raos_105 fix). raos_order_kpi_snapshot() currently returns
--    EITHER personal (scope='staff', for staff/koordinator) OR branch
--    (scope='branch', for admin/management/direksi/direktur) -- never
--    both. Koordinator needs both in one page. Both RPCs below add an
--    OPTIONAL `branch` sub-object to the response, populated ONLY when
--    the caller is koordinator (staff gets no `branch` key at all;
--    admin/management/direksi/direktur's existing top-level scope='branch'
--    shape is completely unchanged -- this is a strictly additive,
--    backward-compatible change for every existing caller).
--
-- 4. Finance Target Staff roster (raos_hris_target_roster, cross-repo view
--    in the SAME Supabase project, consumed by rifim-os's Finance
--    dashboard): ALREADY includes `resolved_role IN ('staff','koordinator')`
--    -- confirmed via pg_get_viewdef, unchanged since the raos_105 audit.
--    NO CHANGE required or made here, per "if Koordinator already exists
--    in canonical roster, do not duplicate logic."
--
-- 5. raos_saldo_progress_snapshot(uuid) exists in production but reads
--    from a DIFFERENT, legacy `kpi_targets` table (columns target_scan/
--    target_gmv/month/year) -- used ONLY by the chat "Pencapaian" progress
--    ping trigger (raos_saldo_after_processed), NOT by the /kpi page.
--    This is pre-existing tech debt (a second target source already in
--    production, predating this task) -- explicitly OUT OF SCOPE here
--    ("do not change saldo submission flow" covers the trigger it's
--    called from) and NOT touched by this migration. Flagged for the
--    Architect as a separate follow-up candidate, not fixed in this round.
--
-- CANONICAL TARGET SOURCE (unchanged, reused, not duplicated):
--   raos_kpi_targets_staff (per-person override, target_saldo/target_order)
--   raos_kpi_targets_branch (branch_id, effective_month, target_cabang,
--     target_staff_default, mode)
--   raos_target_tercapai_bulan (view, staff_id-keyed saldo realisasi,
--     reused as-is for both personal and branch-aggregate sums below --
--     no reimplementation of its is_processed/date-bucketing logic)
--   scan_orders (status='valid', staff_id-keyed order realisasi)
--
-- SECURITY: both new functions are SECURITY DEFINER with an internal role
-- gate (mirroring every other RPC in this system) -- no RLS policy is
-- changed. Branch scope is always derived server-side from the CALLER's
-- own branch_id via raos_branch_geofence_scope(), exactly like
-- raos_order_kpi_snapshot() -- a koordinator can never request another
-- branch's data; there is no branch_id input parameter on either function.

-- ---------------------------------------------------------------------
-- 1) raos_saldo_kpi_snapshot() — NEW. Saldo-mode counterpart to
--    raos_order_kpi_snapshot(), same shape/conventions.
-- ---------------------------------------------------------------------
create or replace function public.raos_saldo_kpi_snapshot()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  caller uuid := auth.uid();
  prof record;
  br record;
  target_branch uuid;
  scope_ids uuid[];
  month_start date;
  branch_target record;
  staff_target record;
  active_people_count integer := 0;
  target_val bigint := 0;
  realized_val numeric := 0;
  target_source text := 'unset';
  scope_mode text := 'staff';
  branch_realized_val numeric := 0;
  branch_json jsonb := null;
begin
  if caller is null then raise exception 'unauthenticated' using errcode='28000'; end if;

  select id,role,branch_id,is_active into prof
  from public.user_profiles where id=caller;
  if prof.id is null or not prof.is_active then raise exception 'profile_inactive'; end if;
  if prof.branch_id is null then raise exception 'branch_not_assigned'; end if;

  select id,parent_branch_id,coalesce(timezone,'Asia/Jakarta') timezone into br
  from public.branches where id=prof.branch_id;
  target_branch := coalesce(br.parent_branch_id,prof.branch_id);
  scope_ids := public.raos_branch_geofence_scope(target_branch);

  month_start := date_trunc('month', timezone(br.timezone,now()))::date;

  select * into branch_target
  from public.raos_kpi_targets_branch
  where branch_id=target_branch and effective_month=month_start
  limit 1;

  if branch_target.id is null or coalesce(branch_target.mode,'saldo') <> 'saldo' then
    return jsonb_build_object(
      'effectiveMonth',month_start,'mode',coalesce(branch_target.mode,'unset'),
      'scope','staff','target',0,'realized',0,'achievementPct',0,'source','unset',
      'branchTarget',coalesce(branch_target.target_cabang,0)
    );
  end if;

  select count(*) into active_people_count
  from public.user_profiles up
  where up.is_active=true and lower(coalesce(up.role,'')) in ('staff','koordinator') and up.branch_id=any(scope_ids);

  if lower(coalesce(prof.role,'')) in ('staff','koordinator') then
    select * into staff_target
    from public.raos_kpi_targets_staff
    where staff_id=caller and effective_month=month_start
    limit 1;

    if staff_target.target_saldo is not null then
      target_val := staff_target.target_saldo;
      target_source := 'staff_override';
    elsif branch_target.target_staff_default is not null then
      target_val := branch_target.target_staff_default;
      target_source := 'branch_default';
    elsif active_people_count > 0 then
      target_val := ceil(branch_target.target_cabang::numeric/active_people_count)::bigint;
      target_source := 'derived_equal_share';
    end if;

    select coalesce(t.realisasi_saldo,0) into realized_val
    from public.raos_target_tercapai_bulan t
    where t.staff_id=caller and t.effective_month=month_start;
    realized_val := coalesce(realized_val,0);

    -- Koordinator parity: on top of the personal figures above (identical
    -- shape/semantics to Staff, top-level scope stays 'staff' -- never
    -- overwritten by branch totals), Koordinator additionally gets the
    -- branch-aggregate view as a SEPARATE `branch` sub-object. Staff gets
    -- no `branch` key at all (branch_json stays null).
    if lower(coalesce(prof.role,''))='koordinator' then
      select coalesce(sum(t.realisasi_saldo),0) into branch_realized_val
      from public.raos_target_tercapai_bulan t
      join public.user_profiles up2 on up2.id=t.staff_id
      where up2.branch_id=any(scope_ids) and t.effective_month=month_start;

      branch_json := jsonb_build_object(
        'target', branch_target.target_cabang,
        'realized', branch_realized_val,
        'remaining', greatest(coalesce(branch_target.target_cabang,0) - branch_realized_val, 0),
        'achievementPct', case when coalesce(branch_target.target_cabang,0) > 0
          then least(branch_realized_val / branch_target.target_cabang * 100, 999) else 0 end,
        'activePeople', active_people_count
      );
    end if;

  elsif lower(coalesce(prof.role,'')) in ('admin','management','direksi','direktur') then
    scope_mode := 'branch';
    target_val := branch_target.target_cabang;
    target_source := 'branch_target';

    select coalesce(sum(t.realisasi_saldo),0) into realized_val
    from public.raos_target_tercapai_bulan t
    join public.user_profiles up2 on up2.id=t.staff_id
    where up2.branch_id=any(scope_ids) and t.effective_month=month_start;
  else
    raise exception 'role_not_allowed';
  end if;

  return jsonb_build_object(
    'effectiveMonth',month_start,
    'mode','saldo',
    'scope',scope_mode,
    'target',target_val,
    'realized',realized_val,
    'achievementPct', case when target_val>0 then least(realized_val::numeric/target_val*100,999) else 0 end,
    'source',target_source,
    'branchTarget',branch_target.target_cabang,
    'activeStaff',active_people_count,
    'targetBranchId',target_branch,
    'branch',branch_json
  );
end;
$function$;

comment on function public.raos_saldo_kpi_snapshot() is
  'Saldo-mode counterpart to raos_order_kpi_snapshot(), same conventions. Personal scope (staff_override -> branch_default -> derived_equal_share) for staff+koordinator; branch-aggregate scope for admin/management/direksi/direktur. Koordinator additionally gets a `branch` sub-object alongside their personal figures. Reuses raos_target_tercapai_bulan (no new target source).';

revoke all on function public.raos_saldo_kpi_snapshot() from public, anon;
grant execute on function public.raos_saldo_kpi_snapshot() to authenticated, service_role;


-- ---------------------------------------------------------------------
-- 2) raos_order_kpi_snapshot() — add the SAME koordinator `branch`
--    sub-object as above, for symmetry (a koordinator assigned to an
--    order-mode branch in the future gets identical behavior to a
--    saldo-mode koordinator today). Personal-scope logic for staff/
--    koordinator, and the existing branch-scope logic for admin/
--    management/direksi/direktur, are otherwise BYTE-IDENTICAL to the
--    raos_105 version already in production -- only the new
--    koordinator-only `branch` sub-object is added.
-- ---------------------------------------------------------------------
create or replace function public.raos_order_kpi_snapshot()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  caller uuid := auth.uid();
  prof record;
  br record;
  target_branch uuid;
  scope_ids uuid[];
  month_start date;
  start_ts timestamptz;
  end_ts timestamptz;
  branch_target record;
  staff_target record;
  active_staff_count integer := 0;
  realized_count bigint := 0;
  target_value bigint := 0;
  target_source text := 'unset';
  scope_mode text := 'staff';
  branch_realized_count bigint := 0;
  branch_json jsonb := null;
begin
  if caller is null then raise exception 'unauthenticated' using errcode='28000'; end if;

  select id,role,branch_id,is_active into prof
  from public.user_profiles where id=caller;
  if prof.id is null or not prof.is_active then raise exception 'profile_inactive'; end if;
  if prof.branch_id is null then raise exception 'branch_not_assigned'; end if;

  select id,parent_branch_id,coalesce(timezone,'Asia/Jakarta') timezone into br
  from public.branches where id=prof.branch_id;
  target_branch := coalesce(br.parent_branch_id,prof.branch_id);
  scope_ids := public.raos_branch_geofence_scope(target_branch);

  month_start := date_trunc('month', timezone(br.timezone,now()))::date;
  start_ts := month_start::timestamp at time zone br.timezone;
  end_ts := (month_start + interval '1 month')::timestamp at time zone br.timezone;

  select * into branch_target
  from public.raos_kpi_targets_branch
  where branch_id=target_branch and effective_month=month_start
  limit 1;

  if branch_target.id is null or branch_target.mode <> 'order' then
    return jsonb_build_object(
      'effectiveMonth',month_start,'mode',coalesce(branch_target.mode,'unset'),
      'scope','staff','target',0,'realized',0,'achievementPct',0,'source','unset',
      'branchTarget',coalesce(branch_target.target_cabang,0)
    );
  end if;

  select count(*) into active_staff_count
  from public.user_profiles up
  where up.is_active=true and lower(coalesce(up.role,'')) in ('staff','koordinator') and up.branch_id=any(scope_ids);

  if lower(coalesce(prof.role,'')) in ('staff','koordinator') then
    select * into staff_target
    from public.raos_kpi_targets_staff
    where staff_id=caller and effective_month=month_start
    limit 1;

    if staff_target.target_order is not null then
      target_value := staff_target.target_order;
      target_source := 'staff_override';
    elsif branch_target.target_staff_default is not null then
      target_value := branch_target.target_staff_default;
      target_source := 'branch_default';
    elsif active_staff_count > 0 then
      target_value := ceil(branch_target.target_cabang::numeric/active_staff_count)::bigint;
      target_source := 'derived_equal_share';
    end if;

    select count(*) into realized_count
    from public.scan_orders s
    where s.staff_id=caller and s.status='valid'
      and s.scanned_at>=start_ts and s.scanned_at<end_ts;

    -- Koordinator parity (2026-08-20, mirrors raos_saldo_kpi_snapshot()):
    -- personal top-level fields above stay exactly as Staff's; Koordinator
    -- additionally gets a `branch` sub-object. Staff gets no `branch` key.
    if lower(coalesce(prof.role,''))='koordinator' then
      select count(*) into branch_realized_count
      from public.scan_orders s
      join public.user_profiles up2 on up2.id=s.staff_id
      where s.status='valid'
        and up2.branch_id=any(scope_ids)
        and s.scanned_at>=start_ts and s.scanned_at<end_ts;

      branch_json := jsonb_build_object(
        'target', branch_target.target_cabang,
        'realized', branch_realized_count,
        'remaining', greatest(coalesce(branch_target.target_cabang,0) - branch_realized_count, 0),
        'achievementPct', case when coalesce(branch_target.target_cabang,0) > 0
          then least(branch_realized_count::numeric / branch_target.target_cabang * 100, 999) else 0 end,
        'activePeople', active_staff_count
      );
    end if;

  elsif lower(coalesce(prof.role,'')) in ('admin','management','direksi','direktur') then
    scope_mode := 'branch';
    target_value := branch_target.target_cabang;
    target_source := 'branch_target';

    select count(*) into realized_count
    from public.scan_orders s
    join public.user_profiles up on up.id=s.staff_id
    where s.status='valid'
      and up.branch_id=any(scope_ids)
      and s.scanned_at>=start_ts and s.scanned_at<end_ts;
  else
    raise exception 'role_not_allowed';
  end if;

  return jsonb_build_object(
    'effectiveMonth',month_start,
    'mode','order',
    'scope',scope_mode,
    'target',target_value,
    'realized',realized_count,
    'achievementPct',case when target_value>0 then least(realized_count::numeric/target_value*100,999) else 0 end,
    'source',target_source,
    'branchTarget',branch_target.target_cabang,
    'activeStaff',active_staff_count,
    'targetBranchId',target_branch,
    'branch',branch_json
  );
end;
$function$;


-- ---------------------------------------------------------------------
-- 3) raos_branch_kpi_breakdown() — NEW. Per-person Staff+Koordinator
--    breakdown for the caller's own branch, own-branch scope only.
--    Gated to koordinator/admin/management/direksi/direktur; the PWA
--    frontend only ever calls this for koordinator (business rule item
--    5/6 explicitly scopes the new UI section to koordinator, not
--    Staff), but the function itself allows the existing branch-
--    supervisory roles too, matching riwayat-cabang's precedent of
--    "if you can already read branch-wide operational data, you can
--    read this too" rather than re-deriving a narrower rule.
-- ---------------------------------------------------------------------
create or replace function public.raos_branch_kpi_breakdown()
returns table(
  staff_id uuid,
  full_name text,
  role text,
  target_saldo bigint,
  realized_saldo bigint,
  pct_saldo numeric,
  target_order bigint,
  realized_order bigint,
  pct_order numeric
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  caller uuid := auth.uid();
  prof record;
  br record;
  target_branch uuid;
  scope_ids uuid[];
  month_start date;
  start_ts timestamptz;
  end_ts timestamptz;
  branch_target record;
  active_people_count integer := 0;
  default_share bigint := 0;
begin
  if caller is null then raise exception 'unauthenticated' using errcode='28000'; end if;

  select id,role,branch_id,is_active into prof
  from public.user_profiles where id=caller;
  if prof.id is null or not prof.is_active then raise exception 'profile_inactive'; end if;
  if lower(coalesce(prof.role,'')) not in ('koordinator','admin','management','direksi','direktur') then
    raise exception 'role_not_allowed';
  end if;
  if prof.branch_id is null then raise exception 'branch_not_assigned'; end if;

  select id,parent_branch_id,coalesce(timezone,'Asia/Jakarta') timezone into br
  from public.branches where id=prof.branch_id;
  target_branch := coalesce(br.parent_branch_id,prof.branch_id);
  scope_ids := public.raos_branch_geofence_scope(target_branch);

  month_start := date_trunc('month', timezone(br.timezone,now()))::date;
  start_ts := month_start::timestamp at time zone br.timezone;
  end_ts := (month_start + interval '1 month')::timestamp at time zone br.timezone;

  select * into branch_target
  from public.raos_kpi_targets_branch
  where branch_id=target_branch and effective_month=month_start
  limit 1;

  select count(*) into active_people_count
  from public.user_profiles up
  where up.is_active=true and lower(coalesce(up.role,'')) in ('staff','koordinator') and up.branch_id=any(scope_ids);

  if active_people_count > 0 and branch_target.id is not null then
    default_share := ceil(coalesce(branch_target.target_cabang,0)::numeric/active_people_count)::bigint;
  end if;

  return query
  with roster as (
    select
      up.id as r_staff_id,
      up.full_name as r_full_name,
      up.role as r_role,
      (case when coalesce(branch_target.mode,'saldo')='saldo'
        then coalesce(kt.target_saldo, branch_target.target_staff_default, default_share, 0)
        else 0 end)::bigint as r_target_saldo,
      coalesce(ttb.realisasi_saldo,0)::bigint as r_realized_saldo,
      (case when coalesce(branch_target.mode,'saldo')='order'
        then coalesce(kt.target_order, branch_target.target_staff_default, default_share, 0)
        else 0 end)::bigint as r_target_order,
      coalesce((
        select count(*) from public.scan_orders s
        where s.staff_id=up.id and s.status='valid'
          and s.scanned_at>=start_ts and s.scanned_at<end_ts
      ),0)::bigint as r_realized_order
    from public.user_profiles up
    left join public.raos_kpi_targets_staff kt
      on kt.staff_id=up.id and kt.effective_month=month_start
    left join public.raos_target_tercapai_bulan ttb
      on ttb.staff_id=up.id and ttb.effective_month=month_start
    where up.is_active=true
      and lower(coalesce(up.role,'')) in ('staff','koordinator')
      and up.branch_id=any(scope_ids)
  )
  select
    r_staff_id, r_full_name, r_role,
    r_target_saldo, r_realized_saldo,
    (case when r_target_saldo>0 then least(r_realized_saldo::numeric/r_target_saldo*100,999) else 0 end)::numeric,
    r_target_order, r_realized_order,
    (case when r_target_order>0 then least(r_realized_order::numeric/r_target_order*100,999) else 0 end)::numeric
  from roster
  order by r_full_name;
end;
$function$;

comment on function public.raos_branch_kpi_breakdown() is
  'Per-person Staff+Koordinator KPI breakdown for the callers own branch (own branch only, derived server-side from the callers branch_id -- no branch_id parameter, so cross-branch access is not possible). Gated to koordinator/admin/management/direksi/direktur. PWA frontend only calls this for koordinator.';

revoke all on function public.raos_branch_kpi_breakdown() from public, anon;
grant execute on function public.raos_branch_kpi_breakdown() to authenticated, service_role;
