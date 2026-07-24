# KPI Port Plan — RAOS Soeta

*Draft: 2026-07-24 (sesi 16). Blueprint untuk implementasi sesi 17.*

## Konteks

- **Sumber pola**: HRIS "DATABASE STAFF" spreadsheet + GAS project
  `1sb8MznaH1GtbsR02zLhwML8Q_rOji2Ow6XjfNSJ3otOpwXmbG_D9wTbR` (RIFIM KPI
  Engine V1) → sudah production di sheet DASHBOARD STAFF.
- **Target adopsi**: spreadsheet RAOS
  `1eYS2mM3Sy-BNAVGfp8BUHtsZuLiGDetnJeGw-AWk__8` (sheet TARGET STAFF
  masih kosong, tab DASHBOARD STAFF belum ada).
- **Cakupan RAOS**: staff cabang **ID Rifim Airport Soeta** saja (3 orang
  saat ini: Hendro, Henry, dst). Direksi/HO tidak masuk KPI operasional.
- **Cabang lain**: pola berbeda — nanti diurus di project HRIS-nya sendiri.

## Formula (adopsi dari KPIEngine V1)

```
TotalKPI = (Pilar1/50) × (Pilar2/30) × (Pilar3/20) × 100
```

Perkalian murni → satu pilar 0 = Total 0.

### Pilar 1 — Realisasi Operasional (max 50)

**HRIS**: Target Saldo. **RAOS**: **kombinasi scan_orders + attendance**
(user confirm sesi 16).

Formula:
```
Realisasi = SUM(scan_orders WHERE staff_id=X AND scanned_at IN periode
                 AND status='validated') × BOBOT_SCAN
          + SUM(raos_attendance WHERE staff_id=X AND date IN periode
                 AND status IN ('hadir','terlambat'))   × BOBOT_HARI

Persen  = Realisasi / TargetStaff
Nilai   = MIN(round(persen × 50), 50)
```

Konstanta yang perlu ditetapkan Anda sebelum implementasi:
- `BOBOT_SCAN` (harga per scan validated, mis. Rp 5.000)
- `BOBOT_HARI` (bobot hari hadir, mis. Rp 100.000)
- `TARGET_STAFF` derive dari `TARGET CABANG SOETA / 3 orang aktif × bobot_jabatan`
  - KOORDINATOR 1.20 (Henry), STAFF 1.00 (Hendro, dst), ADMIN 1.00

### Pilar 2 — Pembinaan Driver (max 30)

**HRIS**: 5 indikator biner dari sheet DB_DRIVER. **RAOS**: derive dari
`raos_drivers` + `scan_orders` (lump-sum Soeta, bukan per T1/T2/T3).

Indikator RAOS (usulan awal — perlu konfirmasi):
| Indikator | Bobot | Sumber |
|---|---|---|
| Driver Baru Aktif | 10 | `raos_drivers.created_at IN periode` + minimal 1 scan |
| Driver Lama Aktif Tinggi | 5 | `scan_orders` per driver ≥ threshold `AKTIF_TINGGI` (mis. 8×/bulan) |
| Briefing | 5 | manual input via sheet baru `RAOS_KPI_MANUAL` |
| Edukasi SOP | 5 | manual input |
| Problem Solving | 5 | manual input |

Biner: ada aktivitas > 0 → dapat poin penuh (mengikuti pola HRIS).

### Pilar 3 — Disiplin & SOP (max 20)

**Sumber RAOS**: `raos_attendance` Supabase (bukan sheet ABSENSI lokal).

| Indikator | Bobot | Formula |
|---|---|---|
| Absensi | 5 | `hariHadir / 26 × 5` (cap 5) |
| Kehadiran (tanpa alpha) | 5 | `hariAlpha=0 ? 5 : max(0, (1-alpha/26)×5)` |
| Pelayanan | 5 | manual sheet `RAOS_KPI_MANUAL` |
| Kerapian | 3 | manual |
| Pelanggaran SOP | 2 | `max(0, 2 - jumlahPelanggaran)` — manual |

Rumus `hariHadir` = `COUNT(raos_attendance WHERE staff_id=X AND
status IN ('hadir','terlambat') AND date IN periode)`.

## Grade & Bonus

Sama dengan HRIS (biar konsisten lintas RIFIM):

| Grade | Min KPI | Bonus % Gaji |
|---|---|---|
| A+ | 95 | 100% |
| A | 90 | 90% |
| B | 80 | 75% |
| C | 70 | 50% |
| D | 60 | 25% |
| E | <60 | 0% |

`Gaji` staff = kolom C sheet MASTER DATA STAFF (belum ke-sync ke
`user_profiles` — perlu tambah kolom `salary` di migration baru, atau
tetap baca via GAS langsung dari sheet SSOT setiap run).

## Struktur sheet yang perlu dibuat di RAOS spreadsheet

Spreadsheet: `1eYS2mM3Sy...` (spreadsheet RAOS).

### Tab baru: `MASTER TARGET`
| Kolom | Isi |
|---|---|
| A: Cabang | "ID Rifim Airport Soeta" |
| B: Target Cabang | mis. Rp 100.000.000 (target realisasi bulan) |
| C: Bulan Aktif | mis. "2026-07" |

### Tab baru: `DASHBOARD STAFF`
Kolom sama dengan HRIS (A-N):
Nama | Cabang | Target | Realisasi | % | KPI | Grade | Bonus |
Driver Aktif Cabang | Jumlah Staff di Cabang | Target Driver per Staff |
KPI A (Saldo) | KPI B (Driver) | KPI SOP

### Tab baru: `RAOS_KPI_MANUAL`
Input manual admin/koord untuk indikator biner yang tidak bisa auto:
Nama Staff | Periode | Briefing | Edukasi SOP | Problem Solving |
Pelayanan | Kerapian | Pelanggaran SOP

## Struktur file GAS yang perlu ditambah

Di folder `gas/` RAOS (pattern mengikuti 12_/13_):

- `14_kpi_config.gs` — CONFIG khusus RAOS (bobot, threshold, source
  Supabase URL, dsb)
- `15_kpi_engine.gs` — 3 pilar calculator, fetch data dari Supabase
  (bukan sheet lokal seperti HRIS)
- `16_kpi_writer.gs` — tulis hasil ke tab DASHBOARD STAFF + insert ke
  Supabase `kpi_targets` (UUID staff_id yang benar, bukan text)
- Update `09_trigger.gs`: replace trigger `updateAllKpiThisMonth` lama
  (broken, staff_id TEXT vs UUID) dengan pipeline baru
- Update `10_menu.gs`: tambah submenu 📊 KPI RAOS → Hitung KPI Bulan Ini
  (manual) + Tampilkan Ringkasan

## Migrasi Supabase (opsional)

Kalau mau simpan gaji di DB (biar tidak fetch dari sheet tiap kali):
```sql
-- migration raos_035
ALTER TABLE user_profiles ADD COLUMN salary numeric DEFAULT 0;
-- + update trigger prevent_ssot_staff_column_edit blok edit salary
--   dari client (SSoT rule)
-- + update gas/13_staff_sync.gs baca kolom C (Gaji Staff) dari sheet,
--   set salary saat sync
```

Atau tetap fetch on-demand dari sheet SSOT (lebih fresh, sedikit slower).
Rekomendasi: tambah kolom `salary` di DB — sinkron dengan kolom SSoT
lain (name/role/phone/staff_id).

## Blocker sebelum mulai koding

Anda perlu tetapkan:
1. **`BOBOT_SCAN`** (harga per scan validated, Rp) — atau formula lain
   untuk konversi scan → realisasi
2. **`BOBOT_HARI`** (bobot Rp per hari hadir) — atau skip (Pilar 1 murni
   dari scan saja?)
3. **`TARGET CABANG SOETA`** bulan ini (nominal Rp)
4. **Threshold `AKTIF_TINGGI`** untuk driver lama aktif (default HRIS: 8
   isi saldo/bulan; untuk RAOS mungkin: 8 scan/bulan?)
5. Isi awal `RAOS_KPI_MANUAL` sheet untuk 3 staff Soeta bulan berjalan
   (Briefing/Edukasi/Problem Solving/Pelayanan/Kerapian/Pelanggaran)

Setelah 1-4 ditetapkan, sesi 17 langsung eksekusi (est. 2-3 sesi kerja
untuk full pipeline + testing).

## Referensi cepat

- HRIS GAS: `1sb8MznaH1GtbsR02zLhwML8Q_rOji2Ow6XjfNSJ3otOpwXmbG_D9wTbR`
- HRIS Config file: `Config.js` (KPI_CONFIG, BOBOT_JABATAN, GRADE_BANDS,
  BONUS_PERSEN)
- HRIS Engine file: `KPIEngine.js` (3 pilar calculator, formula perkalian)
- HRIS Target file: `Target.js` (getTargetCabang, getTargetStaff)
- RAOS spreadsheet ID: `1eYS2mM3Sy-BNAVGfp8BUHtsZuLiGDetnJeGw-AWk__8`
- RAOS Supabase project: `vlievtojpmrbsmzlqswl`
- RAOS staff (per 2026-07-24, `source=ssot_master_staff`):
  Bobby Rahman (direksi, Head Office — TIDAK MASUK KPI operasional),
  Hendro (staff), Henry (koordinator)
