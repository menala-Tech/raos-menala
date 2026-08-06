CREATE OR REPLACE FUNCTION public.raos_random_assign_drivers(p_branch_id uuid, p_force boolean DEFAULT false)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_assigned int := 0;
  v_staffs uuid[];
  v_drivers uuid[];
  v_staff_count int;
  v_driver_count int;
  i int;
  v_staff_id uuid;
  v_driver_id uuid;
BEGIN
  v_role := public.get_my_role();
  IF NOT (v_role = ANY (ARRAY['management','direksi'])) AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Only management/direksi can random-assign drivers';
  END IF;

  SELECT ARRAY_AGG(id ORDER BY random()) INTO v_staffs
  FROM public.user_profiles
  WHERE branch_id = p_branch_id AND is_active = true AND role = ANY (ARRAY['staff','koordinator']);

  IF v_staffs IS NULL OR array_length(v_staffs, 1) IS NULL THEN
    RAISE EXCEPTION 'No active staff/koord in branch';
  END IF;

  IF p_force THEN
    DELETE FROM public.raos_driver_staff_assignment WHERE branch_id = p_branch_id;
    SELECT ARRAY_AGG(id ORDER BY random()) INTO v_drivers
    FROM public.raos_drivers
    WHERE branch_id = p_branch_id AND is_active = true;
  ELSE
    SELECT ARRAY_AGG(d.id ORDER BY random()) INTO v_drivers
    FROM public.raos_drivers d
    LEFT JOIN public.raos_driver_staff_assignment a ON a.driver_id = d.id
    WHERE d.branch_id = p_branch_id AND d.is_active = true AND a.id IS NULL;
  END IF;

  IF v_drivers IS NULL OR array_length(v_drivers, 1) IS NULL THEN
    RETURN 0;
  END IF;

  v_staff_count := array_length(v_staffs, 1);
  v_driver_count := array_length(v_drivers, 1);

  FOR i IN 1..v_driver_count LOOP
    v_driver_id := v_drivers[i];
    v_staff_id := v_staffs[((i - 1) % v_staff_count) + 1];

    INSERT INTO public.raos_driver_staff_assignment (driver_id, staff_id, branch_id, assigned_by)
    VALUES (v_driver_id, v_staff_id, p_branch_id, auth.uid())
    ON CONFLICT (driver_id) DO NOTHING;

    v_assigned := v_assigned + 1;
  END LOOP;

  RETURN v_assigned;
END $$;

REVOKE ALL ON FUNCTION public.raos_random_assign_drivers(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.raos_random_assign_drivers(uuid, boolean) TO authenticated, service_role;
