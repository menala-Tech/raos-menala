# Drive Storage Contract — RAOS

**Audit branch:** `audit/reliability-pass-20260822`  
**Date:** 2026-08-22  
**Scope:** Google Drive folders used for RAOS attendance selfies, backups, and canonical document storage.

## 1. Folders

### 1.1 Selfie / Attendance Photo Root (legacy fallback)
| Field | Value |
|---|---|
| Folder ID | `1Aq-tMtVm89krrt1WNSpEy9k_cxAlsTfh` |
| Used in | `gas/01_config.gs` `CONFIG.DRIVE.ABSENSI_PHOTOS_ROOT_ID` (Script Property fallback) |
| Layout | Subfolders by Pickup Point, then by month |
| Status | **Legacy** — V4 canonical storage now expects `company_config.drive_module_absensi_folder_id` |

### 1.2 Monthly Backup Root
| Field | Value |
|---|---|
| Folder ID | `1i_gSb1iCq9gV2qvxbsCxDcndp_28jMUA` |
| Used in | `gas/07_backup.gs` / `backupHarian()` via canonical layout |
| Layout | `RAOS_PWA/<YYYY>/<MM_Bulan>/04_BACKUP_SPREADSHEET/` |

### 1.3 Canonical Storage Roots (from Smart Office `company_config`)
| `company_config` key | Module | Typical content |
|---|---|---|
| `drive_module_raos_pwa_folder_id` | `raos_pwa` | PDF reports, spreadsheet backups |
| `drive_module_absensi_folder_id` | `absensi` | Attendance selfies per Pickup Point |
| `drive_module_driver_folder_id` | `driver` | Driver data exports |
| `drive_module_master_data_folder_id` | `master_data` | Staff/driver master exports |
| `drive_module_finance_folder_id` | `finance` | Finance exports |
| `drive_module_payroll_folder_id` | `payroll` | Payroll exports |
| `drive_module_kpi_folder_id` | `kpi` | KPI reports |

## 2. Canonical Layout V4

Defined in `gas/18_canonical_drive_storage.gs`:

```
Module Root / YYYY / MM_<Bulan Indonesia> / <Jenis Data> / [optional subfolder]
```

Where:
- `<Jenis Data>` is one of: `01_FOTO_ABSENSI`, `02_DATA_TABEL`, `03_PDF`, `04_BACKUP_SPREADSHEET`, `05_DATABASE_STAFF`, `06_DATABASE_DRIVER`, `07_DATABASE_KEUANGAN`, `08_DATABASE_CUTI`, `09_DATABASE_PAYROLL`, `10_SEMUA_DATABASE`.
- `MM_<Bulan>` uses Indonesian month names: `Januari`, `Februari`, ..., `Desember`.
- The layout version in `company_config.drive_storage_layout_version` must be `2.0-monthly-canonical`. Any mismatch throws an error.

## 3. Selfie Sync Details

Source: `gas/11_drive_sync.gs`
- Trigger: `syncSelfiePhotosToGDrive` every **30 minutes**.
- Source data: `raos_attendance.selfie_in_url` / `selfie_out_url` where `selfie_*_drive_synced` is not `true`.
- Destination: `absensi` module → `01_FOTO_ABSENSI` → subfolder = Pickup Point name.
- File name: `<yyyy-MM-dd>_<staffId>_<staffName>_<MASUK|PULANG>.<png|jpg>`
- After upload, `raos_attendance.selfie_*_drive_synced` is set to `true`.

## 4. Backup Details

Source: `gas/11_drive_sync.gs` / `18_canonical_drive_storage.gs`
- Trigger: `backupHarian` at **02:00 WIB**.
- Creates a copy of the active spreadsheet into `raos_pwa` module → `04_BACKUP_SPREADSHEET`.
- File name: `<Spreadsheet Name> BACKUP <yyyymmdd-HHmmss>`.

## 5. Contract / Rules
- **Do not create ad-hoc Drive folders** outside the canonical roots.
- **Do not rename`company_config` keys** without updating `gas/18_canonical_drive_storage.gs`.
- **Pickup Point subfolder name** must remain stable; file names include staff ID and side (MASUK/PULANG) for uniqueness.
- **Folder ID values must be populated in `company_config`** before V4 sync; the legacy `1Aq-tMt...` root is only a fallback.
