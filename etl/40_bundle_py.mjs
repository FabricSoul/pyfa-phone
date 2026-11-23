import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile, rename, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const data = join(root, 'public/data')
const path = join(data, 'manifest.json')
const manifest = JSON.parse(await readFile(path, 'utf8'))
const file = `py.${manifest.dataVersion}.zip`
const bundle = join(data, file)

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
`, `${bundle}.tmp`], { cwd: root, stdio: 'inherit' })
await rename(`${bundle}.tmp`, bundle)

const bytes = (await stat(bundle)).size
const sha256 = createHash('sha256').update(await readFile(bundle)).digest('hex')
manifest.py = { file, bytes, sha256 }
await writeFile(`${path}.tmp`, JSON.stringify(manifest, null, 2) + '\n')
await rename(`${path}.tmp`, path)
console.log(`${file}: ${bytes} bytes`)
