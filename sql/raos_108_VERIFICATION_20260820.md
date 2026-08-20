# RAOS 108 — National Canonical Target Verification

Production verification after applying `raos_108_canonical_target_progress_national_consistency`.

## Canonical rules

- Target source: `raos_kpi_targets_staff` override -> `raos_kpi_targets_branch.target_staff_default` -> derived equal-share.
- Derived equal-share denominator: active `staff + koordinator` in canonical branch scope.
- Derived equal-share rounding: `CEIL`.
- Branch mode source: `raos_kpi_targets_branch.mode` (`saldo` / `order`).
- Saldo realization: `raos_target_tercapai_bulan`.
- Order realization: `scan_orders` with `status='valid'` and branch timezone month window.
- Legacy `kpi_targets` is no longer referenced by `raos_saldo_progress_snapshot(uuid)`.

## August 2026 production matrix

| Branch | Mode | Target Branch | Active Staff+Koordinator | Equal Share |
|---|---:|---:|---:|---:|
| Bandara Balikpapan | saldo | Rp90,000,000 | 3 | Rp30,000,000 |
| Bandara Batam | saldo | Rp110,000,000 | 7 | Rp15,714,286 |
| Bandara Jambi | saldo | Rp36,000,000 | 3 | Rp12,000,000 |
| Bandara Makassar | order | 5,000 scan | 12 | 417 scan |
| Bandara Manado | saldo | Rp40,000,000 | 3 | Rp13,333,334 |
| Bandara Pekanbaru | saldo | Rp10,000,000 | 4 | Rp2,500,000 |
| Bandara Soekarno-Hatta | order | 18,000 scan | 1 | 18,000 scan |
| Rifim Batam (non-airport) | saldo | Rp70,000,000 | 1 | Rp70,000,000 |
| Rifim Jambi Luar | saldo | Rp16,000,000 | 1 | Rp16,000,000 |

All sampled `raos_saldo_progress_snapshot()` calls returned mode and target matching this matrix. Makassar now correctly returns `order` instead of being inferred as saldo by the old slug-only logic.

At verification time there were no August 2026 per-person override rows, so all rows above used the equal-share fallback. The override precedence remains implemented and unchanged: an explicit person override wins over branch default/equal-share.
