# RAOS / RIFIM OS — Isolated E2E Sandbox Evidence

Date: 2026-08-17
Branch: `audit-full-sync-20260817`
Sandbox project: `rifim-logbook-maxim` (`tnquurldhqfasfiqcwhj`)
Production RAOS project `vlievtojpmrbsmzlqswl` was not mutated.

## Isolation

Existing sandbox tables (`laporan`, `master_kasus`, `profil`, `titik_pickup`) were left untouched.
A dedicated `raos_e2e` schema was created for disposable authorization/readback tests.

## Read-scope E2E as PostgreSQL role `authenticated`

| Role | Driver master visible | Ops rows visible | Result |
|---|---:|---:|---|
| Staff, Branch A | 1 / 2 | own/Branch A scoped | PASS |
| Koordinator, Branch A | 1 / 2 | Branch A scoped | PASS |
| Management | 2 / 2 | global read | PASS |
| Admin | 2 / 2 | global read | PASS |
| Direksi | 2 / 2 | global read | PASS |
| Driver | 0 / 2 | own record only | PASS |

## Mutation / readback E2E

| Actor | Action | Expected | Actual |
|---|---|---|---|
| Staff | insert own ops record in own branch | allow | PASS, readback=1 |
| Staff | insert own ops record into another branch | deny | PASS, RLS 42501 |
| Koordinator | insert ops record | deny | PASS, RLS 42501 |
| Management | insert ops record | deny | PASS, RLS 42501 |
| Admin | insert ops record | allow | PASS, readback=1 |
| Direksi | insert ops record | allow | PASS, readback=1 |
| Driver | insert ops record | deny | PASS, RLS 42501 |
| Admin/authenticated | insert Driver master | deny | PASS, permission denied |
| service_role | insert Driver master | allow canonical sync writer | PASS, readback=1 |

## CI role contract

Permanent executable contract added at:
`apps/pwa/scripts/test-access-policy-contract.cjs`

RAOS PR CI now runs:
- `npm ci`
- ESLint
- `tsc --noEmit`
- six-role access-policy contract

GitHub Actions run `32029066402` completed SUCCESS on commit `254655413ee48f3af08a839b36b5cbb7ddc7341c`.

## Interpretation

Authorization/data-scope contract and isolated write/readback are PASS.
This is not the same as browser-login E2E against production credentials. Browser-authenticated route/session/realtime checks remain a separate final smoke gate and must not mutate real production records.

## Production safety

- No production migration applied.
- No production RLS policy changed.
- No production data inserted/updated/deleted for these tests.
- `docs/sql/RAOS_DRIVER_MASTER_READONLY_DRAFT_20260817.sql` remains draft only until explicit production authorization.
