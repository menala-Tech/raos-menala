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
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
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

CREATE FUNCTION public.harness_capture_target(
  p_target_date date,
  p_target_time time
)
RETURNS timestamptz
LANGUAGE plpgsql
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_now_local timestamp := v_now AT TIME ZONE 'Asia/Jakarta';
  v_target_local timestamp := p_target_date::timestamp + p_target_time;
  v_raw_offset interval := v_now_local - v_target_local;
  v_offset interval;
  v_timezone text := 'Asia/Jakarta';
BEGIN
  -- Use the requested date/time directly. A future target is represented in
  -- the past with a temporary UTC+14 branch timezone; this keeps the target
  -- on the requested local date rather than silently wrapping to yesterday.
  IF v_raw_offset < interval '0' THEN
    v_timezone := 'Etc/GMT-14';
  ELSIF v_raw_offset <= interval '6 minutes' THEN
    v_timezone := 'Etc/GMT-8';
  ELSIF v_raw_offset >= interval '23 hours 55 minutes' THEN
    v_timezone := 'Etc/GMT-6';
  END IF;

  v_now_local := v_now AT TIME ZONE v_timezone;
  v_offset := v_now_local - v_target_local;
  IF v_offset < interval '0' THEN
    v_offset := v_offset + interval '24 hours';
  END IF;

  IF v_offset <= interval '5 minutes' OR v_offset >= interval '24 hours' THEN
    RAISE EXCEPTION
      'HARNESS TIMESTAMP FAILURE: target % % produced offset % outside permitted band',
      p_target_date, p_target_time, v_offset;
  END IF;

  UPDATE public.branches
  SET timezone = v_timezone
  WHERE id = '11111111-1111-1111-1111-111111111111';

  RETURN v_now - v_offset;
END;
$$;

CREATE FUNCTION public.harness_assert_checkin(
  p_label text,
  p_target_date date,
  p_target_time time,
  p_shift_id uuid,
  p_expected_status text,
  p_expected_late integer,
  p_expected_deduction numeric,
  p_expected_error text,
  p_expected_shift_id uuid
)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_captured_at timestamptz;
  v_result jsonb;
  v_error text;
  v_status text;
  v_shift_id uuid;
  v_late integer;
  v_deduction numeric;
BEGIN
  TRUNCATE public.raos_attendance;
  DELETE FROM public.raos_shift_schedules;
  v_captured_at := public.harness_capture_target(p_target_date, p_target_time);
  IF p_shift_id IS NOT NULL THEN
    INSERT INTO public.raos_shift_schedules (
      staff_id, branch_id, tanggal, shift_id
    )
    VALUES (
      '22222222-2222-2222-2222-222222222222',
      '11111111-1111-1111-1111-111111111111',
      (
        v_captured_at AT TIME ZONE (
          SELECT timezone
          FROM public.branches
          WHERE id = '11111111-1111-1111-1111-111111111111'
        )
      )::date,
      p_shift_id
    );
  END IF;

  BEGIN
    v_result := public.raos_attendance_check_in(0, 0, 'harness', v_captured_at);
  EXCEPTION WHEN OTHERS THEN
    v_error := SQLERRM;
  END;

  UPDATE public.branches
  SET timezone = 'Asia/Jakarta'
  WHERE id = '11111111-1111-1111-1111-111111111111';

  IF p_expected_error IS NOT NULL THEN
    IF v_error IS DISTINCT FROM p_expected_error THEN
      RAISE EXCEPTION
        'ASSERTION FAILED: % expected exception [%], actual [%]',
        p_label, p_expected_error, coalesce(v_error, v_result::text);
    END IF;
    RETURN p_label || ' -> exception ' || v_error;
  END IF;

  IF v_error IS NOT NULL THEN
    RAISE EXCEPTION 'ASSERTION FAILED: % unexpected exception [%]', p_label, v_error;
  END IF;

  v_status := v_result->'row'->>'status';
  v_shift_id := (v_result->'row'->>'shift_id')::uuid;
  v_late := (v_result->'row'->>'late_minutes')::integer;
  v_deduction := (v_result->'row'->>'late_deduction_idr')::numeric;

  IF p_expected_status IS NOT NULL AND v_status IS DISTINCT FROM p_expected_status THEN
    RAISE EXCEPTION 'ASSERTION FAILED: % expected status [%], actual [%]',
      p_label, p_expected_status, v_status;
  END IF;
  IF p_expected_late IS NOT NULL AND v_late IS DISTINCT FROM p_expected_late THEN
    RAISE EXCEPTION 'ASSERTION FAILED: % expected late_minutes [%], actual [%]',
      p_label, p_expected_late, v_late;
  END IF;
  IF p_expected_deduction IS NOT NULL
     AND v_deduction IS DISTINCT FROM p_expected_deduction THEN
    RAISE EXCEPTION 'ASSERTION FAILED: % expected deduction [%], actual [%]',
      p_label, p_expected_deduction, v_deduction;
  END IF;
  IF p_expected_shift_id IS NOT NULL AND v_shift_id IS DISTINCT FROM p_expected_shift_id THEN
    RAISE EXCEPTION 'ASSERTION FAILED: % expected shift_id [%], actual [%]',
      p_label, p_expected_shift_id, v_shift_id;
  END IF;

  RETURN p_label || ' -> status=' || v_status
    || ' shift_id=' || v_shift_id
    || ' late_minutes=' || v_late
    || ' late_deduction_idr=' || v_deduction;
END;
$$;

CREATE FUNCTION public.harness_assert_checkout(
  p_label text,
  p_shift_id uuid,
  p_checkin_time time,
  p_checkout_date date,
  p_checkout_time time,
  p_checkin_days_before_checkout integer,
  p_expected_error text
)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_captured_at timestamptz;
  v_result jsonb;
  v_error text;
  v_checkout_date date;
  v_seed_date date;
BEGIN
  v_captured_at := public.harness_capture_target(p_checkout_date, p_checkout_time);
  SELECT (
    v_captured_at AT TIME ZONE timezone
  )::date
  INTO v_checkout_date
  FROM public.branches
  WHERE id = '11111111-1111-1111-1111-111111111111';
  UPDATE public.branches
  SET timezone = 'Asia/Jakarta'
  WHERE id = '11111111-1111-1111-1111-111111111111';

  v_seed_date := v_checkout_date - p_checkin_days_before_checkout;
  PERFORM public.harness_assert_checkin(
    'seed ' || p_label,
    v_seed_date,
    p_checkin_time,
    p_shift_id,
    'hadir',
    0,
    0,
    NULL,
    p_shift_id
  );

  IF p_checkin_days_before_checkout > 0 THEN
    -- The production RPC keys attendance by the captured local date and does
    -- not look back for an overnight row. Keep the check-in timestamp created
    -- by the real RPC, but bridge its attendance date to the next work date so
    -- the real checkout RPC can exercise the legacy no-window path.
    UPDATE public.raos_attendance
    SET date = v_checkout_date
    WHERE staff_id = '22222222-2222-2222-2222-222222222222';
  END IF;

  v_captured_at := public.harness_capture_target(p_checkout_date, p_checkout_time);
  BEGIN
    v_result := public.raos_attendance_check_out(0, 0, 'harness', v_captured_at);
  EXCEPTION WHEN OTHERS THEN
    v_error := SQLERRM;
  END;

  UPDATE public.branches
  SET timezone = 'Asia/Jakarta'
  WHERE id = '11111111-1111-1111-1111-111111111111';

  IF p_expected_error IS NOT NULL THEN
    IF v_error IS DISTINCT FROM p_expected_error THEN
      RAISE EXCEPTION
        'ASSERTION FAILED: % expected exception [%], actual [%]',
        p_label, p_expected_error, coalesce(v_error, v_result::text);
    END IF;
    RETURN p_label || ' -> exception ' || v_error;
  END IF;

  IF v_error IS NOT NULL THEN
    RAISE EXCEPTION 'ASSERTION FAILED: % unexpected exception [%]', p_label, v_error;
  END IF;
  IF (v_result->>'status') IS DISTINCT FROM 'checked_out'
     OR (v_result->'row'->>'check_out_at') IS NULL THEN
    RAISE EXCEPTION 'ASSERTION FAILED: % expected recorded checkout, actual [%]',
      p_label, v_result;
  END IF;
  RETURN p_label || ' -> recorded';
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

\echo 'Middle check-in acceptance matrix (real RPC)'
SELECT public.harness_assert_checkin(
  'check-in 09:59',
  (clock_timestamp() AT TIME ZONE 'Asia/Jakarta')::date,
  '09:59',
  (SELECT id FROM public.shifts WHERE name = 'Middle'),
  NULL, NULL, NULL, 'checkin_before_window', NULL
);
SELECT public.harness_assert_checkin(
  'check-in 10:00',
  (clock_timestamp() AT TIME ZONE 'Asia/Jakarta')::date,
  '10:00',
  (SELECT id FROM public.shifts WHERE name = 'Middle'),
  'hadir', 0, 0, NULL, (SELECT id FROM public.shifts WHERE name = 'Middle')
);
SELECT public.harness_assert_checkin(
  'check-in 11:15',
  (clock_timestamp() AT TIME ZONE 'Asia/Jakarta')::date,
  '11:15',
  (SELECT id FROM public.shifts WHERE name = 'Middle'),
  'hadir', 0, 0, NULL, (SELECT id FROM public.shifts WHERE name = 'Middle')
);
SELECT public.harness_assert_checkin(
  'check-in 12:00',
  (clock_timestamp() AT TIME ZONE 'Asia/Jakarta')::date,
  '12:00',
  (SELECT id FROM public.shifts WHERE name = 'Middle'),
  'hadir', 0, 0, NULL, (SELECT id FROM public.shifts WHERE name = 'Middle')
);
SELECT public.harness_assert_checkin(
  'check-in 12:01',
  (clock_timestamp() AT TIME ZONE 'Asia/Jakarta')::date,
  '12:01',
  (SELECT id FROM public.shifts WHERE name = 'Middle'),
  'terlambat', 1, NULL, NULL, (SELECT id FROM public.shifts WHERE name = 'Middle')
);

\echo 'Middle check-out acceptance matrix (real RPC; each row seeds check-in through real RPC)'
SELECT public.harness_assert_checkout(
  'check-out 18:59',
  (SELECT id FROM public.shifts WHERE name = 'Middle'),
  '10:00',
  (clock_timestamp() AT TIME ZONE 'Asia/Jakarta')::date,
  '18:59',
  0,
  'checkout_before_window'
);
SELECT public.harness_assert_checkout(
  'check-out 19:00',
  (SELECT id FROM public.shifts WHERE name = 'Middle'),
  '10:00',
  (clock_timestamp() AT TIME ZONE 'Asia/Jakarta')::date,
  '19:00',
  0,
  NULL
);
SELECT public.harness_assert_checkout(
  'check-out 20:30',
  (SELECT id FROM public.shifts WHERE name = 'Middle'),
  '10:00',
  (clock_timestamp() AT TIME ZONE 'Asia/Jakarta')::date,
  '20:30',
  0,
  NULL
);
SELECT public.harness_assert_checkout(
  'check-out 23:00',
  (SELECT id FROM public.shifts WHERE name = 'Middle'),
  '10:00',
  (clock_timestamp() AT TIME ZONE 'Asia/Jakarta')::date,
  '23:00',
  0,
  NULL
);
SELECT public.harness_assert_checkout(
  'check-out 23:01',
  (SELECT id FROM public.shifts WHERE name = 'Middle'),
  '10:00',
  (clock_timestamp() AT TIME ZONE 'Asia/Jakarta')::date,
  '23:01',
  0,
  NULL
);

\echo 'Legacy check-in acceptance matrix (real RPC)'
SELECT public.harness_assert_checkin(
  'legacy Pagi 07:00',
  (clock_timestamp() AT TIME ZONE 'Asia/Jakarta')::date,
  '07:00',
  '5a335fe8-6864-49c1-9c2c-d7753f21e859',
  'hadir', 0, 0, NULL, '5a335fe8-6864-49c1-9c2c-d7753f21e859'
);
SELECT public.harness_assert_checkin(
  'legacy Pagi 07:10',
  (clock_timestamp() AT TIME ZONE 'Asia/Jakarta')::date,
  '07:10',
  '5a335fe8-6864-49c1-9c2c-d7753f21e859',
  'hadir', 10, 10000, NULL, '5a335fe8-6864-49c1-9c2c-d7753f21e859'
);
SELECT public.harness_assert_checkin(
  'legacy Pagi 07:46',
  (clock_timestamp() AT TIME ZONE 'Asia/Jakarta')::date,
  '07:46',
  '5a335fe8-6864-49c1-9c2c-d7753f21e859',
  'terlambat', 46, 20000, NULL, '5a335fe8-6864-49c1-9c2c-d7753f21e859'
);
SELECT public.harness_assert_checkin(
  'legacy Siang 13:20',
  (clock_timestamp() AT TIME ZONE 'Asia/Jakarta')::date,
  '13:20',
  '5098582e-6015-4de5-86fc-4b330e8aa02c',
  'terlambat', 20, 10000, NULL, '5098582e-6015-4de5-86fc-4b330e8aa02c'
);
SELECT public.harness_assert_checkin(
  'legacy Malam 21:30',
  (clock_timestamp() AT TIME ZONE 'Asia/Jakarta')::date,
  '21:30',
  '45b7af1e-2a6b-4d6b-92b5-d1ef9b2d58aa',
  'terlambat', 30, 10000, NULL, '45b7af1e-2a6b-4d6b-92b5-d1ef9b2d58aa'
);
SELECT public.harness_assert_checkin(
  'legacy Malam 00:30',
  (clock_timestamp() AT TIME ZONE 'Asia/Jakarta')::date,
  '00:30',
  '45b7af1e-2a6b-4d6b-92b5-d1ef9b2d58aa',
  'terlambat', 210, NULL, NULL, '45b7af1e-2a6b-4d6b-92b5-d1ef9b2d58aa'
);

\echo 'Legacy check-outs (real RPC; each row seeds check-in through real RPC)'
SELECT public.harness_assert_checkout(
  'legacy Pagi check-out 18:00',
  '5a335fe8-6864-49c1-9c2c-d7753f21e859',
  '07:00',
  (clock_timestamp() AT TIME ZONE 'Asia/Jakarta')::date,
  '18:00',
  0,
  NULL
);
SELECT public.harness_assert_checkout(
  'legacy Siang check-out 18:00',
  '5098582e-6015-4de5-86fc-4b330e8aa02c',
  '13:00',
  (clock_timestamp() AT TIME ZONE 'Asia/Jakarta')::date,
  '18:00',
  0,
  NULL
);
SELECT public.harness_assert_checkout(
  'legacy Malam check-out 06:00',
  '45b7af1e-2a6b-4d6b-92b5-d1ef9b2d58aa',
  '21:00',
  (clock_timestamp() AT TIME ZONE 'Asia/Jakarta')::date,
  '06:00',
  1,
  NULL
);

\echo 'Roster-less auto-detect check-ins (real RPC; shift_id asserted)'
SELECT public.harness_assert_checkin(
  'rosterless 14:00',
  (clock_timestamp() AT TIME ZONE 'Asia/Jakarta')::date,
  '14:00',
  NULL,
  'terlambat', NULL, NULL, NULL,
  '5a335fe8-6864-49c1-9c2c-d7753f21e859'
);
SELECT public.harness_assert_checkin(
  'rosterless 20:00',
  (clock_timestamp() AT TIME ZONE 'Asia/Jakarta')::date,
  '20:00',
  NULL,
  'terlambat', NULL, NULL, NULL,
  '5098582e-6015-4de5-86fc-4b330e8aa02c'
);
SELECT public.harness_assert_checkin(
  'rosterless 22:00',
  (clock_timestamp() AT TIME ZONE 'Asia/Jakarta')::date,
  '22:00',
  NULL,
  'terlambat', NULL, NULL, NULL,
  '45b7af1e-2a6b-4d6b-92b5-d1ef9b2d58aa'
);

\echo 'Coverage: every acceptance row above called the real attendance RPC; timestamp offsets were computed at runtime and guarded against clamp/replay bands.'
\echo 'PASS: RAOS 129 Middle window acceptance harness'
