import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { extractManifestFiles } from './99_stamp_sw.mjs'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root))
const manifest = () => read('public/data/manifest.json').then(JSON.parse)

test('Pyodide runtime and the locked dependency closure are hashed and precached', async () => {
  const data = await manifest()
  const { version, files } = data.pyodide ?? {}
  assert.equal(version, '0.29.3')
  const prefix = `/pyodide/${version}/`
  const lock = JSON.parse(await read(`public${prefix}pyodide-lock.json`))
  const pkgFiles = new Set()
  function addPackage(name) {
    const pkg = lock.packages[name]
    if (pkgFiles.has(pkg.file_name)) return
    pkgFiles.add(pkg.file_name)
    for (const dependency of pkg.depends) addPackage(dependency)
  }
  for (const name of ['sqlalchemy', 'pyyaml', 'cryptography', 'sqlite3']) addPackage(name)
  const cached = new Set(extractManifestFiles(data))
  const required = ['pyodide.mjs', 'pyodide.asm.js', 'pyodide.asm.wasm', 'pyodide-lock.json', 'python_stdlib.zip', 'package.json', ...pkgFiles]
  for (const name of required) {
    const path = prefix + name
    const asset = files.find((asset) => asset.file === path)
    assert.ok(asset && cached.has(path), `${path} missing from the manifest or precache`)
    const bytes = await read(`public${path}`)
    assert.equal(bytes.length, asset.bytes)
    assert.ok(asset.bytes < 25 * 1024 * 1024)
    assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256)
    const pkg = Object.values(lock.packages).find((pkg) => pkg.file_name === name)
    if (pkg) assert.equal(asset.sha256, pkg.sha256)
  }
})

test('the browser Worker loads Pyodide from the application origin', async () => {
  assert.doesNotMatch((await read('src/engine/worker.ts')).toString(), /cdn\.jsdelivr\.net/)
})
