'use client'

import { useEffect, useRef } from 'react'
import { App } from '@capacitor/app'
import { branchDateKey, normalizeBranchTimeZone } from './branchTime'
import {
  createWorkReminderPlan,
  normalizeScheduleAssignment,
  SHIFT_CODE_LABELS,
  type WorkShiftCode,
} from './operationalWorkflow'
import { supabase } from './supabase'
import {
  cancelNativeWorkRemindersForUser,
  isNativeAndroidShell,
  syncNativeWorkReminders,
  type NativeWorkReminderPlan,
} from './nativeWorkReminderBridge'

type ScheduleRow = {
  tanggal: string
  shift_id: string | null
  shifts?: {
    id: string
    name: string
    start_time: string
    end_time: string
  } | Array<{
    id: string
    name: string
    start_time: string
    end_time: string
  }> | null
}

const SYNC_THROTTLE_MS = 60 * 1000
const LOOKAHEAD_DAYS = 14
const DEFAULT_LEAD_MINUTES = 30
const ROUTE = '/dashboard?tab=jadwal'

function reminderEnabledLocally(): boolean {
  try {
    const raw = localStorage.getItem('raos_prefs')
    if (!raw) return true
    const prefs = JSON.parse(raw) as { notifMaster?: boolean; notifJenis?: Record<string, boolean> }
    return prefs.notifMaster !== false && prefs.notifJenis?.['Pengingat Absen'] !== false
  } catch {
    return true
  }
}

function addDays(dateStr: string, days: number): string {
  const date = new Date(`${dateStr}T00:00:00`)
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

function branchLocalTimeEpochMs(dateStr: string, time: string, timeZone?: string | null): number {
  const [year, month, day] = dateStr.split('-').map(Number)
  const [hour, minute] = time.split(':').map(Number)
  const zone = normalizeBranchTimeZone(timeZone).zoneLabel
  const offsetHours = zone === 'WIT' ? 9 : zone === 'WITA' ? 8 : 7
  return Date.UTC(year, month - 1, day, hour, minute, 0, 0) - offsetHours * 60 * 60 * 1000
}

function reminderBody(shiftLabel: string, startTime: string, leadMinutes: number): string {
  const formatted = startTime.slice(0, 5).replace(':', '.')
  if (leadMinutes <= 0) return `${shiftLabel} dimulai sekarang, pukul ${formatted}.`
  return `${shiftLabel} dimulai ${leadMinutes} menit lagi, pukul ${formatted}.`
}

function toNativePlan(args: {
  row: ScheduleRow
  userId: string
  branchId: string
  timeZone?: string | null
  leadMinutes: number
}): NativeWorkReminderPlan | null {
  const shift = Array.isArray(args.row.shifts) ? args.row.shifts[0] : args.row.shifts
  const schedule = normalizeScheduleAssignment({
    userId: args.userId,
    branchId: args.branchId,
    workDate: args.row.tanggal,
    shiftId: args.row.shift_id,
    shiftName: shift?.name,
    startTime: shift?.start_time,
    endTime: shift?.end_time,
  })
  const reminder = createWorkReminderPlan(schedule, {
    enabled: true,
    leadMinutes: args.leadMinutes,
    route: ROUTE,
  })
  if (!reminder.active || !shift?.start_time) return null

  const shiftCode = schedule.shiftCode as Exclude<WorkShiftCode, '-'>
  const shiftLabel = SHIFT_CODE_LABELS[shiftCode]
  const reminderAtEpochMs = branchLocalTimeEpochMs(args.row.tanggal, reminder.remindAtLocal!, args.timeZone)
  if (reminderAtEpochMs <= Date.now()) return null
  const shiftStartAtEpochMs = branchLocalTimeEpochMs(args.row.tanggal, shift.start_time, args.timeZone)
  return {
    reminderKey: `${reminder.key}:before`,
    userId: args.userId,
    branchId: args.branchId,
    shiftCode,
    shiftLabel,
    workDate: args.row.tanggal,
    shiftStartAt: new Date(shiftStartAtEpochMs).toISOString(),
    reminderAt: new Date(reminderAtEpochMs).toISOString(),
    reminderAtEpochMs,
    route: ROUTE,
    title: 'Pengingat Jadwal Kerja',
    body: reminderBody(`Shift ${shiftLabel}`, shift.start_time, args.leadMinutes),
  }
}

export function useNativeWorkReminderSync(): void {
  const runningRef = useRef(false)
  const lastSyncRef = useRef(0)
  const lastUserRef = useRef<string | null>(null)

  useEffect(() => {
    if (!isNativeAndroidShell()) return

    const sync = async (force = false) => {
      if (runningRef.current) return
      if (!force && Date.now() - lastSyncRef.current < SYNC_THROTTLE_MS) return

      runningRef.current = true
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user?.id) {
          const lastUser = lastUserRef.current
          if (lastUser) await cancelNativeWorkRemindersForUser(lastUser)
          lastUserRef.current = null
          return
        }

        const userId = session.user.id
        const { data: profile, error: profileError } = await supabase
          .from('user_profiles')
          .select('id, role, branch_id, branches(timezone)')
          .eq('id', userId)
          .maybeSingle()
        if (profileError || !profile?.id) return

        const role = String((profile as any).role ?? '').toLowerCase()
        const branchId = (profile as any).branch_id as string | null
        const previousUser = lastUserRef.current
        if (previousUser && previousUser !== userId) await cancelNativeWorkRemindersForUser(previousUser)
        lastUserRef.current = userId

        if (role !== 'staff' || !branchId || !reminderEnabledLocally()) {
          await cancelNativeWorkRemindersForUser(userId)
          lastSyncRef.current = Date.now()
          return
        }

        const branch = Array.isArray((profile as any).branches) ? (profile as any).branches[0] : (profile as any).branches
        const timeZone = branch?.timezone as string | null | undefined
        const today = branchDateKey(timeZone)
        const until = addDays(today, LOOKAHEAD_DAYS)
        const { data: rows, error: scheduleError } = await supabase
          .from('raos_shift_schedules')
          .select('tanggal, shift_id, shifts(id, name, start_time, end_time)')
          .eq('staff_id', userId)
          .gte('tanggal', today)
          .lte('tanggal', until)
          .order('tanggal')
        if (scheduleError) return

        const plans = ((rows ?? []) as ScheduleRow[])
          .map(row => toNativePlan({ row, userId, branchId, timeZone, leadMinutes: DEFAULT_LEAD_MINUTES }))
          .filter((plan): plan is NativeWorkReminderPlan => Boolean(plan))
        await syncNativeWorkReminders(userId, role, plans)
        lastSyncRef.current = Date.now()
      } finally {
        runningRef.current = false
      }
    }

    void sync(true)
    const authSub = supabase.auth.onAuthStateChange(event => {
      if (event === 'SIGNED_OUT') {
        const lastUser = lastUserRef.current
        if (lastUser) void cancelNativeWorkRemindersForUser(lastUser)
        lastUserRef.current = null
        return
      }
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') void sync(true)
    })
    const onOnline = () => { void sync(true) }
    const onVisible = () => {
      if (document.visibilityState === 'visible') void sync()
    }
    const onPrefsChanged = () => { void sync(true) }
    window.addEventListener('online', onOnline)
    window.addEventListener('raos:prefs-changed', onPrefsChanged)
    document.addEventListener('visibilitychange', onVisible)
    const appState = App.addListener('appStateChange', state => {
      if (state.isActive) void sync()
    })

    return () => {
      authSub.data.subscription.unsubscribe()
      window.removeEventListener('online', onOnline)
      window.removeEventListener('raos:prefs-changed', onPrefsChanged)
      document.removeEventListener('visibilitychange', onVisible)
      void appState.then(listener => listener.remove())
    }
  }, [])
}
