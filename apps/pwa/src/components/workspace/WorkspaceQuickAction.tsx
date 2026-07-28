'use client'

import type React from 'react'
import { BarChart2, Loader2, MapPin, Paperclip, Wallet } from 'lucide-react'

interface Props {
  disabled?: boolean
  sendingLocation?: boolean
  showSaldoRequestButton?: boolean
  onPickFile: () => void
  onSendLocation: () => void
  onOpenPoll: () => void
  onOpenSaldo?: () => void
  extra?: React.ReactNode
}

/**
 * Quick actions row for the workspace composer.
 * Renders the shortcut buttons that trigger business-workspace actions
 * (attach file, drop a location pin, launch a poll, open the Isi Saldo sheet).
 */
export default function WorkspaceQuickAction({
  disabled,
  sendingLocation,
  showSaldoRequestButton,
  onPickFile,
  onSendLocation,
  onOpenPoll,
  onOpenSaldo,
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
      <button
        onClick={onOpenPoll}
        disabled={disabled}
        className="text-gray-400 hover:text-secondary transition-colors disabled:opacity-40 flex-shrink-0"
        title="Buat polling"
      >
        <BarChart2 size={20} />
      </button>
      {showSaldoRequestButton && onOpenSaldo && (
        <button
          onClick={onOpenSaldo}
          disabled={disabled}
          className="flex-shrink-0 flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1.5 text-[11px] font-semibold text-primary hover:bg-primary/20 transition-colors disabled:opacity-40"
          title="Pengajuan Isi Saldo"
        >
          <Wallet size={16} />
          <span>Kirim Saldo</span>
        </button>
      )}
      {extra}
    </>
  )
}
