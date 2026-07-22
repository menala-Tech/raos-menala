'use client'

import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

/**
 * Kalender bulanan compact untuk dashboard.
 * - Highlight tanggal hari ini (primary bg).
 * - Navigasi prev/next bulan.
 * - Header hari: Sen-Min (locale ID, mulai Senin).
 */
const DAYS_ID = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min']

export default function MiniCalendar() {
  const today = useMemo(() => new Date(), [])
  const [month, setMonth] = useState(() => ({ y: today.getFullYear(), m: today.getMonth() }))

  const monthName = new Date(month.y, month.m, 1).toLocaleDateString('id-ID', {
    month: 'long', year: 'numeric',
  })

  const grid = useMemo(() => {
    const first = new Date(month.y, month.m, 1)
    const daysInMonth = new Date(month.y, month.m + 1, 0).getDate()
    // JS getDay(): 0=Min, 1=Sen, ..., 6=Sab. Kita mulai kolom Senin (idx 0) → Minggu (idx 6)
    const firstDayIdx = (first.getDay() + 6) % 7
    const cells: Array<{ day: number | null; isToday: boolean }> = []
    for (let i = 0; i < firstDayIdx; i++) cells.push({ day: null, isToday: false })
    for (let d = 1; d <= daysInMonth; d++) {
      const isToday =
        d === today.getDate() && month.m === today.getMonth() && month.y === today.getFullYear()
      cells.push({ day: d, isToday })
    }
    // Padding akhir supaya jumlah cell kelipatan 7
    while (cells.length % 7 !== 0) cells.push({ day: null, isToday: false })
    return cells
  }, [month, today])

  function prevMonth() {
    setMonth(m => m.m === 0 ? { y: m.y - 1, m: 11 } : { y: m.y, m: m.m - 1 })
  }
  function nextMonth() {
    setMonth(m => m.m === 11 ? { y: m.y + 1, m: 0 } : { y: m.y, m: m.m + 1 })
  }
  function jumpToday() {
    setMonth({ y: today.getFullYear(), m: today.getMonth() })
  }

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
      <div className="flex items-center justify-between mb-3">
        <button onClick={prevMonth} aria-label="Bulan sebelumnya"
          className="w-7 h-7 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-500">
          <ChevronLeft size={16} />
        </button>
        <button onClick={jumpToday}
          className="font-bold text-sm text-gray-800 capitalize hover:text-primary"
          title="Kembali ke hari ini">
          {monthName}
        </button>
        <button onClick={nextMonth} aria-label="Bulan berikutnya"
          className="w-7 h-7 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-500">
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center mb-1">
        {DAYS_ID.map((d, i) => (
          <span key={d} className={
            'text-[10px] font-semibold py-1 ' +
            (i === 6 ? 'text-red-400' : 'text-gray-400')
          }>{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {grid.map((c, i) => (
          <div key={i} className="aspect-square flex items-center justify-center">
            {c.day && (
              <span className={
                'w-7 h-7 flex items-center justify-center text-xs rounded-full ' +
                (c.isToday
                  ? 'bg-primary text-secondary font-black'
                  : (i % 7 === 6 ? 'text-red-400' : 'text-gray-700'))
              }>
                {c.day}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
