// ============================================================
// 15_kpi_engine.gs — KPI 3-pilar RAOS Soeta (Supabase-backed)
// ============================================================
//
// Beda dengan HRIS KPIEngine V1 (yang baca sheet ABSENSI/DB_DRIVER lokal),
// engine ini ambil data langsung dari Supabase RAOS supaya konsisten dengan
// operasional real-time PWA. Sumber:
//   Pilar 1 (Realisasi):        scan_orders + raos_attendance
//   Pilar 2 (Pembinaan Driver): raos_drivers + scan_orders + sheet RAOS_KPI_MANUAL
//   Pilar 3 (Disiplin SOP):     raos_attendance + sheet RAOS_KPI_MANUAL
//
// Formula final (mengikuti HRIS): TotalKPI = (P1/50)×(P2/30)×(P3/20)×100
//   → satu pilar 0 → total 0.

function kpiGetTargetCabang_() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(KPI_CONFIG.SHEET.MASTER_TARGET)
  if (!sh) return null
  const rows = sh.getDataRange().getValues().slice(1)
  const row = rows.find(r => String(r[0]).trim() === KPI_CONFIG.CABANG_NAME)
  return row ? Number(row[1]) || 0 : 0
}

function kpiGetActiveStaff_() {
  // Tarik semua staff Soeta yang aktif — role selain 'direksi' (non-operasional).
  // Direksi bisa masuk KPI juga kalau perlu, ubah OR di URL param.
  const rows = callSupabase(
    "user_profiles?is_active=eq.true&role=in.(staff,koordinator,admin,management)&select=id,full_name,role"
  )
  return (rows || []).filter(r => r.full_name) // guard
}

function kpiGetManualEntries_() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(KPI_CONFIG.SHEET.RAOS_KPI_MANUAL)
  if (!sh) return {}
  const rows = sh.getDataRange().getValues()
  const header = rows[0].map(h => String(h).trim().toLowerCase())
  const idx = {
    nama: header.indexOf('nama staff'),
    periode: header.indexOf('periode'),
    briefing: header.indexOf('briefing'),
    edukasi: header.indexOf('edukasi sop'),
    problem: header.indexOf('problem solving'),
    pelayanan: header.indexOf('pelayanan'),
    kerapian: header.indexOf('kerapian'),
    pelanggaran: header.indexOf('pelanggaran sop'),
  }
  const out = {}
  rows.slice(1).forEach(r => {
    const nama = String(r[idx.nama] || '').trim()
    if (!nama) return
    out[nama] = {
      briefing:    Number(r[idx.briefing]) || 0,
      edukasi:     Number(r[idx.edukasi]) || 0,
      problem:     Number(r[idx.problem]) || 0,
      pelayanan:   Number(r[idx.pelayanan]) || 0,
      kerapian:    Number(r[idx.kerapian]) || 0,
      pelanggaran: Number(r[idx.pelanggaran]) || 0,
    }
  })
  return out
}

function kpiPilar1_(staffId, periode, targetStaff, tanggalStart, tanggalEnd) {
  const MAX = KPI_CONFIG.SALDO.MAX_POIN
  if (!targetStaff) return { nilai: 0, realisasi: 0, targetStaff: 0, persen: 0 }

  const scanCount = kpiCountScans_(staffId, tanggalStart, tanggalEnd)
  const hariHadir = kpiCountHariHadir_(staffId, tanggalStart, tanggalEnd)
  const realisasi = scanCount * KPI_CONFIG.BOBOT_SCAN + hariHadir * KPI_CONFIG.BOBOT_HARI
  const persen = realisasi / targetStaff
  const nilai = Math.min(Math.round(persen * MAX * 100) / 100, MAX)
  return { nilai, realisasi, targetStaff, persen: Math.round(persen * 10000) / 100, scanCount, hariHadir }
}

function kpiPilar2_(staffId, periode, tanggalStart, tanggalEnd, manual) {
  const IND = KPI_CONFIG.DRIVER.INDIKATOR
  const THRESH = KPI_CONFIG.DRIVER.AKTIF_TINGGI_THRESHOLD

  // Driver baru = raos_drivers.created_at dalam periode. Ambil semua driver Soeta
  // aktif, cek scan_orders per driver bulan ini.
  const driverBaru = callSupabase(
    `raos_drivers?is_active=eq.true&created_at=gte.${tanggalStart}&created_at=lte.${tanggalEnd}&select=id,created_at`
  ) || []
  const driverBaruAktif = driverBaru.length > 0 ? IND.DRIVER_BARU_AKTIF : 0

  // Driver lama aktif tinggi: cek jumlah scan per driver.id (lump-sum Soeta,
  // bukan per staff). Approach: kalau ada minimal 1 driver dengan ≥ THRESHOLD
  // scan bulan ini yang tidak "baru", dapat poin.
  const scanCounts = callSupabase(
    `scan_orders?scanned_at=gte.${tanggalStart}&scanned_at=lte.${tanggalEnd}&status=eq.validated&select=driver_id`
  ) || []
  const perDriver = {}
  scanCounts.forEach(r => { perDriver[r.driver_id] = (perDriver[r.driver_id] || 0) + 1 })
  const baruIds = new Set(driverBaru.map(d => d.id))
  const driverLamaAktif = Object.entries(perDriver)
    .some(([id, cnt]) => !baruIds.has(id) && cnt >= THRESH) ? IND.DRIVER_LAMA_AKTIF : 0

  const briefing   = manual.briefing > 0 ? IND.BRIEFING : 0
  const edukasi    = manual.edukasi  > 0 ? IND.EDUKASI_SOP : 0
  const problem    = manual.problem  > 0 ? IND.PROBLEM_SOLVING : 0

  const nilai = Math.min(driverBaruAktif + driverLamaAktif + briefing + edukasi + problem, KPI_CONFIG.DRIVER.MAX_POIN)
  return { nilai, driverBaruAktif, driverLamaAktif, briefing, edukasi, problem }
}

function kpiPilar3_(staffId, periode, tanggalStart, tanggalEnd, manual) {
  const IND = KPI_CONFIG.SOP.INDIKATOR
  const EXPECTED = KPI_CONFIG.SOP.EXPECTED_WORKDAYS_PER_MONTH

  const attendance = callSupabase(
    `raos_attendance?staff_id=eq.${staffId}&date=gte.${tanggalStart}&date=lte.${tanggalEnd}&select=date,status`
  ) || []
  const hariHadir = attendance.filter(a => a.status === 'hadir' || a.status === 'terlambat').length
  const hariAlpha = attendance.filter(a => a.status === 'alpha' || a.status === 'a').length

  const rasioHadir = Math.min(hariHadir / EXPECTED, 1)
  const poinAbsensi = Math.round(rasioHadir * IND.ABSENSI * 100) / 100
  const poinKehadiran = hariAlpha === 0
    ? IND.KEHADIRAN
    : Math.max(0, Math.round((1 - hariAlpha / EXPECTED) * IND.KEHADIRAN * 100) / 100)
  const poinPelayanan = manual.pelayanan > 0 ? IND.PELAYANAN : 0
  const poinKerapian  = manual.kerapian  > 0 ? IND.KERAPIAN : 0
  const poinPelanggaran = Math.max(0, IND.PELANGGARAN_SOP - manual.pelanggaran)

  const nilai = Math.min(
    poinAbsensi + poinKehadiran + poinPelayanan + poinKerapian + poinPelanggaran,
    KPI_CONFIG.SOP.MAX_POIN
  )
  return { nilai, hariHadir, hariAlpha, poinAbsensi, poinKehadiran, poinPelayanan, poinKerapian, poinPelanggaran }
}

function kpiCountScans_(staffId, tanggalStart, tanggalEnd) {
  const rows = callSupabase(
    `scan_orders?staff_id=eq.${staffId}&scanned_at=gte.${tanggalStart}&scanned_at=lte.${tanggalEnd}&status=eq.validated&select=id`
  )
  return (rows || []).length
}

function kpiCountHariHadir_(staffId, tanggalStart, tanggalEnd) {
  const rows = callSupabase(
    `raos_attendance?staff_id=eq.${staffId}&date=gte.${tanggalStart}&date=lte.${tanggalEnd}&status=in.(hadir,terlambat)&select=date`
  )
  return (rows || []).length
}

function kpiGetGrade_(kpiScore) {
  if (kpiScore == null || isNaN(kpiScore)) return '-'
  for (const b of KPI_CONFIG.GRADE_BANDS) if (kpiScore >= b.min) return b.grade
  return 'E'
}

function kpiHitungPeriode_(periode) {
  const [year, month] = periode.split('-').map(Number)
  const start = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { start, end }
}

/**
 * Hitung KPI semua staff Soeta untuk periode. Tulis ke sheet DASHBOARD STAFF
 * dan insert/upsert ke Supabase kpi_targets (staff_id UUID, bukan text lama).
 */
function updateAllKpiRAOS() {
  const periode = kpiCurrentPeriode_()
  const { start, end } = kpiHitungPeriode_(periode)
  const targetCabang = kpiGetTargetCabang_()

  if (!targetCabang) {
    logSistem('warning', 'updateAllKpiRAOS', 'skipped',
      `Target Cabang Soeta = 0 di sheet MASTER TARGET. Set nominal Rp target dulu.`)
    try { SpreadsheetApp.getUi().alert('⚠️ Set nilai "Target Cabang" untuk Soeta di sheet MASTER TARGET dulu.') } catch(e){}
    return
  }

  const staffList = kpiGetActiveStaff_()
  if (staffList.length === 0) {
    logSistem('warning', 'updateAllKpiRAOS', 'skipped', 'Tidak ada staff aktif Soeta')
    return
  }

  const manualEntries = kpiGetManualEntries_()
  const jumlahStaff = staffList.length
  const now = new Date().toISOString()
  const results = []

  staffList.forEach(staff => {
    const bobot = KPI_CONFIG.BOBOT_JABATAN[String(staff.role).toUpperCase()] || KPI_CONFIG.BOBOT_JABATAN_DEFAULT
    const targetStaff = (targetCabang / jumlahStaff) * bobot
    const manual = manualEntries[staff.full_name] || { briefing: 0, edukasi: 0, problem: 0, pelayanan: 0, kerapian: 0, pelanggaran: 0 }

    const p1 = kpiPilar1_(staff.id, periode, targetStaff, start, end)
    const p2 = kpiPilar2_(staff.id, periode, start, end, manual)
    const p3 = kpiPilar3_(staff.id, periode, start, end, manual)

    const kpiScore = Math.round(
      (p1.nilai / KPI_CONFIG.SALDO.MAX_POIN) *
      (p2.nilai / KPI_CONFIG.DRIVER.MAX_POIN) *
      (p3.nilai / KPI_CONFIG.SOP.MAX_POIN) *
      100 * 100
    ) / 100

    const grade = kpiGetGrade_(kpiScore)
    results.push({ staff, targetStaff, p1, p2, p3, kpiScore, grade })

    // Upsert ke Supabase kpi_targets (staff_id UUID sekarang, bukan text)
    try {
      const [yr, mo] = periode.split('-').map(Number)
      callSupabase('kpi_targets?on_conflict=staff_id,month,year', 'POST', {
        staff_id: staff.id,
        month: mo,
        year: yr,
        target_kpi_pct: 100,
        actual_kpi_pct: kpiScore,
        actual_scan: p1.scanCount,
        actual_attendance_pct: p3.hariHadir > 0 ? Math.round(p3.hariHadir / KPI_CONFIG.SOP.EXPECTED_WORKDAYS_PER_MONTH * 100) : 0,
      }, { headers: { Prefer: 'resolution=merge-duplicates' } })
    } catch (e) {
      logSistem('error', 'updateAllKpiRAOS', 'error', `${staff.full_name}: ${e.message}`)
    }
  })

  // Tulis DASHBOARD STAFF
  kpiWriteDashboard_(results, targetCabang, jumlahStaff, periode)

  logSistem('cron', 'updateAllKpiRAOS', 'success',
    `${results.length} staff, periode ${periode}, target cabang Rp ${targetCabang.toLocaleString('id-ID')}`)
  try {
    SpreadsheetApp.getUi().alert(`✅ KPI ${periode} update: ${results.length} staff Soeta`)
  } catch(e) {}
}

function kpiWriteDashboard_(results, targetCabang, jumlahStaff, periode) {
  const ss = SpreadsheetApp.getActiveSpreadsheet()
  let sh = ss.getSheetByName(KPI_CONFIG.SHEET.DASHBOARD_STAFF)
  if (!sh) sh = ss.insertSheet(KPI_CONFIG.SHEET.DASHBOARD_STAFF)
  sh.clear()

  const header = ['Nama', 'Role', 'Target', 'Realisasi', '%', 'KPI', 'Grade',
    'Scan', 'Hari Hadir', 'Hari Alpha', 'P1 (Realisasi)', 'P2 (Driver)', 'P3 (SOP)', 'Periode']
  sh.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold').setBackground('#F5A623').setFontColor('#000')

  const rows = results.map(r => [
    r.staff.full_name,
    r.staff.role,
    r.targetStaff,
    r.p1.realisasi,
    (r.p1.persen ?? 0),
    r.kpiScore,
    r.grade,
    r.p1.scanCount,
    r.p3.hariHadir,
    r.p3.hariAlpha,
    r.p1.nilai,
    r.p2.nilai,
    r.p3.nilai,
    periode,
  ])
  if (rows.length > 0) sh.getRange(2, 1, rows.length, header.length).setValues(rows)
  sh.getRange(2, 3, rows.length, 2).setNumberFormat('"Rp"#,##0')
  sh.getRange(2, 5, rows.length, 1).setNumberFormat('0.0"%"')
  sh.autoResizeColumns(1, header.length)
}

/**
 * Inisialisasi 3 sheet KPI RAOS kalau belum ada:
 *   MASTER TARGET, DASHBOARD STAFF (dibuat kosong, isi oleh updateAllKpiRAOS),
 *   RAOS_KPI_MANUAL.
 */
function initKpiSheetsRAOS() {
  const ss = SpreadsheetApp.getActiveSpreadsheet()
  const created = []
  const existed = []

  // MASTER TARGET
  let sh = ss.getSheetByName(KPI_CONFIG.SHEET.MASTER_TARGET)
  if (!sh) {
    sh = ss.insertSheet(KPI_CONFIG.SHEET.MASTER_TARGET)
    sh.getRange(1, 1, 1, 3).setValues([['Cabang', 'Target Cabang (Rp)', 'Bulan Aktif']]).setFontWeight('bold').setBackground('#F5A623')
    sh.getRange(2, 1, 1, 3).setValues([[KPI_CONFIG.CABANG_NAME, 0, kpiCurrentPeriode_()]])
    sh.getRange(2, 2).setNumberFormat('"Rp"#,##0')
    created.push(KPI_CONFIG.SHEET.MASTER_TARGET)
  } else {
    existed.push(KPI_CONFIG.SHEET.MASTER_TARGET)
  }

  // DASHBOARD STAFF (header saja — isi dibuat updateAllKpiRAOS)
  if (!ss.getSheetByName(KPI_CONFIG.SHEET.DASHBOARD_STAFF)) {
    const dsh = ss.insertSheet(KPI_CONFIG.SHEET.DASHBOARD_STAFF)
    dsh.getRange(1, 1, 1, 3).setValues([['Sheet ini di-generate otomatis oleh updateAllKpiRAOS', '', '']])
    created.push(KPI_CONFIG.SHEET.DASHBOARD_STAFF)
  } else {
    existed.push(KPI_CONFIG.SHEET.DASHBOARD_STAFF)
  }

  // RAOS_KPI_MANUAL — input harian dari koordinator
  let msh = ss.getSheetByName(KPI_CONFIG.SHEET.RAOS_KPI_MANUAL)
  if (!msh) {
    msh = ss.insertSheet(KPI_CONFIG.SHEET.RAOS_KPI_MANUAL)
    msh.getRange(1, 1, 1, 8).setValues([[
      'Nama Staff', 'Periode', 'Briefing', 'Edukasi SOP', 'Problem Solving',
      'Pelayanan', 'Kerapian', 'Pelanggaran SOP'
    ]]).setFontWeight('bold').setBackground('#22C55E').setFontColor('#fff')
    msh.getRange(2, 1, 1, 8).setValues([['(contoh) Hendro', kpiCurrentPeriode_(), 1, 1, 0, 1, 1, 0]])
    created.push(KPI_CONFIG.SHEET.RAOS_KPI_MANUAL)
  } else {
    existed.push(KPI_CONFIG.SHEET.RAOS_KPI_MANUAL)
  }

  try {
    SpreadsheetApp.getUi().alert(
      '✅ Init sheet KPI RAOS selesai.\n\n' +
      (created.length ? 'Dibuat baru: ' + created.join(', ') + '\n' : '') +
      (existed.length ? 'Sudah ada:   ' + existed.join(', ') + '\n\n' : '\n') +
      'Langkah berikutnya:\n' +
      '1. Buka tab MASTER TARGET → isi kolom "Target Cabang (Rp)" untuk Soeta\n' +
      '2. Buka tab RAOS_KPI_MANUAL → hapus baris contoh, isi entri indikator manual per staff/periode\n' +
      '3. Jalankan menu 📊 KPI RAOS → Update KPI Bulan Ini'
    )
  } catch(e){}
}
