# CC Solo Prompt — Sesi Berikutnya (Poin 3, 9, 10, 11 + apply ChatGPT designs)

**Untuk:** Claude Code (Opus) — sesi solo tanpa CX (CX reset sampai 12 Agustus 2026)
**Kapan pakai:** Setelah kamu paste output ChatGPT (dari NEXT_SESSION_CHATGPT_DESIGN.md) untuk poin 4/5/7, atau langsung kalau kamu mau CC handle backend fixes dulu
**Estimasi:** 3-5 jam kerja (tergantung compleksitas ChatGPT design)

---

## Copy-paste prompt CC (single message di sesi baru)

````
Halo CC, lanjut backlog Sesi 2026-08-07. Ada 7 poin sisa dari 13
requirement (docs/REQUIREMENTS_20260807_isi_saldo_expanded.md).

STATE CURRENT (verify dulu sebelum mulai):
- Sesi terakhir 6/13 poin done + deployed (poin 1, 2, 6, 8, 12, 13)
- Migration terakhir: raos_076 (skip approval flow)
- Vercel + GAS Web App semua live
- CX limit reset ~12 Agustus 2026 — SOLO MODE
- CC scope kembali FULL (tidak hanya prompt writer) — implement langsung

BACKLOG 7 POIN SISA:
- Poin 3: verifikasi F-03 (auto-check Lunas AIST) di prod
- Poin 4: Playwright recorder + auto-open AIST
- Poin 5: Desktop notif popup + suara keras berulang
- Poin 7: Reminder chat "Belum Diisi" 5 menit interval
- Poin 9: Auto-sync realisasi ke Target Staff (setiap saldo processed)
- Poin 10: Bug — Target Cabang tidak sync ke Target Staff kolom
- Poin 11: Bug — Target Staff nominal tidak terisi → chain Realisasi + Bonus kosong

═══════════════════════════════════════════════════════════
URUTAN EKSEKUSI HEMAT TOKEN
═══════════════════════════════════════════════════════════

FASE 1 (backend fixes, ~1 jam) — high value, low token
──────────────────────────────────────────────────────────
1. Poin 3: verifikasi F-03
   - Baca bookmarklet aist-fill-v2 waitForAistAcknowledgement()
   - Baca RPC raos_saldo_mark_paid latest (pg_get_functiondef)
   - Report: apakah masih pattern MutationObserver 30s? Behavior OK?
   - Kalau OK: skip (sudah handled), catat di STATUS.md
   - Kalau bug: fix + PR terpisah

2. Poin 10+11: debug Target Cabang → Target Staff sync
   - Read RPC raos_compute_payroll_month (raos_070d)
   - Read view raos_target_tercapai_bulan (raos_070b1)
   - Query prod: SELECT * FROM raos_kpi_targets_branch WHERE month=CURRENT
     - Apakah target_staff_default terisi? Apakah cabang mode='order'
       diperlakukan berbeda?
   - Query prod: SELECT * FROM raos_kpi_targets_staff WHERE month=CURRENT
     - Apakah target_saldo terisi otomatis dari cabang default?
   - Debug root cause: view formula? Trigger missing? UI cache?
   - Fix (kemungkinan: migration raos_077 untuk trigger auto-populate
     staff target dari branch target)
   - Apply + PR

3. Poin 9: auto-sync realisasi
   - Design: trigger AFTER UPDATE OF is_processed ON raos_saldo_requests
     WHEN NEW.is_processed = true AND OLD.is_processed = false
     → increment raos_target_tercapai_bulan.realisasi_saldo (view atau
       tabel — cek existing)
   - Actual: mungkin view yang aggregate live, jadi tidak butuh trigger
     (real-time by design). Verify dulu.
   - Kalau view live: skip (sudah handled by view refresh)
   - Kalau butuh trigger: migration raos_078 + apply

FASE 2 (frontend fitur, tergantung ChatGPT design)
──────────────────────────────────────────────────────────
4. Poin 5: Desktop notif + suara keras
   - IMPORT ChatGPT design dari user paste
   - Apply code snippet ke rifim-os/modules/finance/index.html
   - Test manual: submit /isisaldo dari device lain → verify notif +
     suara loop
   - PR

5. Poin 7: Reminder chat 5 menit
   - IMPORT ChatGPT design + copy pesan
   - Buat migration raos_079_reminder_last_reminded_at (kalau perlu)
   - Tulis GAS function di gas/16_saldo_sync.gs (atau file baru)
   - Update dispatcher 09_trigger.gs
   - Deploy GAS (clasp push otomatis via workflow)
   - PR

6. Poin 4: Playwright recorder
   - IMPORT ChatGPT recommendation (kemungkinan pilih MVP simpler)
   - Kalau MVP simpler: implement tombol "Buka AIST" saja (skip recorder)
   - Kalau full recorder: butuh diskusi lagi + estimated multi-hari kerja
   - Kalau user ingin FULL: tanya konfirmasi effort sebelum start

═══════════════════════════════════════════════════════════
CATATAN HEMAT TOKEN
═══════════════════════════════════════════════════════════

- Batch read files sekaligus (max 3-4 file per turn)
- Skip re-explore file yang sudah dibaca sesi lalu (di context memory)
- Jangan pakai Grep massif — pakai specific file:line
- Migration: prep SQL di file dulu, verify diff manual, baru apply
- Commit + PR + merge per poin (bukan per file) — batch commits
- STATUS.md update 1x di akhir semua poin, bukan per PR
- TypeScript check: hanya di RAOS PWA (rifim-os vanilla JS tidak butuh)

═══════════════════════════════════════════════════════════
BLOCKER CHECK
═══════════════════════════════════════════════════════════

Sebelum mulai, konfirmasi:
- Apakah kamu punya output ChatGPT untuk poin 4/5/7?
  - YA → lanjut FASE 1 dulu, FASE 2 setelahnya
  - TIDAK → aku (CC) tanya user "kirim prompt ChatGPT dulu atau CC
    handle FASE 1 dulu tanpa design ChatGPT?"
- Apakah user ingin scope full (7 poin) atau subset?
  - Kalau token budget ketat, rekomendasi: FASE 1 dulu (poin 3+10+11+9),
    FASE 2 di sesi terpisah

═══════════════════════════════════════════════════════════
DELIVERABLES
═══════════════════════════════════════════════════════════

- Migration Supabase baru (kalau perlu) applied ke prod + committed
- 2-4 PR terpisah (per poin atau per fase)
- STATUS.md kedua repo append
- Test evidence untuk poin 5 (notif + audio) — screenshot atau
  video kalau memungkinkan
- Manual verify list untuk user

Mulai dengan konfirmasi state (git status + last PRs merged), lalu
tanya user prioritas kalau ambigu.
````

---

## Yang kamu perlu siapkan

**Kalau mau efisien (rekomended):**
1. Copy 3 sub-prompt dari `NEXT_SESSION_CHATGPT_DESIGN.md` → ChatGPT (3 turn terpisah)
2. Paste output ChatGPT kembali ke CC
3. Paste prompt CC di atas ke sesi baru CC — CC eksekusi semua

**Kalau mau langsung backend saja dulu (hemat token):**
1. Skip ChatGPT
2. Paste prompt CC ke sesi baru
3. Bilang ke CC: "handle FASE 1 saja dulu (poin 3, 9, 10, 11) — FASE 2 nanti"
4. Sesi berikutnya lagi: ChatGPT design + FASE 2

## Estimasi Token

| Skenario | Estimasi CC | Estimasi ChatGPT |
|---|---|---|
| Semua 7 poin sekaligus (FASE 1 + 2 + ChatGPT design) | ~120-180k | ~20-30k |
| FASE 1 only (poin 3, 9, 10, 11) | ~50-80k | 0 |
| ChatGPT design only (poin 4, 5, 7) | 0 | ~20-30k |

Rekomendasi hemat: **FASE 1 solo dulu di sesi berikutnya, ChatGPT + FASE 2 di sesi setelahnya.**
