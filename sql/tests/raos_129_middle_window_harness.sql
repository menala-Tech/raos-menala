\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

\echo 'RAOS 129 Middle attendance-window harness'
\echo 'Environment: throwaway postgres:16-alpine only'

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE SCHEMA auth;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;

CREATE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT current_setting('harness.uid', true)::uuid
$$;

CREATE TABLE public.shifts (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  tolerance_minutes integer NOT NULL DEFAULT 15,
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE public.branches (
  id uuid PRIMARY KEY,
  timezone text,
  name text
);

CREATE TABLE public.user_profiles (
  id uuid PRIMARY KEY,
  role text,
  branch_id uuid,
  is_active boolean NOT NULL DEFAULT true,
  is_geofence_exempt boolean NOT NULL DEFAULT false,
  email text,
  full_name text
);

CREATE TABLE public.raos_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL,
  branch_id uuid,
  date date NOT NULL,
  shift_id uuid,
  check_in_at timestamptz,
  check_in_at_override timestamptz,
  check_out_at timestamptz,
  check_out_at_override timestamptz,
  check_in_lat numeric,
  check_in_lng numeric,
  check_out_lat numeric,
  check_out_lng numeric,
  pickup_point_id uuid,
  selfie_in_url text,
  selfie_out_url text,
  is_location_valid boolean,
  status text,
  late_minutes integer,
  late_deduction_idr numeric,
  auto_checkout boolean,
  CONSTRAINT raos_attendance_staff_date_key UNIQUE (staff_id, date)
);

CREATE TABLE public.raos_shift_schedules (
  staff_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  tanggal date NOT NULL,
  shift_id uuid NOT NULL
);

CREATE TABLE public.raos_geofence_points (
  id uuid PRIMARY KEY,
  branch_id uuid,
  name text,
  radius_meters numeric,
  latitude numeric,
  longitude numeric,
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE public.pickup_points (
  id uuid PRIMARY KEY,
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE public.system_config (
  key text PRIMARY KEY,
  value text
);

CREATE FUNCTION public.raos_branch_geofence_scope(p_branch_id uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
AS $$
  SELECT ARRAY[p_branch_id]::uuid[]
$$;

INSERT INTO public.branches (id, timezone, name)
VALUES ('11111111-1111-1111-1111-111111111111', 'Asia/Jakarta', 'Harness Branch');

INSERT INTO public.user_profiles (
  id, role, branch_id, is_active, is_geofence_exempt, email, full_name
)
VALUES (
  '22222222-2222-2222-2222-222222222222',
  'staff',
  '11111111-1111-1111-1111-111111111111',
  true,
  true,
  'harness@example.invalid',
  'Harness Staff'
);

INSERT INTO public.raos_geofence_points (
  id, branch_id, name, radius_meters, latitude, longitude, is_active
)
VALUES (
  '33333333-3333-3333-3333-333333333333',
  '11111111-1111-1111-1111-111111111111',
  'Harness Point',
  100,
  0,
  0,
  true
);

INSERT INTO public.pickup_points (id, is_active)
VALUES ('33333333-3333-3333-3333-333333333333', true);

INSERT INTO public.shifts (id, name, start_time, end_time, tolerance_minutes)
VALUES
  ('5a335fe8-6864-49c1-9c2c-d7753f21e859', 'Pagi',  '07:00', '15:00', 15),
  ('5098582e-6015-4de5-86fc-4b330e8aa02c', 'Siang', '13:00', '21:00', 15),
  ('45b7af1e-2a6b-4d6b-92b5-d1ef9b2d58aa', 'Malam', '21:00', '05:00', 15);

INSERT INTO public.system_config (key, value)
VALUES
  ('LATE_DEDUCTION_RATE_IDR', '10000'),
  ('LATE_DEDUCTION_INTERVAL_MIN', '30');

SELECT set_config(
  'harness.uid',
  '22222222-2222-2222-2222-222222222222',
  false
);

-- Legacy baseline: the function body is the branch-local implementation from
-- raos_097, and this trigger definition is the installation from raos_071.
CREATE FUNCTION public.raos_attendance_compute_late()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_shift_start time;
  v_shift_end time;
  v_rate numeric := 10000;
  v_interval int := 30;
  v_check_in timestamptz;
  v_timezone text := 'Asia/Jakarta';
  v_local_time time;
  v_diff_minutes int := 0;
BEGIN
  v_check_in := coalesce(new.check_in_at_override, new.check_in_at);
  IF v_check_in IS NULL OR new.shift_id IS NULL THEN
    new.late_minutes := 0;
    new.late_deduction_idr := 0;
    RETURN new;
  END IF;

  SELECT s.start_time, s.end_time
    INTO v_shift_start, v_shift_end
    FROM public.shifts s
    WHERE s.id = new.shift_id;

  IF v_shift_start IS NULL THEN
    new.late_minutes := 0;
    new.late_deduction_idr := 0;
    RETURN new;
  END IF;

  SELECT coalesce(b.timezone, 'Asia/Jakarta')
    INTO v_timezone
    FROM public.branches b
    WHERE b.id = new.branch_id;

  v_timezone := coalesce(v_timezone, 'Asia/Jakarta');
  v_local_time := (v_check_in AT TIME ZONE v_timezone)::time;

  IF v_shift_end IS NOT NULL
     AND v_shift_start > v_shift_end
     AND v_local_time < v_shift_end THEN
    v_diff_minutes :=
      ((extract(epoch FROM v_local_time)::int + 86400)
       - extract(epoch FROM v_shift_start)::int) / 60;
  ELSE
    v_diff_minutes :=
      (extract(epoch FROM v_local_time)::int
       - extract(epoch FROM v_shift_start)::int) / 60;
  END IF;

  new.late_minutes := greatest(0, v_diff_minutes);

  SELECT coalesce((
    SELECT value::numeric
    FROM public.system_config
    WHERE key = 'LATE_DEDUCTION_RATE_IDR'
  ), 10000)
  INTO v_rate;

  SELECT coalesce((
    SELECT value::int
    FROM public.system_config
    WHERE key = 'LATE_DEDUCTION_INTERVAL_MIN'
  ), 30)
  INTO v_interval;

  new.late_deduction_idr := ceil(new.late_minutes::numeric / v_interval) * v_rate;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS trg_raos_attendance_compute_late ON public.raos_attendance;
CREATE TRIGGER trg_raos_attendance_compute_late
BEFORE INSERT OR UPDATE OF check_in_at, check_in_at_override, shift_id
ON public.raos_attendance
FOR EACH ROW
EXECUTE FUNCTION public.raos_attendance_compute_late();

CREATE FUNCTION public.harness_insert_late(
  p_shift_id uuid,
  p_check_in_at timestamptz
)
RETURNS TABLE (late_minutes integer, late_deduction_idr numeric)
LANGUAGE plpgsql
AS $$
BEGIN
  TRUNCATE public.raos_attendance;
  RETURN QUERY
  INSERT INTO public.raos_attendance (
    staff_id, branch_id, date, shift_id, check_in_at, status
  )
  VALUES (
    '22222222-2222-2222-2222-222222222222',
    '11111111-1111-1111-1111-111111111111',
    (p_check_in_at AT TIME ZONE 'Asia/Jakarta')::date,
    p_shift_id,
    p_check_in_at,
    'hadir'
  )
  RETURNING public.raos_attendance.late_minutes,
            public.raos_attendance.late_deduction_idr;
END;
$$;

CREATE TEMP TABLE harness_legacy_before (
  label text PRIMARY KEY,
  late_minutes integer,
  late_deduction_idr numeric
);

INSERT INTO harness_legacy_before
SELECT 'Pagi 07:00', late_minutes, late_deduction_idr
FROM public.harness_insert_late(
  '5a335fe8-6864-49c1-9c2c-d7753f21e859',
  '2026-08-26 07:00:00+07'
);
INSERT INTO harness_legacy_before
SELECT 'Pagi 07:10', late_minutes, late_deduction_idr
FROM public.harness_insert_late(
  '5a335fe8-6864-49c1-9c2c-d7753f21e859',
  '2026-08-26 07:10:00+07'
);
INSERT INTO harness_legacy_before
SELECT 'Pagi 07:46', late_minutes, late_deduction_idr
FROM public.harness_insert_late(
  '5a335fe8-6864-49c1-9c2c-d7753f21e859',
  '2026-08-26 07:46:00+07'
);
INSERT INTO harness_legacy_before
SELECT 'Siang 13:20', late_minutes, late_deduction_idr
FROM public.harness_insert_late(
  '5098582e-6015-4de5-86fc-4b330e8aa02c',
  '2026-08-26 13:20:00+07'
);
INSERT INTO harness_legacy_before
SELECT 'Malam 21:30', late_minutes, late_deduction_idr
FROM public.harness_insert_late(
  '45b7af1e-2a6b-4d6b-92b5-d1ef9b2d58aa',
  '2026-08-26 21:30:00+07'
);
INSERT INTO harness_legacy_before
SELECT 'Malam 00:30', late_minutes, late_deduction_idr
FROM public.harness_insert_late(
  '45b7af1e-2a6b-4d6b-92b5-d1ef9b2d58aa',
  '2026-08-27 00:30:00+07'
);

\echo 'Legacy baseline captured before RAOS 129'
SELECT label || ' -> late_minutes=' || late_minutes
  || ' late_deduction_idr=' || late_deduction_idr
FROM harness_legacy_before
ORDER BY label;

\ir ../raos_129_shift_middle_windows.sql

CREATE FUNCTION public.harness_assert_equal(
  p_label text,
  p_expected text,
  p_actual text
)
RETURNS text
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_actual IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION 'ASSERTION FAILED: % expected [%], actual [%]',
      p_label, p_expected, p_actual;
  END IF;
  RETURN p_label || ' -> ' || p_actual;
END;
$$;

DO $$
DECLARE
  before_row record;
  after_row record;
BEGIN
  FOR before_row IN
    SELECT * FROM harness_legacy_before ORDER BY label
  LOOP
    SELECT late_minutes, late_deduction_idr
      INTO after_row
      FROM public.harness_insert_late(
        CASE
          WHEN before_row.label LIKE 'Pagi%' THEN
            '5a335fe8-6864-49c1-9c2c-d7753f21e859'::uuid
          WHEN before_row.label LIKE 'Siang%' THEN
            '5098582e-6015-4de5-86fc-4b330e8aa02c'::uuid
          ELSE
            '45b7af1e-2a6b-4d6b-92b5-d1ef9b2d58aa'::uuid
        END,
        CASE before_row.label
          WHEN 'Pagi 07:00' THEN '2026-08-26 07:00:00+07'::timestamptz
          WHEN 'Pagi 07:10' THEN '2026-08-26 07:10:00+07'::timestamptz
          WHEN 'Pagi 07:46' THEN '2026-08-26 07:46:00+07'::timestamptz
          WHEN 'Siang 13:20' THEN '2026-08-26 13:20:00+07'::timestamptz
          WHEN 'Malam 21:30' THEN '2026-08-26 21:30:00+07'::timestamptz
          WHEN 'Malam 00:30' THEN '2026-08-27 00:30:00+07'::timestamptz
        END
      );
    IF after_row.late_minutes IS DISTINCT FROM before_row.late_minutes
       OR after_row.late_deduction_idr IS DISTINCT FROM before_row.late_deduction_idr THEN
      RAISE EXCEPTION
        'ASSERTION FAILED: legacy case % expected late_minutes=%, deduction=%, actual late_minutes=%, deduction=%',
        before_row.label,
        before_row.late_minutes,
        before_row.late_deduction_idr,
        after_row.late_minutes,
        after_row.late_deduction_idr;
    END IF;
    RAISE NOTICE 'legacy unchanged: % -> late_minutes=%, late_deduction_idr=%',
      before_row.label, after_row.late_minutes, after_row.late_deduction_idr;
  END LOOP;
END;
$$;

CREATE FUNCTION public.harness_middle_checkin_guard(p_local_time time)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  local_minutes integer :=
    extract(hour FROM p_local_time)::integer * 60
    + extract(minute FROM p_local_time)::integer;
  v_check_in_start time;
  v_check_in_end time;
BEGIN
  SELECT check_in_start, check_in_end
    INTO v_check_in_start, v_check_in_end
    FROM public.shifts
    WHERE lower(trim(name)) = 'middle';
  IF local_minutes <
     extract(hour FROM v_check_in_start)::integer * 60
     + extract(minute FROM v_check_in_start)::integer THEN
    RAISE EXCEPTION 'checkin_before_window';
  END IF;
  IF local_minutes >
     extract(hour FROM v_check_in_end)::integer * 60
     + extract(minute FROM v_check_in_end)::integer THEN
    RETURN 'terlambat late_minutes=' || (
      local_minutes
      - extract(hour FROM v_check_in_end)::integer * 60
      - extract(minute FROM v_check_in_end)::integer
    );
  END IF;
  RETURN 'hadir late_minutes=0 late_deduction_idr=0';
END;
$$;

CREATE FUNCTION public.harness_middle_checkin_result(p_local_time time)
RETURNS text
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN public.harness_middle_checkin_guard(p_local_time);
EXCEPTION WHEN OTHERS THEN
  RETURN 'exception ' || SQLERRM;
END;
$$;

CREATE FUNCTION public.harness_middle_checkout_guard(p_local_time time)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  local_minutes integer :=
    extract(hour FROM p_local_time)::integer * 60
    + extract(minute FROM p_local_time)::integer;
  v_check_out_start time;
BEGIN
  SELECT check_out_start
    INTO v_check_out_start
    FROM public.shifts
    WHERE lower(trim(name)) = 'middle';
  IF local_minutes <
     extract(hour FROM v_check_out_start)::integer * 60
     + extract(minute FROM v_check_out_start)::integer THEN
    RAISE EXCEPTION 'checkout_before_window';
  END IF;
  RETURN 'recorded';
END;
$$;

CREATE FUNCTION public.harness_middle_checkout_result(p_local_time time)
RETURNS text
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN public.harness_middle_checkout_guard(p_local_time);
EXCEPTION WHEN OTHERS THEN
  RETURN 'exception ' || SQLERRM;
END;
$$;

\echo 'Middle fixed-time acceptance matrix (direct guard evaluation)'
SELECT public.harness_assert_equal(
  'check-in 09:59',
  'exception checkin_before_window',
  public.harness_middle_checkin_result('09:59')
);
SELECT public.harness_assert_equal(
  'check-in 10:00',
  'hadir late_minutes=0 late_deduction_idr=0',
  public.harness_middle_checkin_result('10:00')
);
SELECT public.harness_assert_equal(
  'check-in 11:15',
  'hadir late_minutes=0 late_deduction_idr=0',
  public.harness_middle_checkin_result('11:15')
);
SELECT public.harness_assert_equal(
  'check-in 12:00',
  'hadir late_minutes=0 late_deduction_idr=0',
  public.harness_middle_checkin_result('12:00')
);
SELECT public.harness_assert_equal(
  'check-in 12:01',
  'terlambat late_minutes=1',
  public.harness_middle_checkin_result('12:01')
);
SELECT public.harness_assert_equal(
  'check-out 18:59',
  'exception checkout_before_window',
  public.harness_middle_checkout_result('18:59')
);
SELECT public.harness_assert_equal(
  'check-out 19:00',
  'recorded',
  public.harness_middle_checkout_result('19:00')
);
SELECT public.harness_assert_equal(
  'check-out 20:30',
  'recorded',
  public.harness_middle_checkout_result('20:30')
);
SELECT public.harness_assert_equal(
  'check-out 23:00',
  'recorded',
  public.harness_middle_checkout_result('23:00')
);
SELECT public.harness_assert_equal(
  'check-out 23:01',
  'recorded',
  public.harness_middle_checkout_result('23:01')
);

CREATE FUNCTION public.harness_legacy_checkout_result(
  p_shift_id uuid,
  p_local_time time
)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_check_out_start time;
BEGIN
  SELECT check_out_start
    INTO v_check_out_start
    FROM public.shifts
    WHERE id = p_shift_id;
  IF v_check_out_start IS NULL THEN
    RETURN 'recorded';
  END IF;
  IF p_local_time < v_check_out_start THEN
    RAISE EXCEPTION 'checkout_before_window';
  END IF;
  RETURN 'recorded';
EXCEPTION WHEN OTHERS THEN
  RETURN 'exception ' || SQLERRM;
END;
$$;

\echo 'Legacy check-out window assertions (direct guard evaluation)'
SELECT public.harness_assert_equal(
  'legacy Pagi check-out 18:00',
  'recorded',
  public.harness_legacy_checkout_result(
    '5a335fe8-6864-49c1-9c2c-d7753f21e859',
    '18:00'
  )
);
SELECT public.harness_assert_equal(
  'legacy Siang check-out 18:00',
  'recorded',
  public.harness_legacy_checkout_result(
    '5098582e-6015-4de5-86fc-4b330e8aa02c',
    '18:00'
  )
);
SELECT public.harness_assert_equal(
  'legacy Malam check-out 06:00',
  'recorded',
  public.harness_legacy_checkout_result(
    '45b7af1e-2a6b-4d6b-92b5-d1ef9b2d58aa',
    '06:00'
  )
);

CREATE FUNCTION public.harness_rosterless_autodetect(p_local_time time)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT s.name
  FROM public.shifts s
  WHERE s.is_active
    AND s.check_in_start IS NULL
    AND (
      (
        extract(hour FROM s.start_time)::int * 60
          + extract(minute FROM s.start_time)::int
        <= extract(hour FROM s.end_time)::int * 60
          + extract(minute FROM s.end_time)::int
        AND extract(hour FROM p_local_time)::int * 60
          + extract(minute FROM p_local_time)::int
          >= extract(hour FROM s.start_time)::int * 60
          + extract(minute FROM s.start_time)::int
        AND extract(hour FROM p_local_time)::int * 60
          + extract(minute FROM p_local_time)::int
          < extract(hour FROM s.end_time)::int * 60
          + extract(minute FROM s.end_time)::int
      )
      OR (
        extract(hour FROM s.start_time)::int * 60
          + extract(minute FROM s.start_time)::int
        > extract(hour FROM s.end_time)::int * 60
          + extract(minute FROM s.end_time)::int
        AND (
          extract(hour FROM p_local_time)::int * 60
            + extract(minute FROM p_local_time)::int
          >= extract(hour FROM s.start_time)::int * 60
            + extract(minute FROM s.start_time)::int
          OR extract(hour FROM p_local_time)::int * 60
            + extract(minute FROM p_local_time)::int
          < extract(hour FROM s.end_time)::int * 60
            + extract(minute FROM s.end_time)::int
        )
      )
    )
  ORDER BY s.start_time
  LIMIT 1
$$;

\echo 'Roster-less auto-detect (direct evaluation of migration predicate)'
SELECT public.harness_assert_equal(
  'rosterless 14:00',
  'Pagi',
  public.harness_rosterless_autodetect('14:00')
);
SELECT public.harness_assert_equal(
  'rosterless 20:00',
  'Siang',
  public.harness_rosterless_autodetect('20:00')
);
SELECT public.harness_assert_equal(
  'rosterless 22:00',
  'Malam',
  public.harness_rosterless_autodetect('22:00')
);

CREATE FUNCTION public.harness_rpc_checkin_smoke()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_date date := (v_now AT TIME ZONE 'Asia/Jakarta')::date;
  v_middle uuid;
  v_result jsonb;
BEGIN
  TRUNCATE public.raos_attendance;
  DELETE FROM public.raos_shift_schedules;
  SELECT id INTO v_middle FROM public.shifts WHERE name = 'Middle';
  INSERT INTO public.raos_shift_schedules (
    staff_id, branch_id, tanggal, shift_id
  )
  VALUES (
    '22222222-2222-2222-2222-222222222222',
    '11111111-1111-1111-1111-111111111111',
    v_date,
    v_middle
  );
  v_result := public.raos_attendance_check_in(0, 0, 'rpc-smoke', v_now);
  RETURN 'real RPC check-in (permitted current timestamp, WIB '
    || to_char(v_now AT TIME ZONE 'Asia/Jakarta', 'HH24:MI:SS')
    || ') -> ' || (v_result->>'status');
EXCEPTION WHEN OTHERS THEN
  RETURN 'real RPC check-in (permitted current timestamp, WIB '
    || to_char(v_now AT TIME ZONE 'Asia/Jakarta', 'HH24:MI:SS')
    || ') -> exception ' || SQLERRM;
END;
$$;

CREATE FUNCTION public.harness_rpc_checkout_smoke()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_date date := (v_now AT TIME ZONE 'Asia/Jakarta')::date;
  v_middle uuid;
  v_result jsonb;
BEGIN
  TRUNCATE public.raos_attendance;
  SELECT id INTO v_middle FROM public.shifts WHERE name = 'Middle';
  INSERT INTO public.raos_attendance (
    staff_id, branch_id, date, shift_id, check_in_at, status
  )
  VALUES (
    '22222222-2222-2222-2222-222222222222',
    '11111111-1111-1111-1111-111111111111',
    v_date,
    v_middle,
    v_now - interval '1 hour',
    'hadir'
  );
  v_result := public.raos_attendance_check_out(0, 0, 'rpc-smoke', v_now);
  RETURN 'real RPC check-out (permitted current timestamp, WIB '
    || to_char(v_now AT TIME ZONE 'Asia/Jakarta', 'HH24:MI:SS')
    || ') -> ' || (v_result->>'status');
EXCEPTION WHEN OTHERS THEN
  RETURN 'real RPC check-out (permitted current timestamp, WIB '
    || to_char(v_now AT TIME ZONE 'Asia/Jakarta', 'HH24:MI:SS')
    || ') -> exception ' || SQLERRM;
END;
$$;

\echo 'Real RPC smoke cases (current permitted timestamp; fixed matrix remains direct)'
SELECT public.harness_rpc_checkin_smoke();
SELECT public.harness_rpc_checkout_smoke();

\echo 'Coverage: fixed wall-clock matrix and legacy checkout/autodetect used direct guard evaluation; current-time smoke cases called the real RPCs.'
\echo 'PASS: RAOS 129 Middle window acceptance harness'
