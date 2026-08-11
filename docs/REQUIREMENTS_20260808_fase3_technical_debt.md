# REQUIREMENTS FASE 3 — Technical Debt Cleanup + Enhancement

Tanggal: 2026-08-08
Sumber: Debt list `RAOS/STATUS.md` + `RAOS/CLAUDE.md` + backlog owner request

## Executive Summary

FASE 1 + FASE 2 (13 poin Isi Saldo) selesai. FASE 3 fokus **technical debt cleanup** + **feature enhancement** yang tertunda dari sesi sebelumnya.

**Total scope:** 8 poin (A-H), split 3 sesi hari kerja karena estimasi deploy > 20/hari.

**Split schedule:**
- **Sesi FASE 3.1** (hari 1): Poin A + B + C — critical UX + security hardening (~4-6 deploy)
- **Sesi FASE 3.2** (hari 2): Poin D + E — feature enhancement (~6-10 deploy)
- **Sesi FASE 3.3** (hari 3): Poin F + G + H — nice-to-have + tuning (~4-6 deploy)

---

## Poin A — Service Worker cache-first offline READ

**Priority:** HIGH (critical UX)

**Context:** Infrastruktur offline WRITE (idb queue `offlineQueue.ts`) sudah lengkap sejak sesi 20-an. Tapi offline READ masih menampilkan halaman putih ketika signal jelek di lapangan (Balikpapan, Manado remote area). Staff scan/absensi tidak bisa view riwayat sendiri saat offline.

**Scope:**
- Extend Service Worker existing (`RAOS/apps/pwa/public/sw-push.js`) atau `next.config.js` PWA config dengan cache-first strategy untuk:
  - Dashboard homepage (`/dashboard`)
  - Riwayat (`/riwayat`) — cache last 30 hari
  - Chat room list (`/chat` initial load)
  - User profile card (avatar, name, role)
- Cache invalidation:
  - Auto-refresh cache saat online reconnect.
  - Manual "Refresh" button di setiap page trigger fetch fresh.
- UI feedback: badge kecil "📴 Offline mode — data cached" di header saat offline detected (via `navigator.onLine`).

**Deliverable:**
- 1 PR di raos-menala (Next PWA change).
- File impact: `apps/pwa/next.config.js`, `apps/pwa/public/sw-*.js`, hook baru `hooks/useOfflineStatus.ts`, komponen `OfflineBadge.tsx`.
- Test manual: buka `/riwayat` → matikan wifi/data → refresh page → verify data tampil dari cache.

**JANGAN:**
- Cache API mutation (POST/PATCH/DELETE) — hanya GET.
- Cache Supabase realtime channel — tetap online-only.
- Cache credential/session token.

---

## Poin B — Assign Staff ke Branch SOETA + Verify Auto-Prorate

**Priority:** HIGH (data completeness)

**Context:** Sesi FASE 1 (auto-prorate `raos_077`) verify 8/9 cabang OK. SOETA (Soekarno-Hatta) belum ada staff dengan `branch_id` assigned → auto-prorate skip SOETA. Perlu populate staff SOETA supaya KPI + payroll SOETA hidup.

**Scope:**
- Verify sheet SSoT `MASTER DATA STAFF` — pastikan staff SOETA punya kolom "ID CABANG" terisi = "ID Rifim Airport Soeta".
- Trigger `syncStaffFromSSOT` (cron 10-menit) — pastikan branch_id ter-populate ke `user_profiles`.
- Setelah data ter-sync, jalankan RPC `raos_compute_payroll_month('2026-08-01')` via Supabase MCP untuk re-populate payroll SOETA.
- Verify prod: query `SELECT * FROM raos_kpi_targets_branch WHERE branch_id = <SOETA_id>` → `target_staff_default` auto-prorate valid.

**Deliverable:**
- Instruksi kepada user untuk isi sheet SSoT (kalau kolom kosong).
- CC verify via MCP query + trigger RPC.
- 1 PR update `STATUS.md` dengan hasil verifikasi (no code change).

**JANGAN:**
- Insert manual ke `user_profiles` (harus lewat SSoT sync).
- Force-set `branch_id` via SQL manual (harus lewat sheet).

---

## Poin C — Enable Leaked Password Protection Supabase

**Priority:** MEDIUM (security hardening)

**Context:** Supabase Auth support built-in "Leaked Password Protection" (HaveIBeenPwned integration). Setting ini disable by default → user bisa daftar dengan password yang leak di dark web.

**Scope:**
- Buka Supabase Dashboard → Project `vlievtojpmrbsmzlqswl` → Authentication → Providers → Email.
- Enable checkbox "Leaked password protection" (HaveIBeenPwned).
- Verify: coba reset password staff dummy pakai password lemah (misal "123456") → harus reject.

**Deliverable:**
- User action (5-menit klik di dashboard, no code).
- 1 PR update `STATUS.md` konfirmasi enabled.

**JANGAN:**
- Ubah policy password minimum length (biarkan default supaya PIN existing masih valid).

---

## Poin D — Poin 4 FULL Playwright Recorder AIST

**Priority:** MEDIUM (feature — pending user decision di FASE 2)

**Context:** FASE 2 poin 4 hanya MVP tombol "Buka AIST" (window.open URL). User asli minta:
> "bila perlu langkah2 nya dan id login dan pasword terekam otomatis buat Playwright merekam gerakan saya pada saat proses pengisian saldo"

**Scope:**
- Buat Playwright test script yang record proses:
  1. Login AIST (email + password stored di secure vault, JANGAN hardcode).
  2. Navigate ke halaman "Documents" AIST.
  3. Fill form isi saldo dengan payload dari `raos_saldo_requests`.
  4. Submit + confirm dialog.
  5. Detect success/error response.
- Trigger: dari Finance UI, tombol "▶️ Auto-Fill AIST via Playwright" untuk 1 row saldo pending.
- Backend runner: Node.js service (bisa di Vercel Serverless Function atau GAS proxy) yang jalankan Playwright script.
- Callback: setelah Playwright sukses, call RPC `raos_saldo_mark_paid`.

**Deliverable:**
- Folder baru `rifim-os/automation/playwright-aist/` dengan test scripts.
- 1 endpoint API di `rifim-os/api/internal/aist-runner.js`.
- Extension Finance UI: tombol Playwright next to Lunas.
- 2-3 PR (playwright setup, API endpoint, Finance UI integration).

**JANGAN:**
- Hardcode credential AIST — pakai env var + user prompt di UI.
- Skip existing bookmarklet `aist-fill-v2` (tetap tersedia sebagai fallback).
- Simpan session AIST secara persistent (re-login tiap run).

**BUTUH KONFIRMASI USER:** apakah scope FULL (dengan API backend + Node runner) atau MINI (Playwright script standalone yang user run local dari terminal)?

---

## Poin E — Kolom "Jabatan DIREKSI" di HRIS Sheet SSoT

**Priority:** MEDIUM (data completeness)

**Context:** Sheet `MASTER DATA STAFF` punya kolom "Jabatan" tapi belum ada mapping ke role Supabase untuk direksi. Saat ini direksi ditandai manual via `user_profiles.role = 'direksi'` — tidak sync dari sheet.

**Scope:**
- Tambah kolom `Role Sistem` di sheet `MASTER DATA STAFF` (kolom baru setelah "Jabatan").
- Isi kolom dengan enum: `staff`, `koordinator`, `admin`, `management`, `direksi`, `driver_manager`, `driver`.
- Update GAS `RAOS/gas/13_staff_sync.gs` — read kolom baru, map ke `user_profiles.role` saat sync.
- Backward compat: kalau kolom baru kosong, fallback ke logic existing (parse "Jabatan" text).

**Deliverable:**
- User action: isi kolom `Role Sistem` di sheet SSoT untuk direksi + staff aktif.
- 1 PR di raos-menala: update `13_staff_sync.gs` handler.
- GAS Web App redeploy manual (user manual GUI).
- Verify: query `SELECT role, COUNT(*) FROM user_profiles GROUP BY role` post-sync.

**JANGAN:**
- Rename kolom "Jabatan" existing — tambah kolom BARU.
- Override kolom `Role Sistem` dari client — tetap SSoT sheet-only edit.

---

## Poin F — Sheet MASTER TARGET + RAOS_KPI_MANUAL Auto-Populate Template

**Priority:** LOW (workflow enhancement)

**Context:** Sheet `MASTER TARGET` dan `RAOS_KPI_MANUAL` (bulanan) harus diisi manual tiap bulan oleh admin. Template + validation belum ada → admin sering typo atau lupa kolom.

**Scope:**
- GAS function `initializeMonthlyKpiSheet(monthISO)` — auto-generate template row untuk 9 cabang di kedua sheet.
- Trigger otomatis: cron tanggal 1 tiap bulan jam 08:00 WIB — populate template bulan baru.
- Menu GAS custom: `RAOS > 📊 KPI > Generate Template Bulan Ini` (manual override).
- Data validation di sheet: dropdown enum untuk kolom "Cabang", "Kategori", dll — cegah typo.

**Deliverable:**
- 1 PR di raos-menala: update `RAOS/gas/14_kpi_config.gs` + `15_kpi_engine.gs`.
- GAS Web App redeploy manual (user manual GUI).
- Menu bar RAOS baru: "📊 KPI" section.

**JANGAN:**
- Overwrite baris existing yang sudah diisi admin — hanya append kalau kosong.
- Hardcode 9 cabang di kode — loop dari sheet MASTER DATA STAFF.

---

## Poin G — Full Playwright Admin Test Suite

**Priority:** LOW (dev productivity)

**Context:** User sudah punya folder `playwright-admin/` (di `C:\Projects\menala\playwright-admin`) untuk smoke test kedua PWA. Tapi test suite belum lengkap — hanya template.

**Scope:**
- Setup Playwright test coverage untuk critical path:
  - RAOS PWA: login → dashboard → scan barcode → absensi → riwayat.
  - Rifim-OS Portal: login → finance → target cabang → isi saldo list.
- Fixture: dummy staff/direksi account untuk auto-test.
- CI integration: GitHub Actions workflow `.github/workflows/playwright-smoke.yml` — trigger on push to main.
- Reporting: HTML report deployed sebagai artifact GitHub Actions.

**Deliverable:**
- Folder `playwright-admin/tests/` dengan 8-10 test files.
- 1 GitHub Actions workflow.
- Docs `playwright-admin/README.md` — cara run local + interpret hasil CI.
- 0 deploy Vercel (test infra saja, tidak sentuh PWA production).

**JANGAN:**
- Test yang tergantung data production (harus pakai staff dummy dengan flag `is_test=true`).
- Commit credential test ke repo — pakai GitHub Secrets.

---

## Poin H — Reminder Chat Interval Tuning (Poin 7 Enhancement)

**Priority:** LOW (UX polish)

**Context:** FASE 2 poin 7 implement reminder 5-menit tanpa max limit. Request `raos_saldo_requests` yang tergantung berhari-hari akan spam room chat setiap 5 menit indefinitely.

**Scope:**
- Update GAS function `reminderSaldoBelumDiisi` di `RAOS/gas/16_saldo_sync.gs`:
  - Track reminder count per request (butuh kolom baru `reminder_count int NOT NULL DEFAULT 0`).
  - Max 3 reminder → setelah itu STOP + escalate ke admin (post 1x pesan escalation di room "Umum" tag @admin).
- Migration `raos_079_saldo_reminder_count.sql`.

**Deliverable:**
- 1 PR di raos-menala: migration + GAS update.
- CC apply migration.
- User manual redeploy GAS.

**JANGAN:**
- Reset counter (biar admin tahu request "abandoned").
- Delete request otomatis (biar audit trail lengkap).

---

## Konvensi Umum FASE 3

**Wajib:**
- Setiap poin = 1 branch = 1 PR = max 2 deploy Vercel.
- Setiap PR: `feat(scope): deskripsi (poin X)` atau `fix(scope): ... (poin X)`.
- STATUS.md update di akhir sesi (bundle 1 PR per repo per hari).
- Migration Supabase: file `.sql` di `RAOS/sql/`, CC apply via MCP.
- GAS `.gs` edit: user manual redeploy Web App di GUI.

**Deploy budget:**
- Sesi 3.1: max 6 deploy.
- Sesi 3.2: max 10 deploy.
- Sesi 3.3: max 6 deploy.
- Kalau kena rate-limit di tengah sesi: STOP, defer sisa poin ke sesi berikutnya.

**Coordinate:**
- Migration + GAS change butuh CC + user follow-up. Jangan lupa tag di PR body:
  - `**@CC apply migration raos_079 via MCP**`
  - `**INSTRUKSI USER: manual redeploy GAS Web App + jalankan setupAllTriggers()**`

---

## Split Schedule Detail

### Sesi FASE 3.1 — 2026-08-08 (hari 1)

**Poin dikerjakan:** A + B + C

**Prioritas:** Critical UX + security hardening (paling impactful, low complexity).

**Estimasi:**
- A: 1 PR raos-menala, ~2-4 deploy (SW cache-first, Next PWA config).
- B: 0-1 PR (mostly verify + data entry user + CC MCP verify), 0-2 deploy.
- C: 0 PR (setting dashboard) + 1 PR STATUS.md, 0-2 deploy.
- **Total: 2-3 PR, 4-6 deploy** (aman jauh dari 20).

### Sesi FASE 3.2 — 2026-08-09 (hari 2)

**Poin dikerjakan:** D + E

**Prioritas:** Feature enhancement (medium complexity, butuh coordinate user untuk D scope confirmation).

**Estimasi:**
- D: 2-3 PR (Playwright setup, API endpoint, Finance UI), ~4-6 deploy.
- E: 1 PR (GAS update), 2-4 deploy.
- **Total: 3-4 PR, 6-10 deploy** (aman <15).

### Sesi FASE 3.3 — 2026-08-10 (hari 3)

**Poin dikerjakan:** F + G + H

**Prioritas:** Nice-to-have + tuning.

**Estimasi:**
- F: 1 PR (GAS template), 2 deploy.
- G: 1 PR (playwright-admin folder + workflow), 0 deploy Vercel.
- H: 1 PR (migration + GAS), 2 deploy.
- **Total: 3 PR, 4-6 deploy** (aman <10).

---

## Success Criteria FASE 3

- ✅ Offline READ works (Poin A verify di device dengan wifi off).
- ✅ SOETA payroll populated dengan target valid (Poin B).
- ✅ Password leak protection aktif di Supabase (Poin C).
- ✅ Playwright AIST runner works end-to-end (Poin D).
- ✅ Role direksi ter-sync dari sheet SSoT (Poin E).
- ✅ Template KPI bulan baru auto-generated tiap tanggal 1 (Poin F).
- ✅ Playwright admin smoke suite passing di CI GitHub Actions (Poin G).
- ✅ Reminder chat max 3x + escalation aktif (Poin H).

Semua PR merged, semua migration applied, semua GAS redeployed, semua smoke test pass.
