export type WorkShiftCode = 'P' | 'S' | 'M' | '-'

export const SHIFT_CODE_LABELS: Record<WorkShiftCode, string> = {
  P: 'Pagi',
  S: 'Siang',
  M: 'Malam',
  '-': 'Libur',
}

export interface ShiftTimeConfig {
  code: Exclude<WorkShiftCode, '-'>
  shiftId: string
  name: string
  startTime: string
  endTime: string
}

export interface ScheduleAssignment {
  userId: string
  branchId: string
  workDate: string
  shiftCode: WorkShiftCode
  shiftId?: string | null
  plannedStart?: string | null
  plannedEnd?: string | null
  status?: 'scheduled' | 'libur'
}

export interface ReminderSettings {
  enabled: boolean
  leadMinutes: number
  route?: string
}

export interface WorkReminderPlan {
  active: boolean
  key: string
  userId: string
  branchId: string
  workDate: string
  shiftCode: WorkShiftCode
  route: string
  reason?: 'disabled' | 'libur' | 'missing_shift_time'
  remindAtLocal?: string
}

export interface AttendanceSummaryInput {
  employeeId: string
  workDate: string
  schedule: ScheduleAssignment
  actualCheckIn?: string | null
  actualCheckOut?: string | null
  status: string
  validationState?: string | null
  lateMinutes?: number | null
  earlyLeaveMinutes?: number | null
  overtimeMinutes?: number | null
}

export interface PayrollAttendanceInput {
  employeeId: string
  payrollPeriod: string
  scheduledWorkDays: number
  validatedPresentDays: number
  lateMinutes: number
  absenceDays: number
  approvedLeaveDays: number
  overtimeMinutes: number
  source: 'validated_hris_attendance'
}

export interface PayrollRow {
  id: string
  status?: string | null
  thp?: number | null
}

export function shiftCodeFromName(name?: string | null): WorkShiftCode | null {
  const normalized = String(name ?? '').trim().toLowerCase()
  if (!normalized) return null
  if (normalized.includes('pagi')) return 'P'
  if (normalized.includes('siang')) return 'S'
  if (normalized.includes('malam')) return 'M'
  if (normalized.includes('libur')) return '-'
  return null
}

export function normalizeScheduleAssignment(input: {
  userId: string
  branchId: string
  workDate: string
  shiftId?: string | null
  shiftName?: string | null
  startTime?: string | null
  endTime?: string | null
}): ScheduleAssignment {
  const code = input.shiftId ? (shiftCodeFromName(input.shiftName) ?? '-') : '-'
  return {
    userId: input.userId,
    branchId: input.branchId,
    workDate: input.workDate,
    shiftCode: code,
    shiftId: input.shiftId ?? null,
    plannedStart: code === '-' ? null : input.startTime ?? null,
    plannedEnd: code === '-' ? null : input.endTime ?? null,
    status: code === '-' ? 'libur' : 'scheduled',
  }
}

export function createWorkReminderPlan(schedule: ScheduleAssignment, settings: ReminderSettings): WorkReminderPlan {
  const key = `work-reminder:${schedule.userId}:${schedule.workDate}:${schedule.shiftCode}`
  const route = settings.route ?? '/dashboard?tab=jadwal'
  if (!settings.enabled) {
    return { active: false, key, userId: schedule.userId, branchId: schedule.branchId, workDate: schedule.workDate, shiftCode: schedule.shiftCode, route, reason: 'disabled' }
  }
  if (schedule.shiftCode === '-' || schedule.status === 'libur') {
    return { active: false, key, userId: schedule.userId, branchId: schedule.branchId, workDate: schedule.workDate, shiftCode: schedule.shiftCode, route, reason: 'libur' }
  }
  if (!schedule.plannedStart) {
    return { active: false, key, userId: schedule.userId, branchId: schedule.branchId, workDate: schedule.workDate, shiftCode: schedule.shiftCode, route, reason: 'missing_shift_time' }
  }
  return {
    active: true,
    key,
    userId: schedule.userId,
    branchId: schedule.branchId,
    workDate: schedule.workDate,
    shiftCode: schedule.shiftCode,
    route,
    remindAtLocal: subtractMinutes(schedule.plannedStart, settings.leadMinutes),
  }
}

export function diffWorkReminderPlans(previous: WorkReminderPlan | null, next: WorkReminderPlan): {
  cancelKeys: string[]
  schedule: WorkReminderPlan | null
} {
  const cancelKeys = previous && previous.key !== next.key ? [previous.key] : []
  const schedule = next.active && (!previous || previous.key !== next.key || previous.remindAtLocal !== next.remindAtLocal) ? next : null
  if (previous && !next.active) cancelKeys.push(previous.key)
  return { cancelKeys: Array.from(new Set(cancelKeys)), schedule }
}

export function isValidatedAttendance(validationState?: string | null): boolean {
  const state = String(validationState ?? '').toLowerCase()
  return ['validated', 'approved', 'final', 'finalized'].includes(state)
}

export function buildPayrollAttendanceInput(args: {
  employeeId: string
  payrollPeriod: string
  attendance: AttendanceSummaryInput[]
}): PayrollAttendanceInput {
  const validated = args.attendance.filter(row => isValidatedAttendance(row.validationState))
  return {
    employeeId: args.employeeId,
    payrollPeriod: args.payrollPeriod,
    scheduledWorkDays: validated.filter(row => row.schedule.shiftCode !== '-').length,
    validatedPresentDays: validated.filter(row => ['hadir', 'terlambat'].includes(row.status)).length,
    lateMinutes: sum(validated.map(row => row.lateMinutes)),
    absenceDays: validated.filter(row => row.status === 'tidak_hadir').length,
    approvedLeaveDays: validated.filter(row => ['izin', 'cuti', 'sakit'].includes(row.status)).length,
    overtimeMinutes: sum(validated.map(row => row.overtimeMinutes)),
    source: 'validated_hris_attendance',
  }
}

export function financePayableGate(payroll: PayrollRow): {
  payable: boolean
  idempotencyKey: string
  reason?: 'payroll_not_final'
} {
  const status = String(payroll.status ?? '').toLowerCase()
  const payable = ['approved', 'final', 'finalized', 'paid_ready'].includes(status)
  return payable
    ? { payable, idempotencyKey: `finance-payable:${payroll.id}` }
    : { payable, idempotencyKey: `finance-payable:${payroll.id}`, reason: 'payroll_not_final' }
}

function subtractMinutes(time: string, minutes: number): string {
  const [hourRaw, minuteRaw] = time.split(':')
  const total = ((Number(hourRaw) * 60 + Number(minuteRaw) - minutes) % 1440 + 1440) % 1440
  const hour = String(Math.floor(total / 60)).padStart(2, '0')
  const minute = String(total % 60).padStart(2, '0')
  return `${hour}:${minute}`
}

function sum(values: Array<number | null | undefined>): number {
  return values.reduce<number>((total, value) => total + (Number(value) || 0), 0)
}
