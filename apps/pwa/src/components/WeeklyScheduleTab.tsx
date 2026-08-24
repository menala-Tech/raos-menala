'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle, CalendarDays, Check, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import clsx from 'clsx'
import { supabase } from '@/lib/supabase'
import type { Branch, Shift, ShiftScheduleBoardRow, UserProfile } from '@/types'

type DayKey = 'sen' | 'sel' | 'rab' | 'kam' | 'jum' | 'sab' | 'min'
type WeekDay = { key: DayKey; label: string; date: string; day: string }
type ScheduleCell = { schedule_id: string | null; shift_id: string | null; shift_name: string | null }
type WeeklyRow = {
  staff_id: string
  full_name: string
  byDate: Record<string, ScheduleCell>
}

const DAY_LABELS: Array<{ key: DayKey; label: string }> = [
  { key: 'sen', label: 'Sen' },
  { key: 'sel', label: 'Sel' },
  { key: 'rab', label: 'Rab' },
  { key: 'kam', label: 'Kam' },
  { key: 'jum', label: 'Jum' },
  { key: 'sab', label: 'Sab' },
  { key: 'min', label: 'Min' },
]

function toDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function addDays(dateStr: string, delta: number): string {
  const d = new Date(`${dateStr}T00:00:00`)
  d.setDate(d.getDate() + delta)
  return toDateStr(d)
}

function mondayOf(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return toDateStr(d)
}

function formatWeekRange(days: WeekDay[]): string {
  const first = new Date(`${days[0].date}T00:00:00`)
  const last = new Date(`${days[6].date}T00:00:00`)
  return `${first.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} - ${last.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}`
}

function buildWeek(startDate: string): WeekDay[] {
  return DAY_LABELS.map((d, idx) => {
    const date = addDays(startDate, idx)
    return { ...d, date, day: date.slice(8, 10) }
  })
}

function canEditSchedule(user: UserProfile | null): boolean {
  return user?.role === 'admin' || user?.role === 'koordinator'
}

function canBrowseBranches(user: UserProfile | null): boolean {
  return user?.role === 'admin' || user?.role === 'direksi' || user?.role === 'management'
}

export default function WeeklyScheduleTab({ user }: { user: UserProfile | null }) {
  const [branches, setBranches] = useState<Branch[]>([])
  const [shifts, setShifts] = useState<Shift[]>([])
  const [activeBranch, setActiveBranch] = useState<string | null>(user?.branch_id ?? null)
  const [weekStart, setWeekStart] = useState(() => mondayOf(toDateStr(new Date())))
  const [rows, setRows] = useState<WeeklyRow[]>([])
  const [loading, setLoading] = useState(true)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState('')

  const editable = canEditSchedule(user)
  const browsable = canBrowseBranches(user)
  const lockedBranch = useMemo(() => {
    if (browsable) return null
    return user?.branches ?? branches.find(b => b.id === user?.branch_id) ?? null
  }, [branches, browsable, user])
  const activeBranchData = browsable ? branches.find(b => b.id === activeBranch) ?? null : lockedBranch
  const days = useMemo(() => buildWeek(weekStart), [weekStart])
  const defaultShift = shifts[0] ?? null

  useEffect(() => {
    async function loadStatic() {
      const [{ data: sh }, brRes] = await Promise.all([
        supabase.from('shifts').select('*').eq('is_active', true).order('start_time'),
        browsable ? supabase.from('branches').select('*').eq('is_active', true).order('code') : Promise.resolve({ data: null }),
      ])
      setShifts((sh ?? []) as Shift[])
      if (browsable) setBranches((brRes.data ?? []) as Branch[])
    }
    void loadStatic()
  }, [browsable])

  useEffect(() => {
    if (!browsable && lockedBranch && activeBranch !== lockedBranch.id) setActiveBranch(lockedBranch.id)
  }, [activeBranch, browsable, lockedBranch])

  useEffect(() => {
    if (browsable && !activeBranch && branches.length > 0) setActiveBranch(branches[0].id)
  }, [activeBranch, branches, browsable])

  const loadWeek = useCallback(async () => {
    if (!activeBranch) {
      setRows([])
      setLoading(false)
      return
    }
    setLoading(true)
    setErrorMsg('')
    const results = await Promise.all(days.map(day =>
      supabase.rpc('raos_shift_schedule_board', { p_branch_id: activeBranch, p_tanggal: day.date })
    ))
    const firstError = results.find(r => r.error)?.error
    if (firstError) {
      setErrorMsg('Gagal memuat jadwal.')
      setRows([])
      setLoading(false)
      return
    }

    const merged = new Map<string, WeeklyRow>()
    results.forEach((result, dayIndex) => {
      const date = days[dayIndex].date
      for (const row of ((result.data ?? []) as ShiftScheduleBoardRow[])) {
        const current = merged.get(row.staff_id) ?? { staff_id: row.staff_id, full_name: row.full_name, byDate: {} }
        current.byDate[date] = {
          schedule_id: row.schedule_id,
          shift_id: row.shift_id,
          shift_name: row.shift_name,
        }
        merged.set(row.staff_id, current)
      }
    })
    setRows(Array.from(merged.values()).sort((a, b) => a.full_name.localeCompare(b.full_name)))
    setLoading(false)
  }, [activeBranch, days])

  useEffect(() => { void loadWeek() }, [loadWeek])

  async function toggleDay(row: WeeklyRow, day: WeekDay) {
    if (!editable || !activeBranch || !defaultShift) return
    const cell = row.byDate[day.date] ?? { schedule_id: null, shift_id: null, shift_name: null }
    const key = `${row.staff_id}:${day.date}`
    setSavingKey(key)
    setErrorMsg('')
    const { error } = cell.schedule_id
      ? await supabase.from('raos_shift_schedules').delete().eq('id', cell.schedule_id)
      : await supabase.from('raos_shift_schedules').insert({
          staff_id: row.staff_id,
          branch_id: activeBranch,
          tanggal: day.date,
          shift_id: defaultShift.id,
        })
    if (error) {
      setErrorMsg(error.message.includes('rate_limited')
        ? 'Jadwal staff ini sudah diubah dalam 7 hari terakhir.'
        : 'Gagal menyimpan jadwal.')
    } else {
      await loadWeek()
    }
    setSavingKey(null)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <CalendarDays size={18} className="text-primary" />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-black text-gray-800">Jadwal Mingguan</h2>
          <p className="text-[11px] text-gray-400 truncate">
            {activeBranchData?.name ?? 'Cabang'} · {formatWeekRange(days)}
          </p>
        </div>
        {!editable && <span className="rounded-full bg-gray-100 px-2 py-1 text-[10px] font-bold text-gray-500">Lihat saja</span>}
      </div>

      {browsable && (
        <div className="overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex w-max min-w-full gap-2">
            {branches.map(b => (
              <button
                key={b.id}
                type="button"
                onClick={() => setActiveBranch(b.id)}
                className={clsx(
                  'flex-none min-w-[72px] rounded-lg px-3 py-2 text-sm font-bold whitespace-nowrap transition-colors',
                  activeBranch === b.id ? 'bg-primary text-secondary' : 'bg-gray-100 text-gray-500'
                )}
              >
                {b.code}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between rounded-lg bg-gray-50 px-2 py-2">
        <button type="button" onClick={() => setWeekStart(addDays(weekStart, -7))} className="p-1.5 text-gray-500">
          <ChevronLeft size={18} />
        </button>
        <button type="button" onClick={() => setWeekStart(mondayOf(toDateStr(new Date())))} className="text-xs font-bold text-gray-700">
          {formatWeekRange(days)}
        </button>
        <button type="button" onClick={() => setWeekStart(addDays(weekStart, 7))} className="p-1.5 text-gray-500">
          <ChevronRight size={18} />
        </button>
      </div>

      {errorMsg && (
        <div className="flex items-start gap-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-600">
          <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
          {errorMsg}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-gray-100 bg-white">
        <div className="min-w-[620px]">
          <div className="grid grid-cols-[minmax(160px,1.5fr)_repeat(7,minmax(58px,1fr))] border-b border-gray-100 bg-gray-50 text-[10px] font-black uppercase tracking-wider text-gray-500">
            <div className="px-3 py-2">Nama</div>
            {days.map(day => (
              <div key={day.date} className="px-2 py-2 text-center">
                <div>{day.label}</div>
                <div className="font-semibold text-gray-400 normal-case tracking-normal">{day.day}</div>
              </div>
            ))}
          </div>

          {loading && (
            <div className="flex items-center justify-center gap-2 py-8 text-xs text-gray-400">
              <Loader2 size={14} className="animate-spin" />
              Memuat jadwal
            </div>
          )}

          {!loading && rows.length === 0 && (
            <div className="py-8 text-center text-xs text-gray-400">Belum ada staff aktif di cabang ini</div>
          )}

          {!loading && rows.map(row => (
            <div key={row.staff_id} className="grid grid-cols-[minmax(160px,1.5fr)_repeat(7,minmax(58px,1fr))] border-b border-gray-50 last:border-0">
              <div className="px-3 py-2 text-sm font-semibold text-gray-800 truncate">{row.full_name}</div>
              {days.map(day => {
                const cell = row.byDate[day.date] ?? { schedule_id: null, shift_id: null, shift_name: null }
                const checked = !!cell.schedule_id
                const busy = savingKey === `${row.staff_id}:${day.date}`
                return (
                  <button
                    key={day.date}
                    type="button"
                    disabled={!editable || busy || !defaultShift}
                    onClick={() => toggleDay(row, day)}
                    aria-label={`${row.full_name} ${day.label} ${checked ? 'terjadwal' : 'belum terjadwal'}`}
                    className="flex min-h-10 items-center justify-center px-2 py-2 disabled:cursor-default"
                  >
                    <span
                      className={clsx(
                        'flex h-6 w-6 items-center justify-center rounded border text-[10px]',
                        checked ? 'border-primary bg-primary text-secondary' : 'border-gray-200 bg-white text-transparent',
                        editable && !busy && 'hover:border-primary'
                      )}
                      title={cell.shift_name ?? 'Checklist'}
                    >
                      {busy ? <Loader2 size={12} className="animate-spin text-gray-400" /> : <Check size={14} />}
                    </span>
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      <p className="text-[10px] text-gray-400">
        Checklist menyimpan Nama, Tanggal, dan status jadwal ke tabel raos_shift_schedules. Admin dapat mengubah semua cabang; Koordinator dikunci ke cabang sendiri; role lain lihat saja.
      </p>
    </div>
  )
}
