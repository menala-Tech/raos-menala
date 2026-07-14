// ============================================================
// 04_kpi.gs — Perhitungan KPI Staff
// ============================================================

function hitungKpiStaff(staffId, bulan, tahun) {
  const cfg = getSistemConfig()
  const bobotKehadiran = parseFloat(cfg['KPI KEHADIRAN (%)'] ?? '15') / 100
  const bobotOrder     = parseFloat(cfg['KPI ORDER (%)']    ?? '40') / 100
  const bobotGmv       = parseFloat(cfg['KPI GMV (%)']      ?? '20') / 100

  // Ambil target dari sheet
  const shTarget = getSheet(CONFIG.SHEETS.TARGET_STAFF)
  const targets = shTarget.getDataRange().getValues().slice(1)
  const target = targets.find(r =>
    r[1] === staffId &&
    new Date(r[0]).getMonth() + 1 === bulan &&
    new Date(r[0]).getFullYear() === tahun
  )
  if (!target) return null

  const targetOrder    = parseFloat(target[4]) || 1
  const targetGmv      = parseFloat(target[5]) || 1
  const targetKehadiran = parseFloat(target[6]) || 100

  // Realisasi
  const rekap = rekapOrderBulanan(staffId, bulan, tahun)
  const rekaAbsensi = rekapAbulanan(bulan, tahun)
  const namaStaff = target[2]
  const absensi = rekaAbsensi[namaStaff] ?? { hadir: 0 }
  const hariKerja = getHariKerja(bulan, tahun)

  const pctOrder     = Math.min(rekap.totalOrder / targetOrder * 100, 100)
  const pctGmv       = Math.min(rekap.totalGmv / targetGmv * 100, 100)
  const pctKehadiran = Math.min(absensi.hadir / hariKerja * 100, 100)

  const kpiTotal = (pctKehadiran * bobotKehadiran) +
                   (pctOrder * bobotOrder) +
                   (pctGmv * bobotGmv)

  return {
    staffId,
    bulan,
    tahun,
    pctOrder:     pctOrder.toFixed(1),
    pctGmv:       pctGmv.toFixed(1),
    pctKehadiran: pctKehadiran.toFixed(1),
    kpiTotal:     kpiTotal.toFixed(1),
  }
}

function updateKpiToSupabase(staffId, bulan, tahun) {
  const kpi = hitungKpiStaff(staffId, bulan, tahun)
  if (!kpi) return

  callSupabase('kpi_targets?on_conflict=staff_id,month,year', 'POST', {
    staff_id:           staffId,
    month:              bulan,
    year:               tahun,
    actual_scan:        parseInt(kpi.pctOrder),
    actual_kpi_pct:     parseFloat(kpi.kpiTotal),
    actual_attendance_pct: parseFloat(kpi.pctKehadiran),
  })
  logActivity(staffId, 'update_kpi', `KPI ${bulan}/${tahun}: ${kpi.kpiTotal}%`)
}

function updateAllKpiThisMonth() {
  const now = new Date()
  const bulan = now.getMonth() + 1
  const tahun = now.getFullYear()
  const sh = getSheet(CONFIG.SHEETS.DB_STAFF)
  const staff = sh.getDataRange().getValues().slice(1)

  staff.forEach(row => {
    if (row[6] !== 'Aktif') return
    try { updateKpiToSupabase(row[0], bulan, tahun) }
    catch (e) { Logger.log(`KPI error ${row[0]}: ${e.message}`) }
  })
  logSistem('cron', 'updateAllKpiThisMonth', 'success', `KPI diperbarui untuk ${staff.length} staff`)
}

function getHariKerja(bulan, tahun) {
  let count = 0
  const days = new Date(tahun, bulan, 0).getDate()
  for (let d = 1; d <= days; d++) {
    const day = new Date(tahun, bulan - 1, d).getDay()
    if (day !== 0) count++  // kecuali Minggu
  }
  return count
}
