# SOETA Migrations Rollback Notes

> Source-only migrations. Production mutation intentionally not applied.
> These notes are for Preview QA / Architect review / safe rollback reference.

## Affected Migrations

- `sql/raos_116_soeta_master_schedule.sql` (RAOS)
- `sql/raos_117_soeta_terminal_scoped.sql` (RAOS)
- `supabase/migrations/rifim_001_soeta_staff_master_consumer.sql` (RIFIM OS)

---

## raos_116 — Airport-scoped Staff Master + Schedule Parity

### Tables
- `public.raos_staff_master` (new)

### Columns added to existing tables
- `public.raos_shift_schedules.status` (new column)

### Indexes
- `raos_staff_master_branch_idx`
- `raos_staff_master_airport_id_idx`
- `raos_staff_master_status_idx`
- `raos_staff_master_auth_user_unq` (partial unique on `auth_user_id IS NOT NULL`)

### Triggers
- `trg_raos_staff_master_resolve_airport_and_branch`

### Functions
- `public.raos_staff_master_resolve_airport_and_branch()`
- `public.raos_staff_master_upsert_bulk(jsonb)`
- `public.raos_staff_master_set_email(text, text)`
- `public.raos_staff_master_link_auth(text, uuid)`
- `public.raos_shift_schedule_board(uuid, date)`

### RLS Policies
- `raos_staff_master_select`
- `raos_staff_master_write`

### Rollback
```sql
DROP POLICY IF EXISTS raos_staff_master_select ON public.raos_staff_master;
DROP POLICY IF EXISTS raos_staff_master_write ON public.raos_staff_master;
DROP FUNCTION IF EXISTS public.raos_staff_master_link_auth(text, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.raos_staff_master_set_email(text, text) CASCADE;
DROP FUNCTION IF EXISTS public.raos_staff_master_upsert_bulk(jsonb) CASCADE;
DROP FUNCTION IF EXISTS public.raos_staff_master_resolve_airport_and_branch() CASCADE;
DROP TABLE IF EXISTS public.raos_staff_master CASCADE;
ALTER TABLE public.raos_shift_schedules DROP COLUMN IF EXISTS status;

-- Restore the original global raos_shift_schedule_board (pre-raos_116 definition).
-- Do NOT drop this function; it is part of the global RAOS schedule engine.
CREATE OR REPLACE FUNCTION public.raos_shift_schedule_board(p_branch_id uuid, p_tanggal date)
RETURNS TABLE (
  staff_id         uuid,
  full_name        text,
  schedule_id      uuid,
  shift_id         uuid,
  shift_name       text,
  last_changed_at  timestamptz
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
    ON rs.staff_id = up.id AND rs.tanggal = p_tanggal
  LEFT JOIN public.shifts s ON s.id = rs.shift_id
  WHERE up.branch_id = p_branch_id AND up.role = 'staff' AND up.is_active = true
  ORDER BY up.full_name;
END;
$$;

COMMENT ON FUNCTION public.raos_shift_schedule_board(uuid, date) IS
  'Roster jadwal shift 1 cabang utk 1 tanggal — daftar staff aktif cabang + shift terjadwal (kalau ada). Dipakai Settings > Jadwal Kerja.';
```

---

## raos_117 — Terminal Code Scoped to Airport

### Indexes added
- `branches_hub_code_unq` (unique on `code` where `parent_branch_id IS NULL`)
- `branches_terminal_code_unq` (unique on `parent_branch_id, code` where `parent_branch_id IS NOT NULL`)

### Constraint dropped
- `branches_code_key` (legacy global unique on `branches.code`)

### Rollback
```sql
DROP INDEX IF EXISTS branches_hub_code_unq;
DROP INDEX IF EXISTS branches_terminal_code_unq;
ALTER TABLE public.branches ADD CONSTRAINT branches_code_key UNIQUE (code);
```

> Note: the new scoped unique indexes are only applied if the preflight duplicate check in `raos_117` passes. If a rollback is needed, the original global unique constraint can be re-added only when `branches.code` values are globally unique.

---

## rifim_001 — HRIS Consumer View

### View
- `public.raos_staff_master_hris`

### Grants
- `GRANT SELECT ON public.raos_staff_master_hris TO service_role`

### Rollback
```sql
DROP VIEW IF EXISTS public.raos_staff_master_hris CASCADE;
```

---

## rifim_002 — HRIS Employee Defaults + Dedicated RPC

### Tables
- `public.raos_hris_employee_defaults` (new, RLS, service_role only)

### Functions
- `public.raos_hris_upsert_employees(jsonb)` (new)

### RLS Policies
- `raos_hris_employee_defaults_service_all`

### Grants
- `GRANT SELECT, INSERT, UPDATE, DELETE ON public.raos_hris_employee_defaults TO service_role`
- `GRANT EXECUTE ON FUNCTION public.raos_hris_upsert_employees(jsonb) TO service_role`

### Consumer
- `automation/apps-script/raosSoetaStaffConsumer.js` calls `POST /rest/v1/rpc/raos_hris_upsert_employees`

### Rollback
```sql
REVOKE ALL ON FUNCTION public.raos_hris_upsert_employees(jsonb) FROM service_role;
DROP FUNCTION IF EXISTS public.raos_hris_upsert_employees(jsonb) CASCADE;

DROP POLICY IF EXISTS raos_hris_employee_defaults_service_all ON public.raos_hris_employee_defaults;
REVOKE ALL ON public.raos_hris_employee_defaults FROM service_role;
DROP TABLE IF EXISTS public.raos_hris_employee_defaults CASCADE;

-- Also remove any leftover artifacts from earlier preview iterations.
DROP TRIGGER IF EXISTS trg_employee_hris_defaults ON public.employees;
DROP FUNCTION IF EXISTS public.raos_employee_hris_defaults_insert() CASCADE;
DROP TABLE IF EXISTS public.raos_staff_master_hris_defaults CASCADE;
```

---

## GAS / Apps Script Files

### RAOS
- `gas/23_staff_master_import.gs` (renamed from `23_soeta_master_import.gs`)
- `gas/10_menu.gs` (menu labels updated)

### RIFIM OS
- `automation/apps-script/raosSoetaStaffConsumer.js` (atomic upsert logic)

---

## No Production Mutation Confirmation

- No merge to `main`.
- No production deploy.
- No production database apply.
- Source files are feature-branch only and await Architect / Codex review.
