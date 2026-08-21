-- raos_112_background_location_ingest — ALREADY APPLIED IN PRODUCTION, DO NOT RE-APPLY
-- Retroactive tracked copy for source-control parity only.
--
-- Applied live 2026-08-21 by Architect. This file mirrors the production
-- contract byte-for-byte for the Android background-location foreground
-- service (apps/pwa/android/app/src/main/java/com/rifim/raos/location/).
--
-- Contract:
--   Table: public.raos_background_location_points
--   RPC:   public.raos_ingest_background_location(p_points jsonb)
--
-- Security:
--   - Table RLS enabled, authenticated users may only write/read their own rows.
--   - RPC SECURITY INVOKER, EXECUTE granted to authenticated only (no anon).
--   - Server derives user_id = auth.uid() and branch_id = user_profiles.branch_id
--     from the JWT — the client payload contains ONLY lat/lng/accuracy_m/captured_at.
--   - Hard caps: max 120 points/call; each point validated server-side.

-- ============================================================
-- Table: raos_background_location_points
-- ============================================================
CREATE TABLE IF NOT EXISTS public.raos_background_location_points (
    id            bigserial     PRIMARY KEY,
    user_id       uuid          NOT NULL,
    branch_id     uuid,
    lat           double precision NOT NULL,
    lng           double precision NOT NULL,
    accuracy_m    real,
    captured_at   timestamptz   NOT NULL,
    created_at    timestamptz   NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.raos_background_location_points
  IS 'RAOS Android background location points — inserted by the native foreground service via raos_ingest_background_location. RLS scoped per user.';

ALTER TABLE public.raos_background_location_points ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS raos_background_location_points_insert_own ON public.raos_background_location_points;
CREATE POLICY raos_background_location_points_insert_own
  ON public.raos_background_location_points
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS raos_background_location_points_select_own ON public.raos_background_location_points;
CREATE POLICY raos_background_location_points_select_own
  ON public.raos_background_location_points
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

GRANT INSERT ON public.raos_background_location_points TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.raos_background_location_points_id_seq TO authenticated;

-- ============================================================
-- Function: raos_ingest_background_location(p_points jsonb)
-- ============================================================
CREATE OR REPLACE FUNCTION public.raos_ingest_background_location(p_points jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_user_id  uuid;
    v_branch_id uuid;
    v_role     text;
    v_active   boolean;
    v_count    int;
    v_point    record;
    v_now      timestamptz := now();
    v_inserted int := 0;
BEGIN
    -- 1. Caller must be authenticated
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'not_authenticated';
    END IF;

    -- 2. Resolve caller's branch + role + active status from user_profiles
    SELECT branch_id, role, is_active
      INTO v_branch_id, v_role, v_active
      FROM public.user_profiles
     WHERE id = v_user_id;

    IF v_active IS NULL OR v_active = false THEN
        RAISE EXCEPTION 'profile_inactive';
    END IF;

    IF v_role IS NULL OR v_role NOT IN ('staff', 'koordinator', 'driver_manager', 'driver') THEN
        RAISE EXCEPTION 'role_not_allowed';
    END IF;

    IF v_branch_id IS NULL THEN
        RAISE EXCEPTION 'branch_not_assigned';
    END IF;

    -- 3. Payload must be a non-empty array of at most 120 points
    IF p_points IS NULL OR jsonb_typeof(p_points) != 'array' THEN
        RAISE EXCEPTION 'invalid_point_payload';
    END IF;

    v_count := jsonb_array_length(p_points);
    IF v_count = 0 THEN
        RETURN jsonb_build_object('status', 'ok', 'inserted', 0);
    END IF;

    IF v_count > 120 THEN
        RAISE EXCEPTION 'too_many_points';
    END IF;

    -- 4. Validate and insert each point
    FOR v_point IN
        SELECT *
          FROM jsonb_to_recordset(p_points) AS x(
              lat double precision,
              lng double precision,
              accuracy_m real,
              captured_at timestamptz
          )
    LOOP
        IF v_point.lat IS NULL
           OR v_point.lat < -90 OR v_point.lat > 90
           OR v_point.lng IS NULL
           OR v_point.lng < -180 OR v_point.lng > 180
           OR v_point.captured_at IS NULL
           OR v_point.captured_at < (v_now - interval '2 hours')
           OR v_point.captured_at > (v_now + interval '5 minutes')
           OR (v_point.accuracy_m IS NOT NULL AND (v_point.accuracy_m < 0 OR v_point.accuracy_m > 5000))
        THEN
            RAISE EXCEPTION 'invalid_point_payload';
        END IF;

        INSERT INTO public.raos_background_location_points
            (user_id, branch_id, lat, lng, accuracy_m, captured_at)
        VALUES
            (v_user_id, v_branch_id, v_point.lat, v_point.lng, v_point.accuracy_m, v_point.captured_at);

        v_inserted := v_inserted + 1;
    END LOOP;

    RETURN jsonb_build_object('status', 'ok', 'inserted', v_inserted);
END;
$$;

REVOKE ALL ON FUNCTION public.raos_ingest_background_location(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.raos_ingest_background_location(jsonb) TO authenticated;
