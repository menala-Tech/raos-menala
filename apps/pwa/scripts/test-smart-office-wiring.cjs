const fs = require('fs')
const path = require('path')
const assert = require('node:assert/strict')

const root = path.resolve(__dirname, '..')
function read(...parts) { return fs.readFileSync(path.join(...parts), 'utf8') }

const smartOfficeApi = read(root, 'src/lib/smartOfficeApi.ts')
const documentPage = read(root, 'src/app/documents/page.tsx')
const documentTab = read(root, 'src/components/DocumentRequestTab.tsx')

// 1. Actor must come from authenticated Supabase session, never arbitrary browser text.
//    smartOfficePost must send the session access_token and must NOT forward a
//    client-supplied performedBy/performed_by into the GAS payload.
assert.match(smartOfficeApi, /access_token:\s*session\.access_token/)
assert.doesNotMatch(smartOfficeApi, /performedBy|performed_by/)

// 2. Company code default is the canonical RIFIM default expected by the backend.
//    It may be overridden by NEXT_PUBLIC_SMART_OFFICE_COMPANY_CODE, but the
//    fallback is intentionally RIFIM (not MENALA) because RIFIM OS Smart Office
//    V2 uses getCompanyByCode('RIFIM') as the canonical default and MIG/MENALA
//    is the legal brand, not the database company code.
assert.match(smartOfficeApi, /NEXT_PUBLIC_SMART_OFFICE_COMPANY_CODE\s*\|\|\s*['"]RIFIM['"]/)

// 3. Create draft must validate that a documentId was actually returned before
//    the UI proceeds to submit. Fail closed on missing documentId.
assert.match(smartOfficeApi, /if\s*\(\s*!data\?\.documentId\s*\)/)
assert.match(smartOfficeApi, /DocumentId wajib ada sebelum submit/)

// 4. Submit must reject unexpected/failure status. The canonical V2 submit flow
//    returns status 'pending_approval' or (for already-approved edge case) 'approved'.
assert.match(smartOfficeApi, /status\s*!==\s*['"]pending_approval['"]\s*&&\s*data\?\.status\s*!==\s*['"]approved['"]/)

// 5. /documents is staff-only (matches roleGuard route ownership + in-page gate).
assert.match(documentPage, /['"]staff['"]/)
assert.match(documentPage, /Pengajuan dokumen tersedia untuk Staff/)

// 6. DocumentRequestTab must not construct or forward performedBy metadata.
assert.doesNotMatch(documentTab, /performedBy|performed_by/)

console.log('Smart Office wiring contract: PASS')
