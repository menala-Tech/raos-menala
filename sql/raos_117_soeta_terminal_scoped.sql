-- ============================================================================
-- raos_117: Terminal code scoped to airport (2026-08-24)
-- ============================================================================
--
-- Context:
--   branches.code was originally globally unique (001_schema.sql), preventing
--   the same terminal code (e.g. T1) from existing under different airports.
--
-- Fix:
--   Drop the global unique constraint and replace it with two scoped unique
--   indexes:
--     1. One hub per code (parent_branch_id IS NULL).
--     2. Terminal code unique within its parent airport.
--
-- No production mutation. Source-only migration for feature branch.
-- ============================================================================

-- Preflight: refuse to drop the old constraint if the data would violate the
-- new scoped unique rules. This is a fail-fast guard before production apply.
DO $$
DECLARE
  d record;
  v_conflicts int := 0;
BEGIN
  FOR d IN
    SELECT
      COALESCE(parent_branch_id::text, 'HUB') AS scope,
      code,
      COUNT(*) AS n
    FROM public.branches
    GROUP BY parent_branch_id, code
    HAVING COUNT(*) > 1
  LOOP
    v_conflicts := v_conflicts + 1;
    RAISE NOTICE 'Duplicate branch code detected — scope=%, code=%, count=%', d.scope, d.code, d.n;
  END LOOP;

  IF v_conflicts > 0 THEN
    RAISE EXCEPTION 'raos_117_pilot_check_failed: % duplicate branch code(s) found. Resolve before applying.', v_conflicts;
  END IF;
END $$;

-- Drop the legacy global unique constraint on branches.code if it exists.
ALTER TABLE public.branches
  DROP CONSTRAINT IF EXISTS branches_code_key;

-- Hub branches must have a unique code.
CREATE UNIQUE INDEX IF NOT EXISTS branches_hub_code_unq
  ON public.branches (code)
  WHERE parent_branch_id IS NULL;

-- Terminal / child branch codes are unique only inside their airport hub.
CREATE UNIQUE INDEX IF NOT EXISTS branches_terminal_code_unq
  ON public.branches (parent_branch_id, code)
  WHERE parent_branch_id IS NOT NULL;

COMMENT ON TABLE public.branches IS
  'Airports and terminals. Hub code is globally unique; terminal code is unique per airport via partial unique indexes.';
