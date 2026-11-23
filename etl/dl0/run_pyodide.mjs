import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'

const root = fileURLToPath(new URL('../../', import.meta.url))
const assets = resolve(process.argv[2] ?? join(root, 'public'))
const data = join(assets, 'data')
const manifest = JSON.parse(await readFile(join(data, 'manifest.json'), 'utf8'))
const runtime = join(assets, 'pyodide', manifest.pyodide.version)
const { loadPyodide } = await import(pathToFileURL(join(runtime, 'pyodide.mjs')).href)
const pyodide = await loadPyodide({ indexURL: runtime, packages: ['sqlalchemy', 'pyyaml', 'sqlite3'] })
const [db, bundle] = await Promise.all([
  readFile(join(data, manifest.db.file)).then(gunzipSync),
  readFile(join(data, manifest.py.file)),
])
pyodide.FS.writeFile('/eve.db', db)
pyodide.FS.writeFile('/product.zip', bundle)
pyodide.FS.mkdir('/workspace')
pyodide.FS.mount(pyodide.FS.filesystems.NODEFS, { root }, '/workspace')

const results = pyodide.runPython(`
import json, os, sys, unittest
sys.dont_write_bytecode = True
os.environ.update(
    DL0_DB="/eve.db",
    DL0_UPSTREAM="/workspace/vendor/pyfa",
    DL0_FIXTURES="/workspace/etl/fixtures",
)
sys.path[:0] = ["/workspace/etl/dl0", "/workspace/vendor/pyfa", "/product.zip"]
import test_probe
from probe import summary
result = unittest.TextTestRunner().run(unittest.defaultTestLoader.loadTestsFromModule(test_probe))
assert result.wasSuccessful()
summary(test_probe.DisplayProbeTest.report)
json.dumps(test_probe.DisplayProbeTest.report, ensure_ascii=False)
`)
if (process.argv[3]) {
  const expected = JSON.parse(await readFile(process.argv[3], 'utf8'))
  assert.deepEqual(JSON.parse(results), expected)
  console.log('CPython / Pyodide: 0 differences in captured payload')
}
