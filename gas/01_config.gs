// ============================================================
// 01_config.gs — Konfigurasi Global RAOS
// ============================================================

const CONFIG = {
  SUPABASE_URL:  PropertiesService.getScriptProperties().getProperty('SUPABASE_URL'),
  SUPABASE_KEY:  PropertiesService.getScriptProperties().getProperty('SUPABASE_SERVICE_KEY'),

  SHEETS: {
    ABSENSI:        'ABSENSI',
    ORDER:          'ORDER',
    LOG_ACTIVITY:   'LOG ACTIVITY',
    LOG_SISTEM:     'LOG SISTEM',
    DB_ORDER:       'DATABASE ORDER',
    TARGET_STAFF:   'TARGET STAFF',
    DB_STAFF:       'DATABASE STAFF',
    DB_DRIVER:      'DATABASE DRIVER',
    SISTEM_CONFIG:  'SISTEM CONFIG',
  },

  NOTIF: {
    WHATSAPP_API: PropertiesService.getScriptProperties().getProperty('WA_API_URL'),
    WHATSAPP_KEY: PropertiesService.getScriptProperties().getProperty('WA_API_KEY'),
  },

  DRIVE: {
    BACKUP_FOLDER_ID: PropertiesService.getScriptProperties().getProperty('BACKUP_FOLDER_ID'),
    // Folder induk foto absensi selfie — sudah berisi 8 subfolder Pickup Point
    // (T1/T2/T3 - Pickup Point X), masing-masing dengan subfolder bulan.
    ABSENSI_PHOTOS_ROOT_ID: PropertiesService.getScriptProperties().getProperty('ABSENSI_PHOTOS_ROOT_ID')
      || '1Aq-tMtVm89krrt1WNSpEy9k_cxAlsTfh',
  },
}

function getSheet(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet()
  const sh = ss.getSheetByName(name)
  if (!sh) throw new Error(`Sheet "${name}" tidak ditemukan`)
  return sh
}

function getSistemConfig() {
  const sh = getSheet(CONFIG.SHEETS.SISTEM_CONFIG)
  const rows = sh.getDataRange().getValues()
  const cfg = {}
  rows.forEach(([key, val]) => { if (key) cfg[key] = val })
  return cfg
}

function callSupabase(endpoint, method = 'GET', body = null, options = {}) {
  const defaultHeaders = {
    'apikey': CONFIG.SUPABASE_KEY,
    'Authorization': `Bearer ${CONFIG.SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': method === 'POST' ? 'return=representation' : '',
  }
  const opts = {
    method,
    headers: { ...defaultHeaders, ...(options.headers || {}) },
    muteHttpExceptions: true,
  }
  if (body) opts.payload = JSON.stringify(body)
  const res = UrlFetchApp.fetch(`${CONFIG.SUPABASE_URL}/rest/v1/${endpoint}`, opts)
  const code = res.getResponseCode()
  const text = res.getContentText()
  if (code >= 400) {
    logSistem('error', endpoint, 'error', `HTTP ${code}: ${text}`)
    throw new Error(`Supabase error ${code}: ${text}`)
  }
  return text ? JSON.parse(text) : null
}
