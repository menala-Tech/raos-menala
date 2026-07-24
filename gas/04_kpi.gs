// ============================================================
// 04_kpi.gs — LEGACY (deprecated sesi 16 lanjutan)
// ============================================================
//
// Pipeline lama pakai sheet DB_STAFF (sudah tidak dipakai post-SSoT sesi 14)
// dan staff_id TEXT (mismatch dengan kpi_targets.staff_id UUID) — insert
// selalu gagal.
//
// Pengganti: 15_kpi_engine.gs (`updateAllKpiRAOS`) — 3-pilar Supabase-backed
// mengikuti struktur HRIS KPIEngine V1. Trigger `updateAllKpiThisMonth`
// sekarang forward ke pipeline baru supaya cron 22:00 tidak break.

function updateAllKpiThisMonth() {
  // Forward ke pipeline baru — pertahankan nama fungsi supaya trigger cron
  // di 09_trigger.gs tidak perlu diubah.
  return updateAllKpiRAOS()
}

function hitungKpiStaff_LEGACY(staffId, bulan, tahun) {
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

function updateKpiToSupabase_LEGACY(staffId, bulan, tahun) {
  const kpi = hitungKpiStaff_LEGACY(staffId, bulan, tahun)
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

function updateAllKpiThisMonth_LEGACY() {
  // Sengaja tidak dipanggil — biarkan sebagai referensi struktur lama.
  Logger.log('LEGACY function — pakai updateAllKpiRAOS')
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
