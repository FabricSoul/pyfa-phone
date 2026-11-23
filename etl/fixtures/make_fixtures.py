#!/usr/bin/env python3
"""Compute CalcResult fixtures with pyfa's own eos and write them as JSON.

    uv run --python 3.13 --with sqlalchemy==2.0.51 --with logbook==1.9.2 --with pyyaml \
        --with cryptography python etl/fixtures/make_fixtures.py [--check] [--db PATH]

Reads etl/fixtures/fits.json (FitDoc objects, see src/engine/types.ts) and writes
src/engine/fixtures/{rifter,merlin,thrasher}.json plus catalog.json (item lists for the
mock engine). --check recomputes everything and exits 1 if the committed files differ.

eve.db: --db, else $PYFA_EVE_DB, else ~/.cache/pyfa-phone/eve-<pyfa commit>.db, which is
built on first use by running vendor/pyfa/db_update.py in a temporary copy of the
submodule (the submodule itself is never written to).

pyfa is imported unmodified. Modules it imports that are not available or not wanted here
(wx, requests, jose, and pyfa's GUI frame / column base class / bitmap loader) are replaced
with stand-in modules before the import, the same way the Pyodide worker will do it.
"""
import argparse
import difflib
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PYFA = ROOT / 'vendor' / 'pyfa'
FITS = Path(__file__).resolve().parent / 'fits.json'
OUT = ROOT / 'src' / 'engine' / 'fixtures'
sys.path[:0] = [str(ROOT / 'src/engine/py'), str(PYFA)]
from engine import Engine
from headless import bootstrap, install_stubs


# ---------------------------------------------------------------------------
# eve.db

def pyfa_commit():
    return subprocess.check_output(['git', '-C', str(PYFA), 'rev-parse', 'HEAD'], text=True).strip()


def resolve_db(arg):
    if arg:
        return Path(arg)
    if os.environ.get('PYFA_EVE_DB'):
        return Path(os.environ['PYFA_EVE_DB'])
    cached = Path.home() / '.cache' / 'pyfa-phone' / f'eve-{pyfa_commit()[:12]}.db'
    if not cached.exists():
        cached.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory() as tmp:
            copy = Path(tmp) / 'pyfa'
            print(f'building eve.db from {PYFA} (about 30 s)…', file=sys.stderr)
            shutil.copytree(PYFA, copy, ignore=shutil.ignore_patterns('.git', '__pycache__'))
            # db_update.py imports eos -> config.py -> wx, so it runs behind the same stand-ins.
            subprocess.check_call([sys.executable, __file__, '--run-db-update', str(copy)],
                                  cwd=copy, stdout=subprocess.DEVNULL)
            shutil.move(str(copy / 'eve.db'), cached)
    return cached


def run_db_update(pyfa_copy):
    import runpy
    sys.dont_write_bytecode = True
    sys.path.insert(0, pyfa_copy)
    install_stubs()
    runpy.run_path(os.path.join(pyfa_copy, 'db_update.py'), run_name='__main__')


def dump(obj):
    return json.dumps(obj, indent=2, ensure_ascii=False) + '\n'


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--check', action='store_true', help='recompute and fail if committed JSON differs')
    ap.add_argument('--db', help='path to eve.db')
    ap.add_argument('--run-db-update', metavar='PYFA_COPY', help=argparse.SUPPRESS)
    args = ap.parse_args()
    if args.run_db_update:
        return run_db_update(args.run_db_update)

    bootstrap(resolve_db(args.db))
    engine = Engine()
    docs = json.loads(FITS.read_text())
    outputs = {f'{name}.json': dump(engine.calc(doc)) for name, doc in docs.items()}
    outputs['catalog.json'] = dump(engine.catalog(list(docs.values())))

    if args.check:
        bad = 0
        for fname, text in outputs.items():
            path = OUT / fname
            old = path.read_text() if path.exists() else ''
            if old != text:
                bad += 1
                diff = difflib.unified_diff(old.splitlines(), text.splitlines(), f'committed/{fname}',
                                            f'computed/{fname}', lineterm='', n=1)
                print('\n'.join(list(diff)[:60]))
        if bad:
            print(f'✗ {bad} fixture file(s) differ; run make_fixtures.py to regenerate', file=sys.stderr)
            sys.exit(1)
        print(f'✓ {len(outputs)} fixture files match')
        return

    OUT.mkdir(parents=True, exist_ok=True)
    for fname, text in outputs.items():
        (OUT / fname).write_text(text)
        print(f'wrote {(OUT / fname).relative_to(ROOT)}')


if __name__ == '__main__':
    main()
