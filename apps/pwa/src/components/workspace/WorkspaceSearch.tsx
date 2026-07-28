'use client'

import { Search } from 'lucide-react'

interface Props {
  value: string
  onChange: (val: string) => void
  placeholder?: string
}

export default function WorkspaceSearch({ value, onChange, placeholder }: Props) {
  return (
    <div className="relative">
      <Search className="absolute left-3 top-2.5 text-white/40" size={16} />
      <input
        type="text"
        placeholder={placeholder ?? 'Cari workspace atau pesan...'}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full bg-white/10 text-white placeholder-white/40 text-sm pl-9 pr-3 py-2 rounded-xl border border-white/20 focus:outline-none"
      />
    </div>
  )
}
