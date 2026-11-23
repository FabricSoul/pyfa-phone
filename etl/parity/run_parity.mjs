import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const root = fileURLToPath(new URL('../../', import.meta.url))
const data = join(root, 'public/data')
const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'))
const manifest = await readJson(join(data, 'manifest.json'))
assert.ok(manifest.py?.file, 'Game data manifest must contain the Python engine bundle')
const { loadPyodide } = await import('pyodide')
const [db, bundle, names, fits] = await Promise.all([
  readFile(join(data, manifest.db.file)).then(gunzipSync),
  readFile(join(data, manifest.py.file)),
  readFile(join(data, manifest.names.file)),
  readJson(join(root, 'etl/fixtures/fits.json')),
])
const snapshot = await readFile(new URL('./snapshot.py', import.meta.url), 'utf8')
const expected = JSON.parse(execFileSync('uv', [
  'run', '--python', '3.13', '--with', 'sqlalchemy==2.0.51', '--with', 'pyyaml',
  '--with', 'cryptography', 'python', 'etl/parity/snapshot.py',
  join(root, 'build/eve.db'), join(data, manifest.names.file), 'etl/fixtures/fits.json',
], { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }))
const pyodide = await loadPyodide({
  packageCacheDir: join(root, 'node_modules/.cache/pyodide'),
  packages: ['sqlalchemy', 'pyyaml', 'cryptography', 'sqlite3'],
})
pyodide.FS.writeFile('/eve.db', db)
pyodide.FS.writeFile('/pyfa.zip', bundle)
pyodide.FS.writeFile('/names.json', names)
pyodide.FS.writeFile('/fits.json', JSON.stringify(fits))
const actual = JSON.parse(pyodide.runPython(`
import sys
sys.path.insert(0, '/pyfa.zip')
sys.argv = ['snapshot.py', '/eve.db', '/names.json', '/fits.json']
${snapshot}
`))
for (const name of Object.keys(fits)) {
  const committed = await readJson(join(root, 'src/engine/fixtures', `${name}.json`))
  // JSON treats 0 and -0 identically.
  assert.deepEqual(expected[name].calc, committed, `${name}: CPython calc fixture drift`)
  for (const section of Object.keys(expected[name])) {
    assert.deepEqual(actual[name][section], expected[name][section], `${name}: ${section}`)
  }
  console.log(`${name}: 0 differences (calc, itemsForSlot, chargesFor, and text/skill APIs)`)
}
