# AUDIT LAUNCH — 1 September 2026

**Audit date:** 2026-08-29
**Auditor:** Claude Code
**Scope:** RAOS PWA + Rifim-OS PWA + Google Apps Script + Google Spreadsheets

---

## 0. TL;DR — Go / No-Go

| Domain | Status | Blocker? |
|---|---|---|
| Backup pra-launch (kedua spreadsheet) | ✅ DONE | — |
| GAS pre-launch cleanup RAOS | 🟡 CODE READY, menu belum di-push | user push clasp + run menu |
| GAS pre-launch cleanup Rifim-OS | 🟡 CODE READY, menu belum di-push | user push clasp + run menu |
| Tab `RAOS_SCAN_ORDER` di Rifim-OS spreadsheet | 🟡 CODE READY, akan auto-create | user run menu |
| GAS sync `scan_orders` → sheet (15 menit) | 🟡 CODE READY, trigger belum pasang | user run `setupRaosScanOrderTrigger` |
| Modul PWA RAOS core (17 route) | ✅ LIVE | — |
| Modul PWA Rifim-OS core | ⚠️ PARTIAL — HRIS + Finance + RAOS index live; Dashboard placeholder | non-blocking untuk launch RAOS |
| Web Push VAPID keys (RAOS) | ⚠️ UNCHECKED, cek Supabase secrets | verify sebelum go-live |
| Debt manual user (Hendro PIN, MASTER TARGET isi, dll) | ⚠️ CARRY OVER dari sesi 21 | address parallel |

**Kesimpulan launch 1 Sep:** RAOS PWA siap secara teknis. Yang wajib dilakukan user dalam 72 jam:
1. Push clasp → run 2 menu cleanup (RAOS + Rifim-OS spreadsheet)
2. Run "Setup Trigger Sync (15 menit)" untuk RAOS_SCAN_ORDER
3. Isi PIN Hendro + isi MASTER TARGET bulanan + set branch_id Hendro (debt sesi 21)
4. Verify VAPID key Supabase (`raos-send-push` Edge Function bisa fire)

---

## 1. Full Backup Pra-Launch

Full-file copy sudah dibuat via MCP Google Drive. Ini adalah **safety net utama** untuk rollback.

| Source spreadsheet | Backup file | ID |
|---|---|---|
| RAOS — Rifim Airport Operation System (`1eYS2mM3Sy...`) | RAOS Spreadsheet — FULL BACKUP 20260829 pre-launch | `1DwdnO6cZXWt7k6A-b3XOF2uzycPej0Fu8pEXqnzH064` |
| RIFIM OS — Smart Office Database (`1jHeA-w1bM32S3...`) | RIFIM OS Spreadsheet — FULL BACKUP 20260829 pre-launch | `1pZCQ57tU99Xa-zDfVeZbFk9Pg0B5bldnRT47APeVxY0` |

**Rollback flow kalau launch bermasalah:**
1. Buka backup file
2. File → Make a copy → beri nama sama seperti asli
3. Bagikan ID baru ke GAS Script Properties (`SPREADSHEET_ID` untuk RAOS, edit hard-coded ID di `setupRaosSheets.js` untuk Rifim-OS)

---

## 2. Decision Matrix — Tab Cleanup

### 📊 RAOS Spreadsheet — 10 tab

| Tab | Grid | Aksi | Detail |
|---|---|---|---|
| ABSENSI | 1000×26 | 🗑️ CLEAR | ada 15+ rows dev data (UUID id) |
| Antrian Driver | 1000×26 | 🗑️ CLEAR | 5 rows "Bandara Batam" test |
| LOG ACTIVITY | 1000×26 | 🗑️ CLEAR | 1 row |
| LOG SISTEM | 33005×26 | 🗑️ CLEAR | grid membesar dari log accumulation |
| MASTER TARGET | 1000×26 | ✅ KEEP | konfigurasi target KPI |
| Form Isi Saldo | 1006×26 | 🗑️ CLEAR | 6 rows data (row 1001+) — layout aneh, worth investigating |
| DASHBOARD STAFF | 1000×26 | 🗑️ CLEAR | 76 rows nama staff (auto-regen dari GAS syncStaffFromSSOT) |
| RAOS_KPI_MANUAL | 1000×26 | 🗑️ CLEAR | header saja, no data |
| SISTEM CONFIG | 1000×26 | ✅ KEEP | 20 config entries |
| PANDUAN ADMIN | 100×6 | ✅ KEEP | dokumentasi |

**Hasil:** 7 clear + 3 keep.

### 📊 Rifim-OS Spreadsheet — 33 tab

**CLEAR (21):** `documents`, `doc_approval_rules`, `doc_audit_mirror`, `doc_pending_approvals`, `CRM_AUDIT_LOG`, `Rekap Fee Harian`, `Rekap Fee Bulanan`, `DB Driver Kinerja`, `Saldo Driver`, `Rekap Saldo Cabang`, `system_log`, `Input Driver External`, `Input Driver Airport`, `Input Staff`, `LAPORAN_CABANG`, `MONITORING_SALDO`, `MONITORING_POTONGAN`, `Form Input Saldo AIST`, `Input Potongan 1`, `Input Potongan 2`, `activity_log`.

**KEEP (12):** `employees` (HRIS Karyawan — SSoT dari MASTER DATA STAFF), `Database Driver External`, `Database Driver Airport`, `Database Staff`, `Database AIST`, `Database Potongan`, `CONFIG_FEE_KANTOR`, `companies`, `numbering_sequences`, `company_config`, `document_types`, `PANDUAN ADMIN`.

**BARU (1):** `RAOS_SCAN_ORDER` — 12 kolom, sync 7-hari rolling.

---

## 3. Cara Eksekusi Cleanup (Manual oleh user)

Cleanup **dieksekusi user via menu GAS**, bukan otomatis oleh Claude. Alasan: user harus lihat konfirmasi UI + track siapa yang menekan tombol untuk audit.

### RAOS spreadsheet
1. Push code: `gas/25_pre_launch.gs` dan update `gas/10_menu.gs` sudah ready. Push via clasp (`.clasp.json` sudah tersimpan di folder `gas/`):
   ```bash
   cd C:/MENALA/Repos/raos-menala/gas && clasp push
   ```
2. Buka spreadsheet RAOS → refresh browser → menu **🛠️ RAOS System → ⚙️ Sistem → 🚀 Pre-Launch Cleanup (1 Sep 2026)**
3. Konfirmasi YES.
4. Verify: hasil dialog "Selesai" menampilkan jumlah rows cleared per tab.

### Rifim-OS spreadsheet
1. Push code: `automation/apps-script/preLaunchCleanup.js` + `raosScanOrderSync.js` + update 4 file lain (`raosMenuEngine.js`, `raosDriverLayer.js`, `setupDriveFolders.js`, `setupTemplates.js`). Push via clasp:
   ```bash
   cd C:/MENALA/Repos/rifim-os/automation/apps-script && clasp push
   ```
2. Buka spreadsheet Rifim-OS → refresh browser → menu **🚛 RIFIM OS → ⚙️ Setup → 🚀 Pre-Launch Cleanup (1 Sep 2026)**
3. Konfirmasi YES → auto buat tab `RAOS_SCAN_ORDER`.
4. Lalu: menu **🚛 RIFIM OS → 💳 Isi Saldo — RAOS Feed → ⏰ Setup Trigger Sync (15 menit)**
5. Trigger tiap 15 menit akan sync scan orders Soeta ke tab.

---

## 4. Wiring PWA ↔ GAS ↔ Spreadsheet — Verified

### RAOS PWA (Next.js `raos-menala.vercel.app`)

Route → Supabase table → GAS sync → Sheet tab:

| Route PWA | Supabase | GAS function | Sheet tab | Frequency |
|---|---|---|---|---|
| `/absensi` | `raos_attendance` | `importAbsensiFromSupabase` (manual) | ABSENSI | on-demand |
| `/scan` | `scan_orders` | (baru) `syncRaosScanOrders` | RAOS_SCAN_ORDER (Rifim-OS SS!) | 15m cron |
| `/chat` (`/isisaldo N`) | `raos_saldo_requests` | `syncSaldoRequestsToSheet` | Form Isi Saldo | 5m cron |
| `/antrian-driver` | `raos_driver_queue` | `syncDriverQueueToSheet` | Antrian Driver | on-demand |
| `/kpi` | `scan_orders` (aggregated) | `updateAllKpiRAOS` | DASHBOARD STAFF | 22:00 cron |
| `/admin` | `user_profiles` | `syncStaffFromSSOT` | (no local tab — sync FROM sheet) | 10m cron |
| `/drivers` | `raos_drivers` | `syncDriverAirportFromSSOT` | (no local tab) | 6h cron |

**SSoT one-way:** MASTER DATA STAFF sheet → `user_profiles` (10m). PIN kolom H → `raos_credentials` via `syncRaosCredentials()` manual-only.

### Rifim-OS PWA (statis `rifim-os.vercel.app` + module HTML)

| Modul | File | Backend | Status |
|---|---|---|---|
| Portal (landing) | `modules/portal/index.html` | GAS `webApp.js` | ✅ live |
| HRIS Karyawan | `modules/hris/index.html` | GAS `hrisLayer.js` → Supabase `employees` | ✅ live |
| HRIS Preactivation | `modules/hris/preactivation.html` | GAS `webApp.js` | ✅ live |
| HRIS Soeta KPI | `modules/hris/soeta-kpi.html` | Supabase view `soeta_kpi_pillars` | ✅ live |
| Finance Dashboard | `modules/finance/index.html` | Supabase `raos_saldo_requests` + `raos_payroll` | ✅ live |
| RAOS proxy | `modules/raos/index.html` | link ke RAOS PWA | ✅ live |
| Documents | `modules/documents/` (engines + pages) | GAS `documentEngine.js` | ✅ live |
| Dashboard | `modules/dashboard/` | (kosong) | 🔴 placeholder |
| AI Assistant, CRM, Sistem, Smart Office | `modules/{ai-assistant,crm,sistem,smart-office}` | mix | not on critical path 1 Sep |

**Isi Saldo pipeline (cross-project):**
- Staff PWA RAOS `/chat` `/isisaldo N` → `raos_saldo_requests` (RLS)
- GAS RAOS `syncSaldoRequestsToSheet` (5m) → tab **Form Isi Saldo** RAOS spreadsheet
- Finance Dashboard PWA Rifim-OS `/finance` → RPC `markSaldoRequestProcessed` → `raos_saldo_requests.is_processed=true`
- DB trigger `raos_saldo_after_processed` → push staff + auto-chat driver room
- **BARU untuk launch 1 Sep:** tab `RAOS_SCAN_ORDER` di Rifim-OS spreadsheet — admin Finance/Isi Saldo bisa cross-check scan Soeta hari-hari terakhir tanpa buka PWA RAOS.

---

## 5. Tab Baru RAOS_SCAN_ORDER — Kontrak Data

**File:** `rifim-os/automation/apps-script/raosScanOrderSync.js`
**Sumber:** Supabase `public.scan_orders` (butuh SUPABASE_SERVICE_KEY di Script Properties Rifim-OS GAS)
**Window:** rolling 7 hari (configurable via Script Property `RAOS_SCAN_SYNC_DAYS`)
**Mode:** full replace tiap sync (clear + insert) — bukan append. Alasan: idempotent, no dup, simple mental model.

**Header 12 kolom (teal `#46BDC6` — align dg convention setupRaosSheets):**

| # | Kolom | Sumber |
|---|---|---|
| A | Scan ID | `scan_orders.scan_id` |
| B | Scanned At | `scan_orders.scanned_at` (formatted WIB) |
| C | Staff | `user_profiles.full_name` via `staff_id` |
| D | Driver ID | `scan_orders.driver_id` |
| E | Driver Nama | `raos_drivers.name` via `driver_id` |
| F | Pickup Point | `pickup_points.name` (T1/T2/T3) |
| G | Status | `valid` / `pending` / `rejected` |
| H | Koordinator | `user_profiles.full_name` via `koordinator_id` |
| I | Validated At | `scan_orders.validated_at` |
| J | Admin Checked | TRUE/FALSE |
| K | GMV | Rp format |
| L | Incentive | Rp format |

**Requirements di Supabase:**
- FK constraints ke `user_profiles(staff_id, koordinator_id)`, `drivers(driver_id)`, `pickup_points(pickup_point_id)` harus terdefinisi supaya PostgREST embed jalan. Kalau `_sbGet` return error `PGRST200`, fallback: query manual join di kode.
- Service role key bisa bypass RLS — pastikan Script Property `SUPABASE_SERVICE_KEY` Rifim-OS GAS terisi (bukan JWT legacy, harus `sb_secret_*` sesuai `rifim-os-supabase-rules`).

---

## 6. File Yang Ditambah / Diubah

Perubahan di working tree — belum di-commit. Push clasp/git setelah user review.

| Path | Aksi |
|---|---|
| `raos-menala/gas/25_pre_launch.gs` | **NEW** — cleanup RAOS |
| `raos-menala/gas/10_menu.gs` | **EDIT** — tambah menu item pre-launch |
| `rifim-os/automation/apps-script/preLaunchCleanup.js` | **NEW** — cleanup Rifim-OS + ensure RAOS_SCAN_ORDER tab |
| `rifim-os/automation/apps-script/raosScanOrderSync.js` | **NEW** — sync scan_orders → sheet |
| `rifim-os/automation/apps-script/raosMenuEngine.js` | **EDIT** — 3 menu item baru |
| `raos-menala/AUDIT_LAUNCH_20260901.md` | **NEW** — laporan ini |

---

## 7. Gap Merah untuk 1 Sep 2026

### 7a. Yang WAJIB user selesaikan dalam 72 jam

- [ ] Push GAS RAOS: `cd C:/MENALA/Repos/raos-menala/gas && clasp push`
- [ ] Push GAS Rifim-OS: `cd C:/MENALA/Repos/rifim-os/automation/apps-script && clasp push`
- [ ] Buka RAOS spreadsheet → run "🚀 Pre-Launch Cleanup"
- [ ] Buka Rifim-OS spreadsheet → run "🚀 Pre-Launch Cleanup"
- [ ] Rifim-OS spreadsheet → run "⏰ Setup Trigger Sync (15 menit)"
- [ ] Verify Script Property Rifim-OS GAS `SUPABASE_SERVICE_KEY` = `sb_secret_*` (bukan JWT lama)
- [ ] Verify Supabase secret RAOS `RAOS_VAPID_PUBLIC_KEY` + `RAOS_VAPID_PRIVATE_KEY` + `RAOS_VAPID_SUBJECT` terisi
- [ ] Set PIN Hendro (staff `/admin` → Set PIN)
- [ ] Set `user_profiles.branch_id` Hendro (sesi 21 debt)
- [ ] Enable Supabase "Leaked Password Protection" (sesi 21 debt)
- [ ] Isi sheet MASTER TARGET bulan September (deadline sebelum 1 Sep)
- [ ] Isi sheet RAOS_KPI_MANUAL kalau ada manual entry Aug (opsional)
- [ ] Test end-to-end 1 staff Soeta: login → scan → validate → cek RAOS_SCAN_ORDER tab
- [ ] Test end-to-end 1 staff Batam: login → `/isisaldo 100k` → cek Form Isi Saldo → Finance markProcessed → push notif tiba
- [ ] Broadcast pengumuman internal di room "Pengumuman" H-2

### 7b. Yang ideal tapi non-blocking

- [ ] Tambah kolom "Jabatan DIREKSI" di MASTER DATA STAFF sheet (sesi 21 debt)
- [ ] Service Worker cache-first strategy untuk offline READ (infra WRITE sudah ada)
- [ ] Rifim-OS Dashboard modul (`modules/dashboard/`) — masih kosong, boleh ditunda
- [ ] Uji rollback dari full backup (dry-run di test spreadsheet)

### 7c. Yang di-defer PASCA-launch

- Modul Rifim-OS: AI Assistant, CRM, Sistem, Smart Office — bukan critical path 1 Sep.
- Trigger `cekSLASaldo`/`cekSLASaldoPWA`/`cekSLAPotongan` Rifim-OS masih OFF (agar tidak WA duplikat) — reactivate setelah token & grup Fonnte terpisah.

---

## 8. Referensi

- Spreadsheet RAOS: <https://docs.google.com/spreadsheets/d/1eYS2mM3Sy-BNAVGfp8BUHtsZuLiGDetnJeGw-AWk__8>
- Spreadsheet Rifim-OS: <https://docs.google.com/spreadsheets/d/1jHeA-w1bM32S3-AU-ENN2UjiaCb4iLzRhaf4G7y4ozM>
- GAS RAOS project: `1iMN1ZGZVM0x2nSWmGMVx_umtEEzR-VQMwDZqK_pgHOzzOKVEprSN91jb`
- GAS Rifim-OS project: `1IK8-2anrxahce1X1MG7Bi3aGe6e-_4e3obanTRprT6brYSdla9rEYOxp`
- PWA RAOS: <https://raos-menala.vercel.app>
- PWA Rifim-OS: <https://rifim-os.vercel.app>
- Supabase: <https://supabase.com/dashboard/project/vlievtojpmrbsmzlqswl>

---

## 9. Bug Cleanup — 2026-08-29 (pass ke-2)

Setelah audit awal, saya jalankan scan sistematis (typecheck, lint, test suite, duplicate function detection). Yang ditemukan + di-fix:

### 9a. GAS RAOS — dead code

- `gas/07_backup.gs` `backupHarian()` sudah lama di-override secara silent oleh `gas/11_drive_sync.gs` (GAS load alphabetical, 11 > 07). Menu + trigger + web_api semua jalan ke versi 11. Versi 07 di-rename jadi `backupHarian_legacy_()` supaya tidak terlihat aktif tapi tetap ada untuk histori.

### 9b. GAS Rifim-OS — real bug (silent header loss)

**File:** `automation/apps-script/raosDriverLayer.js` vs `hrisLayer.js`

Dua file mendefinisikan 5 helper Supabase dengan nama sama tapi **signature `_sbHeaders` berbeda**:
- `hrisLayer.js:309`: `_sbHeaders(key, prefer)` — arg 1 = string API key
- `raosDriverLayer.js:470`: `_sbHeaders(extra)` — arg 1 = object header tambahan

Load alphabetical → raosDriverLayer menang → caller di hrisLayer yang pass `_sbHeaders(cfg.key, 'return=representation')` kehilangan `Prefer` header di `_sbPost`. Efek: HRIS create karyawan/document POST return kosong, kadang `_checkResponse` complain, kadang silent-fail.

**Fix:** helper di raosDriverLayer di-prefix `_rd_*` (rename 5 fungsi + 5 caller internal). hrisLayer sekarang satu-satunya pemilik global `_sb*`.

### 9c. GAS Rifim-OS — shadow helper

**File:** `driveManager.js` vs `setupDriveFolders.js` — dua-duanya define `_getOrCreateFolder(parentFolder, name)`. Signature sama, tapi driveManager delegate ke canonical helper (feature-rich), setupDriveFolders plain. Load alphabetical → setupDriveFolders menang → canonical path tidak dipakai.

**Fix:** setupDriveFolders + setupTemplates versi di-prefix `_setup_getOrCreateFolder` (rename def + 5 caller). driveManager tetap canonical.

### 9d. Verifikasi

| Check | Sebelum | Sesudah |
|---|---|---|
| RAOS GAS duplicate function names | 1 (backupHarian) | 0 |
| Rifim-OS GAS duplicate function names | 6 (_sb*×5 + _getOrCreateFolder) | 0 |
| RAOS PWA `tsc --noEmit` | PASS | PASS |
| RAOS PWA `eslint .` | 3 warnings (0 errors) | 3 warnings (pre-existing exhaustive-deps, non-blocking) |
| RAOS PWA test:access | PASS | PASS |
| RAOS PWA test:notifications | PASS | PASS |
| RAOS PWA test:unread | PASS | PASS |
| RAOS PWA test:schedule | PASS | PASS |
| RAOS PWA test:shift-window | PASS | PASS |
| RAOS PWA test:workflow | PASS | PASS |
| RAOS PWA test:work-reminders | PASS | PASS |
| RAOS PWA test:mobile | PASS | PASS |

### 9e. Files yang berubah di pass ke-2

- `raos-menala/gas/07_backup.gs` — rename fn + banner deprecation
- `rifim-os/automation/apps-script/raosDriverLayer.js` — prefix 5 helper + 5 caller
- `rifim-os/automation/apps-script/setupDriveFolders.js` — prefix helper + 2 caller
- `rifim-os/automation/apps-script/setupTemplates.js` — prefix 3 caller
- `raos-menala/AUDIT_LAUNCH_20260901.md` — seksi 9 ini

### 9f. Yang TIDAK saya sentuh (deliberate, alasan launch-safety)

- **3 warning `react-hooks/exhaustive-deps`** di `admin/soeta-kpi/page.tsx` (2) dan `chat/page.tsx` (1). Bukan bug — pola intentional (hindari infinite re-render tanpa useCallback). Fix akan restructure callback dan berisiko regresi 3 hari sebelum launch. Warnings only, bukan errors, tidak blok build.
- **Hardcoded secret scan** kedua repo: nihil (`eyJ*` JWT dan `sb_secret_*` tidak ditemukan di source). ✅
- **`MODULE_TYPELESS_PACKAGE_JSON` warning** dari 2 test node ESM: kosmetik, tidak bug. Fix optional: tambah `"type": "module"` di package.json — tapi bisa break commonjs consumers.

---

_Laporan ini adalah snapshot 2026-08-29. Update setelah tiap milestone (push GAS, run cleanup, uji end-to-end)._
