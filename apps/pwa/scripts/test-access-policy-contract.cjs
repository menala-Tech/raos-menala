const fs = require('fs')
const path = require('path')
const ts = require('typescript')
const Module = require('module')

const policyPath = path.resolve(__dirname, '../src/lib/accessPolicy.ts')
const routePath = path.resolve(__dirname, '../src/lib/roleGuard.ts')
const source = fs.readFileSync(policyPath, 'utf8')
const routeSource = fs.readFileSync(routePath, 'utf8')
const js = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  },
  fileName: policyPath,
}).outputText

const m = new Module(policyPath, module)
m.filename = policyPath
m.paths = module.paths
m._compile(js, policyPath)

const { can, normalizeRole, isAdministrativeWriter, isReadOnlyOperationalRole } = m.exports

function assert(condition, message) {
  if (!condition) throw new Error(message)
}
function allow(role, capability) {
  assert(can(role, capability), `${role} should allow ${capability}`)
}
function deny(role, capability) {
  assert(!can(role, capability), `${role} should deny ${capability}`)
}

// Canonical role contract.
allow('staff', 'scan:create')
allow('staff', 'attendance:self')
allow('staff', 'saldo:submit')
deny('staff', 'staff:mutate')
deny('staff', 'driver:mutate')

// Koordinator = Staff personal operations + branch supervisor reads.
allow('koordinator', 'scan:create')
allow('koordinator', 'attendance:self')
allow('koordinator', 'history:self')
allow('koordinator', 'saldo:submit')
allow('koordinator', 'kpi:self')
allow('koordinator', 'history:branch:read')
allow('koordinator', 'staff:read')
deny('koordinator', 'staff:mutate')
deny('koordinator', 'saldo:mutate')
assert(!isReadOnlyOperationalRole('koordinator'), 'koordinator must have personal operational writes')
assert(/koordinator:\s*\[[^\]]*'\/absensi'/.test(routeSource), 'koordinator route matrix must include /absensi')
assert(/koordinator:\s*\[[^\]]*'\/scan'/.test(routeSource), 'koordinator route matrix must include /scan')

allow('admin', 'admin:panel')
allow('admin', 'staff:mutate')
deny('admin', 'driver:mutate')
assert(isAdministrativeWriter('admin'), 'admin must be administrative writer')

allow('management', 'report:read')
deny('management', 'staff:mutate')
deny('management', 'saldo:mutate')
assert(isReadOnlyOperationalRole('management'), 'management must be read-only operational role')

allow('direksi', 'admin:panel')
allow('direksi', 'staff:mutate')
deny('direksi', 'driver:mutate')
assert(isAdministrativeWriter('direksi'), 'direksi must be administrative writer')

allow('driver_manager', 'queue:operate')
allow('driver_manager', 'driver:barcode:manage')
deny('driver_manager', 'scan:create')

allow('driver', 'history:self')
deny('driver', 'driver:read')
deny('driver', 'staff:read')
deny('driver', 'queue:operate')

assert(normalizeRole(' DIREKSI ') === 'direksi', 'role normalization must trim/lowercase')
assert(normalizeRole('unknown') === null, 'unknown role must fail closed')

console.log('PASS RAOS access policy + route parity contract')
