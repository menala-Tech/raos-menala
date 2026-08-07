# ChatGPT Design Prompt — Sesi Berikutnya (Poin 4, 5, 7)

**Untuk:** ChatGPT reguler (tanpa file access, tanpa MCP)
**Kapan pakai:** Sebelum sesi CC solo dimulai, supaya CC punya blueprint siap eksekusi
**Output diharapkan:** ChatGPT tulis design + code snippet siap paste
**Cara pakai:** Copy 3 sub-prompt di bawah, paste ke ChatGPT satu-per-satu (jangan digabung — reasoning ChatGPT lebih tajam kalau 1 topik/turn). Setelah masing-masing output, paste balik ke CC di sesi berikutnya.

---

## Konteks Umum (paste dulu sebagai turn pertama)

```
Halo, aku butuh design untuk 3 fitur PWA operasional (RAOS + rifim-os
Finance). Kamu akan output: (1) design overview + trade-off, (2) code
snippet siap paste, (3) copy Indonesia yang natural. Aku (Claude Code)
akan implement berdasarkan output kamu.

KONTEKS SISTEM:
- PWA RAOS: Next.js 14 + TypeScript + Tailwind (operasional vendor Maxim
  9 cabang airport). Room chat pengisian saldo per cabang. Staff submit
  /isisaldo <nominal> → row raos_saldo_requests status='pending'.
- rifim-os Finance module: HTML+vanilla JS (bukan React). Vercel-hosted.
  Halaman /finance tab "Isi Saldo (RAOS)" — admin/mgmt/direksi lihat
  request pending → klik tombol "Lunas" → GAS RPC raos_saldo_mark_paid.
- Realtime: Supabase Broadcast channel 'raos-saldo-new' — sudah trigger
  toast + beep instan begitu request masuk (fallback poll 60s).

Sesi ini fokus 3 poin backlog:
- Poin 4: Auto-open AIST + Playwright recorder untuk rekam gerakan admin
- Poin 5: Desktop notif popup + suara keras berulang untuk admin Finance
- Poin 7: Reminder chat "Belum Diisi" tiap 5 menit di chat room pengisian saldo

Kamu output design untuk masing-masing di turn terpisah. Turn ini konteks saja.
Balas "OK, siap terima 3 sub-prompt satu-per-satu."
```

---

## Sub-prompt 1 — POIN 5 Desktop Notif + Audio Loop (mulai dulu, paling small)

```
POIN 5: Desktop notif popup + suara keras berulang untuk admin Finance
kalau ada pengajuan Isi Saldo baru masuk dari PWA RAOS.

Current state (rifim-os/modules/finance/index.html):
- Beep suara sekali via Web Audio API (oscillator) sudah ada
- Toast in-app sudah ada
- Belum ada:
  * Browser Notification API popup
  * Suara berulang sampai admin acknowledge
  * Handle browser autoplay policy (user harus interact page dulu)

REQUIREMENT:
- Notif kuat: popup desktop (butuh permission Notification API)
- Suara keras berulang tiap 3 detik sampai admin klik toast/notif
- Berhenti otomatis kalau admin: (a) klik notif, (b) klik row di Finance
  table, (c) mark_paid pending request, (d) 10 iterasi berlalu (max 30s)
- Kalau browser tab tidak aktif, notif desktop tetap muncul + suara
  keras di background
- Fallback graceful kalau user block Notification permission → hanya
  suara + toast (existing behavior)

OUTPUT YANG AKU BUTUHKAN:
1. Design flow (state machine):
   - IDLE → NEW_REQUEST_ARRIVED → LOOPING (alert) → ACKNOWLEDGED → IDLE
   - Trigger transitions
2. Code snippet vanilla JS lengkap:
   - function `startAlertLoop(request)` — panggil saat toast baru masuk
   - function `stopAlertLoop()` — panggil saat acknowledge
   - handling autoplay policy (unlock audio context saat user interact page
     pertama kali, cache unlocked state di sessionStorage)
   - Notification API permission request UX (banner opt-in kalau default)
   - Format Notification body: title, body, icon, click handler
3. Copy Indonesia:
   - Title notif desktop
   - Body notif desktop (harus include no request + nominal + nama staff)
   - Toast in-app pesan
   - Banner opt-in permission (kalau user belum grant)

CONSTRAINT:
- Jangan pakai library eksternal (rifim-os pakai vanilla JS)
- Suara pakai Web Audio API oscillator existing (jangan MP3 file)
- Jangan block main thread
- Test manual: buka tab Finance, submit /isisaldo dari PWA RAOS di device
  lain, verify notif + suara loop
```

---

## Sub-prompt 2 — POIN 7 Reminder Chat 5 Menit

```
POIN 7: Reminder chat "Belum Diisi" 5 menit setelah pengajuan + berulang
tiap 5 menit sampai processed. Muncul di chat room "Pengisian Saldo —
<cabang>" PWA RAOS.

Current state:
- Migration raos_073 sudah expose RPC raos_post_system_message(room_id,
  content, category, metadata) — SECURITY DEFINER, service_role
- RPC raos_resolve_saldo_room(branch_id) → return chat_rooms.id
- GAS RAOS project (raos-menala/gas/) sudah ada dispatcher cron 5-menit
  (reminderShiftDispatcher via 09_trigger.gs)
- File 16_saldo_sync.gs (LEGACY) punya reminderSaldoBelumDiisi() — pakai
  Fonnte + sheet checkbox → sudah deprecated (Fonnte deprecation 100%)

REQUIREMENT:
- Cron GAS jalan tiap 5 menit
- Query raos_saldo_requests: is_processed=false, status IN ('pending',
  'approved'), created_at > 5 menit lalu, updated_at > 5 menit lalu
  (kirim reminder tiap 5 menit fresh, bukan spam sekali kirim)
- Untuk tiap request qualifying:
  - Panggil raos_post_system_message ke room "Pengisian Saldo — <cabang>"
  - Content: pesan reminder yang informatif tapi tidak annoying
- Dedup: pakai kolom baru `last_reminded_at` di raos_saldo_requests +
  cek kalau (now - last_reminded_at) > 5 menit sebelum kirim ulang
- Setelah kirim, UPDATE last_reminded_at = now()

OUTPUT YANG AKU BUTUHKAN:
1. Design:
   - Cron interval: tiap 5 menit (existing dispatcher OK, tambah handler)
   - Migration SQL untuk kolom last_reminded_at (kalau perlu)
   - Query logic pseudocode
   - Dedup logic (avoid double reminder kalau cron overlap)
2. Code snippet GAS (JavaScript ES5 — GAS runtime):
   - function `reminderPengisianSaldoBelumDiisi()` — dipanggil cron
   - Loop qualifying rows
   - Panggil RPC via UrlFetchApp (pakai helper _supaRpc existing)
   - Format message + metadata payload
   - Update last_reminded_at
3. Copy Indonesia:
   - Template pesan reminder (ada 3 varian escalation: 5m, 15m, 30m+)
   - Contoh:
     * 5m: "⏰ Pengajuan Isi Saldo Rp X untuk driver Y belum diproses.
            Mohon dilunasi via Finance."
     * 15m: "⚠️ Sudah 15 menit — pengajuan Rp X..."
     * 30m+: "🔴 URGENT — pengajuan Rp X belum diproses > 30 menit"

CONSTRAINT:
- Pesan harus tidak duplikat (dedup via last_reminded_at)
- Cron interval fix 5 menit (bukan setiap cabang berbeda)
- Kalau raos_saldo_requests.chat_room_id null, fallback ke resolve_saldo_room
- Kalau resolve return null (room belum dibuat), skip + log warning
```

---

## Sub-prompt 3 — POIN 4 Playwright Recorder Design (paling kompleks, terakhir)

```
POIN 4: Auto-open AIST (https://aist-id.taxsee.com/) + Playwright recorder
untuk rekam gerakan admin saat mengisi saldo — supaya bisa di-replay
otomatis di future request tanpa admin klik manual.

Current state:
- Bookmarklet aist-fill-v2 (rifim-os/automation/aist-bookmarklet/) sudah
  auto-fill field Amount + Login di modal AIST + mark_paid setelah AIST
  confirm (F-03 fix pakai MutationObserver 30s)
- Admin masih klik OK manual di AIST modal setelah bookmarklet fill
- Playwright BUKAN dependency existing repo mana pun

REQUIREMENT (dari user):
- Tombol "Buka AIST + Rekam" di Finance module
- Klik → open aist-id.taxsee.com di tab baru
- Playwright recorder mulai capture gerakan admin (login, buka modal
  Balance Replenishment, isi form, klik OK)
- Saat admin mark complete recording, script Playwright disimpan
- Future request: bookmarklet BUKAN lagi manual fill, tapi trigger
  Playwright replay script yang tersimpan

QUESTION YANG PERLU KAMU JAWAB SEBELUM CODE:
1. TECH STACK PILIHAN:
   - Playwright browser extension? (rekam via ekstension Chrome + save
     to filesystem) — simpler tapi butuh instal ekstension per admin
   - Playwright codegen via CLI? (tapi tidak in-browser — butuh Node
     runtime desktop)
   - Selenium IDE (browser ext)? (mirip Playwright ext tapi mature)
   - Chromium Recorder built-in DevTools? (native, no ekstension, save
     JSON) — RECOMMENDED KALAU FIT
   - Custom JS wrapper (record clicks/inputs manually + save to
     localStorage/Supabase)? — most custom control tapi banyak edge case
2. STORAGE lokasi script hasil recording:
   - localStorage per admin (private, hilang kalau clear)
   - Supabase table baru raos_admin_replay_scripts (shared per cabang)
   - Google Drive folder admin
3. REPLAY MECHANISM:
   - Puppeteer/Playwright headless di server? (butuh backend infra baru)
   - CDP client-side? (Chrome DevTools Protocol via ekstension)
   - Simple event dispatch di halaman AIST via extension?
4. SECURITY:
   - Script Playwright bisa contain credential (kalau admin login manual
     saat rekam). Bagaimana handle password field masking?
   - AIST session cookie perlu preserved untuk replay
5. UX RECORDING:
   - Bagaimana admin tahu recording sedang jalan? Overlay banner?
   - Cara stop recording? Tombol overlay atau shortcut?
   - Review recording sebelum save? (option: preview action list)

OUTPUT YANG AKU BUTUHKAN:
1. Analisis 5 pilihan tech stack di atas — pro/con masing-masing
2. Rekomendasi 1 stack yang paling realistic untuk PWA context
3. Design high-level (tanpa full code dulu):
   - Recording flow: start → capture → stop → save
   - Replay flow: trigger → load script → execute → mark_paid
   - Storage schema (kalau butuh table baru)
   - Security handling (password field, session)
4. Estimasi effort implementasi (jam kerja)
5. Alternative simpler: MVP tanpa recorder — hanya auto-open AIST dgn
   bookmarklet existing + tetap fill manual first-time (skip recording
   entirely, next call reuse config)

CATATAN:
- User target akhir: admin gak perlu klik apa-apa manual setelah recording
  pertama. Semua otomatis.
- Kalau kamu rekomend MVP simpler yang give 80% value dgn 20% effort,
  sebutkan.
```

---

## Setelah 3 output ChatGPT

Paste balik ke Claude Code sesi berikutnya dengan format:

```
Halo CC, ini output ChatGPT untuk poin 5 + 7 + 4:

[paste output sub-prompt 1 di sini]
---
[paste output sub-prompt 2 di sini]
---
[paste output sub-prompt 3 di sini]

Lanjut implement sesuai design ChatGPT. Prioritas: poin 5 → poin 7 → poin 4
(pilih MVP kalau MVP good enough).
```

CC akan review 3 output, apply, migration kalau perlu, PR keduanya per poin.
