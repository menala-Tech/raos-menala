const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const { pathToFileURL } = require('node:url')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const workflowUrl = pathToFileURL(path.join(root, 'src/lib/operationalWorkflow.ts')).href

const code = `
  import assert from 'node:assert/strict'
  const workflow = await import(${JSON.stringify(workflowUrl)})

  assert.equal(workflow.shiftCodeFromName('Pagi'), 'P')
  assert.equal(workflow.shiftCodeFromName('Shift Siang'), 'S')
  assert.equal(workflow.shiftCodeFromName('Malam'), 'M')
  assert.equal(workflow.shiftCodeFromName(null), null)
  assert.equal(workflow.isStaffWorkReminderEligibleRole('staff'), true)
  for (const role of ['admin', 'koordinator', 'driver', 'direksi', 'management']) {
    assert.equal(workflow.isStaffWorkReminderEligibleRole(role), false)
  }

  const pagi = workflow.normalizeScheduleAssignment({
    userId: 'staff-a',
    branchId: 'branch-a',
    workDate: '2026-08-24',
    shiftId: 'shift-p',
    shiftName: 'Pagi',
    startTime: '07:00',
    endTime: '15:00',
  })
  assert.deepEqual(
    { shiftCode: pagi.shiftCode, status: pagi.status, plannedStart: pagi.plannedStart, plannedEnd: pagi.plannedEnd },
    { shiftCode: 'P', status: 'scheduled', plannedStart: '07:00', plannedEnd: '15:00' }
  )

  const libur = workflow.normalizeScheduleAssignment({
    userId: 'staff-a',
    branchId: 'branch-a',
    workDate: '2026-08-25',
    shiftId: null,
    shiftName: null,
  })
  assert.equal(libur.shiftCode, '-')
  assert.equal(libur.status, 'libur')

  const reminder = workflow.createWorkReminderPlan(pagi, { enabled: true, leadMinutes: 30 })
  assert.equal(reminder.active, true)
  assert.equal(reminder.key, 'work-reminder:staff-a:2026-08-24:P')
  assert.equal(reminder.remindAtLocal, '06:30')
  assert.equal(reminder.route, '/dashboard?tab=jadwal')

  const disabled = workflow.createWorkReminderPlan(pagi, { enabled: false, leadMinutes: 30 })
  assert.equal(disabled.active, false)
  assert.equal(disabled.reason, 'disabled')

  const liburReminder = workflow.createWorkReminderPlan(libur, { enabled: true, leadMinutes: 30 })
  assert.equal(liburReminder.active, false)
  assert.equal(liburReminder.reason, 'libur')

  const siang = workflow.normalizeScheduleAssignment({
    userId: 'staff-a',
    branchId: 'branch-a',
    workDate: '2026-08-24',
    shiftId: 'shift-s',
    shiftName: 'Siang',
    startTime: '13:00',
    endTime: '21:00',
  })
  const nextReminder = workflow.createWorkReminderPlan(siang, { enabled: true, leadMinutes: 30 })
  const changed = workflow.diffWorkReminderPlans(reminder, nextReminder)
  assert.deepEqual(changed.cancelKeys, ['work-reminder:staff-a:2026-08-24:P'])
  assert.equal(changed.schedule?.key, 'work-reminder:staff-a:2026-08-24:S')

  const duplicate = workflow.diffWorkReminderPlans(nextReminder, nextReminder)
  assert.deepEqual(duplicate.cancelKeys, [])
  assert.equal(duplicate.schedule, null)

  const removed = workflow.diffWorkReminderPlans(nextReminder, liburReminder)
  assert.deepEqual(removed.cancelKeys, ['work-reminder:staff-a:2026-08-24:S'])
  assert.equal(removed.schedule, null)

  const otherUser = workflow.createWorkReminderPlan({ ...pagi, userId: 'staff-b' }, { enabled: true, leadMinutes: 30 })
  assert.equal(otherUser.key, 'work-reminder:staff-b:2026-08-24:P')
  assert.notEqual(otherUser.key, reminder.key)

  const payrollInput = workflow.buildPayrollAttendanceInput({
    employeeId: 'staff-a',
    payrollPeriod: '2026-08-01',
    attendance: [
      { employeeId: 'staff-a', workDate: '2026-08-24', schedule: pagi, status: 'terlambat', validationState: 'validated', lateMinutes: 17, overtimeMinutes: 20 },
      { employeeId: 'staff-a', workDate: '2026-08-25', schedule: libur, status: 'tidak_hadir', validationState: 'draft', lateMinutes: 999 },
      { employeeId: 'staff-a', workDate: '2026-08-26', schedule: pagi, status: 'izin', validationState: 'approved' },
    ],
  })
  assert.deepEqual(payrollInput, {
    employeeId: 'staff-a',
    payrollPeriod: '2026-08-01',
    scheduledWorkDays: 2,
    validatedPresentDays: 1,
    lateMinutes: 17,
    absenceDays: 0,
    approvedLeaveDays: 1,
    overtimeMinutes: 20,
    source: 'validated_hris_attendance',
  })

  assert.equal(workflow.financePayableGate({ id: 'payroll-a', status: 'draft' }).payable, false)
  assert.deepEqual(workflow.financePayableGate({ id: 'payroll-a', status: 'approved' }), {
    payable: true,
    idempotencyKey: 'finance-payable:payroll-a',
  })
`

execFileSync(process.execPath, ['--experimental-transform-types', '--input-type=module', '-e', code], {
  cwd: root,
  stdio: 'inherit',
})

console.log('Operational workflow contract: PASS')
