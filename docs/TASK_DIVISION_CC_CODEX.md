# TASK DIVISION — Claude Code Desktop vs Codex Desktop

> **Ruang lingkup:** Sinkronisasi kerja dua agent (Claude Code Desktop = **CC**, Codex Desktop = **CX**) untuk PWA **RAOS** (`raos-menala`) dan PWA **RIFIM OS** (`rifim-os`) agar keduanya tetap **terintegrasi satu SSoT** (Supabase + Google Sheets).
>
> **Prinsip inti:** CC pegang **kontrak & otak** (arsitektur, DB, RLS, RPC, dokumentasi, cross-repo integrity). CX pegang **implementasi & tangan** (UI React/HTML, styling, form, refactor komponen, unit test). Setiap perubahan yang menyentuh **kolom / enum / endpoint** yang dipakai kedua PWA **WAJIB** melalui CC lebih dulu (kontrak berubah), CX menyusul (UI ikut).
>
> **Aturan mutlak:** Baik CC maupun CX **DILARANG** menyentuh area di luar kavling masing-masing tanpa konfirmasi. Kalau ragu → STOP → tanya user.

Versi: 1.0 · Terakhir diperbarui: 2026-08-05 · Branch aktif: `claude/pwa-raos-rifim-task-division-730bij`

---

## 1. Filosofi Pembagian

| Aspek | Claude Code Desktop (CC) | Codex Desktop (CX) |
|---|---|---|
| **Peran utama** | Lead Software Architect + DB Owner | Frontend/UI Implementer + Refactor Bot |
| **Kekuatan** | Reasoning multi-step, konteks besar, konsistensi arsitektur, RLS/RPC, cross-repo integrity | Iterasi UI cepat, pola CRUD berulang, styling, test skeleton |
| **Kalau ragu** | Buka STATUS.md → CLAUDE.md → tanya user | Buka file yang mirip → ikuti pola existing → jangan improvisasi kontrak |
| **DILARANG** | Ubah styling per pixel tanpa spec DDS | Ubah schema Supabase, RPC signature, atau enum kontrak |
| **Model default** | `claude-opus-*` (thinking on) | GPT-5 Codex |
| **Working directory** | Root repo (bisa lompat antar repo) | Sub-folder komponen / halaman terisolasi |

**Mnemonic:** *"CC menulis kontrak, CX menulis komponen. Kontrak berubah dulu, komponen menyusul."*

---

## 2. Matriks 15 Kategori — Pemegang Tanggung Jawab

| # | Kategori | Owner utama | Owner pendamping | Alasan pemisahan |
|---|---|---|---|---|
| 1 | **Pengembangan** (fitur baru) | CC (design + backend) | CX (UI + form) | Fitur baru butuh kontrak dulu, baru render |
| 2 | **Perubahan** (existing behavior) | CC kalau touch kontrak; CX kalau UI-only | — | Kalau ubah kolom/enum/endpoint = CC. Kalau ubah warna/label/layout = CX |
| 3 | **Perbaikan** (bug fix) | CC untuk bug logic/DB/RLS/security | CX untuk bug UI/form/state komponen | Root cause menentukan owner |
| 4 | **Pembangunan** (engine baru) | CC (100%) | — | Engine = arsitektur inti, tidak boleh dibangun ad-hoc |
| 5 | **Rule Projek** (PROJECT_RULES.md, CLAUDE.md, RULE_PROJECT.md) | CC | — | CX boleh baca, dilarang edit |
| 6 | **STATUS.md** | CC (di akhir sesi) | CX (append entry saat commit) | CC yang rekonsiliasi, CX yang lapor progress harian |
| 7 | **Infrastruktur** (env, secrets, CI/CD, Vercel config, GH Actions) | CC | — | Sensitif — hanya 1 agent yang boleh sentuh |
| 8 | **Local Folder** (struktur direktori) | CC | CX (dalam folder yang sudah dibuat CC) | CC yang bikin folder baru; CX tinggal isi |
| 9 | **GitHub** (branch, PR, review, merge) | CC (PR desc + review) | CX (commit + push feature branch) | CC pegang narasi PR, CX push fisik commit |
| 10 | **Vercel** (deploy config, env vars, domain) | CC | — | Production surface — 1 pemilik |
| 11 | **Supabase** (schema, RLS, RPC, migration, trigger, edge function) | CC | — | **CX DILARANG** apply_migration atau execute_sql non-read |
| 12 | **GAS Script** (backend cron, sync, sheet integration) | CC | CX (refactor kecil di util) | GAS = backend, arsitektural |
| 13 | **Spreadsheet** (schema kolom, tab baru, formula master) | CC | CX (isi seed data / template row) | Schema sheet = kontrak visual sama pentingnya dengan DB |
| 14 | **Google Drive** (folder struktur, naming convention, backup path) | CC | — | Sudah didefinisikan di CLAUDE.md; jangan buat folder liar |
| 15 | **Automation** (bookmarklet, cron trigger, edge function, WA template) | CC | CX (asset bookmarklet, HTML install page) | Logic = CC, presentation = CX |

**Aturan grey zone:** Kalau sebuah task menyentuh **≥3 kategori sekaligus**, otomatis CC yang pegang → CC boleh delegasi sub-task UI ke CX via PR review comment.

---

## 3. Pembagian per Halaman — PWA RAOS (`raos-menala/apps/pwa/src/app/`)

Format: **Halaman → CC scope → CX scope → Sync point ke Rifim-OS**

### 3.1 `/` (Login) — `src/app/page.tsx`

| Fungsi | CC | CX | Sync ke Rifim-OS |
|---|---|---|---|
| Validasi email vs `email_is_registered_staff` RPC | ✅ (RPC + PIN → password sync) | — | user_profiles = mirror employees Rifim-OS |
| Form login UI (input, error state, loading) | — | ✅ | — |
| Magic link fallback + reset-password flow | ✅ | CX render halaman `/reset-password` | — |
| Redirect role-based post-login | ✅ (mapping role→route) | CX implement redirect | — |

### 3.2 `/dashboard` — `src/app/dashboard/page.tsx`

| Fungsi | CC | CX | Sync ke Rifim-OS |
|---|---|---|---|
| Query stats (scan_orders count, saldo_requests SUM, attendance today) | ✅ (SQL / view / RPC) | — | Dashboard Direktur Rifim-OS baca view yang sama |
| Card layout, chart (donut, mini calendar) | — | ✅ | — |
| DateTimeHeader realtime tick 1s | — | ✅ | — |
| Cache-first hook (`useApiCache`) | ✅ (lib) | CX pakai di komponen | — |

### 3.3 `/scan` — `src/app/scan/page.tsx`

| Fungsi | CC | CX | Sync ke Rifim-OS |
|---|---|---|---|
| Insert `scan_orders` + validasi geofence (hard-block staff > radius+500m) | ✅ | — | Finance KPI Order (Soeta) baca `scan_orders` |
| GPS tiered (`requestLocationTiered`) | ✅ (lib/gps.ts) | CX konsumsi | — |
| `BarcodeScanner` component (html5-qrcode wrapper) | — | ✅ (jangan restart on parent re-render, pattern ref) | — |
| Loading/error UI, success toast | — | ✅ | — |
| Offline queue enqueue `scan_order` | ✅ (idempotency UNIQUE key) | CX trigger enqueue | — |

### 3.4 `/absensi` — `src/app/absensi/page.tsx`

| Fungsi | CC | CX | Sync ke Rifim-OS |
|---|---|---|---|
| Insert `raos_attendance` (in/out) + selfie upload bucket `selfies` | ✅ | — | HRIS Rifim-OS attendance module baca `raos_attendance` (read-only) |
| Trigger broadcast pesan chat ke room 'Absensi' | ✅ (DB trigger) | — | — |
| Camera capture UI + preview | — | ✅ | — |
| Radius display + hard-block modal | ✅ logic | CX render modal | — |

### 3.5 `/riwayat` — `src/app/riwayat/page.tsx`

| Fungsi | CC | CX | Sync ke Rifim-OS |
|---|---|---|---|
| Query 3 tab (Scan, Absensi, Isi Saldo) + filter pin kuning/hijau/merah | ✅ (query optimization) | CX tab UI | Rifim-OS Finance Isi Saldo tab baca `raos_saldo_requests` sama |
| Infinite scroll / pagination logic | ✅ | CX komponen | — |
| Empty state, skeleton loader | — | ✅ | — |

### 3.6 `/chat` — `src/app/chat/page.tsx`

| Fungsi | CC | CX | Sync ke Rifim-OS |
|---|---|---|---|
| RPC `get_chat_rooms_for_user` + `mark_chat_room_read` + `get_or_create_pribadi_room` | ✅ | — | Rifim-OS **belum** punya chat; kalau nanti butuh reuse RPC yang sama |
| Realtime subscribe `chat_messages` + `chat_message_reads` + `raos_driver_queue` + `raos_saldo_requests` | ✅ (publication + policy) | CX handler UI | — |
| Slash command parser (`/isisaldo`, `/antri`, `/panggil`, `/selesai`, `/keluar`) | ✅ (lib/saldoRequest.ts, lib/driverQueue.ts) | CX render bubble | — |
| `IsiSaldoBottomSheet` (cek `activeRoomBranch` bukan user.branch) | ✅ logic branch context | CX bottom sheet UI | Rifim-OS Isi Saldo pakai enum nominal yg sama |
| Mention @nama autocomplete | ✅ regex parser + payload | CX dropdown + render span | — |
| Voice message (MediaRecorder + upload `chat_attachments`) | ✅ bucket policy | CX record button + player | — |
| Retensi chip button (Tidak/7/30/90 hari) | ✅ RPC `set_chat_room_retention` | CX chip UI | — |
| Read receipt centang (`Check`/`CheckCheck` sky-300) | ✅ RPC `get_message_readers` | CX centang UI + modal | — |
| Optimistic append + dedup by id | ✅ pattern | CX apply | — |

### 3.7 `/settings` — `src/app/settings/page.tsx`

| Fungsi | CC | CX | Sync ke Rifim-OS |
|---|---|---|---|
| Upsert `user_profiles.notification_prefs` jsonb | ✅ (schema + trigger) | CX form | Rifim-OS profil user pakai kolom yang sama |
| Filter kategori push (7 field: master, scan_berhasil, scan_pending, validasi_koordinator, pengingat_absen, pengumuman, chat_room) | ✅ mapping label→key | CX toggle UI | — |
| Reminder Absensi 6 waktu per shift | ✅ AppPrefs schema | CX 3 group time input UI | — |
| Ukuran teks preference | — | ✅ (localStorage only) | — |
| Halaman `/settings/bantuan` FAQ collapsible | — | ✅ (konten statis) | — |

### 3.8 `/admin` — `src/app/admin/page.tsx`

| Fungsi | CC | CX | Sync ke Rifim-OS |
|---|---|---|---|
| Validasi scan (invokePush ke staff_id) | ✅ | — | — |
| Kelola staff (edit `branch_id`, `is_active` via policy `user_profiles_update_admin`) | ✅ RLS | CX form modal | Rifim-OS HRIS edit `employees` (sisi lain) |
| `CreateProyekRoomModal` + branch dropdown + member picker | ✅ RPC `create_proyek_room` | CX modal UI | — |
| Bulk-create room per cabang (RPC `seed_room_per_branch`) | ✅ | CX button | — |
| Tombol 🎲 Random Assign Driver → Staff (RPC `raos_random_assign_drivers`) | ✅ RPC + role gate | CX button + confirm dialog | Rifim-OS Finance DB Driver tab konsumsi assignment ini |

### 3.9 `/admin/barcodes` — Barcode generator driver

| Fungsi | CC | CX | Sync ke Rifim-OS |
|---|---|---|---|
| Generator QR (Engine `qrEngine.js`) | ✅ | — | — |
| Print layout (A4 sheet, kartu individu) | — | ✅ | — |

### 3.10 `/validasi-saldo` — Approve/reject saldo per cabang

| Fungsi | CC | CX | Sync ke Rifim-OS |
|---|---|---|---|
| Query + filter status per branch scope | ✅ (`is_branch_in_scope`) | CX filter UI | Rifim-OS Finance tab 🎯 Isi Saldo baca table yang sama |
| Approve/reject inline action (UPDATE `raos_saldo_requests`) | ✅ RLS koord+ | CX button + optimistic UI | — |
| Total per status card | ✅ query | CX card render | — |

### 3.11 `/antrian-driver` — Real-time queue monitor

| Fungsi | CC | CX | Sync ke Rifim-OS |
|---|---|---|---|
| Subscribe `raos_driver_queue` postgres_changes | ✅ publication | CX subscribe handler | Rifim-OS **belum** butuh (bisa direplikasi nanti) |
| RPC `raos_call_driver`, `raos_complete_queue`, `raos_leave_queue` inline button | ✅ RPC | CX button UI | — |
| Sort by position + status badge | ✅ query order | CX render | — |

### 3.12 `/kpi` — KPI staff dashboard

| Fungsi | CC | CX | Sync ke Rifim-OS |
|---|---|---|---|
| Query `kpi_targets` + view `raos_target_tercapai_bulan` + `raos_driver_active_days_bulan` | ✅ | CX chart | Rifim-OS Finance tab 👤 Target Staff baca view yang sama |
| Filter bulan + cabang | ✅ (branch scope) | CX filter | — |
| Chart per pilar (Order/Saldo/BSK/BPB) | — | ✅ | — |

### 3.13 `/laporan` — Export xlsx/PDF

| Fungsi | CC | CX | Sync ke Rifim-OS |
|---|---|---|---|
| Aggregate query per periode | ✅ view/RPC | — | — |
| Export xlsx (SheetJS) + PDF (Document Engine via GAS) | ✅ engine call | CX button + download | Document Engine sama antara RAOS & Rifim-OS |

### 3.14 `/status` — Donut chart validasi

| Fungsi | CC | CX | Sync ke Rifim-OS |
|---|---|---|---|
| Query aggregate scan status | ✅ | — | — |
| Donut chart + legend | — | ✅ | — |

### 3.15 `/drivers` — CRUD driver

| Fungsi | CC | CX | Sync ke Rifim-OS |
|---|---|---|---|
| Insert/edit `raos_drivers` (kolom RAOS-only: phone, vehicle_type, vehicle_plate, barcode, branch_id) | ✅ RLS | CX form modal | Sheet Database Driver Airport (SSoT) via GAS sync |
| Filter aktif/nonaktif + search | ✅ query | CX filter UI | — |
| Modal bottom-sheet padding `calc(96px + env(safe-area-inset-bottom))` | — | ✅ konvensi UI | — |

### 3.16 `/notifications` — Notif list

| Fungsi | CC | CX | Sync ke Rifim-OS |
|---|---|---|---|
| Query `notifications` table | ✅ trigger insert | CX list render | Rifim-OS notif center pakai table yang sama |
| Mark as read | ✅ RPC | CX button | — |

### 3.17 `/reset-password` — Set password dari magic link

| Fungsi | CC | CX | Sync ke Rifim-OS |
|---|---|---|---|
| Supabase auth updateUser | ✅ | CX form | — |
| PIN validation ≥6 digit numeric | ✅ rule | CX validasi client | — |

### 3.18 Manifest halaman (`/manifest-{staff,koord,mgmt,direksi,driver}`)

| Fungsi | CC | CX | Sync ke Rifim-OS |
|---|---|---|---|
| PWA manifest per role (icon, start_url, scope) | ✅ konfig | — | — |
| Icon asset generator | — | ✅ `scripts/generate-icons.js` | — |

### 3.19 `/driver-workspace` — Driver mode

| Fungsi | CC | CX | Sync ke Rifim-OS |
|---|---|---|---|
| Query driver-specific dashboard | ✅ | CX render | — |
| Quick action buttons (join queue, isi saldo) | ✅ command wrapper | CX button UI | — |

---

## 4. Pembagian per Modul — PWA RIFIM OS (`rifim-os/modules/`)

Format sama: **Modul → CC scope → CX scope → Sync point ke RAOS**

### 4.1 `modules/finance/index.html`

| Tab / Fungsi | CC | CX | Sync ke RAOS |
|---|---|---|---|
| Endpoint `finance_kpi_target_branch_list/upsert` | ✅ `crmApi.js` | — | RPC `raos_compute_payroll_month` konsumsi table ini |
| Endpoint `finance_kpi_target_staff_list/upsert` | ✅ | — | View `raos_target_tercapai_bulan` join |
| Endpoint `finance_payroll_compute/list` | ✅ RPC wrapper | — | Table `raos_payroll` |
| Endpoint `finance_drivers_list` + `finance_driver_assignment_list` | ✅ | — | `raos_drivers` + `raos_driver_staff_assignment` |
| Endpoint `finance_driver_assign_random` (management-only hard check) | ✅ role gate + RPC call | — | RPC `raos_random_assign_drivers` |
| Tab **🎯 Target Cabang** — table + edit modal | — | ✅ (pakai `openEditModal` helper) | — |
| Tab **👤 Target Staff** — 14 kolom + filter + override modal | — | ✅ | — |
| Tab **🚗 DB Driver** — filter + search + random-assign button | — | ✅ | — |
| Tab **Isi Saldo (RAOS)** — proxy list `raos_saldo_requests` | ✅ endpoint | CX table render | — |
| Helper `openEditModal({title, fields, onSave, onDelete})` | ✅ pattern | CX apply di setiap CRUD | — |
| Modal broadcast `raos-saldo-new` (BroadcastChannel API) | ✅ event schema | CX listener | RAOS PWA fire broadcast |

### 4.2 `modules/hris/index.html`

| Fungsi | CC | CX | Sync ke RAOS |
|---|---|---|---|
| Endpoint `hris_payroll_bonus_list` | ✅ | — | Map by staff_code → `user_profiles.staff_id` RAOS |
| Kolom baru **Bonus Saldo RAOS** + **Bonus KPI RAOS** di tabel Payroll | — | ✅ | Cross-fetch `raos_payroll` |
| Modal Buat Payroll — tombol 🔄 Auto-fill dari Bonus RAOS | ✅ logic fetch | CX button + populate field | — |
| Sync SSoT MASTER DATA STAFF → `employees` | ✅ `hrisMasterStaffSync.js` (10 menit trigger) | — | `user_profiles` RAOS sync dari sheet yang SAMA |
| Tombol "Sync Sekarang" | ✅ endpoint | CX button | — |
| Attendance module (read-only view `raos_attendance`) | ✅ | CX table | — |

### 4.3 `modules/crm/index.html`

| Fungsi | CC | CX | Sync ke RAOS |
|---|---|---|---|
| Endpoint CRM (customer, lead, opportunity) | ✅ | — | RAOS **belum** integrate — future scope |
| Table + form CRUD | — | ✅ (reuse `openEditModal`) | — |

### 4.4 `modules/dashboard/index.html`

| Fungsi | CC | CX | Sync ke RAOS |
|---|---|---|---|
| Query dashboard direktur (aggregate 3 perusahaan) | ✅ | — | Read view yang sama dgn RAOS dashboard |
| KPI card, trend chart, alert banner | — | ✅ (dataviz skill) | — |
| Filter cabang, periode, perusahaan | ✅ scope logic | CX filter UI | — |

### 4.5 `modules/raos/index.html`

| Fungsi | CC | CX | Sync ke RAOS |
|---|---|---|---|
| Portal RAOS versi web (bukan PWA) — read-only mirror | ✅ endpoint bridge | CX layout | Cross-repo — konsumsi endpoint RAOS via `crmApi.js` |
| Link ke PWA RAOS Vercel | — | ✅ deeplink | — |

### 4.6 `modules/smart-office/index.html`

| Fungsi | CC | CX | Sync ke RAOS |
|---|---|---|---|
| Document Engine trigger (HTML→PDF via GAS) | ✅ engine call | CX form input | RAOS pakai engine yang sama |
| Placeholder Engine input | ✅ | CX UI | — |
| Numbering Engine display | ✅ auto-generate | CX display | — |
| Approval workflow state machine | ✅ Approval Engine | CX state badge | — |
| Revision Engine (versioning) | ✅ | CX diff view | — |
| Audit Engine display (log immutable) | ✅ engine | CX table | — |

### 4.7 `modules/ai-assistant/index.html`

| Fungsi | CC | CX | Sync ke RAOS |
|---|---|---|---|
| Claude API integration + prompt caching (`anthropic-beta: prompt-caching-2024-07-31`) | ✅ (lihat CLAUDE.md §AI API Integration) | — | — |
| Cache_control ephemeral pada system message | ✅ | — | — |
| Chat bubble UI + streaming | — | ✅ | — |

### 4.8 `modules/portal/index.html`

| Fungsi | CC | CX | Sync ke RAOS |
|---|---|---|---|
| Login portal (RCP 4-level auth) | ✅ Auth Engine RCP | CX form | RAOS pakai auth Supabase native (bukan RCP), tapi user_profiles → employees mirror |
| Role-based menu | ✅ mapping | CX menu render | — |

### 4.9 `modules/sistem/index.html`

| Fungsi | CC | CX | Sync ke RAOS |
|---|---|---|---|
| System log viewer | ✅ query `system_log` sheet | CX table | RAOS `system_logs` (beda table, cross-view) |
| Config editor (Spreadsheet SISTEM CONFIG) | ✅ read/write via GAS | CX form | RAOS `system_config` |

---

## 5. Kolom Tabel Kritis — Sync Points Cross-Repo

**Konvensi:** Setiap kolom di tabel/sheet berikut adalah **kontrak lintas-repo**. Perubahan nama, tipe, atau enum **WAJIB** dilakukan CC dalam 1 commit yang menyentuh **3 sisi sekaligus**: (a) migration Supabase, (b) endpoint `crmApi.js` (Rifim-OS), (c) query PWA RAOS (`raos-menala`).

### 5.1 `user_profiles` (Supabase, milik RAOS, dipakai HRIS Rifim-OS via sync)

| Kolom | Tipe | Owner edit | Konsumer | Aturan CC | Aturan CX |
|---|---|---|---|---|---|
| `id` | uuid | Supabase Auth | RAOS + Rifim-OS | Immutable | Jangan pernah ubah |
| `email` | text | Auth | RAOS + Rifim-OS | Format lowercase | Validasi client |
| `staff_id` | text (kode staff dari sheet) | GAS sync SSoT | Rifim-OS `employees.staff_code` cross-key | UPPERCASE, unique | Display only |
| `full_name` | text | Sheet MASTER DATA STAFF | RAOS + Rifim-OS | Sync-only, `source=ssot_master_staff` block manual edit | Display only |
| `role` | enum | Sheet | RAOS RLS + Rifim-OS RCP mapping | Enum: `staff/koordinator/admin/direksi/management` | Filter, tidak edit |
| `branch_id` | uuid | `/admin` PWA RAOS | RAOS RLS scope | Bisa edit via policy admin | Form dropdown |
| `phone` | text | Sheet | RAOS + WA Fonnte | Sync-only | Display |
| `pin` (→ password Auth) | text ≥6 digit | Sheet kolom H | Auth Supabase | Sync 1 jam | Validasi client `inputMode=numeric` |
| `notification_prefs` | jsonb | User via `/settings` | Edge Function `raos-send-push` | Schema 7 field | Toggle UI |
| `source` | enum `manual\|ssot_master_staff` | GAS sync | Guard trigger | Auto-set | Read-only |
| `is_active` | bool | Admin | RLS + queries | Soft-delete only | Toggle admin form |
| `avatar_url` | text | User upload | RAOS chat/profile | RAOS-only, tidak di sheet | Upload form |

### 5.2 `raos_saldo_requests` (Supabase, milik RAOS, dipakai Finance Rifim-OS)

| Kolom | Tipe | Aturan sync | CC | CX |
|---|---|---|---|---|
| `id` | uuid | — | ✅ generate | Display |
| `staff_id` | uuid FK user_profiles | Insert via `/isisaldo` command | ✅ RLS insert staff | Chat parser |
| `branch_id` | uuid FK branches | Auto dari activeRoomBranch (BUKAN user branch) | ✅ policy | Chat context |
| `nominal` | int | Validate against `branches.saldo_nominal_options` | ✅ allowedNominals check | Chip UI di IsiSaldoBottomSheet |
| `status` | enum `pending/approved/rejected` | Koord+ update via `/validasi-saldo` | ✅ RLS koord+ | Button UI |
| `is_processed` | bool | Admin centang via sheet kolom I ATAU AIST bookmarklet | ✅ trigger BEFORE UPDATE dispatch push + auto-chat | Bookmarklet install page |
| `processed_at` | timestamptz | Auto | ✅ trigger set | Display |
| `processed_by` | uuid | Auto (auth.uid()) | ✅ trigger | Display |
| `auto_chat_posted` | bool | Auto | ✅ trigger flag | Read-only |
| `client_id` | uuid | Idempotency saat offline replay | ✅ UNIQUE | Offline queue |

**Sync Point:**
- Rifim-OS `finance_saldo_raos_list` endpoint → proxy read table ini
- Rifim-OS `finance_saldo_raos_mark_paid` endpoint → PATCH `is_processed=true`
- Bookmarklet AIST v2 → tulis via kedua endpoint di atas (bukan langsung Supabase)
- BroadcastChannel `raos-saldo-new` → fire di RAOS PWA saat insert, listen di Rifim-OS Finance tab

### 5.3 `raos_payroll` (Supabase, hasil compute, dipakai HRIS Rifim-OS)

| Kolom | Tipe | Sumber | CC | CX |
|---|---|---|---|---|
| `staff_id` | uuid | Loop semua staff aktif | ✅ RPC | — |
| `effective_month` | date | Input p_month | ✅ | — |
| `gapok` | numeric | Sheet payroll config | ✅ read config | — |
| `bonus_saldo` | numeric | Tier formula (<80/80-89/90-99/≥100%) | ✅ hardcoded di RPC | — |
| `bpjs` | numeric | Config | ✅ | — |
| `paket_data` | numeric | Config | ✅ | — |
| `member_parkir` | numeric | Override `raos_kpi_targets_staff` | ✅ | — |
| `bonus_kpi` | numeric | Tier formula driver active days | ✅ | — |
| `thp` | GENERATED | SUM above | ✅ formula immutable | Display only |
| `target_pct` | numeric | Compute | ✅ | Display |
| `driver_active_pct` | numeric | Compute | ✅ | Display |
| `status_target` | enum `belum/tercapai/na` | Compute | ✅ | Badge UI |

**Konsumer:** HRIS Payroll tabel Rifim-OS (2 kolom baru: Bonus Saldo RAOS, Bonus KPI RAOS) via endpoint `hris_payroll_bonus_list`.

### 5.4 `raos_kpi_targets_branch` + `raos_kpi_targets_staff` (target V2)

| Tabel | Kolom kritis | CC | CX |
|---|---|---|---|
| `raos_kpi_targets_branch` | `branch_id`, `effective_month`, `target_cabang`, `target_staff_default`, `mode` | ✅ RLS + schema | Rifim-OS Finance Target Cabang modal |
| `raos_kpi_targets_staff` | `staff_id`, `effective_month`, `target_saldo`, `member_parkir_amount` | ✅ (override) | Rifim-OS Finance Target Staff modal |

**Aturan penting:** `mode='saldo'` untuk cabang non-Soeta (Pilar 1 = SUM nominal), `mode='order'` untuk Soeta (Pilar 1 = COUNT scan_orders). CX **DILARANG** hardcode mode — selalu fetch dari row.

### 5.5 `raos_driver_staff_assignment`

| Kolom | Owner | CC | CX |
|---|---|---|---|
| `driver_id` UNIQUE | RPC `raos_random_assign_drivers` | ✅ Fisher-Yates + round-robin | — |
| `staff_id` | idem | ✅ management-only | — |
| `branch_id` | idem | ✅ | — |

**Konsumer:** Rifim-OS Finance tab DB Driver (grouped per staff).

### 5.6 `chat_messages` (shared future — RAOS aktif, Rifim-OS belum)

| Kolom | Aturan | CC | CX |
|---|---|---|---|
| `sender_id` FK ke user_profiles | Embed WAJIB pakai FK name eksplisit `user_profiles!chat_messages_sender_id_fkey(...)` | ✅ pattern | Apply konsisten |
| `pinned_by` FK ke user_profiles | Embed WAJIB pakai `chat_messages_pinned_by_fkey` | ✅ | — |
| `type` | enum extend: `text/image/audio/saldo_request/driver_queue` | ✅ enum owner | Chat bubble per type |
| `mentions` | uuid[] | Regex parser `(?:^\|\s)@([\w.\-]*)$` | ✅ trigger push khusus | Autocomplete UI |
| `client_id` | uuid idempotency | ✅ UNIQUE | Offline replay |

### 5.7 Sheet Kolom Kritis (Spreadsheet SSoT)

| Sheet | Kolom kritis | Owner | Sync target |
|---|---|---|---|
| MASTER DATA STAFF | A staff_id, B full_name, C role, D ID CABANG, E phone, H PIN, dll | HR manual | → `user_profiles` (RAOS) + `employees` (Rifim-OS) |
| Database Driver Airport | 7 tab per cabang | Ops manual | → `raos_drivers` (via `12_driver_airport_sync.gs`) |
| Form Isi Saldo (RAOS spreadsheet) | 15 kolom gabungan | Sync 5 menit | Mirror `raos_saldo_requests` |
| MASTER TARGET | B target order, C target saldo Rp per cabang | Finance manual | → `raos_kpi_targets_branch` |
| RAOS_KPI_MANUAL | briefing/edukasi/problem/pelayanan/kerapian/pelanggaran per staff | Koord manual | → `kpi_targets` |
| Form Input Saldo PWA + AIST (RIFIM OS spreadsheet) | Belum dipakai — kosong sampai staff RIFIM OS PWA release | — | Future |

**Aturan:** Kalau CC tambah kolom baru di sheet → **WAJIB** update juga di:
1. `PROJECT_RULES.md` §Sheet Schema
2. Migration Supabase (kolom mirror)
3. Endpoint `crmApi.js` yang expose
4. Query PWA yang konsumsi

---

## 6. Protokol Sinkronisasi Cross-Repo

### 6.1 Branch Strategy

- Setiap sesi cross-repo pakai **branch identik** di kedua repo: `claude/<slug>-<hash>`
- CC create branch di **kedua repo bersamaan** (walau baru ada perubahan di satu sisi)
- CX push commit ke branch yang **sudah dibuat CC** — jangan bikin sendiri
- Merge PR **kedua repo dalam 1 hari** — jangan biarkan PR di satu sisi merged sedang sisi lain masih open >24 jam

### 6.2 Commit Sequence untuk Perubahan Kontrak

Kalau ada perubahan yang menyentuh kontrak lintas repo, urutan wajib:

1. **CC — Supabase migration** (schema/RLS/RPC change)
2. **CC — GAS backend** (`crmApi.js` endpoint + `_gasValidate()` + `_gasWithLock()`)
3. **CC — GAS redeploy** (⚠️ MANUAL — lihat CLAUDE.md rifim-os §Redeploy)
4. **CC — PWA RAOS backend** (query, RPC call, RLS check di client)
5. **CX — PWA RAOS UI** (component, form, table)
6. **CX — PWA Rifim-OS UI** (module HTML + endpoint call)
7. **CC — Update STATUS.md + CLAUDE.md** di kedua repo
8. **CC — PR review + merge**

**JANGAN:** commit UI (step 5-6) sebelum kontrak (step 1-4) landed.

### 6.3 Contract Change Rules

Perubahan berikut = **CONTRACT CHANGE** → CC eksklusif:

- Tambah/rename/hapus kolom di Supabase table yang dipakai kedua PWA
- Ubah enum value (mis. `raos_saldo_requests.status`)
- Rename RPC atau ubah signature
- Tambah/hapus endpoint di `crmApi.js`
- Ubah struktur JSON `notification_prefs`
- Ubah nama/struktur sheet SSoT
- Ubah kategori push notification
- Ubah `type` di `chat_messages`

Perubahan berikut = **NON-CONTRACT** → CX boleh:

- Warna, spacing, font size (selama pakai token DDS)
- Label UI (i18n Indonesian text)
- Layout responsive (mobile-first)
- Icon swap (dari Lucide → Lucide varian lain)
- Loading state, skeleton, toast
- Form validation client-side (di atas yang server sudah validate)
- Unit test scaffolding
- Refactor internal komponen tanpa ubah props

### 6.4 Handoff CC → CX

Setelah CC selesai kontrak, tulis **handoff comment** di PR body:

```
## Handoff ke CX

**Endpoint baru:**
- `finance_kpi_target_branch_upsert&branch_id=&month=&target_cabang=&target_staff_default=&mode=`
  → response `{ok:true, data:{...}}` atau `{ok:false, error:'...'}`

**Component yang perlu dibuat:**
- `modules/finance/index.html` tab "🎯 Target Cabang"
  - Table 5 kolom: Cabang · Target Cabang · Target Staff Default · Mode · Aksi
  - Modal edit pakai helper `openEditModal({...})`

**Konvensi yang WAJIB diikuti:**
- Pakai `openEditModal` bukan native `prompt`
- Fetch pakai token dari `getGasToken()`
- Error handling: alert `error.message` + log console
- Loading state: disable tombol + spinner icon

**File touched CC:**
- `automation/apps-script/crmApi.js` +2 endpoint
- Migration `raos_070a`

**File yang CX perlu edit:**
- `modules/finance/index.html`
```

### 6.5 Handoff CX → CC

Setelah CX push UI, tulis **verification checklist** di PR body:

```
## Verification untuk CC

- [ ] Endpoint call ke `finance_kpi_target_branch_upsert` — response 200
- [ ] RLS enforce: user admin bisa, user koord ditolak (test 2 akun)
- [ ] Sinkron ke RAOS: setelah upsert, RPC `raos_compute_payroll_month` picks up
- [ ] Broadcast `raos-saldo-new` fire di listener CX (test manual)
- [ ] STATUS.md updated (bagian sesi hari ini)
- [ ] CLAUDE.md updated kalau ada pola konvensi baru
```

---

## 7. Rule Projek — Point of Truth per Repo

| Dokumen | Owner | Isi | Kapan update |
|---|---|---|---|
| `rifim-os/CLAUDE.md` | CC | Operating manual Rifim-OS | Setiap sesi baru CC append entri sesi terbawah |
| `rifim-os/PROJECT_RULES.md` | CC | Business rules BR-01..BR-10 + Integration Rules 40..47 | Kalau rule bertambah/berubah |
| `rifim-os/docs/STATUS.md` | CC (rekonsiliasi) + CX (append entry) | Sprint aktif, backlog, temuan | Setiap commit |
| `raos-menala/CLAUDE.md` | CC | Operating manual RAOS | Idem |
| `raos-menala/RULE_PROJECT.md` | CC | Rule RAOS spesifik | Kalau rule baru |
| `raos-menala/STATUS.md` | CC + CX | Sprint RAOS | Setiap commit |
| `raos-menala/SESSION_PROMPT.md` | CC | Resumable prompt sesi | Setiap sesi selesai |
| **Dokumen ini** (`TASK_DIVISION_CC_CODEX.md`) | CC | Pembagian tugas CC vs CX | Kalau pola division berubah |

**Aturan STATUS.md:**
- Setiap sesi, CC append section baru di bawah: `## Sesi YYYY-MM-DD - <topik>`
- CX append task selesai sebagai bullet: `- ✅ <deskripsi> — commit <hash>`
- CC rekonsiliasi di akhir sesi: pindahkan task pending ke Backlog

---

## 8. Infrastruktur — Zona CC

| Surface | Yang boleh diubah | Owner |
|---|---|---|
| Vercel env vars | `NEXT_PUBLIC_*` (public), semua secret | CC only |
| Vercel domain | Custom domain, alias | CC only |
| Vercel deployment protection | On/off, allowed users | CC only |
| Supabase Vault secrets | `raos_service_role_key` (WAJIB pakai `sb_secret_*` bukan JWT legacy) | CC only |
| Supabase Edge Function env | `RAOS_VAPID_*` prefix | CC only |
| Supabase Auth settings | Leaked password protection, MFA, SMTP | CC only |
| GitHub Actions workflow | `.github/workflows/*` | CC only |
| GitHub branch protection | `main` require review, no force push | CC only |
| GitHub secrets | Semua | CC only |
| `.env.local` di dev | CC generate, CX pakai | CC bikin, CX copy |
| GAS Script Properties | `SUPABASE_SERVICE_KEY`, `FONNTE_TOKEN`, dll | CC only |
| GAS Advanced Services | Drive v2, Slides v1 | CC only |
| GAS deploy version | Manual redeploy di editor | CC only |

**Kalau CX butuh env var baru:** buka PR draft yang berisi request → CC review → CC yang set di dashboard → CC comment "env set" → CX baru merge.

---

## 9. Local Folder — Struktur & Aturan

### 9.1 Path standar (tidak boleh keluar)

- **CC:** `C:\Projects\menala\rifim-os\`, `C:\Projects\menala\RAOS\`
- **CX:** subfolder yang **sudah CC buat**. Contoh:
  - `apps/pwa/src/components/`
  - `apps/pwa/src/app/<page>/`
  - `modules/<modul>/`
- **DILARANG** (untuk kedua agent): buat file di Desktop, Downloads, `/tmp` sistem
- File temporary: `temp/` di dalam repo, ditambahkan ke `.gitignore`

### 9.2 File yang CX boleh create

- `apps/pwa/src/components/**/*.tsx`
- `apps/pwa/src/app/<page>/components/*.tsx`
- `modules/<modul>/components/*.html`
- Assets di `public/images/`

### 9.3 File yang CX DILARANG create/edit

- `apps/pwa/src/lib/*.ts` (kecuali util murni tanpa side effect network)
- `automation/apps-script/*.js`
- `gas/*.gs`
- `sql/*.sql`
- Migration Supabase (via MCP)
- `next.config.js`, `vercel.json`, `package.json`
- `CLAUDE.md`, `PROJECT_RULES.md`, `RULE_PROJECT.md`, `STATUS.md` (kecuali append entry sesuai §7)

---

## 10. GitHub — Workflow PR

### 10.1 Branch naming

- Feature: `claude/<slug>-<hash6>` (CC create)
- Hotfix: `claude/hotfix-<slug>-<hash6>` (CC create)
- CX **jangan** bikin branch sendiri — commit ke branch CC

### 10.2 PR flow

1. CC push commit pertama + `git push -u origin <branch>` + create PR **draft**
2. CC tulis PR body dengan handoff (§6.4)
3. CX pull branch → tambah commit UI → push (autoretry 2s/4s/8s/16s)
4. CX comment "UI done, ready for review"
5. CC review + verification (§6.5) → mark ready for review (undraft)
6. Merge oleh CC setelah CI green

### 10.3 Commit message format

```
<type>(<scope>): <deskripsi>
```

- `type`: feat, fix, docs, chore, refactor, test
- `scope`: modul (raos, rifim-os, finance, hris, chat, scan, dll)
- Contoh:
  - `feat(finance): tambah endpoint hris_payroll_bonus_list`
  - `fix(chat): dedup message id di realtime handler`
  - `docs(status): sesi 2026-08-06 - task division CC-CX`

### 10.4 Attribution footer

Setiap komentar GitHub (issue, PR, review) WAJIB diakhiri:

```
---
_Generated by [Claude Code](https://claude.ai/code)_
```

CC yang enforce ini. CX kalau posting comment via MCP GitHub, ikuti pattern.

---

## 11. Vercel — Zona CC

- **Deployment:** Auto-deploy dari `main` (CC yang setting)
- **Preview:** Auto per PR (CX bisa cek URL preview di PR comment)
- **Env vars:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (public — aman di embed client)
- **DILARANG di Vercel:** `SUPABASE_SERVICE_ROLE_KEY` (post-rollback sesi 14). Kalau CX butuh, panggil via Edge Function bukan langsung
- **Domain:** `raos.menala.com` (RAOS), `rifim-os.vercel.app` (Rifim-OS)

---

## 12. Supabase — Zona CC Absolut

**CX DILARANG** tools berikut:
- `mcp__Supabase__apply_migration`
- `mcp__Supabase__execute_sql` (non-SELECT)
- `mcp__Supabase__deploy_edge_function`
- `mcp__Supabase__create_branch` / `merge_branch`

**CX BOLEH:**
- `mcp__Supabase__list_tables` (read)
- `mcp__Supabase__execute_sql` (SELECT only, untuk debug UI)
- `mcp__Supabase__get_logs`
- `mcp__Supabase__generate_typescript_types` (untuk `.d.ts` update)

**Migration naming:** `raos_<3digit>_<snake_case_desc>.sql` (sequential per repo, jangan pakai timestamp)

**RLS convention:** Selalu SECURITY INVOKER kecuali butuh bypass (SECURITY DEFINER) — kalau SECURITY DEFINER, WAJIB `SET search_path=public,extensions,vault` explicit.

---

## 13. GAS Script — Zona CC (dengan window CX kecil)

### 13.1 CC only

- File baru di `automation/apps-script/*.js` (Rifim-OS)
- File baru di `gas/*.gs` (RAOS)
- Endpoint registrasi dispatcher
- Trigger baru (`setupXxxTrigger()`)
- Deploy version manual di editor

### 13.2 CX boleh

- Refactor util murni di `utils/` (rename var, extract function)
- Tambah komentar / JSDoc
- Update string konstanta (mis. label alert, pesan WA template — sepanjang variabel data tidak berubah)

### 13.3 Deploy checklist (CC only)

Setelah edit `automation/apps-script/*.js`:

1. `cd C:/Projects/menala/rifim-os/automation/apps-script && clasp push --force`
2. Buka GAS editor Rifim-OS (link di CLAUDE.md)
3. Terapkan → Kelola deployment → ✏️ Edit deployment aktif → Versi baru → Terapkan
4. URL `/exec` **tetap** (jangan buat deployment baru — akan bikin URL baru)
5. Test endpoint via `curl` sebelum update PWA
6. Update STATUS.md dengan tag `[gas-redeploy]`

Untuk RAOS `gas/*.gs`, sama tapi Script ID beda (lihat CLAUDE.md §Google Apps Script Registry).

---

## 14. Spreadsheet — Zona CC dengan bantuan CX

### 14.1 CC only

- Tambah/rename tab (WAJIB update GAS `initXxxSheet()` dan STATUS.md)
- Tambah/rename kolom di tab yang dipakai sync
- Ubah formula master
- Ubah conditional formatting
- Ubah protect range

### 14.2 CX boleh

- Isi seed data test (dalam tab test/staging)
- Update template row (row 2 kosongkan, isi placeholder)

### 14.3 Cross-repo sheet map

| Sheet | Repo Owner | Konsumer |
|---|---|---|
| MASTER DATA STAFF | Shared SSoT | RAOS + Rifim-OS |
| Database Driver Airport | Shared SSoT | RAOS + Rifim-OS |
| MASTER TARGET (RAOS spreadsheet) | RAOS | RAOS KPI + Rifim-OS Finance |
| Form Isi Saldo (RAOS spreadsheet) | RAOS | RAOS + Rifim-OS Finance |
| Form Input Saldo PWA (Rifim-OS spreadsheet) | Rifim-OS | Belum aktif |
| SISTEM CONFIG | Per-repo | Per-repo (bisa duplicate value manual) |
| system_log | Per-repo | Per-repo |

**Aturan duplicate config:** `SAL_WA_GROUP_PER_CABANG` (Pengisian Saldo GAS) ↔ `_MON_WA_SALDO_GRUP` (RIFIM OS `raosMonitoringEngine.js`) — kalau salah satu diubah, CC WAJIB update yang lain di commit yang sama.

---

## 15. Google Drive — Zona CC

Struktur Drive sudah didefinisikan di CLAUDE.md kedua repo. Aturan singkat:

### 15.1 CC only

- Buat folder baru (nama harus mengikuti convention `[Perusahaan]/[Tipe]/[Periode]/`)
- Set permission share (edit siapa yang boleh view/edit)
- Move file antar folder
- Delete file (WAJIB backup dulu)

### 15.2 CX boleh

- Baca file (via MCP `Google_Drive`)
- Upload file baru ke folder yang sudah ada (kalau butuh untuk implementasi UI, mis. asset icon)

### 15.3 Aturan naming

- Foto selfie: `<staff_id>-<tanggal>-<jam>.jpg` di folder `[Pickup Point]/[Bulan]/`
- Backup: `RAOS-Backup-<tipe>-YYYYMMDD.<ext>` di folder `[Jenis Backup]/[Bulan]/`
- Dokumen output: `[NOMOR_DOC]-<judul>.pdf` di folder Rifim-OS Drive

**DILARANG:** buat folder di My Drive root, atau di luar folder yang tercantum di CLAUDE.md.

---

## 16. Automation — Kolaborasi CC + CX

| Item | CC | CX |
|---|---|---|
| Bookmarklet AIST v2 source (`aist-fill-v2.source.js`) | ✅ logic (fetch endpoint, mark processed, refresh 30s) | Selector heuristic keyword array (kalau AIST DOM berubah, edit) |
| Bookmarklet install page (`install.html`) | Endpoint spec | ✅ HTML page + drag-to-bookmarks UI + minify client |
| Edge Function `raos-send-push` | ✅ v5 code | — |
| SW handler `public/sw-push.js` | ✅ inject via next.config.js | ✅ tune vibrate pattern / requireInteraction |
| WA template Fonnte (`notificationEngine.js`) | ✅ template placeholder | ✅ copywriting text (Indonesian) |
| Cron trigger GAS (`setupXxxTrigger()`) | ✅ | — |
| Cron dispatcher (`reminderShiftDispatcher`) | ✅ | — |
| Backup harian/bulanan | ✅ | — |
| Auto-sync sheet ke Supabase | ✅ | — |

---

## 17. Aturan Konflik & Escalation

### 17.1 Kalau CC dan CX punya opini beda

1. Cek CLAUDE.md kedua repo — kalau ada rule, ikuti
2. Cek dokumen ini — kalau ada mapping, ikuti
3. Kalau tetap tidak jelas → CC yang decide (arsitektur wins)
4. Kalau CX tidak setuju → CX **jangan** self-override, tulis alasan di PR comment → tunggu user

### 17.2 Kalau salah satu agent menyimpang

- User invoke `/reset-alur-rifim-os` → semua agent STOP → re-baca CLAUDE.md + dokumen ini
- Tanda menyimpang: hardcode hex color, queue format lama, koord bisa lihat semua cabang, saldo negatif, write GAS tanpa `_gasWithLock()`, commit langsung ke `main`

### 17.3 Kalau sesi CC crash / kehilangan konteks

- Baca `SESSION_PROMPT.md` (RAOS) — resume dari checkpoint
- Baca `STATUS.md` (kedua repo) — cek task pending
- Baca dokumen ini — konfirmasi zona kerja

### 17.4 Kalau ada duplicate output CC vs CX

- CC yang lebih dulu commit yang menang (first-writer-wins untuk kontrak)
- CX rebase ke atas CC
- Kalau CC belum commit tapi kontrak sudah dijelaskan di PR body, CX tunggu CC push

---

## 18. Checklist Definition of Done (Cross-Repo)

Task cross-repo dianggap selesai kalau **semua** checkbox berikut ✅:

- [ ] Migration Supabase applied di production
- [ ] RPC/view accessible dengan RLS enforcement teruji (test 2 akun beda role)
- [ ] Endpoint `crmApi.js` (Rifim-OS) atau `21_web_api.gs` (RAOS) return schema yang benar
- [ ] GAS redeployed (kalau ada perubahan endpoint)
- [ ] UI PWA RAOS render + interact tanpa error console
- [ ] UI PWA Rifim-OS render + interact tanpa error console
- [ ] BroadcastChannel / realtime subscribe fire di kedua sisi
- [ ] `STATUS.md` kedua repo di-append
- [ ] `CLAUDE.md` di-update kalau ada pola/konvensi baru
- [ ] PR kedua repo merged dalam ≤24 jam
- [ ] User confirm di chat sesi berikutnya
- [ ] Tidak ada regression di RLS advisor (`get_advisors`)
- [ ] Tidak ada regression di Vercel deployment (build success)
- [ ] Backward compatible dengan data existing

---

## 19. Ringkasan 1-Slide (untuk paste ke sesi baru)

```
CC (Claude Code Desktop) = OTAK
  → Arsitektur, Supabase (schema/RLS/RPC/migration/edge), GAS backend,
    kontrak lintas repo, PR review, dokumentasi, security, infra

CX (Codex Desktop) = TANGAN
  → UI React/HTML, komponen, styling (via token DDS), form,
    refactor internal komponen, unit test, asset

Kontrak berubah → CC dulu, CX menyusul.
Kontrak = kolom DB, enum, endpoint, RPC signature, sheet schema,
           kategori push, chat message type.

Cross-repo sync:
  RAOS  ─── Supabase ────  Rifim-OS
    │         │              │
    │      user_profiles     │
    │      raos_saldo_req    │
    │      raos_payroll      │
    │      raos_kpi_*        │
    │      raos_driver_*     │
    │         │              │
    └── Google Sheets SSoT ──┘
        MASTER DATA STAFF
        Database Driver Airport

Branch strategy: identik di kedua repo.
Merge sequence: kontrak (CC) → UI (CX) → docs (CC).
```

---

**Referensi wajib baca:**
- `rifim-os/CLAUDE.md` (operating manual)
- `rifim-os/PROJECT_RULES.md` (business rules + integration rules)
- `rifim-os/docs/STATUS.md` (sprint & backlog)
- `raos-menala/CLAUDE.md` (operating manual RAOS)
- `raos-menala/RULE_PROJECT.md` (rule RAOS)
- `raos-menala/STATUS.md` (sprint RAOS)
- `raos-menala/SESSION_PROMPT.md` (resumable prompt)

**Kalau dokumen ini bertentangan dengan CLAUDE.md** → CLAUDE.md wins. Update dokumen ini dan flag CC untuk rekonsiliasi.
