-- ============================================================================
-- raos_121: Target Staff mode-specific contract guard
-- ============================================================================
-- Prevents cross-mode leakage:
--   order branch -> target_order only
--   saldo branch -> target_saldo only
--
-- This is a write guard only. Existing rows are not rewritten by migration.
-- Service-role/API writes are guarded too because this is a table trigger.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.raos_kpi_targets_staff_mode_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff_branch uuid;
  v_target_branch uuid;
  v_mode text;
BEGIN
  SELECT up.branch_id
  INTO v_staff_branch
  FROM public.user_profiles up
  WHERE up.id = NEW.staff_id;

  IF v_staff_branch IS NULL THEN
    RAISE EXCEPTION 'target_staff_profile_or_branch_not_found';
  END IF;

  SELECT COALESCE(b.parent_branch_id, b.id)
  INTO v_target_branch
  FROM public.branches b
  WHERE b.id = v_staff_branch;

  SELECT k.mode
  INTO v_mode
  FROM public.raos_kpi_targets_branch k
  WHERE k.branch_id = v_target_branch
    AND k.effective_month = NEW.effective_month
  LIMIT 1;

  -- If a branch target is not configured yet, preserve legacy behavior.
  IF v_mode IS NULL THEN
    RETURN NEW;
  END IF;

  IF v_mode = 'order' THEN
    IF NEW.target_saldo IS NOT NULL THEN
      RAISE EXCEPTION 'target_mode_mismatch: order mode requires target_order; target_saldo must be null';
    END IF;
  ELSIF v_mode = 'saldo' THEN
    IF NEW.target_order IS NOT NULL THEN
      RAISE EXCEPTION 'target_mode_mismatch: saldo mode requires target_saldo; target_order must be null';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.raos_kpi_targets_staff_mode_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_raos_kpi_targets_staff_mode_guard
  ON public.raos_kpi_targets_staff;
CREATE TRIGGER trg_raos_kpi_targets_staff_mode_guard
  BEFORE INSERT OR UPDATE OF staff_id, effective_month, target_saldo, target_order
  ON public.raos_kpi_targets_staff
  FOR EACH ROW
  EXECUTE FUNCTION public.raos_kpi_targets_staff_mode_guard();

COMMENT ON FUNCTION public.raos_kpi_targets_staff_mode_guard() IS
  'Fail-closed guard against target_saldo/target_order cross-mode leakage.';
