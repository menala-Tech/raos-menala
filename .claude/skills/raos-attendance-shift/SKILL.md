---
name: raos-attendance-shift
description: Attendance & shift RAOS — /absensi page insert raos_attendance (in/out) + selfie upload bucket selfies + trigger broadcast ke room chat Absensi format WA-style, hard-block scan/absensi di luar radius+500m via GEOFENCE_TOLERANCE_METERS di lib/geo.ts (interpretasi jarak > radius + 500m block staff, koord/direksi/exempt bypass), foto selfie auto-sync ke Drive folder [Pickup Point]/[Bulan] via gas/11_drive_sync.gs syncSelfiePhotosToGDrive trigger 30 menit (kolom selfie_in_drive_synced/selfie_out_drive_synced di raos_attendance mark yang sudah tersync), reminder 6 waktu per shift (Pagi/Siang/Malam × masuk/pulang) via dispatcher GAS 5-menit. Gunakan skill ini setiap kali menyentuh /absensi, /scan, geofence, selfie, sync foto, atau reminder shift.
---

# Attendance & Shift — RAOS

## `/absensi` Page

Insert `raos_attendance` (in/out) + selfie upload ke Supabase Storage bucket `selfies`.

**Trigger `trg_raos_broadcast_absensi_to_chat`** AFTER INSERT/UPDATE → post pesan format WA-style ke room 'Absensi' (chain: pesan chat → push notif ke member room).

**Format pesan WA-style:**
- ✅ ABSEN MASUK / 🏁 ABSEN PULANG
- Nama
- Cabang
- Shift
- Jam WIB
- Tanggal
- Lokasi
- Footer PT

`sender_id` = staff yang absen (bubble kanan kalau buka room).

## Room 'Absensi' — Wajib Punya Member

Room ID `9bdd3316-1c81-4943-943f-cc9d76cf97e9`. Bisa lain sepanjang `lower(name) = 'absensi'` — trigger case-insensitive.

**Wajib punya member.** Query manual:
```sql
INSERT INTO chat_room_members
SELECT room_id, id FROM user_profiles WHERE is_active;
```

Kalau kosong, pesan tetap post tapi push tidak kirim ke siapa-siapa.

## Hard-Block Geofence

**`GEOFENCE_TOLERANCE_METERS`** di `lib/geo.ts` = **500m** (dari 1000m sebelumnya, sesi 21).

**Interpretasi final:** `jarak > radius + 500m` → **block staff** (koord/direksi/exempt bypass).

Infra `shouldBlockByGeofence()` sudah ada sejak sesi 17.

## `/scan` Page

Sama pattern geofence hard-block. Insert `scan_orders` + validasi via `BarcodeScanner`.

## GPS Tiered

Detail di skill `raos-frontend-conventions` — 2 fase paralel COARSE + REFINE.

## Sync Foto Selfie → Drive

**`gas/11_drive_sync.gs`** — `syncSelfiePhotosToGDrive`, trigger tiap 30 menit.

Struktur target: `[Pickup Point]/[Bulan]/nama-file.jpg`

**Folder induk:** https://drive.google.com/drive/folders/1Aq-tMtVm89krrt1WNSpEy9k_cxAlsTfh

**Struktur folder:**
```
T1 - Pickup Point 1/2026-07 Juli/
T1 - Pickup Point 2/2026-07 Juli/
T1 - Pickup Point 3/2026-07 Juli/
T2 - Pickup Point 1/2026-07 Juli/
T2 - Pickup Point 2/2026-07 Juli/
T2 - Pickup Point 3/2026-07 Juli/
T3 - Pickup Point 1/2026-07 Juli/
T3 - Pickup Point 2/2026-07 Juli/
```

Subfolder bulan berikutnya (`2026-08 Agustus`, dst) dibuat OTOMATIS oleh `getOrCreateSubfolder()` saat pertama kali dibutuhkan.

**Sync flow:** PWA upload → Supabase Storage bucket `selfies` → cron 30 menit copy ke Drive. Kolom `selfie_in_drive_synced` / `selfie_out_drive_synced` di `raos_attendance` mark foto yang sudah tersync (hindari duplikat).

## Backup Bulanan

**Folder induk:** https://drive.google.com/drive/folders/1i_gSb1iCq9gV2qvxbsCxDcndp_28jMUA

**Struktur:**
```
Backup Spreadsheet/2026-07 Juli/   ← hasil backupHarian() GAS (XLSX)
Backup Laporan PDF/2026-07 Juli/   ← hasil exportLaporanBulanan() GAS (PDF)
Backup Database/2026-07 Juli/      ← reserved untuk backup Supabase (belum dipakai)
```

## Reminder 6 Waktu per Shift

Detail di skill `raos-push-notification` — AppPrefs 3 group (Pagi/Siang/Malam) × 2 time input, dispatcher GAS 5-menit granular per-menit.

**Default:**
- Pagi 06:30 / 15:00
- Siang 14:30 / 23:00
- Malam 22:30 / 07:00

## `kirimReminderAbsensi()` — Sudah Difix

Fetch dari Supabase `user_profiles?is_active=eq.true` (bukan sheet lokal DATABASE STAFF yang sudah tidak dipakai post-SSOT).

## Archive Cron (Bulanan)

**`gas/22_absensi_archive.gs`** — cron tanggal 1 tiap bulan restructure foto Drive + archive raos_attendance bulan sebelumnya.
