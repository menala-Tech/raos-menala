# CLAUDE.md — RAOS Project

> **Panduan Claude Code untuk RAOS** (Rifim Airport Operation System — PWA operasional Vendor Maxim di 9 cabang RIFIM).
>
> Semua detail teknis pindah ke `.claude/skills/` — di-load on-demand oleh Claude sesuai konteks task. File ini hanya berisi core (konteks proyek, aturan kerja, latest session).

Version: 2.0 (post skill-migration)
Last updated: 2026-08-05 sore (skill extraction untuk hemat token per sesi baru)

---

## Konteks Proyek

RAOS = Rifim Airport Operation System. PWA operasional Vendor Maxim di **9 cabang aktif RIFIM** (sesi 17 multi-cabang):

1. **ID Rifim Airport Soeta** (T1/T2/T3 sub-terminal) — khusus **Order** (scan valid)
2. ID Rifim Airport Batam
3. ID Rifim Airport Jambi
4. ID Rifim Airport Balikpapan
5. ID Rifim Airport Manado
6. ID Rifim Airport Pekanbaru
7. ID Rifim Airport Makassar
8. ID Rifim Batam (non-airport)
9. ID Rifim Jambi Luar

Cabang non-Soeta khusus **Saldo** (Rp nominal). Detail lengkap: invoke skill **`raos-multi-cabang`**.

---

## Stack

- **Frontend:** Next.js 14 + TypeScript + Tailwind CSS (PWA)
- **Backend:** Supabase (PostgreSQL + Auth + Realtime + RLS) — project `vlievtojpmrbsmzlqswl`
- **Automation:** Google Apps Script (22 file di `gas/`)
- **Deploy:** Vercel + GitHub Actions
- **Storage:** Google Drive (backup + selfie)

---

## ⚠️ Deploy GAS

Setiap butuh deploy GAS, baca dulu [../GAS_PROJECTS_MAP.md](../GAS_PROJECTS_MAP.md). Ada 2 GAS project (RAOS + Rifim-OS) — kalau salah folder, salah deploy. Helper: `.\..\gas-push.ps1 raos`.

Detail lengkap: invoke skill **`raos-gas-rules`**.

---

## Aturan Kerja

0. **WAJIB sync ke spreadsheet RAOS** (`1eYS2mM3Sy...`) setiap upgrade yang mengubah data agregat. Antar sheet (DASHBOARD STAFF, MASTER TARGET, Form Isi Saldo, LOG SISTEM, DATABASE ORDER, SISTEM CONFIG) HARUS terintegrasi. Tab baru auto-create via menu GAS.

0b. **WAJIB gunakan semua MCP** yang tersedia (Supabase, Vercel, GitHub, Context7). Jangan fallback manual shell.

1. Selalu update STATUS.md setelah selesai sesi
2. Jangan hardcode credential — pakai `.env.local` atau Supabase Secrets
3. Semua tabel Supabase wajib punya RLS policy
4. Commit format: `feat(scope): deskripsi` / `fix(scope): deskripsi`
5. Test fitur di browser sebelum lapor selesai
6. **SEBELUM reuse/extend tabel Supabase manapun**, cek dulu skema kolomnya — kalau ada kolom gaya lain (mis. `employee_id` text bukan `staff_id` UUID) itu tanda tabel MILIK PROYEK LAIN. Buat tabel baru berprefix `raos_` alih-alih extend.
7. **Tabel MILIK PROYEK LAIN — JANGAN disentuh:** `drivers`, `employees`, `employee_contracts`, `attendance` (bukan `raos_attendance`), `leave_requests`, `leave_balances`, `payroll`, `users` (bukan `user_profiles`), `saldo_events`
8. **Tabel MILIK RAOS (aman dipakai/diextend):** lihat skill `raos-supabase-rules` seksi 9

---

## Skill Registry — Detail Teknis On-Demand

Skill files di `.claude/skills/` — Claude auto-invoke berdasarkan konteks task. Kalau tidak auto-trigger, invoke manual via `Skill` tool:

| Skill | Konteks Trigger |
|---|---|
| `raos-supabase-rules` | Migration, RLS, RPC, Edge Function, vault, publication realtime, tabel ownership |
| `raos-gas-rules` | File `.gs` di `gas/`, deploy RAOS GAS, cron trigger, debug endpoint |
| `raos-design-tokens` | CSS/Tailwind, form/tabel/badge, chat UI, styling komponen |
| `raos-chat-conventions` | `/chat` page, room membership, FK embed, mention @nama, read receipt, retensi, slash command |
| `raos-push-notification` | Web Push VAPID, Edge Function `raos-send-push`, filter kategori, trigger otomatis, VAPID env |
| `raos-frontend-conventions` | Header sticky, BottomNav, MenalaLogo, GPS tiered, BarcodeScanner, modal padding, SwipeBack, offline queue |
| `raos-ssot-sync` | Sync sheet MASTER DATA STAFF/Driver → user_profiles/raos_drivers, PIN password mapping |
| `raos-kpi-payroll-v2` | KPI target V2, payroll compute tier formula, random assign driver, cross-repo integration Finance/HRIS |
| `raos-multi-cabang` | 9 cabang aktif, `is_branch_in_scope`, 5 room per cabang, Isi Saldo pipeline, Antrian Driver |
| `raos-attendance-shift` | `/absensi`, `/scan`, geofence hard-block, selfie sync Drive, reminder 6 waktu shift |
| `raos-external-resources` | Supabase project, Drive folder, spreadsheet SSoT, working directory |
| `raos-modul-pwa-routes` | Mapping 17+ halaman PWA → fungsi → role |

**Aturan:** kalau lihat tanda-tanda topik di kolom "Konteks Trigger", skill terkait akan auto-invoke. Kalau tidak, invoke manual.

---

## Lokasi Lokal

```
C:\Projects\menala\RAOS\       ← git repo (working dir: RAOS\apps\pwa)
```

Detail folder + Drive + Spreadsheet: invoke skill **`raos-external-resources`**.

---

## Cross-Repo Kolaborasi

RAOS terkoneksi dengan **PWA RIFIM OS** (`rifim-os`) via:
- Supabase shared (project `vlievtojpmrbsmzlqswl`)
- Sheet SSoT MASTER DATA STAFF (staff sync 10 menit paralel)
- `raos_saldo_requests` proxy di endpoint Finance
- `raos_payroll` konsumsi HRIS Payroll bonus
- Broadcast `raos-saldo-new` cross-tab

Pembagian tugas 2 agent (CC vs Codex Desktop) diatur di `docs/TASK_DIVISION_CC_CODEX.md` + `prompts/CC_DESKTOP_ONBOARDING.md` + `prompts/CX_DESKTOP_ONBOARDING.md`.

---

## Debt / Pending Tinggi (per akhir sesi 21)

Detail lengkap di `STATUS.md`. Highlight yang masih relevan:

- **Tambah kolom "Jabatan DIREKSI" di HRIS** — mapping role direksi belum ada di sheet SSoT
- **Service Worker cache-first strategy untuk offline READ** — infra offline WRITE sudah lengkap, offline READ masih putih
- **Debt manual user:** enable Leaked Password Protection, isi PIN Hendro, set branch_id Hendro, isi sheet MASTER TARGET, isi sheet RAOS_KPI_MANUAL bulanan

## Sesi Terakhir — 2026-08-05 sore (Skill Extraction)

Refactor CLAUDE.md dari 891 baris → ~150 baris core. Detail teknis pindah ke 12 skill files di `.claude/skills/` (target hemat 60-75% token per sesi baru).

**File yang dibuat (12 skill):** raos-{supabase-rules, gas-rules, design-tokens, chat-conventions, push-notification, frontend-conventions, ssot-sync, kpi-payroll-v2, multi-cabang, attendance-shift, external-resources, modul-pwa-routes}

Cross-repo companion di `rifim-os/.claude/skills/` — 8 skill.

## Sesi Sebelumnya — 2026-08-04 sore

KPI Targets V2 + Payroll RAOS (backend foundation cross-repo integration). Migration `raos_070a-d` applied: 4 tabel baru, 2 view, 2 RPC SECURITY DEFINER. PWA `/admin` tombol Random Assign Driver.

Detail: invoke skill `raos-kpi-payroll-v2`.
