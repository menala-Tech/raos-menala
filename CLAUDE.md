# CLAUDE.md — RAOS Project
*Panduan Claude Code untuk proyek RAOS*

## Konteks Proyek
RAOS (Rifim Airport Operation System) adalah PWA untuk operasional Vendor Maxim di Bandara Soekarno-Hatta.

## Stack
- **Frontend:** Next.js 14 + TypeScript + Tailwind CSS (PWA)
- **Backend:** Supabase (PostgreSQL + Auth + Realtime + RLS)
- **Automation:** Google Apps Script (GAS)
- **Deploy:** Vercel (frontend) + GitHub Actions (CI/CD)
- **Storage:** Google Drive (backup)

## Supabase Project
- **URL:** https://vlievtojpmrbsmzlqswl.supabase.co
- **Project ID:** vlievtojpmrbsmzlqswl

## Struktur Folder
```
RAOS/
├── apps/pwa/          ← Next.js PWA (sumber utama frontend)
├── gas/               ← 10 Google Apps Script modules
├── sql/               ← Schema, RLS, Seed data
├── .github/workflows/ ← CI/CD pipeline
├── vercel.json        ← Konfigurasi Vercel
└── CLAUDE.md          ← File ini
```

## Aturan Kerja
1. Selalu update STATUS.md setelah selesai sesi
2. Jangan hardcode credential — pakai .env.local atau Supabase Secrets
3. Semua tabel Supabase wajib punya RLS policy
4. Commit format: `feat(scope): deskripsi` / `fix(scope): deskripsi`
5. Test fitur di browser sebelum lapor selesai

## Modul PWA
| Route | Fungsi |
|---|---|
| `/` | Login |
| `/dashboard` | Beranda + statistik |
| `/scan` | Scan barcode driver |
| `/absensi` | Absensi masuk/pulang + GPS |
| `/riwayat` | History scan & absensi |
| `/chat` | Chat room staff (realtime) |
| `/settings` | Pengaturan akun & app |
