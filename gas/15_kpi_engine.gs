// ============================================================
// 15_kpi_engine.gs — KPI 3-pilar RAOS Soeta (Supabase-backed)
// ============================================================
//
// RAOS Soeta = cabang "Khusus Order" — target Pilar 1 = jumlah scan
// validated, bukan Rp saldo. Cabang lain pakai target saldo Rp — itu
// project HRIS terpisah.
//
// Sumber data:
//   Pilar 1 (Order):            scan_orders (Supabase)
//   Pilar 2 (Pembinaan Driver): raos_drivers + scan_orders + sheet RAOS_KPI_MANUAL
//   Pilar 3 (Disiplin SOP):     raos_attendance + sheet RAOS_KPI_MANUAL
//
// Formula final: TotalKPI = (P1/50)×(P2/30)×(P3/20)×100
//   → satu pilar 0 → total 0.

/**
 * Ambil spreadsheet RAOS — coba container-bound dulu (menu invocation),
 * fallback ke Script Property SPREADSHEET_ID (cron trigger context tidak
 * punya active spreadsheet).
 */
function kpiGetSpreadsheet_() {
  // Web App context: getActiveSpreadsheet() return null. Fallback ke ID
  // hardcoded (sheet RAOS resmi) — tidak perlu Script Property setup.
  const active = SpreadsheetApp.getActiveSpreadsheet()
  if (active) return active
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID')
    || '1eYS2mM3Sy-BNAVGfp8BUHtsZuLiGDetnJeGw-AWk__8'
  return SpreadsheetApp.openById(id)
}

/**
 * Ambil target untuk cabang tertentu (slug match kolom A).
 * Return { order, saldo, mode }:
 *   mode = 'order' → RAOS Soeta (Pilar 1 = jumlah scan)
 *   mode = 'saldo' → cabang lain (Pilar 1 = Rp saldo)
 */
function kpiGetTargetByCabang_(slug) {
  const sh = kpiGetSpreadsheet_().getSheetByName(KPI_CONFIG.SHEET.MASTER_TARGET)
  if (!sh) return { order: 0, saldo: 0, mode: 'order' }
  const rows = sh.getDataRange().getValues().slice(1)
  const row = rows.find(r => String(r[0]).trim() === slug)
  if (!row) return { order: 0, saldo: 0, mode: slug === KPI_CONFIG.CABANG_NAME ? 'order' : 'saldo' }
  const order = Number(row[1]) || 0
  const saldo = Number(row[2]) || 0
  // Soeta khusus Order. Cabang lain khusus Saldo.
  const mode = slug === 'ID Rifim Airport Soeta' ? 'order' : 'saldo'
  return { order, saldo, mode }
}

// Backward-compat untuk pemanggil lama (default cabang RAOS = Soeta)
function kpiGetTargetCabang_() {
  return kpiGetTargetByCabang_(KPI_CONFIG.CABANG_NAME).order
}

function kpiGetActiveStaff_() {
  // Multi-cabang (P2.12) — tarik semua staff aktif dengan branch info.
  // Direksi (Head Office) excluded — non-operasional.
  const rows = callSupabase(
    "user_profiles?is_active=eq.true&role=in.(staff,koordinator,admin,management)" +
    "&select=id,full_name,role,branch_id,branches(id,slug,name,parent_branch_id)"
  )
  return (rows || []).filter(r => r.full_name)
}

/** Slug cabang top-level untuk staff (sub-terminal → parent slug). */
function kpiResolveCabangSlug_(staff) {
  if (!staff.branches) return null
  // Terminal T1/T2/T3 → parent Soeta
  if (staff.branches.parent_branch_id) {
    // Ambil parent slug via inline query di batch — cache di map global
    return _resolveParentSlug_(staff.branches.parent_branch_id)
  }
  return staff.branches.slug
}

const _parentSlugCache = {}
function _resolveParentSlug_(parentId) {
  if (_parentSlugCache[parentId]) return _parentSlugCache[parentId]
  const rows = callSupabase(`branches?id=eq.${parentId}&select=slug`)
  const slug = (rows && rows[0]) ? rows[0].slug : null
  _parentSlugCache[parentId] = slug
  return slug
}

function kpiGetManualEntries_() {
  const sh = kpiGetSpreadsheet_().getSheetByName(KPI_CONFIG.SHEET.RAOS_KPI_MANUAL)
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

function kpiPilar1_(staffId, periode, targetStaff, tanggalStart, tanggalEnd, mode) {
  const MAX = KPI_CONFIG.ORDER.MAX_POIN
  if (!targetStaff) return { nilai: 0, realisasi: 0, targetStaff: 0, persen: 0, scanCount: 0, saldoTotal: 0, mode }

  let realisasi = 0
  const scanCount = kpiCountScans_(staffId, tanggalStart, tanggalEnd)
  const saldoTotal = kpiSumSaldo_(staffId, tanggalStart, tanggalEnd)

  if (mode === 'saldo') {
    realisasi = saldoTotal
  } else {
    realisasi = scanCount
  }
  const persen = realisasi / targetStaff
  const nilai = Math.min(Math.round(persen * MAX * 100) / 100, MAX)
  return { nilai, realisasi, targetStaff, persen: Math.round(persen * 10000) / 100, scanCount, saldoTotal, mode }
}

function kpiSumSaldo_(staffId, tanggalStart, tanggalEnd) {
  const rows = callSupabase(
    `raos_saldo_requests?staff_id=eq.${staffId}&is_processed=eq.true` +
    `&processed_at=gte.${tanggalStart}&processed_at=lte.${tanggalEnd}&select=nominal`
  )
  return (rows || []).reduce((s, r) => s + (Number(r.nominal) || 0), 0)
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

  const staffList = kpiGetActiveStaff_()
  if (staffList.length === 0) {
    logSistem('warning', 'updateAllKpiRAOS', 'skipped', 'Tidak ada staff aktif')
    return
  }

  // Group staff per cabang → hitung Target Staff per cabang.
  const perCabang = {} // { slug: [staff...] }
  staffList.forEach(s => {
    const slug = kpiResolveCabangSlug_(s)
    if (!slug) return
    if (!perCabang[slug]) perCabang[slug] = []
    perCabang[slug].push(s)
  })

  const manualEntries = kpiGetManualEntries_()
  const now = new Date().toISOString()
  const results = []

  Object.keys(perCabang).forEach(slug => {
    const staffCabang = perCabang[slug]
    const tgt = kpiGetTargetByCabang_(slug)
    const targetCabang = tgt.mode === 'order' ? tgt.order : tgt.saldo

    if (!targetCabang) {
      logSistem('warning', 'updateAllKpiRAOS', 'skipped',
        `Target ${tgt.mode.toUpperCase()} cabang "${slug}" = 0 di MASTER TARGET — skip ${staffCabang.length} staff`)
      return
    }
    const jumlahStaff = staffCabang.length

    staffCabang.forEach(staff => {
      const bobot = KPI_CONFIG.BOBOT_JABATAN[String(staff.role).toUpperCase()] || KPI_CONFIG.BOBOT_JABATAN_DEFAULT
      const targetStaff = (targetCabang / jumlahStaff) * bobot
      const manual = manualEntries[staff.full_name] || { briefing: 0, edukasi: 0, problem: 0, pelayanan: 0, kerapian: 0, pelanggaran: 0 }

      const p1 = kpiPilar1_(staff.id, periode, targetStaff, start, end, tgt.mode)
      const p2 = kpiPilar2_(staff.id, periode, start, end, manual)
      const p3 = kpiPilar3_(staff.id, periode, start, end, manual)

      const kpiScore = Math.round(
        (p1.nilai / KPI_CONFIG.ORDER.MAX_POIN) *
        (p2.nilai / KPI_CONFIG.DRIVER.MAX_POIN) *
        (p3.nilai / KPI_CONFIG.SOP.MAX_POIN) *
        100 * 100
      ) / 100

      const grade = kpiGetGrade_(kpiScore)
      results.push({ staff, cabangSlug: slug, targetMode: tgt.mode, targetStaff, p1, p2, p3, kpiScore, grade })

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
  })

  kpiWriteDashboard_(results, periode)

  logSistem('cron', 'updateAllKpiRAOS', 'success',
    `${results.length} staff lintas ${Object.keys(perCabang).length} cabang, periode ${periode}`)
  try {
    SpreadsheetApp.getUi().alert(`✅ KPI ${periode} update: ${results.length} staff lintas ${Object.keys(perCabang).length} cabang`)
  } catch(e) {}
}

function kpiWriteDashboard_(results, periode) {
  const ss = kpiGetSpreadsheet_()
  let sh = ss.getSheetByName(KPI_CONFIG.SHEET.DASHBOARD_STAFF)
  if (!sh) sh = ss.insertSheet(KPI_CONFIG.SHEET.DASHBOARD_STAFF)
  sh.clear()

  const header = [
    'Nama', 'Cabang', 'Role', 'Mode Target',
    'Target Staff', 'Realisasi', '%', 'KPI', 'Grade',
    'Hari Hadir', 'Hari Alpha',
    'P1', 'P2 (Driver)', 'P3 (SOP)', 'Periode'
  ]
  sh.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold').setBackground('#F5A623').setFontColor('#000')

  const rows = results.map(r => [
    r.staff.full_name,
    r.cabangSlug,
    r.staff.role,
    r.targetMode,
    Math.round(r.targetStaff * 100) / 100,
    r.p1.realisasi,
    (r.p1.persen ?? 0),
    r.kpiScore,
    r.grade,
    r.p3.hariHadir,
    r.p3.hariAlpha,
    r.p1.nilai,
    r.p2.nilai,
    r.p3.nilai,
    periode,
  ])
  if (rows.length > 0) {
    sh.getRange(2, 1, rows.length, header.length).setValues(rows)
    // Format kolom Target Staff + Realisasi tergantung mode:
    // 'order' → 'scan', 'saldo' → Rp. Karena mix, pakai general format
    // dengan separator ribuan.
    sh.getRange(2, 5, rows.length, 2).setNumberFormat('#,##0.##')
    sh.getRange(2, 7, rows.length, 1).setNumberFormat('0.0"%"')
  }
  sh.setFrozenRows(1)
  sh.autoResizeColumns(1, header.length)
}

/**
 * Inisialisasi 3 sheet KPI RAOS kalau belum ada:
 *   MASTER TARGET, DASHBOARD STAFF (dibuat kosong, isi oleh updateAllKpiRAOS),
 *   RAOS_KPI_MANUAL.
 */
function initKpiSheetsRAOS() {
  const ss = kpiGetSpreadsheet_()
  const created = []
  const existed = []

  // MASTER TARGET
  // Multi-cabang (P2.12) — seed 9 cabang aktif dengan 2 kolom target.
  // Kolom B = Target Order (untuk Soeta khusus).
  // Kolom C = Target Saldo Rp (untuk cabang lain).
  // Kolom D = Bulan Aktif.
  const ALL_CABANG_SLUGS = [
    'ID Rifim Airport Soeta',
    'ID Rifim Airport Batam',
    'ID Rifim Airport Jambi',
    'ID Rifim Airport Balikpapan',
    'ID Rifim Airport Manado',
    'ID Rifim Airport Pekanbaru',
    'ID Rifim Airport Makassar',
    'ID Rifim Batam',
    'ID Rifim Jambi Luar',
  ]
  const periode = kpiCurrentPeriode_()

  let sh = ss.getSheetByName(KPI_CONFIG.SHEET.MASTER_TARGET)
  if (!sh) {
    sh = ss.insertSheet(KPI_CONFIG.SHEET.MASTER_TARGET)
    created.push(KPI_CONFIG.SHEET.MASTER_TARGET)
  } else {
    existed.push(KPI_CONFIG.SHEET.MASTER_TARGET)
  }
  // Header dan skema selalu direfresh (idempotent)
  sh.getRange(1, 1, 1, 4).setValues([[
    'Cabang', 'Target Order (Scan Valid)', 'Target Saldo (Rp)', 'Bulan Aktif'
  ]]).setFontWeight('bold').setBackground('#F5A623')

  // Ambil existing rows (kolom A) untuk skip yang sudah ada
  const existingCabang = sh.getLastRow() > 1
    ? sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().flat().map(v => String(v).trim())
    : []
  let nextRow = sh.getLastRow() + 1
  ALL_CABANG_SLUGS.forEach(slug => {
    if (existingCabang.includes(slug)) return
    // Nilai default: Soeta Order 30.000; cabang saldo 0 (isi manual)
    const defaultOrder = slug === 'ID Rifim Airport Soeta' ? 30000 : 0
    const defaultSaldo = slug === 'ID Rifim Airport Soeta' ? 0 : 0
    sh.getRange(nextRow, 1, 1, 4).setValues([[slug, defaultOrder, defaultSaldo, periode]])
    nextRow++
  })
  sh.getRange(2, 2, ALL_CABANG_SLUGS.length, 1).setNumberFormat('#,##0" scan"')
  sh.getRange(2, 3, ALL_CABANG_SLUGS.length, 1).setNumberFormat('"Rp"#,##0')
  sh.setFrozenRows(1)

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
      '1. Buka tab MASTER TARGET → isi Target Order (Soeta) atau Target Saldo (cabang lain) per baris\n' +
      '2. Buka tab RAOS_KPI_MANUAL → hapus baris contoh, isi entri indikator manual per staff/periode\n' +
      '3. Jalankan menu 📊 KPI RAOS → Update KPI Bulan Ini'
    )
  } catch(e){}
}

/**
 * P2.13 — bikin tab "Form Isi Saldo" kalau belum ada. Idempotent —
 * kalau sudah ada dari `syncSaldoRequestsToSheet` skip.
 */
function initSheetFormIsiSaldo() {
  const ss = kpiGetSpreadsheet_()
  // Delegate ke ensureSaldoSheet_ di 16_saldo_sync.gs supaya format
  // header + kolom + checkbox konsisten dengan sync writer. Idempotent.
  const sh = ensureSaldoSheet_(ss)
  const existed = sh.getLastRow() > 1
  try {
    SpreadsheetApp.getUi().alert(
      (existed ? '✅ Tab "Form Isi Saldo" di-refresh.\n' : '✅ Tab "Form Isi Saldo" dibuat.\n') + '\n' +
      'Format kolom:\n' +
      '  A No Request  B Tanggal  C Nama Staff  D Cabang  E Nominal\n' +
      '  F ID Login Driver  G Nama Driver  H Status Validasi\n' +
      '  I ☑ Sudah Diisi  J Waktu Diisi  K Diisi Oleh  L Alasan Tolak\n' +
      '  M ☑ Alert Terkirim  N Alert Terakhir  O Request ID (hidden)\n\n' +
      'Cara pakai:\n' +
      '• Cron 5-menit auto-fill baris dari raos_saldo_requests\n' +
      '• Admin isi kolom F+G (ID/Nama Driver) manual saat proses\n' +
      '• Admin centang kolom I "Sudah Diisi" → PATCH is_processed=true\n' +
      '  → trigger DB dispatch push + auto-chat driver + update TARGET STAFF\n' +
      '• Kolom M+N otomatis di-set kalau reminder 5-menit fire ke chat'
    )
  } catch(e){}
}
