const fs = require('fs')
const path = require('path')

const sqlPath = path.resolve(__dirname, '../../../sql/raos_116_soeta_master_schedule.sql')
const gasPath = path.resolve(__dirname, '../../../gas/23_soeta_master_import.gs')
const menuPath = path.resolve(__dirname, '../../../gas/10_menu.gs')

const sql = fs.readFileSync(sqlPath, 'utf8')
const gas = fs.readFileSync(gasPath, 'utf8')
const menu = fs.readFileSync(menuPath, 'utf8')

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

// ---------- SQL contract ----------
assert(sql.includes('CREATE TABLE IF NOT EXISTS public.raos_staff_master'), 'raos_staff_master table must be defined')
assert(/email\s+text\s*[,\n]/.test(sql), 'raos_staff_master.email must be nullable text')
assert(sql.includes('is_activated    boolean'), 'raos_staff_master.is_activated must be defined')
assert(sql.includes('auth_user_id    uuid REFERENCES auth.users'), 'raos_staff_master.auth_user_id must allow auth linkage')
assert(sql.includes("CREATE OR REPLACE FUNCTION public.raos_staff_master_upsert_bulk"), 'bulk upsert RPC must exist')
assert(sql.includes('p_records jsonb'), 'bulk upsert must accept p_records jsonb')
assert(sql.includes("CREATE OR REPLACE FUNCTION public.raos_staff_master_set_email"), 'set_email RPC must exist')
assert(sql.includes("CREATE OR REPLACE FUNCTION public.raos_staff_master_link_auth"), 'link_auth RPC must exist')
assert(sql.includes("CREATE OR REPLACE FUNCTION public.raos_shift_schedule_board"), 'schedule board RPC must be redefined')
assert(sql.includes("ARRAY['staff','koordinator']"), 'schedule board must include koordinator')
assert(sql.includes('ALTER TABLE public.raos_staff_master ENABLE ROW LEVEL SECURITY'), 'raos_staff_master RLS must be enabled')

// ---------- GAS contract ----------
assert(gas.includes('function importSoetaStaffMasterFromXlsx'), 'GAS import function must exist')
assert(gas.includes('rpc/raos_staff_master_upsert_bulk'), 'GAS must call raos_staff_master_upsert_bulk RPC')
assert(gas.includes('function importSoetaStaffMasterFromXlsx_MENU'), 'GAS menu wrapper must exist')
assert(gas.includes('isValidEmail'), 'GAS must validate email and allow null/empty')
assert(gas.includes('setSoetaStaffMasterEmail_MENU'), 'GAS set email menu must exist')
assert(gas.includes('linkSoetaStaffMasterAuth_MENU'), 'GAS link auth menu must exist')

// ---------- Menu contract ----------
assert(menu.includes('importSoetaStaffMasterFromXlsx_MENU'), 'Menu must expose SOETA master import')
assert(menu.includes('setSoetaStaffMasterEmail_MENU'), 'Menu must expose set email')
assert(menu.includes('linkSoetaStaffMasterAuth_MENU'), 'Menu must expose link auth')

console.log('PASS SOETA master data + schedule implementation contract')
