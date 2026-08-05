---
name: raos-gas-rules
description: Aturan Google Apps Script untuk RAOS — 22 file di raos-menala/gas/ (01_config.gs s.d. 22_absensi_archive.gs), trigger cron utama (syncStaffFromSSOT 10 menit, syncDriverAirportFromSSOT 6 jam, syncSelfiePhotosToGDrive 30 menit, syncSaldoRequestsToSheet 5 menit, reminderShiftDispatcher 5 menit dengan dispatcher granular per-menit + dedup cache, notifyPendingScansKoordinator 15 menit, updateAllKpiThisMonth cron 22:00), push notification dari GAS via invokePushFromGas_ pakai SERVICE_KEY di Script Properties, RPC raos_dispatch_push. Gunakan skill ini setiap kali menulis/edit file .gs di gas/ folder, deploy RAOS GAS, debug endpoint atau cron.
---

# Google Apps Script — RIFIM OS + RAOS

## 1. Utility Wajib di `automation/apps-script/gasUtils.js` (Rifim-OS)

**JANGAN implementasi ulang.** Semua kode yang menyentuh data WAJIB pakai util berikut:

| Util | Fungsi | Kapan pakai |
|---|---|---|
| `_gasNow()` | ISO UTC timestamp `YYYY-MM-DDTHH:mm:ss.sssZ` | Semua kolom storage waktu |
| `_gasToday(ss)` | Date-only YYYY-MM-DD | Kolom tanggal |
| `_gasTimeDisplay(ss)` | Display lokal WIB | UI display saja, BUKAN storage |
| `_gasWithLock(fn)` | ScriptLock 10 detik + release di finally | **SEMUA write konkuren** (Rule 41) |
| `_gasValidate({...})` | Enum + tipe check di baris pertama endpoint | Setiap endpoint yang terima input |
| `_gasUuid()` | UUID v4 | ID baru |
| `_gasLogError(e, ctx)` | Sheet `system_log` + return `{ok:false, error}` | Semua catch |
| `_gasLogWarn(msg, ctx)` | Sheet `system_log` warning | Non-fatal issues |

**Pengecualian:** Di dalam logger sendiri, pakai `console.error()` (untuk avoid infinite loop).

## 2. Integration Rules 40-47 (SSoT Data Contract — MUTLAK)

| # | Aturan | Implementasi |
|---|---|---|
| 40 | Timestamp ISO UTC di storage | `_gasNow()` |
| 41 | Race Condition — write dalam ScriptLock 10 detik | `_gasWithLock(fn)` — read-modify-write = 1 lock utuh |
| 42 | Validasi tipe & enum — attachment integer, status uppercase enum `WAITING/CALLED/PICKED/DONE/CANCEL`, ID baru = UUID v4 | `_gasValidate()` di baris pertama endpoint, `_gasUuid()`, frontend kirim tipe final (`parseInt \|\| 0`) |
| 43 | Error logging — semua catch → sheet `system_log` | `_gasLogError()` |
| 44-47 | Kontrak payload | Perubahan nama field/tipe/enum WAJIB update 3 sisi (PWA + webApp + engine) dalam 1 commit |

## 3. GAS Project Registry — 2 Project

Ada **2 GAS project berbeda** — kalau salah folder, salah deploy. Lihat juga `../GAS_PROJECTS_MAP.md`.

| Nama Project | Script ID | Lokasi Lokal | File Utama | Spreadsheet Bound |
|---|---|---|---|---|
| **RIFIM OS (Main)** | `1IK8-2anrxahce1X1MG7Bi3aGe6e-_4e3obanTRprT6brYSdla9rEYOxp` | `automation/apps-script/` | `raosMonitoringEngine.js`, `saldoEngine.js`, `staffAppApi.js`, `crmApi.js`, `hrisMasterStaffSync.js` dll | `1jHeA-w1bM32S3-AU-ENN2UjiaCb4iLzRhaf4G7y4ozM` |
| **Pengisian Saldo** | `1_V2BOS56ac1v0mzte2rfl3at4wmc31foeKoLddZ6SeYRhSc_B2icbcUz` | `C:\Projects\menala\rifim-isi-saldo\New folder\` | `MonitoringSaldo.gs`, `Main.gs`, `Matching.gs` dll | `1T7gvlIPt2Un2mca43803oGpdMakaFuEUiSF7Z_KeXqU` |

**RAOS** punya GAS terpisah lagi di repo `raos-menala/gas/*.gs` (22 file: `01_config.gs` s.d. `22_absensi_archive.gs`). Deploy dari `raos-menala/gas/` folder.

## 4. Redeploy Manual — Wajib per Edit Endpoint

Setiap edit `automation/apps-script/*.js` (Rifim-OS) atau `gas/*.gs` (RAOS) yang expose endpoint publik:

```bash
# Push RIFIM OS Main
cd automation/apps-script && clasp push --force
```

Lalu **manual di GAS Editor:**
1. Buka [GAS editor RIFIM OS](https://script.google.com/home/projects/1IK8-2anrxahce1X1MG7Bi3aGe6e-_4e3obanTRprT6brYSdla9rEYOxp/edit)
2. Terapkan → Kelola deployment → ✏️ Edit deployment aktif → Versi baru → Terapkan
3. **URL `/exec` TETAP** — jangan buat deployment baru (akan bikin URL baru yang bikin semua PWA break)
4. Test endpoint via `curl` sebelum update PWA
5. Update STATUS.md dengan tag `[gas-redeploy]`

## 5. Push clasp ke Project Tertentu

**RIFIM OS Main:**
```bash
cd /home/user/rifim-os/automation/apps-script && clasp push --force
```

**Pengisian Saldo** (pull dulu ke temp folder, edit, push):
```bash
mkdir -p /tmp/pengisian-saldo && cd /tmp/pengisian-saldo
echo '{"scriptId":"1_V2BOS56ac1v0mzte2rfl3at4wmc31foeKoLddZ6SeYRhSc_B2icbcUz","rootDir":"."}' > .clasp.json
clasp pull
# ... edit ...
clasp push
```

**RAOS:**
```bash
cd /home/user/raos-menala/gas && clasp push --force
```

**Prasyarat:** `~/.clasprc.json` (OAuth token) harus ada — didapat dari `clasp login` di komputer lokal, lalu paste isinya ke remote session.

## 6. Endpoint URL — Copy dari CLAUDE.md, JANGAN Retype

**RIFIM OS Web App (aktif):**
```
https://script.google.com/macros/s/AKfycbzzK75gxawaylaUZpoC1zp_hq5ktznlN7scIl24HkdEgR2l3cVmpUSLck0potcMZZtw/exec
```

⚠️ URL mengandung `scIl` (huruf besar I + huruf kecil l) — mudah tertukar dengan `scll`. **Copy dari file CLAUDE.md, jangan retype.**

## 7. Vercel PWA Endpoint Map

| PWA | Vercel URL | GAS Endpoint (deployment) | Project GAS |
|---|---|---|---|
| Isi Saldo Staff | `isisaldo.vercel.app/?cabang=…&staff=…` | `AKfycbzq…omm` @52 | **Pengisian Saldo** |
| Admin Isi Saldo | `isisaldo.vercel.app/admin` | `AKfycbzq…omm` @52 (sama) | **Pengisian Saldo** |
| Monitor Saldo | `rifim-monitor-saldo.vercel.app` | `AKfycbzzK75…ZZtw` @52 "V55" | **RIFIM OS (Main)** |
| Monitor Koordinator | `rifim-monitor-koordinator.vercel.app` | `AKfycbzzK75…ZZtw` @52 "V55" (sama) | **RIFIM OS (Main)** |
| RAOS PWA utama | `raos-menala.vercel.app` | — (pakai Supabase langsung, bukan GAS) | — |

**Konsekuensi penting:**
- Perubahan pada `Pengisian Saldo` **TIDAK berlaku** untuk Monitor Saldo/Koordinator. Sebaliknya juga.
- 2 project GAS punya fungsi dengan **nama sama tapi logika berbeda** (`refreshMonitoringSaldo`, `cekSLASaldo`) — selalu pastikan folder/scriptId yang benar sebelum edit
- Konfigurasi WA group per cabang **di-duplicate manual** — `SAL_WA_GROUP_PER_CABANG` (Pengisian Saldo) ↔ `_MON_WA_SALDO_GRUP` (RIFIM OS/`raosMonitoringEngine.js`). Kalau salah satu diedit, yang lain harus di-sync manual.

## 8. Advanced Services yang WAJIB Enabled

Di `appsscript.json`:
- **Drive v2** — untuk HTML→PDF pipeline (Drive.Files.insert)
- **Slides v1** — untuk composite signature via Slides API

Scope: `/auth/documents`, `/auth/drive`, `/auth/presentations`.

## 9. Organisasi File GAS (Rekomendasi)

Pisahkan menjadi:
- `business-logic/` — logika bisnis
- `services/` — integrasi eksternal (Fonnte, dll)
- `utils/` — fungsi utilitas (di Rifim-OS: `gasUtils.js`)
- `config/` — konfigurasi (Script Properties helper)
- `engines/` — reusable engines (Document, Placeholder, Numbering, Notification)

Jangan taruh semua di `Code.gs`.

## 10. RAOS GAS — Trigger Utama

- `syncStaffFromSSOT` — tiap **10 menit** (dari 6 jam sesi 2026-08-05) — sync sheet MASTER DATA STAFF → user_profiles
- `syncDriverAirportFromSSOT` — tiap 6 jam — sync sheet driver airport → raos_drivers
- `syncSelfiePhotosToGDrive` — tiap 30 menit — Supabase Storage bucket selfies → Drive folder Pickup Point/Bulan
- `syncSaldoRequestsToSheet` — tiap 5 menit — sync `raos_saldo_requests` → tab Form Isi Saldo (15 kolom)
- `reminderShiftDispatcher` — tiap 5 menit — cek WIB clock vs 6 target time (06:30/14:30/22:30 masuk + 15:00/23:00/07:00 pulang) + dedup Script Properties cache
- `reminderSaldoBelumDiisi` — tiap 5 menit — request >5 menit belum diisi post WA-style pesan
- `notifyPendingScansKoordinator` — tiap 15 menit — scan pending >15m push ke koord/admin
- `updateAllKpiThisMonth` — cron 22:00 harian — forward ke `updateAllKpiRAOS`

**Trigger yang dinonaktifkan (RIFIM OS Main):** `cekSLASaldo`, `cekSLASaldoPWA`, `cekSLAPotongan` — supaya tidak WA duplikat dengan Pengisian Saldo. Setup ulang HANYA setelah RIFIM OS live dengan token & grup Fonnte terpisah.

## 11. Push Notification dari GAS

Pakai `invokePushFromGas_()` (RAOS) yang panggil Edge Function `raos-send-push` dengan `SUPABASE_SERVICE_KEY` di Script Properties. **JANGAN buat Edge Function baru** — reuse yang ada.

Kalau butuh push dari trigger GAS, panggil RPC `raos_dispatch_push(user_ids[], title, body, url, tag, kategori)` yang bypass role via service_role.
