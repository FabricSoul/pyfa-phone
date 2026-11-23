#!/usr/bin/env python3
"""Compute CalcResult fixtures with pyfa's own eos and write them as JSON.

    uv run --python 3.13 --with sqlalchemy==2.0.51 --with logbook==1.9.2 --with pyyaml \
        --with cryptography python etl/fixtures/make_fixtures.py [--check] [--db PATH]

Reads etl/fixtures/fits.json (FitDoc objects, see src/engine/types.ts) and writes
src/engine/fixtures/{rifter,merlin,thrasher}.json plus catalog.json (item lists for the
mock engine) plus a separate parity-only fixture set. --check recomputes everything and exits 1 if the committed files differ.

Run pnpm etl first. The manifest supplies the asset version and eve.db defaults to
the generated build/eve.db (overridable with --db or PYFA_EVE_DB).

pyfa is imported unmodified. Modules it imports that are not available or not wanted here
(wx, requests, jose, and pyfa's GUI frame / column base class / bitmap loader) are replaced
with stand-in modules before the import, the same way the Pyodide worker will do it.
"""
import argparse
import difflib
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PYFA = ROOT / 'vendor' / 'pyfa'
FITS = Path(__file__).resolve().parent / 'fits.json'
OUT = ROOT / 'src' / 'engine' / 'fixtures'
ADVANCED = FITS.with_name('advanced-fits.json')
ADVANCED_EXPECTED = FITS.with_name('advanced-expected.json')
sys.path[:0] = [str(ROOT / 'src/engine/py'), str(PYFA)]
import api


def dump(obj):
    return json.dumps(obj, indent=2, ensure_ascii=False) + '\n'


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--check', action='store_true', help='recompute and fail if committed JSON differs')
    ap.add_argument('--db', help='path to eve.db')
    args = ap.parse_args()

    manifest = json.loads((ROOT / 'public/data/manifest.json').read_text())
    db = Path(args.db or os.environ.get('PYFA_EVE_DB') or ROOT / 'build/eve.db').resolve()
    api.initialize(db, ROOT / 'public/data' / manifest['names']['file'],
                   manifest['dataVersion'], manifest['clientBuild'])
    engine = api._engine
    docs = json.loads(FITS.read_text())
    for doc in docs.values():
        doc.update(dataVersion=engine.data_version, clientBuild=engine.client_build, itemNames=engine.item_names(doc))
    outputs = {OUT / f'{name}.json': dump(api.calc(doc)) for name, doc in docs.items()}
    with api._temporary_fit():
        outputs[OUT / 'catalog.json'] = dump(engine.catalog(list(docs.values())))
    outputs[ADVANCED_EXPECTED] = dump({name: api.calc(doc) for name, doc in json.loads(ADVANCED.read_text()).items()})
    outputs[FITS] = dump(docs)

    if args.check:
        bad = 0
        for path, text in outputs.items():
            fname = path.name
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
    for path, text in outputs.items():
        path.write_text(text)
        print(f'wrote {path.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
