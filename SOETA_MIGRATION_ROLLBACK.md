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
DROP FUNCTION IF EXISTS public.raos_shift_schedule_board(uuid, date) CASCADE;
DROP TABLE IF EXISTS public.raos_staff_master CASCADE;
ALTER TABLE public.raos_shift_schedules DROP COLUMN IF EXISTS status;
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
