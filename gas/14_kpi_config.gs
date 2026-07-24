// ============================================================
// 14_kpi_config.gs — KPI Config RAOS (adopsi dari HRIS KPIEngine V1)
// ============================================================
//
// Konstanta bisa di-override via Script Property (biar tidak perlu redeploy):
//   BOBOT_SCAN            — Rp per scan validated (default 5000)
//   BOBOT_HARI            — Rp per hari hadir (default 100000)
//   AKTIF_TINGGI_THRESHOLD — jumlah scan/bulan supaya driver dianggap aktif tinggi (default 8)
//   RAOS_KPI_PERIODE      — override periode 'yyyy-MM' (default: bulan berjalan)
//
// Target Cabang Soeta di-set di sheet spreadsheet RAOS: tab MASTER TARGET,
// kolom Target Cabang. Bukan Script Property — supaya bisa diubah tanpa
// akses developer.

const KPI_CONFIG = {
  // ---- Sheet di spreadsheet RAOS (di file SPREADSHEET_ID) ----
  SHEET: {
    MASTER_TARGET:   'MASTER TARGET',
    DASHBOARD_STAFF: 'DASHBOARD STAFF',
    RAOS_KPI_MANUAL: 'RAOS_KPI_MANUAL',
  },

  CABANG_NAME: 'ID Rifim Airport Soeta', // literal match kolom Cabang di MASTER TARGET

  // ---- Bobot Pilar 1 (Realisasi Operasional) ----
  // Rp konversi: 1 scan validated = BOBOT_SCAN, 1 hari hadir = BOBOT_HARI.
  // Realisasi (Rp) = scanCount × BOBOT_SCAN + hariHadir × BOBOT_HARI.
  BOBOT_SCAN: parseFloat(PropertiesService.getScriptProperties().getProperty('BOBOT_SCAN')) || 5000,
  BOBOT_HARI: parseFloat(PropertiesService.getScriptProperties().getProperty('BOBOT_HARI')) || 100000,

  // ---- Bobot Jabatan (Target Staff = Target Cabang/Jumlah Staff × Bobot Jabatan) ----
  BOBOT_JABATAN: {
    'KOORDINATOR': 1.20,
    'STAFF':       1.00,
    'ADMIN':       1.00,
    'MANAGEMENT':  1.00,
    'DIREKSI':     1.00, // direksi biasanya bukan operasional — di-exclude di query staff
  },
  BOBOT_JABATAN_DEFAULT: 1.00,

  // ---- Pilar 1 — Realisasi Operasional (max 50 poin) ----
  SALDO: {
    MAX_POIN: 50,
    BONUS_OVER_TARGET: [
      { minPersen: 1.25, bonus: 5 },
      { minPersen: 1.20, bonus: 4 },
      { minPersen: 1.15, bonus: 3 },
      { minPersen: 1.10, bonus: 2 },
      { minPersen: 1.05, bonus: 1 },
      { minPersen: 0,    bonus: 0 }
    ]
  },

  // ---- Pilar 2 — Pembinaan Driver (max 30 poin) ----
  DRIVER: {
    MAX_POIN: 30,
    INDIKATOR: {
      DRIVER_BARU_AKTIF: 10, // driver register bulan ini + ≥ 1 scan
      DRIVER_LAMA_AKTIF: 5,  // driver lama dengan ≥ AKTIF_TINGGI_THRESHOLD scan bulan ini
      BRIEFING:          5,  // manual sheet RAOS_KPI_MANUAL
      EDUKASI_SOP:       5,  // manual
      PROBLEM_SOLVING:   5,  // manual
    },
    AKTIF_TINGGI_THRESHOLD: parseInt(
      PropertiesService.getScriptProperties().getProperty('AKTIF_TINGGI_THRESHOLD')
    ) || 8,
  },

  // ---- Pilar 3 — Disiplin & SOP (max 20 poin) ----
  SOP: {
    MAX_POIN: 20,
    INDIKATOR: {
      ABSENSI:         5, // proporsional hadir/expected
      KEHADIRAN:       5, // penuh kalau 0 alpha
      PELAYANAN:       5, // manual
      KERAPIAN:        3, // manual
      PELANGGARAN_SOP: 2, // manual (dikurangi per pelanggaran)
    },
    EXPECTED_WORKDAYS_PER_MONTH: 26,
  },

  // ---- Grade & Bonus ----
  GRADE_BANDS: [
    { min: 95, grade: 'A+' },
    { min: 90, grade: 'A' },
    { min: 80, grade: 'B' },
    { min: 70, grade: 'C' },
    { min: 60, grade: 'D' },
    { min: -Infinity, grade: 'E' }
  ],
  BONUS_PERSEN: {
    'A+': 1.00, 'A': 0.90, 'B': 0.75, 'C': 0.50, 'D': 0.25, 'E': 0.00, '-': 0.00,
  },
}

/** Format periode default = bulan berjalan atau override via Script Property. */
function kpiCurrentPeriode_() {
  const override = PropertiesService.getScriptProperties().getProperty('RAOS_KPI_PERIODE')
  if (override) return override
  const now = new Date()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  return `${now.getFullYear()}-${mm}`
}

/** Cek apakah tanggal berada di periode 'yyyy-MM'. */
function kpiInPeriode_(date, periode) {
  if (!date) return false
  const d = date instanceof Date ? date : new Date(date)
  if (isNaN(d.getTime())) return false
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${d.getFullYear()}-${mm}` === periode
}
