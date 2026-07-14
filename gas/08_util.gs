// ============================================================
// 08_util.gs — Fungsi Pembantu
// ============================================================

function formatDate(date) {
  if (!date) return ''
  const d = new Date(date)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

function formatCurrency(amount) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(amount)
}

function logActivity(userId, action, detail) {
  try {
    const sh = getSheet(CONFIG.SHEETS.LOG_ACTIVITY)
    sh.appendRow([
      new Date(),
      new Date().toLocaleTimeString('id-ID'),
      userId,
      action,
      detail,
      '',  // IP address (GAS tidak bisa ambil IP client)
    ])
    // juga kirim ke Supabase
    callSupabase('activity_logs', 'POST', {
      user_id: userId,
      action,
      detail,
      created_at: new Date().toISOString(),
    })
  } catch (e) {
    Logger.log(`logActivity error: ${e.message}`)
  }
}

function logSistem(type, process, status, detail) {
  try {
    const sh = getSheet(CONFIG.SHEETS.LOG_SISTEM)
    sh.appendRow([new Date(), new Date().toLocaleTimeString('id-ID'), type, process, status, detail])
    callSupabase('system_logs', 'POST', { type, process, status, detail, created_at: new Date().toISOString() })
  } catch (e) {
    Logger.log(`logSistem error: ${e.message}`)
  }
}

function generateId(prefix) {
  const ts = Date.now().toString(36).toUpperCase()
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase()
  return `${prefix}-${ts}-${rand}`
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function isValidPhone(phone) {
  return /^(\+62|62|0)8[1-9][0-9]{6,10}$/.test(phone.replace(/\s/g, ''))
}

function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}
