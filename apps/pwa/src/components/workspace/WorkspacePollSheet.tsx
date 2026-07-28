'use client'

import { BarChart2, Loader2, Plus, Trash2, X } from 'lucide-react'
import clsx from 'clsx'

interface Props {
  pollQuestion: string
  pollOptions: string[]
  pollMultiple: boolean
  pollSending: boolean
  onQuestionChange: (val: string) => void
  onOptionsChange: (val: string[]) => void
  onToggleMultiple: () => void
  onCreate: () => void
  onClose: () => void
}

export default function WorkspacePollSheet({
  pollQuestion, pollOptions, pollMultiple, pollSending,
  onQuestionChange, onOptionsChange, onToggleMultiple, onCreate, onClose,
}: Props) {
  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end" onClick={() => { if (!pollSending) onClose() }}>
      <div className="bg-white rounded-t-3xl shadow-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>
        <div className="px-5 pb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <BarChart2 size={18} className="text-secondary" />
              <p className="font-bold text-gray-800 text-base">Buat Polling</p>
            </div>
            <button onClick={onClose} disabled={pollSending} aria-label="Tutup">
              <X size={20} className="text-gray-400" />
            </button>
          </div>

          <div className="mb-4">
            <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Pertanyaan</label>
            <input
              type="text"
              maxLength={200}
              placeholder="Tulis pertanyaan polling..."
              value={pollQuestion}
              onChange={e => onQuestionChange(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-secondary"
            />
          </div>

          <div className="mb-3">
            <label className="text-xs font-semibold text-gray-500 mb-1.5 block">
              Pilihan ({pollOptions.length}/4)
            </label>
            <div className="space-y-2">
              {pollOptions.map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="text"
                    maxLength={100}
                    placeholder={`Pilihan ${i + 1}`}
                    value={opt}
                    onChange={e => {
                      const next = [...pollOptions]
                      next[i] = e.target.value
                      onOptionsChange(next)
                    }}
                    className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-secondary"
                  />
                  {pollOptions.length > 2 && (
                    <button
                      onClick={() => onOptionsChange(pollOptions.filter((_, j) => j !== i))}
                      className="text-gray-300 hover:text-red-400 transition-colors flex-shrink-0"
                      aria-label="Hapus pilihan"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {pollOptions.length < 4 && (
              <button
                onClick={() => onOptionsChange([...pollOptions, ''])}
                className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-secondary"
              >
                <Plus size={13} /> Tambah pilihan
              </button>
            )}
          </div>

          <div className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3 mb-5">
            <div>
              <p className="text-sm font-semibold text-gray-700">Boleh pilih banyak</p>
              <p className="text-[10px] text-gray-400">Peserta bisa memilih lebih dari satu opsi</p>
            </div>
            <button
              onClick={onToggleMultiple}
              className={clsx('relative w-11 h-6 rounded-full transition-colors flex-shrink-0', pollMultiple ? 'bg-secondary' : 'bg-gray-200')}
              aria-label="Toggle multi pilihan"
            >
              <span className={clsx('absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform', pollMultiple ? 'translate-x-5' : 'translate-x-0.5')} />
            </button>
          </div>

          <button
            onClick={onCreate}
            disabled={pollSending || !pollQuestion.trim() || pollOptions.filter(o => o.trim()).length < 2}
            className="w-full bg-secondary text-white font-bold py-3 rounded-2xl disabled:opacity-40 transition-opacity flex items-center justify-center gap-2"
          >
            {pollSending
              ? <><Loader2 size={16} className="animate-spin" /> Membuat...</>
              : <><BarChart2 size={16} /> Buat Polling</>}
          </button>
        </div>
      </div>
    </div>
  )
}
