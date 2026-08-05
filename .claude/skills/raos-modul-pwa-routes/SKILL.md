---
name: raos-modul-pwa-routes
description: 17+ halaman PWA RAOS di apps/pwa/src/app/ dengan fungsi + role access — / (login email+PIN), /dashboard, /scan (hard-block staff >radius+500m), /absensi (GPS+selfie), /riwayat (3 tab pin kuning/hijau/merah), /chat (realtime + slash command), /settings (+bantuan FAQ + ukuran teks), /admin (validasi+kelola staff+bulk-create room), /admin/barcodes (QR generator), /validasi-saldo (koord+ per cabang scope), /antrian-driver (real-time monitor + tombol Panggil/Selesai/Keluar), /kpi, /laporan (koord+ export xlsx/PDF), /status (donut chart), /drivers (admin CRUD), /notifications, /reset-password, /driver-workspace, manifest per role (staff/koord/mgmt/direksi/driver). Gunakan skill ini setiap kali butuh mapping halaman → fungsi → role, atau menambah halaman baru.
---

# Modul PWA — RAOS Routes

## Tabel Route (sesi 17 multi-cabang)

| Route | Fungsi | Role |
|---|---|---|
| `/` | Login (email + PIN dari SSoT sheet) | Semua |
| `/dashboard` | Beranda + statistik | Semua |
| `/scan` | Scan barcode driver (hard-block staff > radius+500m) | Staff/Koord |
| `/absensi` | Absensi masuk/pulang + GPS + selfie | Semua |
| `/riwayat` | History scan/absensi/isi saldo — pin kuning/hijau/merah | Semua |
| `/chat` | Chat room realtime + slash command `/isisaldo` `/antri` `/panggil` `/selesai` `/keluar` | Semua |
| `/settings` | Preferensi + Bantuan/FAQ + Ukuran Teks | Semua |
| `/admin` | Validasi scan + kelola staff + branch dropdown + bulk-create room per cabang | Admin/Direksi/Mgmt |
| `/admin/barcodes` | Generator QR code driver | Admin |
| `/validasi-saldo` | Approve/reject pengajuan Isi Saldo per cabang scope | Koord+ |
| `/antrian-driver` | Real-time monitor queue driver + tombol Panggil/Selesai/Keluar | Semua |
| `/kpi` | KPI staff | Koord+ |
| `/laporan` | Laporan & analitik + export xlsx/PDF | Koord+ |
| `/status` | Status validasi (donut chart) | Semua |
| `/drivers` | Kendaraan & driver | Admin |
| `/notifications` | Notifikasi list | Semua |
| `/settings/bantuan` | 8 FAQ collapsible + info app | Semua |
| `/reset-password` | Set password baru dari magic link | Semua |
| `/driver-workspace` | Driver mode dashboard + quick actions | Driver |

## Manifest per Role (PWA Install)

- `/manifest-staff` — untuk staff
- `/manifest-koord` — untuk koordinator
- `/manifest-mgmt` — untuk management
- `/manifest-direksi` — untuk direksi
- `/manifest-driver` — untuk driver

## Cross-Reference Detail

- **Konvensi UI header/BottomNav/modal:** skill `raos-frontend-conventions`
- **Chat detail (mention, retention, read receipt, dll):** skill `raos-chat-conventions`
- **Slash command parser:** skill `raos-frontend-conventions` seksi Slash Command
- **Isi Saldo & Antrian Driver detail:** skill `raos-multi-cabang`
- **KPI page detail:** skill `raos-kpi-payroll-v2`
- **/admin random-assign driver:** skill `raos-kpi-payroll-v2`
