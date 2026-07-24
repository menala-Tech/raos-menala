# COLLABORATION.md — Claude Code + Codex Paralel di RAOS

*Panduan kerja bareng antara Claude Code + Codex (atau AI Code lain)
supaya tidak konflik file, tidak override credential, dan progress
roadmap sinkron.*

Update terakhir: 2026-07-25 (sesi 18)

---

## 🧭 Prinsip Dasar

1. **Satu source of truth** = `main` branch di GitHub. Semua kerja
   merge kembali ke sini.
2. **Domain terpisah per AI** — kalau bisa, jangan biarkan 2 AI edit
   file yang sama di window waktu yang sama.
3. **Append-only log** di `STATUS.md § COLLABORATION LOG` — siapa
   commit apa kapan, supaya AI lain tahu context terkini.
4. **User = arbiter final** untuk konflik/ambiguitas. AI TIDAK boleh
   force merge / force push.
5. **Credential JANGAN pernah masuk AI context** — `.env.local`
   `is_geofence_exempt` API key, service_role, VAPID key. Ini tetap di
   Vercel env vars + GAS Script Properties + Supabase Secrets.

---

## 🏗 4 Model Kolaborasi (pilih 1 per project fase)

### Model A: Split by Layer ⭐ (paling aman, direkomendasi default)

Satu AI pegang **frontend PWA**, satu pegang **backend GAS + Supabase**.
File domain berbeda → konflik 0%.

| Layer | Claude Code | Codex |
|---|---|---|
| **Frontend PWA** (`apps/pwa/**`) | ✅ owner | ❌ read-only |
| **GAS scripts** (`gas/**`) | ❌ read-only | ✅ owner |
| **Migration Supabase** | Yang punya task saja | Yang punya task saja |
| **Docs** (STATUS/CLAUDE/RULE_PROJECT) | Append di section sendiri | Append di section sendiri |

**Kelebihan**: konflik file 0%, review simple.
**Kekurangan**: butuh koordinasi kalau fitur touch keduanya (mis. tambah
kolom Supabase + PWA render + GAS sync ke sheet).
**Rekomendasi**: Model default untuk RAOS Phase 5-7.

### Model B: Split by Feature Branch

Setiap AI kerja di branch terpisah, merge via PR.

| AI | Branch | Contoh task |
|---|---|---|
| Claude | `claude/p5-rifim-os` | P5 integrasi rifim-os |
| Codex | `codex/p6-riwayat-scope` | P6 filter riwayat per role |

Setelah selesai, buka PR ke `main`. **User review + merge manual**.

**Kelebihan**: full isolated, bisa parallel eksperimen.
**Kekurangan**: rebase kalau `main` jalan → conflict manual.
**Rekomendasi**: untuk fitur besar/eksperimental yang mungkin di-abort.

### Model C: Split by Phase Roadmap

Bagi 25 poin `Upgrade Full Cabang.md` — Claude pegang phase odd, Codex
phase even. Progress tracker di `SESSION_PROMPT.md` kolom `Owner`.

| Phase | Owner |
|---|---|
| P5 rifim-os | Claude |
| P6 riwayat scope | Codex |
| P7 test + polish | Claude |
| P8 (next) | Codex |

**Rekomendasi**: setelah team sudah familiar Model A.

### Model D: Pair Programming (review chain)

Codex generate code → Claude review + polish → commit.
Atau sebaliknya.

Untuk task critical (arsitektur besar, RLS policy, security).

**Kelebihan**: hasil lebih matang.
**Kekurangan**: lebih lambat, cost 2×.
**Rekomendasi**: untuk migration RLS + trigger DB yang high-impact.

---

## 📋 2 Prompt Master

### PROMPT 1 — Claude Code (owner Frontend PWA di Model A)

Paste ini persis di sesi baru Claude Code:

```
Sesi kolaborasi RAOS — saya pegang FRONTEND PWA (Model A)

Repo: https://github.com/menala-Tech/raos-menala
Working dir: C:\Projects\menala\RAOS
Branch: main

DOMAIN SAYA:
- apps/pwa/** (Next.js PWA, komponen, lib, halaman)
- Migration Supabase yang HANYA touch tabel PWA-only
  (raos_saldo_requests row-level, chat_messages, dst — cek kalau ragu)
- Docs: section "Frontend" atau tandai [Claude] di STATUS.md/CLAUDE.md

READ-ONLY (jangan edit, boleh baca untuk context):
- gas/** (domain Codex)
- Migration Supabase yang touch GAS-side flow / trigger DB

BEFORE mulai kerja:
1. git pull origin main --rebase
2. Baca SESSION_PROMPT.md § Progress Tracker — task saya ditandai
   "Owner: Claude"
3. Baca STATUS.md § COLLABORATION LOG entries terakhir — apa yang
   Codex baru commit
4. Kalau file yang mau saya edit baru di-touch Codex <24 jam, ping
   user "Codex baru edit X, saya lanjut/tunggu?"

BACA WAJIB (per RULE_PROJECT.md):
- SESSION_PROMPT.md — checkpoint terakhir + progress tracker
- CLAUDE.md — panduan teknis + state fitur
- RULE_PROJECT.md — rule book, terutama §1.-1 sinkron spreadsheet
  + §1.-2 wajib MCP + §1.0.5 hub sync
- STATUS.md — kronologi + COLLABORATION LOG
- SSOT_DATA_SOURCES.md di C:\Projects\menala\

ATURAN CREDENTIAL (WAJIB):
- JANGAN pernah tulis/edit/baca isi apps/pwa/.env.local
- JANGAN hardcode Supabase key / VAPID / password di source
- Kalau baca file source dan ada credential terselip → flag ke user
  + minta rotate
- Kalau butuh env var baru, kasih instruksi ke user set manual di
  Vercel Dashboard + copy ke .env.local lokal

AFTER selesai commit:
1. Update SESSION_PROMPT.md § Progress Tracker: mark task saya
   dengan status ✅ + commit hash
2. Append 1 baris di STATUS.md § COLLABORATION LOG:
   "[YYYY-MM-DD HH:MM Claude] <commit_short_sha> <ringkas satu baris>"
3. git push origin main

Task untuk sesi ini:
- [Isi task]
```

### PROMPT 2 — Codex (owner Backend GAS + Supabase di Model A)

Paste ini persis di sesi baru Codex:

```
Sesi kolaborasi RAOS — saya pegang BACKEND GAS + SUPABASE (Model A)

Repo: https://github.com/menala-Tech/raos-menala
Working dir: [path lokal, mis. ~/raos-menala]
Branch: main

DOMAIN SAYA:
- gas/** (18 file Google Apps Script — 01_config sampai 18_driver_queue_sync)
- Migration Supabase yang touch:
  * Trigger DB (raos_saldo_after_processed, raos_broadcast_absensi_to_chat)
  * RLS policy tabel yang di-consume GAS
  * Kolom yang GAS sync ke sheet
- Docs: section "Backend" atau tandai [Codex] di STATUS.md/CLAUDE.md

READ-ONLY (jangan edit, boleh baca untuk context):
- apps/pwa/** (domain Claude)
- SESSION_PROMPT.md progress tracker "Owner: Claude"

BEFORE mulai kerja:
1. git pull origin main --rebase
2. Baca SESSION_PROMPT.md § Progress Tracker — task saya ditandai
   "Owner: Codex"
3. Baca STATUS.md § COLLABORATION LOG — apa yang Claude baru commit
4. Kalau ragu apakah file GAS/migration overlap dengan work Claude,
   ping user "Claude baru edit X, saya lanjut/tunggu?"

BACA WAJIB:
- SESSION_PROMPT.md, CLAUDE.md, RULE_PROJECT.md, STATUS.md
- SSOT_DATA_SOURCES.md (C:\Projects\menala\ atau ~/menala/)
- RULE_PROJECT §1.-1 sinkron spreadsheet — setiap upgrade GAS
  harus terintegrasi dengan sheet yang relevan (LOG SISTEM,
  DATABASE ORDER, MASTER TARGET, Form Isi Saldo, Antrian Driver,
  DASHBOARD STAFF, SISTEM CONFIG)

ATURAN CREDENTIAL (WAJIB):
- JANGAN pernah generate/edit .env.local (bahkan kalau user minta)
- JANGAN hardcode SUPABASE_SERVICE_KEY / VAPID / password di source
- GAS Script Properties di server-side (script.google.com), JANGAN
  ditulis di gas/ source code
- Kalau baca file source dan ada credential terselip → flag ke user
  + minta rotate

AFTER selesai:
1. cd gas && clasp push (18 file expected sesi 18)
2. Kalau ada trigger baru/berubah interval, reminder user:
   "Re-run setupAllTriggers() manual di GAS Script Editor"
3. Update SESSION_PROMPT.md § Progress Tracker: mark task saya
   dengan status ✅ + commit hash
4. Append 1 baris di STATUS.md § COLLABORATION LOG:
   "[YYYY-MM-DD HH:MM Codex] <commit_short_sha> <ringkas>"
5. git commit + git push origin main

Task untuk sesi ini:
- [Isi task]
```

---

## 🔄 Workflow Harian Kolaborasi

### Setiap sesi mulai (kedua AI)

```
1. git pull origin main --rebase
2. Cek SESSION_PROMPT.md § Progress Tracker
   → task saya (owner match)
   → task AI lain (context, jangan disentuh)
3. Cek STATUS.md § COLLABORATION LOG (5 entries terakhir)
   → siapa touch apa 24 jam terakhir
4. Kalau ada konflik/ambigu, ping user:
   "AI [nama] baru commit X di file Y. Task saya butuh edit file
   yang sama. Lanjut/tunggu/split?"
5. Kalau clear, mulai eksekusi
```

### Setiap task selesai

```
1. Build lokal:
   - Frontend: cd apps/pwa && npm run build (0 error)
   - GAS: cd gas && clasp push
2. Commit conventional format:
   feat/fix/docs/perf/chore(scope): deskripsi
3. Update SESSION_PROMPT.md progress tracker + STATUS.md log
4. git push origin main
5. Kalau ada file baru di domain AI lain, notify user
   (mis. Claude bikin file di gas/ — jangan!)
```

### Handoff antar AI (task multi-layer)

Task yang butuh kedua sisi (mis. fitur baru: migration + PWA + GAS
sync ke sheet) → **user pecah jadi 2 task**:

**Contoh: Fitur "Ekspor Absensi Bulanan ke PDF"**

- Task A (Claude, frontend): Bikin halaman `/laporan/absensi-pdf` +
  komponen download button + call API endpoint
- Task B (Codex, backend): GAS function `exportAbsensiPdfBulanan()` +
  trigger + save ke Drive folder + email admin

Task B depends on Task A? NO — mereka bisa parallel. Kalau depends
(mis. Task B butuh column baru dari Task A migration), Codex tunggu
Task A commit dulu → git pull → mulai.

---

## 🛡 Aturan Anti-Konflik

### 1. Deep read before write

Sebelum edit file:
```bash
git log --oneline -5 <path>
```
Cek siapa terakhir touch, kapan, kenapa. Kalau AI lain baru edit
<24 jam, extra hati-hati atau ping user.

### 2. Atomic commit per task

1 task = 1 commit (atau 2-3 commit terkait). Jangan bikin commit
besar campur banyak feature — susah rollback + susah review AI lain.

### 3. Rebase, jangan merge

```bash
git pull origin main --rebase
```

Jangan `git pull` biasa (bikin merge commit yang mengaburkan
timeline).

### 4. Force push HARAM

`git push --force` DILARANG di `main`. Kalau history rusak, ping
user manual — jangan self-heal dengan force push.

### 5. Migration Supabase seri unik

Migration nomor unik sequential. Sebelum apply migration baru:
```
list_migrations → cari nomor terakhir → target next raos_<N+1>
```

**Race condition**: 2 AI bikin migration dengan nomor sama →
migration kedua akan fail atau overwrite. Prevention: **hanya 1 AI
apply migration per hari**, atau pakai timestamp prefix
(`raos_20260726_1030_<name>`).

### 6. Timezone sync

Semua timestamp di COLLABORATION LOG pakai **WIB** (Asia/Jakarta)
supaya konsisten. Format: `YYYY-MM-DD HH:MM` (24 jam).

### 7. File yang HANYA user boleh edit

- `SESSION_PROMPTS.md` di `C:\Projects\menala\` (root workspace,
  lintas project) — user maintainer, AI read-only
- `SSOT_DATA_SOURCES.md` di `C:\Projects\menala\` — user maintainer
- `Upgrade Full Cabang.md` di root RAOS — source roadmap, user author
- `.env.local` — HARAM disentuh AI

AI edit file ini → user marah, harus rotate credential kalau ada
leak.

### 8. Sheet spreadsheet RAOS = read-only untuk AI

Spreadsheet RAOS (`1eYS2mM3Sy...`) hanya boleh dibaca via Google
Workspace MCP atau via GAS. **Jangan** AI tulis langsung ke sheet
tanpa go-through GAS function. GAS jadi single gateway ke sheet.

---

## 🎯 Setup Awal (sekali di komputer/tools baru)

### 1. Clone repo

```bash
git clone https://github.com/menala-Tech/raos-menala.git
cd raos-menala
```

### 2. Config git identity

Supaya commit tahu siapa yang commit:

```bash
git config user.name "Menala-Tech"
git config user.email "menalagemilang@gmail.com"
```

Commit message body tambah trailer:
```
Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
```
atau
```
Co-Authored-By: Codex GPT-4 <noreply@openai.com>
```

### 3. Install deps

```bash
cd apps/pwa && npm install
```

### 4. Setup `.env.local` (dari Vercel)

Ambil credential dari Vercel Dashboard → project raos-menala →
Settings → Environment Variables → download atau copy manual ke
`apps/pwa/.env.local`.

### 5. Setup GAS clasp (untuk Codex kalau owner GAS)

```bash
npm install -g @google/clasp
clasp login  # OAuth via browser
```

Login pakai akun yang punya akses ke script
`1iMN1ZGZVM0x2nSWmGMVx_umtEEzR-VQMwDZqK_pgHOzzOKVEprSN91jb`.

### 6. Setup MCP (kalau Claude Code)

MCP sudah preconfigured di sesi Claude Code. Codex butuh setup MCP
plugin sendiri kalau tersedia.

### 7. Bikin `.env.local` immutable (defense)

Setelah setup `.env.local`, lock supaya AI tidak override:

```bash
# Windows PowerShell (Admin)
attrib +R apps\pwa\.env.local

# Linux/macOS/Git Bash
chmod 444 apps/pwa/.env.local
```

---

## 📊 Template SESSION_PROMPT Progress Tracker (kolom Owner)

Extend format existing dengan kolom Owner:

```markdown
| Phase | Poin | Owner | Status | Commit terakhir |
|---|---|---|---|---|
| P5.1 | Baca rifim-os codebase | **Claude** | ⬜ | — |
| P5.2 | Modul rifim-os deep link | **Claude** | ⬜ | — |
| P6.1 | Filter riwayat scope role | **Codex** | ⬜ | — |
| P6.2 | Index composite branch+created_at | **Codex** | ⬜ | — |
| P7.1 | Test 5 install variant HP | **User** | ⬜ | — |
```

Owner options:
- `Claude` — AI Claude Code
- `Codex` — AI Codex (atau AI lain yang ditugaskan)
- `User` — task yang harus user manual (mis. test HP)
- `Both` — pair programming Model D

---

## 📝 Template STATUS.md COLLABORATION LOG

Append-only section (jangan hapus history):

```markdown
## COLLABORATION LOG

Format: [YYYY-MM-DD HH:MM AI_name] <commit_sha_short> <ringkas>

- [2026-07-26 09:15 Claude] ed43184 P5.1 baca rifim-os codebase — plan
  integrasi
- [2026-07-26 10:30 Codex] a1b2c3d P6.1 filter riwayat scope by role
- [2026-07-26 14:00 Claude] f4g5h6i P5.2 modul rifim-os deep link auth
- [2026-07-26 16:45 Codex] j7k8l9m gas/19 export absensi PDF ke Drive
```

---

## 🚨 Konflik Handling

### Konflik ringan (file berbeda, race pull)

```bash
# AI 1 sudah push, AI 2 pull dulu
git pull origin main --rebase
# kalau conflict, resolve manual di file terkait
git rebase --continue
git push origin main
```

### Konflik berat (file sama, edit sama)

AI 2 detect konflik → **JANGAN auto-resolve**. Ping user:
```
Konflik di apps/pwa/src/lib/geo.ts:
- AI 1 (Claude) tambah kolom exempt
- Saya (Codex) refactor haversine
Mau saya tunggu, atau user resolve manual?
```

User arbiter final.

### AI ke-3 masuk mid-sesi

Kalau user assign task ke AI ke-3 (mis. Cursor) di tengah sesi
Claude+Codex jalan:
1. AI ke-3 baca 5 file wajib
2. AI ke-3 cek COLLABORATION LOG last 10 entries
3. AI ke-3 ping user "Saya masuk pegang task X, konfirmasi tidak
   overlap dengan Claude/Codex?"
4. User konfirmasi → AI ke-3 lanjut

---

## 🏁 Checklist Akhir Sesi (per AI)

Ikuti STANDARD AKHIRI SESI di `C:\Projects\menala\SESSION_PROMPTS.md`
+ tambahan kolaborasi:

```
1. git status (working tree clean)
2. Build lokal 0 error
3. Commit + push
4. Update SESSION_PROMPT.md progress tracker (kolom Owner + Status
   + Commit)
5. Append STATUS.md § COLLABORATION LOG
6. Kalau GAS: clasp push + reminder user setupAllTriggers()
7. Verify Vercel deploy READY
8. Ping user: "Sesi saya (Claude/Codex) selesai — task X-Y-Z landed.
   AI lain bisa lanjut task Q-R-S di file [list]."
```

---

## 🎓 FAQ

**Q: Kalau Codex tidak support MCP, bagaimana cek Supabase state?**
A: Codex user manual buka https://supabase.com/dashboard/project/vlievtojpmrbsmzlqswl
→ Migration History, Advisors, dsb. Atau pakai `supabase` CLI kalau
terinstall.

**Q: Codex commit tapi tidak update STATUS.md log, bagaimana?**
A: User perlu tegaskan di prompt Codex. Kalau Codex lupa 3x, user
ganti model atau pindah task ke Claude.

**Q: Bisa pakai lebih dari 2 AI (Claude + Codex + Cursor + Cline)?**
A: Bisa, tapi rekomendasi maksimal **3 AI aktif bersamaan**. Lebih
dari itu, koordinasi jadi mimpi buruk. Tambah kolom Owner:
`Claude/Codex/Cursor/Cline/User` di tracker.

**Q: Bagaimana kalau AI lupa baca SESSION_PROMPT.md?**
A: User paste ulang PROMPT 1 atau PROMPT 2. Sesi baru = ulang dari
awal (AI tidak punya memory antar sesi).

**Q: Konflik migration Supabase — 2 AI apply nomor sama?**
A: Migration kedua akan fail (nomor unique). Manual: renumber
migration kedua ke `raos_048`, apply, cek advisor. Atau: pakai
timestamp prefix `raos_20260726_1030_<name>` supaya auto-unik.

**Q: Kalau AI diminta edit file di luar domain-nya?**
A: AI harus refuse + ping user. Contoh:
> User ke Claude: "Edit gas/13_staff_sync.gs tambah kolom baru"
> Claude: "File gas/ adalah domain Codex (Model A). Saya bisa
> generate patch, tapi apply oleh Codex. Atau user override?"

User bisa override kalau memang urgent — tapi log di COLLABORATION
LOG dengan tag `[override]`.

---

## 🔗 File Terkait

- `SESSION_PROMPT.md` (root repo) — master resumable prompt + progress tracker
- `STATUS.md` (root repo) — kronologi + COLLABORATION LOG
- `CLAUDE.md` (root repo) — panduan teknis + state fitur
- `RULE_PROJECT.md` (root repo) — rule book operasional
- `C:\Projects\menala\SESSION_PROMPTS.md` — prompt lintas 13 project RIFIM
- `C:\Projects\menala\SSOT_DATA_SOURCES.md` — aturan sumber data staff/driver

---

*Doc ini living document — update setiap ada pattern kolaborasi baru
atau konflik yang menghasilkan lesson learned.*
