CREATE TABLE IF NOT EXISTS public.raos_kpi_targets_branch (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  effective_month date NOT NULL,
  target_cabang bigint NOT NULL DEFAULT 0,
  target_staff_default bigint,
  mode text NOT NULL CHECK (mode IN ('saldo','order')),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.user_profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (branch_id, effective_month)
);
CREATE INDEX IF NOT EXISTS raos_kpi_targets_branch_month_idx ON public.raos_kpi_targets_branch (effective_month);

CREATE TABLE IF NOT EXISTS public.raos_kpi_targets_staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  effective_month date NOT NULL,
  target_saldo bigint,
  member_parkir_amount int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (staff_id, effective_month)
);

CREATE TABLE IF NOT EXISTS public.raos_driver_staff_assignment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES public.raos_drivers(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  assigned_by uuid REFERENCES public.user_profiles(id),
  UNIQUE (driver_id)
);
CREATE INDEX IF NOT EXISTS raos_driver_staff_assignment_staff_idx ON public.raos_driver_staff_assignment (staff_id);
CREATE INDEX IF NOT EXISTS raos_driver_staff_assignment_branch_idx ON public.raos_driver_staff_assignment (branch_id);

CREATE TABLE IF NOT EXISTS public.raos_payroll (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  effective_month date NOT NULL,
  gapok int NOT NULL DEFAULT 0,
  bonus_saldo int NOT NULL DEFAULT 0,
  bpjs int NOT NULL DEFAULT 55000,
  paket_data int NOT NULL DEFAULT 100000,
  member_parkir int NOT NULL DEFAULT 0,
  bonus_kpi int NOT NULL DEFAULT 0,
  thp int GENERATED ALWAYS AS (gapok + bonus_saldo + bpjs + paket_data + member_parkir + bonus_kpi) STORED,
  target_pct numeric(6,2) DEFAULT 0,
  driver_active_pct numeric(6,2) DEFAULT 0,
  status_target text NOT NULL DEFAULT 'ok' CHECK (status_target IN ('ok','warning','cut_off','na')),
  computed_at timestamptz NOT NULL DEFAULT now(),
  computed_by uuid REFERENCES public.user_profiles(id),
  UNIQUE (staff_id, effective_month)
);
CREATE INDEX IF NOT EXISTS raos_payroll_month_idx ON public.raos_payroll (effective_month);
