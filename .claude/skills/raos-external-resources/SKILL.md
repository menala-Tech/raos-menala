---
name: raos-external-resources
description: External resources & lokasi kanonik RAOS — working directory C:\Projects\menala\RAOS + apps/pwa, Supabase project vlievtojpmrbsmzlqswl (shared dengan proyek lain), Google Drive 3 folder (selfie Pickup Point/Bulan, spreadsheet RAOS sumber GAS, backup bulanan), spreadsheet RAOS SSoT sync + KPI + saldo. Semua akses via MCP tools (Supabase/Vercel/GitHub/Context7) — jangan fallback manual shell. Gunakan skill ini setiap kali butuh reference Supabase project ID, Drive folder ID, working directory, atau saat user sebut "folder Drive", "spreadsheet", "backup", "Supabase project".
---

# External Resources — RAOS

## Working Directory

**Lokal:** `C:\Projects\menala\RAOS`
**Sesi remote/container:** `/home/user/raos-menala/`

Struktur:
```
C:\Projects\menala\
├── RAOS\          ← git repo (working dir: RAOS\apps\pwa)
├── .claude\       ← Claude Code project config (launch.json, settings.local.json)
├── docs\          ← dokumen referensi & prompt AI
└── assets\        ← brand assets (logo, mockup, screenshot)
```

Repo struktur:
```
RAOS/
├── apps/pwa/          ← Next.js PWA (sumber utama frontend)
├── gas/               ← 22 Google Apps Script modules
├── sql/               ← Schema, RLS, Seed data
├── .github/workflows/ ← CI/CD pipeline
├── vercel.json        ← Konfigurasi Vercel
└── CLAUDE.md          ← Operating manual
```

## Supabase Project

- **URL:** https://vlievtojpmrbsmzlqswl.supabase.co
- **Project ID:** `vlievtojpmrbsmzlqswl`

**PENTING:** Project **dipakai bersama proyek lain**. JANGAN sentuh tabel milik proyek lain (`drivers`, `employees`, `employee_contracts`, `attendance`, `leave_requests`, `leave_balances`, `payroll`, `users`, `saldo_events`).

Detail tabel ownership di skill `raos-supabase-rules` seksi 9.

## Google Drive — 3 Folder

### 1. Foto Absensi Selfie

**Folder induk:** https://drive.google.com/drive/folders/1Aq-tMtVm89krrt1WNSpEy9k_cxAlsTfh

Sync otomatis dari Supabase Storage bucket `selfies`. Detail di skill `raos-attendance-shift`.

### 2. Spreadsheet RAOS (Sumber Data GAS)

**Folder:** https://drive.google.com/drive/folders/1o9PTsBtN7eb8U4xLyWe3zq1nQXufm_oL

Lokasi Google Spreadsheet sumber data GAS — ABSENSI, ORDER, DATABASE STAFF, dst.

**Spreadsheet RAOS utama:** `1eYS2mM3Sy...` (SSoT untuk sync sheet, WAJIB sinkron setiap upgrade).

### 3. Backup Bulanan

**Folder induk:** https://drive.google.com/drive/folders/1i_gSb1iCq9gV2qvxbsCxDcndp_28jMUA

Struktur `[Jenis Backup]/[Bulan]/nama-file`. Detail di skill `raos-attendance-shift`.

## Aturan Simpan File

Project Supabase RAOS **dipakai bersama proyek lain**. Google Drive di atas adalah lokasi resmi RAOS — **SELALU** simpan file baru (foto, PDF, backup) ke folder yang sesuai. **JANGAN** buat folder baru sembarangan di tempat lain.

## Spreadsheet SSoT (Shared dengan Proyek Lain)

- **MASTER DATA STAFF:** `1fcraq3QHqIaD-13Ebzt6stT9aA6j_loTXeAtpNX12kw` — tab "MASTER DATA STAFF" filter cabang Soeta untuk RAOS
- **Database Driver Airport:** `1FEZxyHPx_GCQKw92hLSf6QxxkXgZn5R1sRswOYM_Tlc` — tab "ID Rifim Airport Soeta" untuk RAOS

Reference: `C:\Projects\menala\SSOT_DATA_SOURCES.md`

Detail sync di skill `raos-ssot-sync`.

## MCP-First

Gunakan MCP tools:
- `mcp__Supabase__*` — DB operations
- `mcp__Vercel__*` — deploy, projects
- `mcp__github__*` — PR, commits, issues
- `mcp__Google_Drive__*` — file operations (kalau tersedia)

**Jangan fallback manual shell** kalau MCP available (Rule §1.-2 baru sesi 17).

## Stack

- **Frontend:** Next.js 14 + TypeScript + Tailwind CSS (PWA)
- **Backend:** Supabase (PostgreSQL + Auth + Realtime + RLS)
- **Automation:** Google Apps Script (GAS)
- **Deploy:** Vercel (frontend) + GitHub Actions (CI/CD)
- **Storage:** Google Drive (backup)

## Cross-Reference

- **Rifim-OS resources:** cek skill `rifim-os-external-resources` (kalau butuh Drive/Sheet Rifim-OS)
- **GAS project registry (2 project berbeda):** skill `raos-gas-rules` seksi 3
