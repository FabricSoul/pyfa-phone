import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { access, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const data = join(root, 'public/data')
const path = join(data, 'manifest.json')

export async function cleanStaleAssets(dataDir, pyodideDir, manifest) {
  const keepFiles = new Set(
    [manifest.db?.file, manifest.names?.file, manifest.py?.file].filter(Boolean)
  )

  try {
    const dataEntries = await readdir(dataDir, { withFileTypes: true })
    for (const entry of dataEntries) {
      if (entry.isFile() || entry.isSymbolicLink()) {
        const name = entry.name
        if (
          (name.startsWith('eve.') || name.startsWith('names.') || name.startsWith('py.')) &&
          !keepFiles.has(name)
        ) {
          await rm(join(dataDir, name), { force: true })
        }
      }
    }
  } catch (err) {
    if (err.code !== 'ENOENT') throw err
  }

  const keepVersion = manifest.pyodide?.version
  if (keepVersion) {
    try {
      const pyodideEntries = await readdir(pyodideDir, { withFileTypes: true })
      for (const entry of pyodideEntries) {
        if (entry.isDirectory() && entry.name !== keepVersion) {
          await rm(join(pyodideDir, entry.name), { recursive: true, force: true })
        }
      }
    } catch (err) {
      if (err.code !== 'ENOENT') throw err
    }
  }
}

export async function bundlePy() {
  const readJson = async (file) => JSON.parse(await readFile(join(root, 'build', file), 'utf8'))
  const [{ clientBuild, db }, { dbSha256, ...names }, pyodide] = await Promise.all([
    readJson('game-db.json'), readJson('names.json'), readJson('pyodide.json'),
  ])
  if (db.sha256 !== dbSha256) throw new Error('The names index must be generated from the staged database')
  await Promise.all([join(data, db.file), join(data, names.file),
    ...pyodide.files.map(({ file }) => join(root, 'public', file)),
  ].map((file) => access(file)))
  await mkdir(data, { recursive: true })
  const stage = await mkdtemp(join(data, '.bundle-'))
  const bundle = join(stage, 'engine.zip')
  try {
    // The pyfa submodule remains untouched. Use Python's stdlib for a reproducible ZIP.
    execFileSync('python3', ['-c', `
from pathlib import Path
from sys import argv
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

vendor = Path('vendor/pyfa')
vendor_files = [
    'config.py', 'LICENSE', 'eos/lgpl.txt', 'service/__init__.py',
    'service/attribute.py', 'service/character.py', 'service/const.py',
    'service/damagePattern.py', 'service/esi.py', 'service/esiAccess.py',
    'service/fit.py', 'service/market.py', 'service/server.py', 'service/settings.py',
    'service/port/__init__.py', 'service/port/dna.py', 'service/port/eft.py',
    'service/port/multibuy.py', 'service/port/muta.py', 'service/port/shared.py',
    'service/port/xml.py', 'service/port/esi.py',
    'gui/__init__.py', 'gui/globalEvents.py',
    'gui/builtinViewColumns/__init__.py', 'gui/builtinViewColumns/misc.py',
    'gui/builtinViewColumns/maxRange.py', 'gui/fitCommands/__init__.py',
    'gui/fitCommands/helpers.py', 'gui/utils/__init__.py',
    'gui/utils/listFormatter.py', 'gui/utils/numberFormatter.py',
]
for directory in ('eos', 'service/conversions', 'service/jargon', 'utils'):
    vendor_files.extend(p.relative_to(vendor).as_posix() for p in (vendor / directory).rglob('*.py'))
vendor_files.extend(p.relative_to(vendor).as_posix() for p in (vendor / 'service/jargon').glob('*.yaml'))
files = {name: vendor / name for name in vendor_files}
own = Path('src/engine/py')
files.update({p.relative_to(own).as_posix(): p for p in own.rglob('*.py')})

with ZipFile(argv[1], 'w') as archive:
    for name, path in sorted(files.items()):
        archive.writestr(ZipInfo(name), path.read_bytes(), compress_type=ZIP_DEFLATED, compresslevel=9)
    `, bundle], { cwd: root, stdio: 'inherit' })

    const bytes = (await stat(bundle)).size
    const sha256 = createHash('sha256').update(await readFile(bundle)).digest('hex')
    const file = `py.${sha256}.zip`
    await rename(bundle, join(data, file))
    const py = { file, bytes, sha256 }
    const hashes = [db, names, py, ...pyodide.files].map((asset) => asset.sha256)
    const dataVersion = createHash('sha256').update(hashes.join('')).digest('hex')
    const manifest = { dataVersion, clientBuild, db, names, py, pyodide }
    const stagedManifest = join(stage, 'manifest.json')
    await writeFile(stagedManifest, JSON.stringify(manifest, null, 2) + '\n')
    await rename(stagedManifest, path)
    await cleanStaleAssets(data, join(root, 'public/pyodide'), manifest)
    console.log(`${file}: ${bytes} bytes`)
  } finally {
    await rm(stage, { recursive: true, force: true })
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  await bundlePy()
}

