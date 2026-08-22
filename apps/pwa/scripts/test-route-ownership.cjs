const fs = require('fs')
const path = require('path')
const ts = require('typescript')
const os = require('os')

const appDir = path.resolve(__dirname, '../src/app')
const libDir = path.resolve(__dirname, '../src/lib')
const roleGuardPath = path.join(libDir, 'roleGuard.ts')
const accessPolicyPath = path.join(libDir, 'accessPolicy.ts')

// Compile the two inter-dependent TS files into a temp directory so that
// CommonJS require('./accessPolicy') resolves correctly from roleGuard.js.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'raos-route-test-'))
const libTmpDir = path.join(tmpDir, 'lib')
fs.mkdirSync(libTmpDir, { recursive: true })

function compileTsToJs(sourcePath, outDir) {
  const source = fs.readFileSync(sourcePath, 'utf8')
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: sourcePath,
  }).outputText
  const base = path.basename(sourcePath, '.ts') + '.js'
  fs.writeFileSync(path.join(outDir, base), js)
}

compileTsToJs(accessPolicyPath, libTmpDir)
compileTsToJs(roleGuardPath, libTmpDir)

const { canRoleAccessRoute } = require(path.join(libTmpDir, 'roleGuard.js'))

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

// Canonical route ownership: each page is owned by the role(s) that the page
// itself or the dashboard quick-link matrix expects. This is the source of
// truth; ROLE_ROUTES must permit every owning role. admin/direksi/direktur
// wildcard routes are not listed as primary owners but still pass because of
// the '*' in ROLE_ROUTES.
const PUBLIC_ROUTES = new Set(['/', '/reset-password', '/offline'])

const PAGE_ROUTE_OWNERSHIP = {
  '/': { public: true },
  '/reset-password': { public: true },
  '/offline': { public: true },

  '/dashboard': { roles: ['staff', 'koordinator', 'management', 'driver_manager'] },
  '/chat': { roles: ['staff', 'koordinator', 'management', 'driver_manager', 'driver'] },
  '/settings': { roles: ['staff', 'koordinator', 'management', 'driver_manager', 'driver'] },
  '/settings/bantuan': { roles: ['staff', 'koordinator', 'management', 'driver_manager', 'driver'] },
  '/notifications': { roles: ['staff', 'koordinator', 'management', 'driver_manager', 'driver'] },

  '/scan': { roles: ['staff', 'koordinator'] },
  '/absensi': { roles: ['staff', 'koordinator'] },
  '/riwayat': { roles: ['staff', 'koordinator', 'management'] },
  '/status': { roles: ['staff', 'koordinator', 'management'] },
  '/riwayat-cabang': { roles: ['koordinator', 'management'] },
  '/kpi': { roles: ['staff', 'koordinator', 'management'] },
  '/laporan': { roles: ['koordinator', 'management'] },
  '/validasi-saldo': { roles: ['koordinator', 'management'] },

  '/antrian-driver': { roles: ['staff', 'koordinator', 'management', 'driver_manager'] },
  '/drivers': { roles: ['staff', 'koordinator', 'management', 'driver_manager'] },

  '/documents': { roles: ['staff'] },

  '/admin': { roles: ['admin'] },
  '/admin/barcodes': { roles: ['driver_manager'] },
  '/admin/kpi': { roles: ['management'] },

  '/driver-workspace': { roles: ['driver'] },
}

function discoverPageRoutes(dir) {
  const routes = []
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const ent of entries) {
    const full = path.join(dir, ent.name)
    if (ent.isDirectory()) {
      routes.push(...discoverPageRoutes(full))
    } else if (ent.name === 'page.tsx') {
      const rel = path.relative(appDir, full)
      const segs = rel.split(path.sep).filter(s => s !== 'page.tsx')
      const route = '/' + segs.join('/')
      routes.push(route)
    }
  }
  return routes
}

const discovered = discoverPageRoutes(appDir).sort()

// Every page must be declared in the ownership manifest (fail-closed for new pages).
for (const route of discovered) {
  assert(PAGE_ROUTE_OWNERSHIP[route], `Route ${route} exists as page.tsx but has no ownership entry in test-route-ownership.cjs`)
}

// Every manifest entry must have a page on disk, unless it is a public route.
for (const route of Object.keys(PAGE_ROUTE_OWNERSHIP)) {
  if (PUBLIC_ROUTES.has(route)) continue
  assert(discovered.includes(route), `Ownership manifest declares ${route} but no page.tsx found for it`)
}

// Each owner role must actually be permitted by the route guard.
for (const [route, meta] of Object.entries(PAGE_ROUTE_OWNERSHIP)) {
  if (meta.public) {
    assert(
      canRoleAccessRoute(undefined, route),
      `Public route ${route} is not accessible without a role`,
    )
    continue
  }
  assert(meta.roles && meta.roles.length > 0, `Route ${route} has no owning roles`)
  const failures = []
  for (const role of meta.roles) {
    if (!canRoleAccessRoute(role, route)) {
      failures.push(role)
    }
  }
  assert(
    failures.length === 0,
    `Route ${route} intended for [${meta.roles.join(',')}] but RoleGuard denies: ${failures.join(',')}`,
  )
}

// Confirm that the public set in roleGuard matches the manifest public routes.
for (const route of PUBLIC_ROUTES) {
  assert(PAGE_ROUTE_OWNERSHIP[route]?.public, `Public route ${route} must be declared public in the ownership manifest`)
}

console.log('PASS RAOS route ownership contract')
