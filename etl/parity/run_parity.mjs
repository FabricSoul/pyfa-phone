import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'

const root = fileURLToPath(new URL('../../', import.meta.url))
const data = join(root, 'public/data')
const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'))
const manifest = await readJson(join(data, 'manifest.json'))
assert.ok(manifest.py?.file, 'Game data manifest must contain the Python engine bundle')
const runtimeDir = join(root, 'public', 'pyodide', manifest.pyodide.version)
const { loadPyodide } = await import(pathToFileURL(join(runtimeDir, 'pyodide.mjs')).href)
const [db, bundle, names, fits, advanced, advancedExpected] = await Promise.all([
  readFile(join(data, manifest.db.file)).then(gunzipSync),
  readFile(join(data, manifest.py.file)),
  readFile(join(data, manifest.names.file)),
  readJson(join(root, 'etl/fixtures/fits.json')),
  readJson(join(root, 'etl/fixtures/advanced-fits.json')),
  readJson(join(root, 'etl/fixtures/advanced-expected.json')),
])
const [snapshot, regressions] = await Promise.all(
  ['snapshot.py', 'regressions.py'].map((file) => readFile(new URL(file, import.meta.url), 'utf8')),
)
const cpython = execFileSync('uv', [
  'run', '--python', '3.13', '--with', 'sqlalchemy==2.0.51', '--with', 'pyyaml',
  '--with', 'cryptography', 'python', 'etl/parity/snapshot.py',
  join(root, 'build/eve.db'), join(data, manifest.names.file), 'etl/fixtures/fits.json',
  manifest.dataVersion, manifest.clientBuild, 'etl/fixtures/advanced-fits.json',
], { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'inherit'] })
const expected = JSON.parse(cpython)
const pyodide = await loadPyodide({
  indexURL: runtimeDir,
  packages: ['sqlalchemy', 'pyyaml', 'sqlite3'],
})
pyodide.FS.writeFile('/eve.db', db)
pyodide.FS.writeFile('/pyfa.zip', bundle)
pyodide.FS.writeFile('/names.json', names)
pyodide.FS.writeFile('/fits.json', JSON.stringify(fits))
pyodide.FS.writeFile('/advanced-fits.json', JSON.stringify(advanced))
pyodide.FS.writeFile('/regressions.py', regressions)
pyodide.globals.set('snapshot_version', manifest.dataVersion)
pyodide.globals.set('snapshot_client_build', manifest.clientBuild)
const actual = JSON.parse(pyodide.runPython(`
import sys
sys.path[:0] = ['/pyfa.zip', '/']
sys.argv = ['snapshot.py', '/eve.db', '/names.json', '/fits.json', snapshot_version, snapshot_client_build, '/advanced-fits.json']
${snapshot}
`))
for (const name of Object.keys({ ...fits, ...advanced })) {
  const committed = name in advanced ? advancedExpected[name] : await readJson(join(root, 'src/engine/fixtures', `${name}.json`))
  // The manifest also hashes the bundled Python source, so each build has its own data version.
  assert.equal(expected[name].calc.dataVersion, manifest.dataVersion)
  assert.equal(expected[name].getDataVersion, manifest.dataVersion)
  assert.deepEqual(expected[name].calc, { ...committed, dataVersion: manifest.dataVersion }, `${name}: CPython calc fixture drift`)
  for (const section of Object.keys(expected[name])) {
    assert.deepEqual(actual[name][section], expected[name][section], `${name}: ${section}`)
  }
  const sections = name in advanced ? 'every calc field' : 'calc, market and item APIs, charges, text and skills'
  console.log(`${name}: 0 differences (${sections})`)
}
