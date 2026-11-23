import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { extractManifestFiles } from './99_stamp_sw.mjs'
import { cleanStaleAssets } from './40_bundle_py.mjs'

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
  for (const name of ['sqlalchemy', 'pyyaml', 'sqlite3']) addPackage(name)
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

test('the engine archive contains Pyodide-compatible bytecode beside the original source', async () => {
  const { py, pyodide } = await manifest()
  const { spawnSync } = await import('node:child_process')
  const python = JSON.parse(await read(`public/pyodide/${pyodide.version}/pyodide-lock.json`)).info.python
  const result = spawnSync('uv', ['run', '--python', python.split('.').slice(0, 2).join('.'), 'python', '-c', `
from importlib.util import MAGIC_NUMBER
from zipfile import ZipFile
from sys import argv

with ZipFile(argv[1]) as archive:
    assert 'api.py' in archive.namelist()
    assert 'eos/db/__init__.py' in archive.namelist()
    for module in ('api', 'eos/db/__init__'):
        assert f'{module}.pyc' in archive.namelist(), f'Missing bytecode for {module}'
        assert archive.read(f'{module}.pyc').startswith(MAGIC_NUMBER)
    assert any(name.startswith('site-bytecode/sqlalchemy/__pycache__/__init__.') for name in archive.namelist())
`, fileURLToPath(new URL(`../public/data/${py.file}`, import.meta.url))], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
})

test('cleanStaleAssets removes unreferenced eve.*, names.*, py.* files and unreferenced pyodide directories', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'clean-test-'))
  const dataDir = join(temp, 'data')
  const pyodideDir = join(temp, 'pyodide')
  await Promise.all([mkdir(dataDir, { recursive: true }), mkdir(pyodideDir, { recursive: true })])

  const manifest = {
    db: { file: 'eve.referenced.db.gz' },
    names: { file: 'names.referenced.json' },
    py: { file: 'py.referenced.zip' },
    pyodide: { version: '0.29.3' },
  }

  // Create test files in dataDir
  await Promise.all([
    writeFile(join(dataDir, 'eve.old.db.gz'), 'old eve'),
    writeFile(join(dataDir, 'eve.20261122-34a39e9.db.gz'), 'pre-f1 eve'),
    writeFile(join(dataDir, 'eve.referenced.db.gz'), 'current eve'),
    writeFile(join(dataDir, 'names.old.json'), 'old names'),
    writeFile(join(dataDir, 'names.referenced.json'), 'current names'),
    writeFile(join(dataDir, 'py.old.zip'), 'old py'),
    writeFile(join(dataDir, 'py.referenced.zip'), 'current py'),
    writeFile(join(dataDir, 'manifest.json'), '{}'),
    writeFile(join(dataDir, 'other.txt'), 'do not touch'),
  ])

  // Create test dirs in pyodideDir
  const oldPyodide = join(pyodideDir, '0.28.0')
  const currentPyodide = join(pyodideDir, '0.29.3')
  await mkdir(oldPyodide, { recursive: true })
  await mkdir(currentPyodide, { recursive: true })
  await writeFile(join(oldPyodide, 'file.txt'), 'old')
  await writeFile(join(currentPyodide, 'file.txt'), 'current')

  try {
    await cleanStaleAssets(dataDir, pyodideDir, manifest)

    const remainingData = await readdir(dataDir)
    assert.deepEqual(
      remainingData.sort(),
      ['eve.referenced.db.gz', 'manifest.json', 'names.referenced.json', 'other.txt', 'py.referenced.zip'].sort()
    )

    const remainingPyodide = await readdir(pyodideDir)
    assert.deepEqual(remainingPyodide, ['0.29.3'])
  } finally {
    await rm(temp, { recursive: true, force: true })
  }
})

