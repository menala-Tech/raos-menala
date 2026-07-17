import { supabase } from './supabase'

export interface Shift {
  id: string
  name: string
  start_time: string // '07:00:00'
  end_time: string   // '15:00:00'
  tolerance_minutes: number
  is_active: boolean
}

function toMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

/**
 * Deteksi shift aktif berdasarkan jam sekarang (spec Absensi.md: Shift Otomatis
 * Pagi/Siang/Malam). Shift malam melewati tengah malam (21:00–05:00) ditangani khusus.
 * Kalau jam sekarang di luar semua shift, pilih shift terdekat yang akan datang.
 */
export async function detectCurrentShift(): Promise<Shift | null> {
  const { data: shifts } = await supabase
    .from('shifts')
    .select('*')
    .eq('is_active', true)
    .order('start_time')

  if (!shifts || shifts.length === 0) return null

  const now = new Date()
  const nowMin = now.getHours() * 60 + now.getMinutes()

  for (const s of shifts as Shift[]) {
    const start = toMinutes(s.start_time)
    const end = toMinutes(s.end_time)
    if (start <= end) {
      if (nowMin >= start && nowMin < end) return s
    } else {
      // Shift malam: 21:00 → 05:00
      if (nowMin >= start || nowMin < end) return s
    }
  }

  // Di luar semua shift → shift berikutnya yang paling dekat
  let next: Shift | null = null
  let minDiff = Infinity
  for (const s of shifts as Shift[]) {
    const start = toMinutes(s.start_time)
    const diff = start >= nowMin ? start - nowMin : start + 1440 - nowMin
    if (diff < minDiff) { minDiff = diff; next = s }
  }
  return next
}

export function formatShiftTime(s: Shift): string {
  const fmt = (t: string) => t.slice(0, 5)
  return `${fmt(s.start_time)} s/d ${fmt(s.end_time)}`
}

/** Cek keterlambatan check-in terhadap start shift + toleransi */
export function isLate(shift: Shift, checkInAt: Date): boolean {
  const start = toMinutes(shift.start_time)
  const checkin = checkInAt.getHours() * 60 + checkInAt.getMinutes()
  // Shift malam yang mulai 21:00 — kalau checkin dini hari, hitung relatif hari sebelumnya
  const startAdjusted = start
  let checkinAdjusted = checkin
  if (toMinutes(shift.start_time) > toMinutes(shift.end_time) && checkin < toMinutes(shift.end_time)) {
    checkinAdjusted = checkin + 1440
  }
  return checkinAdjusted > startAdjusted + shift.tolerance_minutes
}
