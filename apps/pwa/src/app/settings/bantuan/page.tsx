'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ChevronDown, MessageCircle, Info, HelpCircle } from 'lucide-react'
import MenalaLogo from '@/components/MenalaLogo'
import { DateTimeStack } from '@/components/DateTimeHeader'

type FaqItem = { q: string; a: string }

const FAQ: FaqItem[] = [
  {
    q: 'Kenapa saya tidak bisa scan / absen padahal sudah di lokasi?',
    a: 'Untuk role Staff, RAOS block scan/absen kalau posisi Anda lebih dari 50 meter di luar radius pickup point. Aktifkan lokasi HP (Setting → Lokasi → RAOS → Izinkan) dan pastikan berada dekat titik pickup. Jarak & titik terdekat ditampilkan di banner atas layar scan/absen.',
  },
  {
    q: 'Kenapa notifikasi push tidak masuk ke HP saya?',
    a: '1) Buka Settings RAOS → Notifikasi → toggle "Aktifkan Notifikasi" (off → on lagi untuk paksa re-subscribe). 2) Pastikan izin notifikasi Chrome untuk raos-menala.vercel.app di posisi "Izinkan". 3) Cek toggle jenis notifikasi (Chat/Reminder/dll) apakah semua aktif. Kalau masih tidak sampai, coba clear cache PWA sekali (long-press ikon → Info aplikasi → Hapus data) lalu login ulang.',
  },
  {
    q: 'Saya lupa PIN — bagaimana reset?',
    a: 'Di halaman login, tap "Lupa PIN". Kode reset akan dikirim ke email terdaftar Anda. Kalau email tidak masuk 5 menit, cek folder Spam. PIN baru harus 6 digit angka, minimum 6 karakter.',
  },
  {
    q: 'PIN saya diubah admin di sheet MASTER DATA STAFF — kapan aktif?',
    a: 'Sync SSoT jalan otomatis setiap 1 jam. PIN yang diubah admin di sheet akan aktif maksimum 1 jam setelah edit. Kalau butuh segera, admin bisa jalankan sync manual dari menu spreadsheet: 🛠️ RAOS System → 👥 Staff → 🔄 Sync Staff Soeta (SSOT).',
  },
  {
    q: 'Kenapa data driver / staff / jabatan salah, saya tidak bisa edit?',
    a: 'Nama, jabatan, nomor HP, dan ID staff bersumber dari sheet MASTER DATA STAFF (SSoT global RIFIM). RAOS/PWA tidak boleh mengubahnya langsung — perubahan harus dilakukan di sheet, sync otomatis akan meng-update ke aplikasi dalam 1 jam. Yang boleh diubah admin dari /admin: Terminal (T1/T2/T3) dan status aktif/nonaktif.',
  },
  {
    q: 'Bedanya "Absensi Masuk" dan "Scan Barcode"?',
    a: 'Absensi Masuk = tanda kehadiran Anda di lokasi kerja hari ini (1× per hari, dengan selfie + GPS). Scan Barcode = validasi order driver Maxim yang tiba di pickup point (setiap kali ada driver drop-off/pick-up penumpang). Keduanya harus di dalam radius pickup point.',
  },
  {
    q: 'Scan saya statusnya "pending" — kapan divalidasi?',
    a: 'Koordinator/admin validasi scan lewat halaman /admin. Kalau > 15 menit belum divalidasi, koordinator akan dapat push notif otomatis. Anda dapat notif "Scan Berhasil" saat sudah divalidasi, atau notif "Scan Ditolak" dengan alasan kalau ditolak.',
  },
  {
    q: 'Kenapa foto selfie absen saya tidak masuk ke Google Drive?',
    a: 'Foto tersimpan di Supabase Storage dulu, lalu di-sync ke Google Drive setiap 30 menit (folder Pickup Point/Bulan yang sesuai). Kalau > 1 jam belum masuk, mungkin ada issue di GAS — laporkan ke admin.',
  },
]

export default function BantuanPage() {
  const [openIdx, setOpenIdx] = useState<number | null>(null)

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="bg-secondary text-white px-4 pt-10 pb-5 sticky top-0 z-30">
        <div className="flex items-center gap-3 mb-3">
          <Link href="/settings" className="text-white/70"><ArrowLeft size={22} /></Link>
          <div className="flex-1"><MenalaLogo size={28} showText /></div>
        </div>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-black text-xl">Bantuan &amp; Panduan</h1>
            <p className="text-white/50 text-xs mt-0.5">Jawaban untuk pertanyaan umum</p>
          </div>
          <DateTimeStack />
        </div>
      </div>

      <div className="px-4 py-4 space-y-4 pb-24">
        <div className="card">
          <div className="flex items-center gap-3 mb-2">
            <Info size={18} className="text-primary" />
            <p className="text-sm font-bold text-gray-800 dark:text-gray-100">Tentang Aplikasi</p>
          </div>
          <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
            <strong>RAOS</strong> — Rifim Airport Operation System. PWA operasional
            Vendor Maxim di Bandara Soekarno-Hatta. Kelola scan order driver,
            absensi staff, chat room, dan monitoring pickup point real-time.
          </p>
          <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 text-[11px] text-gray-500 dark:text-gray-400 space-y-0.5">
            <p>PT. Menala Internasional Gemilang</p>
            <p>Menala.co · rifiminternationalgemilang@gmail.com</p>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-3 mb-3">
            <HelpCircle size={18} className="text-primary" />
            <p className="text-sm font-bold text-gray-800 dark:text-gray-100">Pertanyaan Umum (FAQ)</p>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {FAQ.map((item, i) => (
              <div key={i} className="py-2">
                <button
                  onClick={() => setOpenIdx(openIdx === i ? null : i)}
                  className="w-full flex items-start gap-3 text-left py-1"
                >
                  <ChevronDown
                    size={16}
                    className={`text-gray-400 mt-0.5 shrink-0 transition-transform ${openIdx === i ? 'rotate-180' : ''}`}
                  />
                  <span className="text-sm font-semibold text-gray-800 dark:text-gray-100 flex-1">
                    {item.q}
                  </span>
                </button>
                {openIdx === i && (
                  <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed pl-7 pt-2 pb-2">
                    {item.a}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>

        <Link
          href="/chat?room=umum"
          className="card flex items-center gap-3 text-primary border border-primary/20"
        >
          <div className="bg-primary/10 p-2.5 rounded-xl">
            <MessageCircle size={18} />
          </div>
          <div className="flex-1">
            <p className="font-bold text-sm">Butuh bantuan lain?</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Chat admin di room Umum</p>
          </div>
        </Link>
      </div>
    </div>
  )
}
