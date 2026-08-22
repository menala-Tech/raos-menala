# GAS Deployment Fingerprint

**Audit branch:** `audit/reliability-pass-20260822`  
**Date:** 2026-08-22  
**Scope:** Local RAOS GAS source under `gas/`.

## Project Identity
`gas/.clasp.json`:
```json
{
  "scriptId": "1iMN1ZGZVM0x2nSWmGMVx_umtEEzR-VQMwDZqK_pgHOzzOKVEprSN91jb",
  "rootDir": "."
}
```

| Field | Value | Provenance |
|---|---|---|
| Local repo | `C:\\Projects\\menala\\RAOS\\gas` | Local filesystem |
| Script ID | `1iMN1ZGZVM0x2nSWmGMVx_umtEEzR-VQMwDZqK_pgHOzzOKVEprSN91jb` | `gas/.clasp.json` (local) |
| Web App deployment label | `rifim os V1` | Repository/config reference — **not live-verified** |
| Web App URL | `https://script.google.com/macros/s/AKfycbxrgQ_MWvsdA_bsbNF4deIALWATDCspYvY47fakpuXMZeAtGAd4baeVVe1dPGDAi1tZJA/exec` | `GAS_PROJECTS_MAP.md` reference — **not live-verified** |

## Local vs Live Deployment Fingerprint

| Category | Status | Evidence |
|---|---|---|
| **Local source fingerprint** | VERIFIED in this audit | Hashes computed from `gas/*.gs` + `appsscript.json` below |
| **Live deployment fingerprint** | **NOT VERIFIED** | `clasp` CLI unavailable; no `clasp pull` or `clasp version` run |

The Web App URL and deployment label above are taken from `GAS_PROJECTS_MAP.md` and `gas/.clasp.json` as repository references only. They were not confirmed against current Google Apps Script deployment metadata because `clasp` could not run in this environment.

## File Inventory & Local Hashes
Total source files: **24**
Aggregate SHA-256 (sorted file hashes joined by newline): `cf4996f052f771b27f03b0ec350eb9dc1837e264821b01750bde6647dbfade2c`

| # | File | Size (bytes) | SHA-256 |
|---|---|---|---|
| 1 | `01_config.gs` | 2618 | `bf9ebdd152e8c15dfb43abf2cc1574a155127f3dd04eeaddcf4acf3a6225705a` |
| 2 | `02_absensi.gs` | 12776 | `4949563978ab27417577558b4a9b2f366c31c32f0d6cdca726291c2e9924af02` |
| 3 | `03_order.gs` | 7704 | `8e4550860d3f2c2d90e3bcd2e3a2e247a0767d4c743667008f99807fa39a471f` |
| 4 | `04_kpi.gs` | 3385 | `d47b540f219a9850215dfd35f501238ac70a04a852c5f14fbf5105af34616603` |
| 5 | `05_notifikasi.gs` | 3200 | `90da94743d8adec31d419f3e71043a2dfaaef2d0594872b82027a906dd033b07` |
| 6 | `06_dashboard.gs` | 1855 | `383ae8c36ce126b1f305c49e94f2f2932f83054f710d845f6cdc007b8875058d` |
| 7 | `07_backup.gs` | 2092 | `4d6782dce15f586be3c954b253f7e37009e282533c49828b449978a3f82b2966` |
| 8 | `08_util.gs` | 2348 | `5eabe5016d7ab2a2b74835c2ddb3f71274f46fd2a722cde9802c8139f9221f3a` |
| 9 | `09_trigger.gs` | 9751 | `d68b03813e8d949fb99e544c56f7eaeb96d4585d859b81242d099ef7752c9041` |
| 10 | `10_menu.gs` | 8935 | `db09ba8c98a12f57f233c08378d75c5e4b3aa36ac09659568a6f30ec95030971` |
| 11 | `11_drive_sync.gs` | 5213 | `486331dc2d39475b4def7f862fd559b58055f528a0248524402f53f8ba42ed09` |
| 12 | `12_driver_airport_sync.gs` | 12615 | `b0052106fe736f665c4a75c13cfaa8ed808545caf800df5b8c2c1f242f6a64d4` |
| 13 | `13_staff_sync.gs` | 16731 | `4e773ba8a2573aa9a2bad3a094083354acbbef5c7222f4a346889734e52077ab` |
| 14 | `14_kpi_config.gs` | 3901 | `15c8e8eac11c2536d1a6f2debb663719217776aeef6ca770b9bf589870f0ce5c` |
| 15 | `15_kpi_engine.gs` | 21964 | `0416c3eefc27afd0c33d55ddf40a91c6d295b92ac36212d397f6afa30a0c659f` |
| 16 | `16_saldo_sync.gs` | 18532 | `20f34d6a9270cedc5b7f8c241a15e918daf7ab455cb58e742d4eb99deb673e49` |
| 17 | `17_driver_external_sync.gs` | 10434 | `39175f6243b0a96cf03f6130779b672aeaccd36cc0e9273dcba5c09d12d2d389` |
| 18 | `18_canonical_drive_storage.gs` | 5224 | `557e4c3224910f33ce2992f927d14be0e1a7a5bab261377e0e2437a01a98ba3b` |
| 19 | `18_driver_queue_sync.gs` | 2772 | `3e9b4893ed58d78c45a6cf4fc0d9406b9a83ee22b02cb2219d6894e880c88af0` |
| 20 | `19_raos_credentials_sync.gs` | 3887 | `09fbedf05affc1108213094449f66e463d23c796ac327326b0f9b6dfd111be5b` |
| 21 | `20_maintenance.gs` | 1975 | `2776554208f56de731619fcd1a4b926092eebf7a9bf2e4ba28e38c61480f697f` |
| 22 | `21_web_api.gs` | 12162 | `28b62b6bc51de614f9e8895abca1eae753967748d56c8018f80f4a18f45d16df` |
| 23 | `22_absensi_archive.gs` | 8723 | `df1bd1a8b015a0f5b2d8fd480bd20b69e59dbedbeb04d3a4286a90a324e7f65a` |
| 24 | `appsscript.json` | 461 | `cea865a409bf4d23a14753657202db397a04360ae77056503f8833f9575036d5` |

## Observations
- File numbering conflict: two files start with `18_`: `18_canonical_drive_storage.gs` and `18_driver_queue_sync.gs`. One should be renumbered to avoid GAS editor confusion and keep the canonical 22-file list.
- Local source includes `appsscript.json`; verify it matches the GAS editor manifest.

## Remote comparison status
**Remote GAS state could not be fetched** in this session because `clasp` CLI is not installed / not authenticated on this environment. The fingerprint above is **local-source only**. To complete the comparison later, run:

```bash
cd C:/Projects/menala/RAOS/gas && clasp pull --force
# then recompute the hash and diff against this report
```

## Recommended pre-deploy checklist
1. Ensure `clasp.json scriptId` matches the intended RAOS project (not RIFIM-OS).
2. Renumber duplicate `18_` file before next push.
3. Compare this aggregate hash after any future GAS pull to detect accidental editor-side changes.
