// ============================================================
// 06_dashboard.gs — Update Dashboard & Data Supabase
// ============================================================

function getDashboardData() {
  const today = formatDate(new Date())
  const bulan = new Date().getMonth() + 1
  const tahun = new Date().getFullYear()

  const shAbsensi = getSheet(CONFIG.SHEETS.ABSENSI)
  const shOrder   = getSheet(CONFIG.SHEETS.ORDER)

  const absRows = shAbsensi.getDataRange().getValues().slice(1)
    .filter(r => formatDate(r[1]) === today)  // r[1]=TANGGAL

  const ordRows = shOrder.getDataRange().getValues().slice(1)
    .filter(r => formatDate(r[1]) === today)

  return {
    tanggal:       today,
    totalAbsensi:  absRows.length,
    totalScan:     ordRows.length,
    scanValid:     ordRows.filter(r => r[9] === 'valid').length,
    scanPending:   ordRows.filter(r => r[9] === 'pending').length,
    totalGmv:      ordRows.reduce((s, r) => s + (parseFloat(r[7]) || 0), 0),
  }
}

function pushDashboardToSupabase() {
  const data = getDashboardData()
  callSupabase('system_logs', 'POST', {
    type:    'dashboard',
    process: 'pushDashboardToSupabase',
    status:  'success',
    detail:  JSON.stringify(data),
  })
  logSistem('dashboard', 'pushDashboardToSupabase', 'success', JSON.stringify(data))
}

function getStaffLeaderboard(bulan, tahun) {
  const shTarget = getSheet(CONFIG.SHEETS.TARGET_STAFF)
  const rows = shTarget.getDataRange().getValues().slice(1)
  const results = []

  rows.forEach(row => {
    const tgl = new Date(row[0])
    if (tgl.getMonth() + 1 !== bulan || tgl.getFullYear() !== tahun) return
    const kpi = hitungKpiStaff(row[1], bulan, tahun)
    if (kpi) results.push({ nama: row[2], cabang: row[3], kpi: kpi.kpiTotal })
  })

  return results.sort((a, b) => parseFloat(b.kpi) - parseFloat(a.kpi))
}
