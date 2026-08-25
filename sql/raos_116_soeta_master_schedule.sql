-- ============================================================================
-- raos_116: Airport-scoped Staff Master + Schedule Parity (2026-08-24)
-- ============================================================================
--
-- Business goals:
--   1. Import pre-activation workforce from XLSX without requiring email.
--   2. Store canonical pre-activation master in raos_staff_master (email nullable).
--   3. Resolve airport_id (hub) and branch_id (terminal) from branches.
--   4. Future activation: admin adds email, creates auth user, links auth_user_id
--      → user_profiles created automatically.
--   5. Schedule board includes koordinator as first-class assignee.
--
-- No production mutation. Source-only migration for feature branch.
-- ============================================================================

-- ---------- 1. raos_staff_master: canonical pre-activation workforce -----
CREATE TABLE IF NOT EXISTS public.raos_staff_master (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id        text NOT NULL,
  full_name       text NOT NULL,
  email           text,
  phone           text,
  airport_id      uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  airport         text,
  terminal        text,
  branch_id       uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  role            text NOT NULL CHECK (role IN ('staff','koordinator','admin','management','direksi','driver_manager','driver')),
  status          text NOT NULL DEFAULT 'Aktif' CHECK (status IN ('Aktif','Nonaktif','Pending')),
  is_activated    boolean NOT NULL DEFAULT false,
  auth_user_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  source          text NOT NULL DEFAULT 'xlsx_import',
  imported_at     timestamptz NOT NULL DEFAULT now(),
  activated_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (staff_id)
);

CREATE INDEX IF NOT EXISTS raos_staff_master_branch_idx ON public.raos_staff_master (branch_id);
CREATE INDEX IF NOT EXISTS raos_staff_master_airport_id_idx ON public.raos_staff_master (airport_id);
CREATE INDEX IF NOT EXISTS raos_staff_master_status_idx ON public.raos_staff_master (status);

-- One auth user can only be linked to one master record.
CREATE UNIQUE INDEX IF NOT EXISTS raos_staff_master_auth_user_unq
  ON public.raos_staff_master (auth_user_id)
  WHERE auth_user_id IS NOT NULL;

COMMENT ON TABLE public.raos_staff_master IS
  'Canonical airport-scoped pre-activation workforce master. Imported from XLSX; email may be null until admin activates.';

ALTER TABLE public.raos_staff_master ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS raos_staff_master_select ON public.raos_staff_master;
CREATE POLICY raos_staff_master_select ON public.raos_staff_master
  FOR SELECT USING (
    public.is_branch_in_scope(branch_id)
    OR public.get_my_role() = ANY (ARRAY['admin','management','direksi'])
  );

DROP POLICY IF EXISTS raos_staff_master_write ON public.raos_staff_master;
CREATE POLICY raos_staff_master_write ON public.raos_staff_master
  FOR ALL USING (
    public.get_my_role() = ANY (ARRAY['admin','management','direksi'])
  )
  WITH CHECK (
    public.get_my_role() = ANY (ARRAY['admin','management','direksi'])
  );

-- ---------- 2. Auto-resolve airport_id and branch_id (terminal) ----------
CREATE OR REPLACE FUNCTION public.raos_staff_master_resolve_airport_and_branch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hub_id uuid;
BEGIN
  -- Resolve airport hub id from branches by code, then by name fallback.
  IF NEW.airport IS NOT NULL AND NEW.airport <> '' THEN
    SELECT b.id INTO v_hub_id
    FROM public.branches b
    WHERE b.code = NEW.airport
      AND b.parent_branch_id IS NULL
      AND b.is_active = true
    LIMIT 1;

    IF v_hub_id IS NULL THEN
      SELECT b.id INTO v_hub_id
      FROM public.branches b
      WHERE b.parent_branch_id IS NULL
        AND (b.name ILIKE '%' || NEW.airport || '%' OR b.code ILIKE '%' || NEW.airport || '%')
        AND b.is_active = true
      LIMIT 1;
    END IF;

    NEW.airport_id := v_hub_id;
  END IF;

  -- Resolve terminal branch_id scoped to airport_id.
  IF NEW.terminal IS NOT NULL AND NEW.terminal <> '' THEN
    IF NEW.airport_id IS NOT NULL THEN
      SELECT b.id INTO NEW.branch_id
      FROM public.branches b
      WHERE b.code = NEW.terminal
        AND b.parent_branch_id = NEW.airport_id
        AND b.is_active = true
      LIMIT 1;
    ELSE
      SELECT b.id INTO NEW.branch_id
      FROM public.branches b
      WHERE b.code = NEW.terminal
        AND b.is_active = true
      LIMIT 1;
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.raos_staff_master_resolve_airport_and_branch() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_raos_staff_master_resolve_airport_and_branch ON public.raos_staff_master;
CREATE TRIGGER trg_raos_staff_master_resolve_airport_and_branch
  BEFORE INSERT OR UPDATE OF airport, terminal ON public.raos_staff_master
  FOR EACH ROW EXECUTE FUNCTION public.raos_staff_master_resolve_airport_and_branch();

-- ---------- 3. Bulk upsert from GAS / XLSX import --------------------------
CREATE OR REPLACE FUNCTION public.raos_staff_master_upsert_bulk(p_records jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  n int := 0;
BEGIN
  IF NOT (public.get_my_role() = ANY (ARRAY['admin','management','direksi']))
     AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'forbidden: only admin/management/direksi or service role can upsert master';
  END IF;

  IF p_records IS NULL OR jsonb_typeof(p_records) <> 'array' OR jsonb_array_length(p_records) = 0 THEN
    RETURN 0;
  END IF;

  FOR r IN SELECT * FROM jsonb_array_elements(p_records) AS x(value)
  LOOP
    INSERT INTO public.raos_staff_master (
      staff_id, full_name, email, phone, role, airport, terminal, status, source
    ) VALUES (
      r.value->>'staff_id',
      r.value->>'full_name',
      NULLIF(r.value->>'email', ''),
      NULLIF(r.value->>'phone', ''),
      COALESCE(r.value->>'role', 'staff'),
      NULLIF(r.value->>'airport', ''),
      NULLIF(r.value->>'terminal', ''),
      COALESCE(r.value->>'status', 'Aktif'),
      COALESCE(r.value->>'source', 'xlsx_import')
    )
    ON CONFLICT (staff_id) DO UPDATE SET
      full_name = EXCLUDED.full_name,
      email     = COALESCE(EXCLUDED.email, raos_staff_master.email),
      phone     = EXCLUDED.phone,
      role      = EXCLUDED.role,
      airport   = EXCLUDED.airport,
      terminal  = EXCLUDED.terminal,
      status    = EXCLUDED.status,
      source    = EXCLUDED.source,
      updated_at = now();
    n := n + 1;
  END LOOP;

  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.raos_staff_master_upsert_bulk(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.raos_staff_master_upsert_bulk(jsonb) TO authenticated, service_role;

COMMENT ON FUNCTION public.raos_staff_master_upsert_bulk(jsonb) IS
  'Bulk upsert airport-scoped staff master from XLSX import via GAS. airport_id and branch_id are resolved by trigger.';

-- ---------- 4. Activation helpers (email + auth linkage) ------------------
CREATE OR REPLACE FUNCTION public.raos_staff_master_set_email(
  p_staff_id text,
  p_email text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.get_my_role() = ANY (ARRAY['admin','management','direksi']))
     AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'forbidden: only admin/management/direksi or service role can set email';
  END IF;

  UPDATE public.raos_staff_master
    SET email = p_email,
        updated_at = now()
  WHERE staff_id = p_staff_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'staff_id_not_found');
  END IF;

  RETURN jsonb_build_object('ok', true, 'staff_id', p_staff_id);
END;
$$;

REVOKE ALL ON FUNCTION public.raos_staff_master_set_email(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.raos_staff_master_set_email(text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.raos_staff_master_link_auth(
  p_staff_id text,
  p_auth_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m public.raos_staff_master%rowtype;
  v_other_staff_id text;
  v_branch_active boolean;
  v_existing public.user_profiles%rowtype;
BEGIN
  IF NOT (public.get_my_role() = ANY (ARRAY['admin','management','direksi']))
     AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'forbidden: only admin/management/direksi or service role can link auth';
  END IF;

  SELECT * INTO m
  FROM public.raos_staff_master
  WHERE staff_id = p_staff_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'staff_id_not_found');
  END IF;

  -- Activation requires a fully resolved branch.
  IF m.airport_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'airport_id_not_resolved');
  END IF;
  IF m.branch_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'branch_id_not_resolved');
  END IF;

  SELECT b.is_active INTO v_branch_active
  FROM public.branches b
  WHERE b.id = m.branch_id;
  IF v_branch_active IS DISTINCT FROM true THEN
    RETURN jsonb_build_object('ok', false, 'error', 'branch_inactive');
  END IF;

  -- Prevent one auth user from being linked to multiple master records.
  SELECT staff_id INTO v_other_staff_id
  FROM public.raos_staff_master
  WHERE auth_user_id = p_auth_user_id
    AND staff_id <> p_staff_id
  LIMIT 1;

  IF v_other_staff_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'auth_user_id_already_linked', 'other_staff_id', v_other_staff_id);
  END IF;

  -- Prevent this staff from being linked to a different auth user.
  IF m.auth_user_id IS NOT NULL AND m.auth_user_id <> p_auth_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'staff_already_linked_to_other_auth_user');
  END IF;

  -- Identity immutability: an auth user must not be reassigned to a different staff.
  SELECT * INTO v_existing
  FROM public.user_profiles
  WHERE id = p_auth_user_id;

  IF FOUND THEN
    IF v_existing.staff_id IS DISTINCT FROM p_staff_id THEN
      RETURN jsonb_build_object('ok', false, 'error', 'user_profiles_identity_conflict', 'existing_staff_id', v_existing.staff_id);
    END IF;
    -- Idempotent re-call for the same identity is a no-op.
  ELSE
    INSERT INTO public.user_profiles (
      id, staff_id, email, full_name, role, phone, branch_id, is_active, source, ssot_synced_at
    ) VALUES (
      p_auth_user_id,
      p_staff_id,
      m.email,
      m.full_name,
      m.role,
      m.phone,
      m.branch_id,
      true,
      'manual',
      now()
    );
  END IF;

  UPDATE public.raos_staff_master
    SET auth_user_id = p_auth_user_id,
        is_activated = true,
        activated_at = now(),
        updated_at = now()
  WHERE staff_id = p_staff_id;

  RETURN jsonb_build_object('ok', true, 'staff_id', p_staff_id, 'auth_user_id', p_auth_user_id);
END;
$$;

REVOKE ALL ON FUNCTION public.raos_staff_master_link_auth(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.raos_staff_master_link_auth(text, uuid) TO authenticated, service_role;

-- ---------- 5. Schedule: status column + koordinator on board -------------
ALTER TABLE public.raos_shift_schedules
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'confirmed'
  CHECK (status IN ('draft','confirmed','cancelled'));

COMMENT ON COLUMN public.raos_shift_schedules.status IS
  'Schedule row state: draft, confirmed (canonical), or cancelled.';

CREATE OR REPLACE FUNCTION public.raos_shift_schedule_board(
  p_branch_id uuid,
  p_tanggal date
)
RETURNS TABLE (
  staff_id        uuid,
  full_name       text,
  schedule_id     uuid,
  shift_id        uuid,
  shift_name      text,
  last_changed_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_branch_in_scope(p_branch_id) THEN
    RAISE EXCEPTION 'branch_out_of_scope';
  END IF;

  RETURN QUERY
  SELECT up.id, up.full_name, rs.id, rs.shift_id, s.name, rs.last_changed_at
  FROM public.user_profiles up
  LEFT JOIN public.raos_shift_schedules rs
    ON rs.staff_id = up.id AND rs.tanggal = p_tanggal AND rs.status <> 'cancelled'
  LEFT JOIN public.shifts s ON s.id = rs.shift_id
  WHERE up.branch_id = p_branch_id
    AND up.role = ANY (ARRAY['staff','koordinator'])
    AND up.is_active = true
  ORDER BY up.full_name;
END;
$$;

REVOKE ALL ON FUNCTION public.raos_shift_schedule_board(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.raos_shift_schedule_board(uuid, date) TO authenticated;

COMMENT ON FUNCTION public.raos_shift_schedule_board(uuid, date) IS
  'Roster board for a terminal on a date. Includes staff and koordinator; admin & koordinator can edit. Cancelled schedules are hidden.';
