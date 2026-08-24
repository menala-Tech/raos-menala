const fs = require('fs')
const path = require('path')

const sqlPath = path.resolve(__dirname, '../../../sql/raos_116_soeta_master_schedule.sql')
const scopedPath = path.resolve(__dirname, '../../../sql/raos_117_soeta_terminal_scoped.sql')
const gasPath = path.resolve(__dirname, '../../../gas/23_staff_master_import.gs')
const menuPath = path.resolve(__dirname, '../../../gas/10_menu.gs')
const rifimSqlPath = path.resolve(__dirname, '../../../../rifim-os/supabase/migrations/rifim_001_soeta_staff_master_consumer.sql')
const rifimConsumerPath = path.resolve(__dirname, '../../../../rifim-os/automation/apps-script/raosSoetaStaffConsumer.js')

const sql = fs.readFileSync(sqlPath, 'utf8')
const scoped = fs.readFileSync(scopedPath, 'utf8')
const gas = fs.readFileSync(gasPath, 'utf8')
const menu = fs.readFileSync(menuPath, 'utf8')
const rifimSql = fs.readFileSync(rifimSqlPath, 'utf8')
const rifimConsumer = fs.readFileSync(rifimConsumerPath, 'utf8')

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

// ---------- SQL contract: raos_staff_master ----------
assert(sql.includes('CREATE TABLE IF NOT EXISTS public.raos_staff_master'), 'raos_staff_master table must be defined')
assert(/email\s+text\s*[,\n]/.test(sql), 'raos_staff_master.email must be nullable text')
assert(sql.includes('airport_id      uuid'), 'raos_staff_master.airport_id must be defined')
assert(sql.includes('is_activated    boolean'), 'raos_staff_master.is_activated must be defined')
assert(sql.includes('auth_user_id    uuid REFERENCES auth.users'), 'raos_staff_master.auth_user_id must allow auth linkage')
assert(sql.includes('raos_staff_master_auth_user_unq'), 'raos_staff_master.auth_user_id must be unique when not null')
assert(sql.includes("CREATE OR REPLACE FUNCTION public.raos_staff_master_upsert_bulk"), 'bulk upsert RPC must exist')
assert(sql.includes('p_records jsonb'), 'bulk upsert must accept p_records jsonb')
assert(sql.includes("CREATE OR REPLACE FUNCTION public.raos_staff_master_set_email"), 'set_email RPC must exist')
assert(sql.includes("CREATE OR REPLACE FUNCTION public.raos_staff_master_link_auth"), 'link_auth RPC must exist')
assert(sql.includes('ALTER TABLE public.raos_staff_master ENABLE ROW LEVEL SECURITY'), 'raos_staff_master RLS must be enabled')

// ---------- SQL contract: auth identity hardening ----------
assert(sql.includes('auth_user_id_already_linked'), 'link_auth must reject already-linked auth_user_id')
assert(sql.includes('airport_id_not_resolved'), 'link_auth must reject unresolved airport_id')
assert(sql.includes('branch_id_not_resolved'), 'link_auth must reject unresolved branch_id')
assert(sql.includes('branch_inactive'), 'link_auth must reject inactive branch')

// ---------- SQL contract: schedule parity ----------
assert(sql.includes("CREATE OR REPLACE FUNCTION public.raos_shift_schedule_board"), 'schedule board RPC must be redefined')
assert(sql.includes("ARRAY['staff','koordinator']"), 'schedule board must include koordinator')
assert(sql.includes("ALTER TABLE public.raos_shift_schedules") && sql.includes("status text"), 'raos_shift_schedules.status must be added')

// ---------- SQL contract: terminal scoping ----------
assert(scoped.includes('DROP CONSTRAINT IF EXISTS branches_code_key'), 'legacy global branches.code unique must be dropped')
assert(scoped.includes('branches_terminal_code_unq'), 'terminal code must be unique per airport')
assert(/preflight|duplicate.*branch.*code/i.test(scoped), 'raos_117 must include preflight duplicate check')

// ---------- GAS contract ----------
assert(gas.includes('function importStaffMasterFromXlsx'), 'GAS import function must use global name')
assert(gas.includes('rpc/raos_staff_master_upsert_bulk'), 'GAS must call raos_staff_master_upsert_bulk RPC')
assert(gas.includes('function importStaffMasterFromXlsx_MENU'), 'GAS menu wrapper must use global name')
assert(gas.includes('isValidEmail'), 'GAS must validate email and allow null/empty')
assert(gas.includes('setStaffMasterEmail_MENU'), 'GAS set email menu must use global name')
assert(gas.includes('linkStaffMasterAuth_MENU'), 'GAS link auth menu must use global name')
assert(!gas.includes('Soekarno-Hatta'), 'GAS must not hardcode Soekarno-Hatta')

// ---------- Menu contract ----------
assert(menu.includes('importStaffMasterFromXlsx_MENU'), 'Menu must expose staff master import')
assert(menu.includes('setStaffMasterEmail_MENU'), 'Menu must expose set email')
assert(menu.includes('linkStaffMasterAuth_MENU'), 'Menu must expose link auth')

// ---------- RIFIM SQL contract ----------
assert(rifimSql.includes('raos_staff_master_hris'), 'RIFIM view must exist')
assert(rifimSql.includes('security_invoker'), 'RIFIM view must use security_invoker')
assert(rifimSql.includes('GRANT SELECT ON public.raos_staff_master_hris TO service_role'), 'RIFIM view must be granted to service_role only')
assert(!rifimSql.includes('TO authenticated'), 'RIFIM view must not grant to authenticated')

// ---------- RIFIM consumer contract ----------
assert(rifimConsumer.includes('on_conflict=employee_id'), 'RIFIM consumer must use atomic upsert')
assert(rifimConsumer.includes('resolution=merge-duplicates'), 'RIFIM consumer must use resolution=merge-duplicates')
assert(rifimConsumer.includes('is_activated !== true'), 'RIFIM consumer must skip non-activated rows')

console.log('PASS SOETA master data + schedule implementation contract')
