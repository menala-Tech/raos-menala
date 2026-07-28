'use client'

import type React from 'react'
import { BarChart2, Car, Loader2, MapPin, Paperclip, Wallet } from 'lucide-react'

interface Props {
  disabled?: boolean
  sendingLocation?: boolean
  showSaldoRequestButton?: boolean
  showQueueRequestButton?: boolean
  showPollButton?: boolean
  onPickFile: () => void
  onSendLocation: () => void
  onOpenPoll: () => void
  onOpenSaldo?: () => void
  onOpenQueue?: () => void
  extra?: React.ReactNode
}

/**
 * Aksi cepat pada composer workspace. Tombol bisnis (Isi Saldo, Antrian
 * Driver) muncul berdasarkan konteks workspace. Tombol Polling
 * disembunyikan di workspace Saldo/Driver sesuai spec (kode polling di
 * DB/API tetap ada — cuma tidak ditampilkan).
 */
export default function WorkspaceQuickAction({
  disabled,
  sendingLocation,
  showSaldoRequestButton,
  showQueueRequestButton,
  showPollButton = true,
  onPickFile,
  onSendLocation,
  onOpenPoll,
  onOpenSaldo,
  onOpenQueue,
  extra,
}: Props) {
  return (
    <>
      <button
        onClick={onPickFile}
        disabled={disabled}
        className="text-gray-400 hover:text-primary transition-colors disabled:opacity-40 flex-shrink-0"
        title="Kirim foto / file"
      >
        <Paperclip size={20} />
      </button>
      <button
        onClick={onSendLocation}
        disabled={disabled || sendingLocation}
        className="text-gray-400 hover:text-red-500 transition-colors disabled:opacity-40 flex-shrink-0"
        title="Kirim lokasi"
      >
        {sendingLocation
          ? <Loader2 size={18} className="animate-spin text-red-400" />
          : <MapPin size={20} />}
      </button>
      {showPollButton && (
        <button
          onClick={onOpenPoll}
          disabled={disabled}
          className="text-gray-400 hover:text-secondary transition-colors disabled:opacity-40 flex-shrink-0"
          title="Buat polling"
        >
          <BarChart2 size={20} />
        </button>
      )}
      {showSaldoRequestButton && onOpenSaldo && (
        <button
          onClick={onOpenSaldo}
          disabled={disabled}
          className="flex-shrink-0 flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1.5 text-[11px] font-semibold text-primary hover:bg-primary/20 transition-colors disabled:opacity-40"
          title="Pengajuan Isi Saldo"
        >
          <Wallet size={16} />
          <span>+ Isi Saldo</span>
        </button>
      )}
      {showQueueRequestButton && onOpenQueue && (
        <button
          onClick={onOpenQueue}
          disabled={disabled}
          className="flex-shrink-0 flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[11px] font-semibold text-amber-700 hover:bg-amber-100 transition-colors disabled:opacity-40"
          title="Masukkan Driver ke Antrean"
        >
          <Car size={16} />
          <span>+ Antrian Driver</span>
        </button>
      )}
      {extra}
    </>
  )
}
