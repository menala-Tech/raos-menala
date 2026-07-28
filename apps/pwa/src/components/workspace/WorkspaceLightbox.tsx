'use client'

import { Download, X } from 'lucide-react'

interface Props {
  url: string
  onClose: () => void
}

export default function WorkspaceLightbox({ url, onClose }: Props) {
  return (
    <div className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center" onClick={onClose}>
      <button
        onClick={onClose}
        aria-label="Tutup"
        className="absolute top-5 right-5 w-11 h-11 rounded-full bg-white/10 backdrop-blur-sm text-white flex items-center justify-center active:scale-95"
      >
        <X size={22} />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt="Preview"
        className="max-w-[92vw] max-h-[80vh] object-contain rounded-xl shadow-2xl"
        onClick={e => e.stopPropagation()}
      />
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        download
        onClick={e => e.stopPropagation()}
        style={{ bottom: 'calc(28px + env(safe-area-inset-bottom))' }}
        className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2 bg-primary hover:bg-primary/90 text-secondary text-sm font-bold px-6 py-3 rounded-full shadow-lg active:scale-95 transition-transform"
      >
        <Download size={18} /> Unduh Gambar
      </a>
    </div>
  )
}
