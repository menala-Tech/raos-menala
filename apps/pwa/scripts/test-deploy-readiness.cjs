const fs = require('fs')
const path = require('path')
const assert = require('assert')

// RAOS latest main SHA (as committed in this checkout)
const raosRoot = 'C:\\MENALA\\Repos\\raos-menala'
const rifimRoot = 'C:\\MENALA\\Repos\\rifim-os'

const raosSha = fs.readFileSync(path.join(raosRoot, '.git/HEAD'), 'utf8').trim()
const rifimSha = fs.readFileSync(path.join(rifimRoot, '.git/HEAD'), 'utf8').trim()

console.log('RAOS HEAD ref:', raosSha)
console.log('RIFIM HEAD ref:', rifimSha)

// Count RIFIM serverless functions under api/
const rifimApiFiles = []
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p)
    else if (e.isFile() && e.name.endsWith('.js')) rifimApiFiles.push(p)
  }
}
walk(path.join(rifimRoot, 'api'))

console.log('RIFIM api/*.js files:', rifimApiFiles.length)
for (const f of rifimApiFiles) {
  const rel = path.relative(rifimRoot, f)
  console.log(' ', rel)
}

assert(
  rifimApiFiles.length <= 12,
  `RIFIM serverless function count must be <= 12, found ${rifimApiFiles.length}`
)

console.log('✅ deployment readiness contract passed')
