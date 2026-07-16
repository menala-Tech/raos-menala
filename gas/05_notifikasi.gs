// ============================================================
// 05_notifikasi.gs — Notifikasi WhatsApp & Email
// ============================================================

function sendWhatsApp(phone, message) {
  if (!CONFIG.NOTIF.WHATSAPP_API || !phone) return
  try {
    UrlFetchApp.fetch(CONFIG.NOTIF.WHATSAPP_API, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CONFIG.NOTIF.WHATSAPP_KEY}`,
        'Content-Type': 'application/json',
      },
      payload: JSON.stringify({
        phone: phone.replace(/\D/g, ''),
        message,
      }),
      muteHttpExceptions: true,
    })
  } catch (e) {
    logSistem('notifikasi', 'sendWhatsApp', 'error', `${phone}: ${e.message}`)
  }
}

function sendEmail(to, subject, body) {
  try {
    GmailApp.sendEmail(to, subject, body, {
      htmlBody: body,
      name: 'RAOS — MENALA System',
    })
  } catch (e) {
    logSistem('notifikasi', 'sendEmail', 'error', `${to}: ${e.message}`)
  }
}

function notifAbsensiMasuk(namaStaff, phone, waktu, lokasi) {
  sendWhatsApp(phone,
    `✅ *ABSENSI MASUK BERHASIL*\n` +
    `Nama: ${namaStaff}\n` +
    `Waktu: ${waktu} WIB\n` +
    `Lokasi: ${lokasi}\n` +
    `Terima kasih telah absen tepat waktu! 🙏`
  )
}

function notifAbsensiPulang(namaStaff, phone, waktu) {
  sendWhatsApp(phone,
    `✅ *ABSENSI PULANG BERHASIL*\n` +
    `Nama: ${namaStaff}\n` +
    `Waktu: ${waktu} WIB\n` +
    `Selamat beristirahat! 👋`
  )
}

function notifScanValid(namaStaff, phone, scanId, namaDriver) {
  sendWhatsApp(phone,
    `✅ *SCAN TERVALIDASI*\n` +
    `ID Scan: ${scanId}\n` +
    `Driver: ${namaDriver}\n` +
    `Divalidasi oleh Koordinator ✓`
  )
}

function notifTargetTercapai(namaStaff, phone, pct) {
  sendWhatsApp(phone,
    `🎯 *TARGET TERCAPAI!*\n` +
    `Hai ${namaStaff}, KPI kamu bulan ini: *${pct}%*\n` +
    `Terus pertahankan performa terbaikmu! 💪`
  )
}

function kirimLaporanHarianAdmin() {
  const cfg = getSistemConfig()
  const emailAdmin = cfg['EMAIL_ADMIN'] ?? ''
  if (!emailAdmin) return

  const today = formatDate(new Date())
  const shAbsensi = getSheet(CONFIG.SHEETS.ABSENSI)
  const absRows = shAbsensi.getDataRange().getValues().slice(1)
    .filter(r => formatDate(r[1]) === today)  // r[1]=TANGGAL

  const shOrder = getSheet(CONFIG.SHEETS.ORDER)
  const ordRows = shOrder.getDataRange().getValues().slice(1)
    .filter(r => formatDate(r[1]) === today)

  const totalScan = ordRows.length
  const valid = ordRows.filter(r => r[9] === 'valid').length
  const pending = ordRows.filter(r => r[9] === 'pending').length

  const html = `
    <h2>📊 Laporan Harian RAOS — ${today}</h2>
    <table border="1" style="border-collapse:collapse;font-family:Arial;font-size:13px">
      <tr><td><b>Total Absensi</b></td><td>${absRows.length} staff</td></tr>
      <tr><td><b>Total Scan</b></td><td>${totalScan}</td></tr>
      <tr><td><b>Valid</b></td><td style="color:green">${valid}</td></tr>
      <tr><td><b>Pending</b></td><td style="color:orange">${pending}</td></tr>
    </table>
  `
  sendEmail(emailAdmin, `[RAOS] Laporan Harian — ${today}`, html)
  logSistem('notifikasi', 'kirimLaporanHarianAdmin', 'success', today)
}
