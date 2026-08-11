// ============================================================
// 18_canonical_drive_storage.gs — Canonical Drive Storage V4 (RAOS)
// ============================================================
// SSOT folder: RIFIM OS Smart Office DB -> company_config.
// Layout: Module / YYYY / MM_Bulan / Jenis Data / [subfolder opsional]
// Tidak ada destination folder legacy / hard-code di writer RAOS.

const RAOS_CANONICAL_CONFIG_SHEET_ID =
  PropertiesService.getScriptProperties().getProperty('CANONICAL_STORAGE_CONFIG_SHEET_ID')
  || '1jHeA-w1bM32S3-AU-ENN2UjiaCb4iLzRhaf4G7y4ozM'

const RAOS_CANONICAL_LAYOUT_VERSION = '2.0-monthly-canonical'

const RAOS_CANONICAL_MODULE_KEYS = {
  raos_pwa: 'drive_module_raos_pwa_folder_id',
  absensi: 'drive_module_absensi_folder_id',
  driver: 'drive_module_driver_folder_id',
  master_data: 'drive_module_master_data_folder_id',
  finance: 'drive_module_finance_folder_id',
  payroll: 'drive_module_payroll_folder_id',
  kpi: 'drive_module_kpi_folder_id',
}

const RAOS_CANONICAL_DATA_FOLDERS = {
  foto_absensi: '01_FOTO_ABSENSI',
  data_tabel: '02_DATA_TABEL',
  pdf: '03_PDF',
  backup_spreadsheet: '04_BACKUP_SPREADSHEET',
  database_staff: '05_DATABASE_STAFF',
  database_driver: '06_DATABASE_DRIVER',
  database_keuangan: '07_DATABASE_KEUANGAN',
  database_cuti: '08_DATABASE_CUTI',
  database_payroll: '09_DATABASE_PAYROLL',
  semua_database: '10_SEMUA_DATABASE',
}

const RAOS_CANONICAL_MONTHS_ID = [
  'Januari','Februari','Maret','April','Mei','Juni',
  'Juli','Agustus','September','Oktober','November','Desember',
]

let _raosCanonicalConfigCache = null

function raosCanonicalConfig_() {
  if (_raosCanonicalConfigCache) return _raosCanonicalConfigCache
  const ss = SpreadsheetApp.openById(RAOS_CANONICAL_CONFIG_SHEET_ID)
  const sh = ss.getSheetByName('company_config')
  if (!sh) throw new Error('company_config tidak ditemukan di canonical config sheet')
  const rows = sh.getDataRange().getValues()
  const cfg = {}
  rows.slice(1).forEach(row => {
    const key = String(row[0] || '').trim()
    if (key) cfg[key] = row[1]
  })
  const version = String(cfg.drive_storage_layout_version || '').trim()
  if (version !== RAOS_CANONICAL_LAYOUT_VERSION) {
    throw new Error(`Drive layout version ${version || '(kosong)'} != ${RAOS_CANONICAL_LAYOUT_VERSION}`)
  }
  _raosCanonicalConfigCache = cfg
  return cfg
}

function resetRaosCanonicalConfigCache_() {
  _raosCanonicalConfigCache = null
}

function raosCanonicalGetOrCreateFolder_(parent, name) {
  const safe = String(name || '').trim()
  if (!safe) throw new Error('Nama folder canonical kosong')
  const it = parent.getFoldersByName(safe)
  return it.hasNext() ? it.next() : parent.createFolder(safe)
}

function raosCanonicalMonthParts_(when) {
  const d = when instanceof Date ? when : (when ? new Date(when) : new Date())
  if (isNaN(d.getTime())) throw new Error(`Tanggal storage invalid: ${when}`)
  const m = d.getMonth()
  return {
    date: d,
    year: String(d.getFullYear()),
    month: `${String(m + 1).padStart(2, '0')}_${RAOS_CANONICAL_MONTHS_ID[m]}`,
  }
}

function raosCanonicalMonthFolder_(moduleKey, dataType, when) {
  const cfg = raosCanonicalConfig_()
  const moduleConfigKey = RAOS_CANONICAL_MODULE_KEYS[String(moduleKey || '').trim().toLowerCase()]
  if (!moduleConfigKey) throw new Error(`Module Drive tidak dikenal: ${moduleKey}`)
  const rootId = String(cfg[moduleConfigKey] || '').trim()
  if (!rootId) throw new Error(`company_config.${moduleConfigKey} belum diisi`)

  const dataName = RAOS_CANONICAL_DATA_FOLDERS[String(dataType || '').trim().toLowerCase()]
  if (!dataName) throw new Error(`Jenis data Drive tidak dikenal: ${dataType}`)

  const parts = raosCanonicalMonthParts_(when)
  const root = DriveApp.getFolderById(rootId)
  const year = raosCanonicalGetOrCreateFolder_(root, parts.year)
  const month = raosCanonicalGetOrCreateFolder_(year, parts.month)
  return raosCanonicalGetOrCreateFolder_(month, dataName)
}

function raosCanonicalSubfolder_(moduleKey, dataType, subfolderName, when) {
  const base = raosCanonicalMonthFolder_(moduleKey, dataType, when)
  return subfolderName ? raosCanonicalGetOrCreateFolder_(base, subfolderName) : base
}

function raosCanonicalSaveBlob_(moduleKey, dataType, blob, fileName, when, subfolderName) {
  if (!blob) throw new Error('Blob kosong')
  const folder = raosCanonicalSubfolder_(moduleKey, dataType, subfolderName, when)
  const output = fileName ? blob.copyBlob().setName(fileName) : blob
  return folder.createFile(output)
}

function raosCanonicalBackupActiveSpreadsheet_(when) {
  const ss = SpreadsheetApp.getActiveSpreadsheet()
  const source = DriveApp.getFileById(ss.getId())
  const folder = raosCanonicalMonthFolder_('raos_pwa', 'backup_spreadsheet', when)
  const stamp = Utilities.formatDate(when instanceof Date ? when : new Date(), 'Asia/Jakarta', 'yyyyMMdd-HHmmss')
  return source.makeCopy(`${source.getName()} BACKUP ${stamp}`, folder)
}

function raosCanonicalSaveReportPdf_(pdfBlob, fileName, when) {
  return raosCanonicalSaveBlob_('raos_pwa', 'pdf', pdfBlob, fileName, when)
}
