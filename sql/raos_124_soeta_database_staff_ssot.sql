-- ============================================================================
-- raos_124: Database Staff Soeta -> Supabase operational mirror contract
-- ============================================================================
-- Canonical source: Google Sheet "Database Staff Soeta"
-- Spreadsheet ID: 13aVdbdeS0UOZ1pnfu3J-bJ99oLn4ugdYwFPd9tbg_dQ
-- Tabs: Soeta (master roster), T1/T2/T3 (terminal assignment)
--
-- Safety:
--   * exact identity key = ID Staff
--   * no Auth creation
--   * no automatic activation/deactivation
--   * no delete from raos_staff_master / employees / user_profiles
--   * missing sheet rows are reported as drift only
--   * terminal from T1/T2/T3 is authoritative for raos_staff_master
--   * activated user_profiles only receive terminal/identity updates when a
--     resolved terminal exists; an unassigned sheet row never clears a live
--     operational branch automatically
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.raos_soeta_staff_sheet_mirror (
  staff_id            text PRIMARY KEY,
  full_name           text NOT NULL,
  email               text,
  phone               text,
  role                text NOT NULL CHECK (role IN ('staff','koordinator','admin','management','direksi','driver_manager','driver')),
  jabatan             text,
  gaji_staff          numeric(14,2),
  terminal            text CHECK (terminal IS NULL OR terminal IN ('T1','T2','T3')),
  source_row          integer,
  source_sheet_id     text NOT NULL,
  source_revision     text,
  source_updated_at   timestamptz,
  mirrored_at         timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.raos_soeta_staff_sheet_mirror ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS raos_soeta_staff_sheet_mirror_select ON public.raos_soeta_staff_sheet_mirror;
CREATE POLICY raos_soeta_staff_sheet_mirror_select
ON public.raos_soeta_staff_sheet_mirror
FOR SELECT TO authenticated
USING (public.get_my_role() = ANY (ARRAY['admin','management','direksi']));

REVOKE ALL ON public.raos_soeta_staff_sheet_mirror FROM anon;
GRANT SELECT ON public.raos_soeta_staff_sheet_mirror TO authenticated;
GRANT ALL ON public.raos_soeta_staff_sheet_mirror TO service_role;

-- Clear stale branch_id when a future SSOT sync intentionally leaves terminal empty.
CREATE OR REPLACE FUNCTION public.raos_staff_master_resolve_airport_and_branch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hub_id uuid;
BEGIN
  IF NEW.airport IS NULL OR btrim(NEW.airport) = '' THEN
    NEW.airport_id := NULL;
    NEW.branch_id := NULL;
  ELSE
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

    IF NEW.terminal IS NULL OR btrim(NEW.terminal) = '' THEN
      NEW.branch_id := NULL;
    ELSE
      SELECT b.id INTO NEW.branch_id
      FROM public.branches b
      WHERE b.code = NEW.terminal
        AND b.parent_branch_id = NEW.airport_id
        AND b.is_active = true
      LIMIT 1;
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.raos_staff_master_resolve_airport_and_branch() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.raos_soeta_staff_sheet_sync(
  p_records jsonb,
  p_sheet_id text,
  p_revision text DEFAULT NULL,
  p_source_updated_at timestamptz DEFAULT NULL,
  p_apply boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expected_sheet constant text := '13aVdbdeS0UOZ1pnfu3J-bJ99oLn4ugdYwFPd9tbg_dQ';
  v_role text := public.get_my_role();
  v_incoming integer := 0;
  v_terminal_assigned integer := 0;
  v_existing_mirror integer := 0;
  v_stale_mirror integer := 0;
  v_master_insertable integer := 0;
  v_master_not_in_sheet integer := 0;
  v_hris_not_in_sheet integer := 0;
  v_activated_unassigned integer := 0;
  v_profiles_updated integer := 0;
  v_master_upserted integer := 0;
  v_mirror_deleted integer := 0;
BEGIN
  IF auth.role() <> 'service_role' AND v_role <> ALL (ARRAY['admin','direksi']) THEN
    RAISE EXCEPTION 'forbidden: admin/direksi/service_role required';
  END IF;

  IF p_sheet_id IS DISTINCT FROM v_expected_sheet THEN
    RAISE EXCEPTION 'unexpected_soeta_ssot_sheet_id';
  END IF;

  IF p_records IS NULL OR jsonb_typeof(p_records) <> 'array' THEN
    RAISE EXCEPTION 'records_array_required';
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS pg_temp.soeta_staff_payload (
    staff_id text PRIMARY KEY,
    full_name text NOT NULL,
    email text,
    phone text,
    role text NOT NULL,
    jabatan text,
    gaji_staff numeric(14,2),
    terminal text,
    source_row integer
  ) ON COMMIT DROP;
  TRUNCATE pg_temp.soeta_staff_payload;

  INSERT INTO pg_temp.soeta_staff_payload(staff_id,full_name,email,phone,role,jabatan,gaji_staff,terminal,source_row)
  SELECT
    upper(btrim(x->>'staff_id')),
    btrim(x->>'full_name'),
    NULLIF(lower(btrim(x->>'email')),''),
    NULLIF(regexp_replace(COALESCE(x->>'phone',''),'\\D','','g'),''),
    lower(COALESCE(NULLIF(btrim(x->>'role'),''),'staff')),
    NULLIF(btrim(x->>'jabatan'),''),
    NULLIF(x->>'gaji_staff','')::numeric,
    NULLIF(upper(btrim(x->>'terminal')),''),
    NULLIF(x->>'source_row','')::integer
  FROM jsonb_array_elements(p_records) x;

  IF EXISTS (SELECT 1 FROM pg_temp.soeta_staff_payload WHERE staff_id = '' OR full_name = '') THEN
    RAISE EXCEPTION 'staff_id_and_full_name_required';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_temp.soeta_staff_payload
    WHERE role NOT IN ('staff','koordinator','admin','management','direksi','driver_manager','driver')
  ) THEN
    RAISE EXCEPTION 'invalid_role_in_payload';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_temp.soeta_staff_payload
    WHERE terminal IS NOT NULL AND terminal NOT IN ('T1','T2','T3')
  ) THEN
    RAISE EXCEPTION 'invalid_terminal_in_payload';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_temp.soeta_staff_payload p
    WHERE p.terminal IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.branches b
        JOIN public.branches hub ON hub.id = b.parent_branch_id
        WHERE hub.code = 'SOETA' AND hub.parent_branch_id IS NULL
          AND b.code = p.terminal AND b.is_active = true
      )
  ) THEN
    RAISE EXCEPTION 'terminal_branch_not_resolved';
  END IF;

  SELECT count(*) INTO v_incoming FROM pg_temp.soeta_staff_payload;
  SELECT count(*) INTO v_terminal_assigned FROM pg_temp.soeta_staff_payload WHERE terminal IS NOT NULL;
  SELECT count(*) INTO v_existing_mirror
    FROM public.raos_soeta_staff_sheet_mirror m JOIN pg_temp.soeta_staff_payload p USING(staff_id);
  SELECT count(*) INTO v_stale_mirror
    FROM public.raos_soeta_staff_sheet_mirror m LEFT JOIN pg_temp.soeta_staff_payload p USING(staff_id)
    WHERE p.staff_id IS NULL;
  SELECT count(*) INTO v_master_insertable
    FROM pg_temp.soeta_staff_payload p LEFT JOIN public.raos_staff_master m USING(staff_id)
    WHERE m.staff_id IS NULL;
  SELECT count(*) INTO v_master_not_in_sheet
    FROM public.raos_staff_master m LEFT JOIN pg_temp.soeta_staff_payload p USING(staff_id)
    WHERE upper(COALESCE(m.airport,'')) = 'SOETA' AND p.staff_id IS NULL;
  SELECT count(*) INTO v_hris_not_in_sheet
    FROM public.employees e LEFT JOIN pg_temp.soeta_staff_payload p ON p.staff_id = upper(btrim(e.employee_id))
    WHERE COALESCE(e.branch,'') ILIKE '%SOETA%' AND p.staff_id IS NULL;
  SELECT count(*) INTO v_activated_unassigned
    FROM public.raos_staff_master m JOIN pg_temp.soeta_staff_payload p USING(staff_id)
    WHERE m.is_activated = true AND p.terminal IS NULL;

  IF NOT p_apply THEN
    RETURN jsonb_build_object(
      'ok',true,'apply',false,'sheetId',p_sheet_id,'revision',p_revision,
      'incomingCount',v_incoming,'terminalAssignedCount',v_terminal_assigned,
      'existingMirrorCount',v_existing_mirror,'staleMirrorCount',v_stale_mirror,
      'masterInsertableCount',v_master_insertable,'masterNotInSheetCount',v_master_not_in_sheet,
      'hrisNotInSheetCount',v_hris_not_in_sheet,'activatedUnassignedCount',v_activated_unassigned
    );
  END IF;

  DELETE FROM public.raos_soeta_staff_sheet_mirror m
  WHERE NOT EXISTS (SELECT 1 FROM pg_temp.soeta_staff_payload p WHERE p.staff_id = m.staff_id);
  GET DIAGNOSTICS v_mirror_deleted = ROW_COUNT;

  INSERT INTO public.raos_soeta_staff_sheet_mirror(
    staff_id,full_name,email,phone,role,jabatan,gaji_staff,terminal,source_row,
    source_sheet_id,source_revision,source_updated_at,mirrored_at,updated_at
  )
  SELECT staff_id,full_name,email,phone,role,jabatan,gaji_staff,terminal,source_row,
         p_sheet_id,p_revision,p_source_updated_at,now(),now()
  FROM pg_temp.soeta_staff_payload
  ON CONFLICT (staff_id) DO UPDATE SET
    full_name=EXCLUDED.full_name,email=EXCLUDED.email,phone=EXCLUDED.phone,
    role=EXCLUDED.role,jabatan=EXCLUDED.jabatan,gaji_staff=EXCLUDED.gaji_staff,
    terminal=EXCLUDED.terminal,source_row=EXCLUDED.source_row,
    source_sheet_id=EXCLUDED.source_sheet_id,source_revision=EXCLUDED.source_revision,
    source_updated_at=EXCLUDED.source_updated_at,mirrored_at=now(),updated_at=now();

  INSERT INTO public.raos_staff_master(staff_id,full_name,email,phone,role,airport,terminal,status,source)
  SELECT staff_id,full_name,email,phone,role,'SOETA',terminal,'Aktif','google_sheet:ssot:database_staff_soeta'
  FROM pg_temp.soeta_staff_payload
  ON CONFLICT (staff_id) DO UPDATE SET
    full_name=EXCLUDED.full_name,
    email=COALESCE(EXCLUDED.email,raos_staff_master.email),
    phone=COALESCE(EXCLUDED.phone,raos_staff_master.phone),
    role=EXCLUDED.role,
    airport='SOETA',
    terminal=EXCLUDED.terminal,
    source='google_sheet:ssot:database_staff_soeta',
    updated_at=now();
  GET DIAGNOSTICS v_master_upserted = ROW_COUNT;

  UPDATE public.user_profiles up
  SET full_name=m.full_name,
      email=COALESCE(m.email,up.email),
      phone=COALESCE(m.phone,up.phone),
      role=m.role,
      branch_id=m.branch_id,
      ssot_synced_at=now()
  FROM public.raos_staff_master m
  JOIN pg_temp.soeta_staff_payload p USING(staff_id)
  WHERE m.auth_user_id = up.id
    AND m.is_activated = true
    AND m.branch_id IS NOT NULL;
  GET DIAGNOSTICS v_profiles_updated = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok',true,'apply',true,'sheetId',p_sheet_id,'revision',p_revision,
    'incomingCount',v_incoming,'terminalAssignedCount',v_terminal_assigned,
    'mirrorDeletedCount',v_mirror_deleted,'masterUpsertedCount',v_master_upserted,
    'profilesUpdatedCount',v_profiles_updated,'masterNotInSheetCount',v_master_not_in_sheet,
    'hrisNotInSheetCount',v_hris_not_in_sheet,'activatedUnassignedCount',v_activated_unassigned
  );
END;
$$;

REVOKE ALL ON FUNCTION public.raos_soeta_staff_sheet_sync(jsonb,text,text,timestamptz,boolean)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.raos_soeta_staff_sheet_sync(jsonb,text,text,timestamptz,boolean)
TO authenticated, service_role;

COMMENT ON TABLE public.raos_soeta_staff_sheet_mirror IS
  'Operational mirror of the Google Sheet Database Staff Soeta. The Google Sheet remains the SSOT.';
COMMENT ON FUNCTION public.raos_soeta_staff_sheet_sync(jsonb,text,text,timestamptz,boolean) IS
  'Dry-run/apply sync from Database Staff Soeta. No Auth creation, activation, deactivation, or destructive operational deletes.';
