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
import builtins
import difflib
import importlib.abc
import importlib.machinery
import json
import os
import shutil
import subprocess
import sys
import tempfile
import types
from functools import lru_cache
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PYFA = ROOT / 'vendor' / 'pyfa'
FITS = Path(__file__).resolve().parent / 'fits.json'
OUT = ROOT / 'src' / 'engine' / 'fixtures'
DISTANCES_KM = list(range(0, 31))


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


# ---------------------------------------------------------------------------
# Stand-in modules

class _Dummy:
    """Absorbs any use: call, attribute, `|`, unpacking (wx.lib.newevent.NewEvent())."""
    def __init__(self, *a, **k): pass
    def __call__(self, *a, **k): return _Dummy()
    def __getattr__(self, name): return _Dummy()
    def __or__(self, other): return 0
    __ror__ = __or__
    def __iter__(self): return iter((_Dummy(), _Dummy()))


class _StubModule(types.ModuleType):
    def __getattr__(self, name):
        if name.startswith('__'):
            raise AttributeError(name)
        value = type(name, (_Dummy,), {})  # a class, so it can be subclassed too
        setattr(self, name, value)
        return value


STUB_PACKAGES = {'wx', 'requests_cache', 'requests', 'jose'}
# pyfa GUI modules that misc.py / maxRange.py import but only use inside __init__, which we
# never call. Importing the real ones drags in the whole wx GUI (and a circular import).
STUB_MODULES = {'gui.mainFrame', 'gui.ssoLogin', 'gui.viewColumn', 'gui.bitmap_loader'}


class _StubFinder(importlib.abc.MetaPathFinder, importlib.abc.Loader):
    def find_spec(self, name, path, target=None):
        if name.split('.')[0] in STUB_PACKAGES or name in STUB_MODULES:
            return importlib.machinery.ModuleSpec(name, self, is_package=name not in STUB_MODULES)

    def create_module(self, spec):
        mod = _StubModule(spec.name)
        if spec.name not in STUB_MODULES:
            mod.__path__ = []
        return mod

    def exec_module(self, mod):
        if mod.__name__ == 'wx':
            mod.Colour = lambda *a: a
            mod.GetTranslation = lambda s, *a, **k: s
            mod.CallAfter = lambda f, *a, **k: f(*a, **k)
        elif mod.__name__ == 'gui.viewColumn':
            class ViewColumn:
                columns = {}

                def __init__(self, fittingView=None):
                    self.fittingView = fittingView

                @classmethod
                def register(cls):
                    ViewColumn.columns[cls.name] = cls
            mod.ViewColumn = ViewColumn


def run_db_update(pyfa_copy):
    import runpy
    sys.dont_write_bytecode = True
    sys.path.insert(0, pyfa_copy)
    sys.meta_path.insert(0, _StubFinder())
    runpy.run_path(os.path.join(pyfa_copy, 'db_update.py'), run_name='__main__')


def bootstrap(db_path):
    sys.dont_write_bytecode = True  # keep the submodule clean
    sys.path.insert(0, str(PYFA))
    sys.meta_path.insert(0, _StubFinder())
    builtins._ = lambda s: s  # pyfa.py installs gettext's _ as a builtin
    sys._called_from_test = True  # in-memory saveddata
    import eos.config
    eos.config.gamedata_connectionstring = f'sqlite:///{db_path}'
    import config
    config.savePath = tempfile.mkdtemp(prefix='pyfa-settings-')
    import eos.db
    eos.db.saveddata_meta.create_all(eos.db.saveddata_engine)


# ---------------------------------------------------------------------------
# Helpers that need eos (imported after bootstrap)

def r(x, nd=4):
    """Round floats so the JSON is stable and small."""
    v = round(float(x), nd)
    return int(v) if v == int(v) and abs(v) < 1e15 else v


STATES = {'offline': -1, 'online': 0, 'active': 1, 'overheated': 2}
STATE_NAMES = {v: k for k, v in STATES.items()}
SLOT_KINDS = ['high', 'mid', 'low', 'rig', 'subsystem']


def meta_of(metagroup_id):
    # pyfa metaGroupIDs: 1 T1, 2 T2, 3 Storyline, 4 Faction, 5 Officer, 6 Deadspace,
    # 14 T3, 52 Structure Faction, 53 Structure T2, 54 Structure T1.
    return {2: 'tech2', 53: 'tech2', 3: 'storyline', 4: 'faction', 52: 'faction',
            5: 'officer', 6: 'deadspace'}.get(metagroup_id, 'tech1')


META_ORDER = ['tech2', 'tech1', 'faction', 'storyline', 'deadspace', 'officer']


class Engine:
    def __init__(self):
        import eos.db
        from eos.const import FittingSlot, FittingHardpoint
        from gui.builtinViewColumns.misc import Miscellanea
        from gui.builtinViewColumns.maxRange import MaxRange
        from service.market import Market
        self.db = eos.db
        self.Slot = FittingSlot
        self.Hardpoint = FittingHardpoint
        self.slot_of = {FittingSlot.HIGH: 'high', FittingSlot.MED: 'mid', FittingSlot.LOW: 'low',
                        FittingSlot.RIG: 'rig', FittingSlot.SUBSYSTEM: 'subsystem'}
        self.kind_slot = {v: k for k, v in self.slot_of.items()}
        # The columns' __init__ wants a live wx list; their getText only needs the module.
        self.misc = object.__new__(Miscellanea)
        self.range = object.__new__(MaxRange)
        self.market = Market.getInstance()
        from sqlalchemy import text
        conn = eos.db.gamedata_engine.connect()
        self.data_version = str(conn.execute(text(
            "select field_value from metadata where field_name='client_build'")).scalar())
        self.zh = dict(conn.execute(text('select typeID, typeName_zh from invtypes')).all())

    def item(self, type_id):
        it = self.db.getItem(type_id)
        if it is None:
            raise SystemExit(f'typeID {type_id} not in eve.db')
        return it

    def lname(self, it):
        return {'en': it.name, 'zh': self.zh.get(it.ID) or it.name}

    # -- build ---------------------------------------------------------------
    def build(self, doc):
        from eos.saveddata.booster import Booster
        from eos.saveddata.cargo import Cargo
        from eos.saveddata.character import Character
        from eos.saveddata.damagePattern import DamagePattern
        from eos.saveddata.drone import Drone
        from eos.saveddata.fit import Fit
        from eos.saveddata.implant import Implant
        from eos.saveddata.module import Module
        from eos.saveddata.ship import Ship
        from eos.saveddata.targetProfile import TargetProfile

        fit = Fit(Ship(self.item(doc['shipTypeId'])))
        fit.name = doc['name']
        fit.character = Character.getAll5() if doc['character'] == 'all5' else Character.getAll0()
        fit.implantLocation = 0
        fit.damagePattern = DamagePattern.getBuiltinById(doc['damagePatternId'])
        if doc['targetProfileId'] is not None:
            fit.targetProfile = TargetProfile.getBuiltinById(doc['targetProfileId'])
        self.db.saveddata_session.add(fit)
        self.db.flush()

        positions = {}  # id(module) -> (kind, index)
        for kind in SLOT_KINDS:
            for index, entry in enumerate(doc['modules'][kind]):
                if entry is None:
                    mod = Module.buildEmpty(self.kind_slot[kind])
                else:
                    mod = Module(self.item(entry['typeId']))
                    if self.slot_of.get(mod.slot) != kind:
                        raise SystemExit(f'{mod.item.name} does not go in a {kind} slot')
                    if entry['chargeTypeId'] is not None:
                        mod.charge = self.item(entry['chargeTypeId'])
                    state = STATES[entry['state']]
                    if not mod.isValidState(state):
                        raise SystemExit(f'{mod.item.name} cannot be {entry["state"]}')
                fit.modules.append(mod)
                if entry is not None:
                    mod.state = state
                positions[id(mod)] = (kind, index)
        for d in doc['drones']:
            drone = Drone(self.item(d['typeId']))
            drone.amount = d['amount']
            drone.amountActive = d['active']
            fit.drones.append(drone)
        for c in doc['cargo']:
            cargo = Cargo(self.item(c['typeId']))
            cargo.amount = c['amount']
            fit.cargo.append(cargo)
        for t in doc['implants']:
            fit.implants.append(Implant(self.item(t)))
        for t in doc['boosters']:
            fit.boosters.append(Booster(self.item(t)))
        self.db.flush()
        self.recalc(fit)
        return fit, positions

    @staticmethod
    def recalc(fit):
        fit.clear()
        fit.calculateModifiedAttributes()

    # -- result --------------------------------------------------------------
    def key_parts(self, mod):
        parts = [self.range.getText(mod), self.misc.getText(mod)]
        return [p for p in parts if p]

    def slot_rows(self, fit, positions):
        out = {k: [] for k in SLOT_KINDS}
        totals = {k: int(fit.getNumSlots(self.kind_slot[k])) for k in SLOT_KINDS}
        groups = {k: {} for k in SLOT_KINDS}
        for mod in fit.modules:
            kind, index = positions[id(mod)]
            if mod.isEmpty:
                key = ('empty',)
            else:
                key = ('module', mod.item.ID, mod.state, mod.charge.ID if mod.charge else None)
            if key not in groups[kind]:
                groups[kind][key] = []
                out[kind].append(key)
            groups[kind][key].append((index, mod))
        rows = {}
        for kind in SLOT_KINDS:
            rows[kind] = []
            # Slots the FitDoc does not list are empty too.
            listed = len([1 for key in out[kind] for _ in groups[kind][key]])
            for extra in range(listed, totals[kind]):
                key = ('empty',)
                if key not in groups[kind]:
                    groups[kind][key] = []
                    out[kind].append(key)
                groups[kind][key].append((extra, None))
            # empty slots go last
            order = [k for k in out[kind] if k[0] == 'module'] + [k for k in out[kind] if k[0] == 'empty']
            for key in order:
                members = groups[kind][key]
                idx = [i for i, _ in members]
                if key[0] == 'empty':
                    rows[kind].append({'kind': 'empty', 'count': len(members), 'positions': idx})
                    continue
                mod = members[0][1]
                charge = None
                if mod.charge is not None:
                    charge = {'typeId': mod.charge.ID, 'name': self.lname(mod.charge),
                              'iconId': mod.charge.iconID, 'count': int(mod.numCharges)}
                parts = self.key_parts(mod)
                rows[kind].append({
                    'kind': 'module',
                    'typeId': mod.item.ID,
                    'name': self.lname(mod.item),
                    'iconId': mod.item.iconID,
                    'meta': meta_of(mod.item.metaGroupID),
                    'count': len(members),
                    'positions': idx,
                    'state': STATE_NAMES[int(mod.state)],
                    'charge': charge,
                    'keyLine': ' · '.join(parts),
                    'keyParts': parts,
                    'cpu': r(mod.getModifiedItemAttr('cpu') or 0),
                    'powergrid': r(mod.getModifiedItemAttr('power') or 0),
                    'overSlots': any(i >= totals[kind] for i in idx),
                })
        return rows

    def resources(self, fit):
        ship = fit.ship
        attr = ship.getModifiedItemAttr
        ut = lambda used, total: {'used': r(used or 0), 'total': r(total or 0)}
        return {
            'cpu': ut(fit.cpuUsed, attr('cpuOutput')),
            'powergrid': ut(fit.pgUsed, attr('powerOutput')),
            'calibration': ut(fit.calibrationUsed, attr('upgradeCapacity')),
            'turretHardpoints': ut(fit.getHardpointsUsed(self.Hardpoint.TURRET), attr('turretSlotsLeft')),
            'launcherHardpoints': ut(fit.getHardpointsUsed(self.Hardpoint.MISSILE), attr('launcherSlotsLeft')),
            'cargo': ut(fit.cargoBayUsed, attr('capacity')),
            'droneBay': ut(fit.droneBayUsed, attr('droneCapacity')),
            'droneBandwidth': ut(fit.droneBandwidthUsed, attr('droneBandwidth')),
            'slots': {k: ut(fit.getSlotsUsed(self.kind_slot[k]), fit.getNumSlots(self.kind_slot[k]))
                      for k in SLOT_KINDS},
        }

    @staticmethod
    def warnings(res):
        out = []
        for key in ['cpu', 'powergrid', 'calibration', 'turretHardpoints', 'launcherHardpoints',
                    'cargo', 'droneBay', 'droneBandwidth']:
            if res[key]['used'] > res[key]['total']:
                out.append({'kind': key, **res[key]})
        for k in SLOT_KINDS:
            if res['slots'][k]['used'] > res['slots'][k]['total']:
                out.append({'kind': f'{k}Slots', **res['slots'][k]})
        return out

    def stats(self, fit):
        ship = fit.ship
        attr = ship.getModifiedItemAttr
        hp, ehp = fit.hp, fit.ehp

        def resists(prefix):
            names = {'em': 'Em', 'thermal': 'Thermal', 'kinetic': 'Kinetic', 'explosive': 'Explosive'}
            return {k: r(1 - attr(f'{prefix}{v}DamageResonance' if prefix else f'{v[0].lower()}{v[1:]}DamageResonance'))
                    for k, v in names.items()}

        layers = {
            'shield': {'hp': r(hp['shield']), 'ehp': r(ehp['shield']), 'resists': resists('shield')},
            'armor': {'hp': r(hp['armor']), 'ehp': r(ehp['armor']), 'resists': resists('armor')},
            'hull': {'hp': r(hp['hull']), 'ehp': r(ehp['hull']), 'resists': resists('')},
        }

        def tank(t):
            return {'passiveShield': r(t['passiveShield']), 'shield': r(t['shieldRepair']),
                    'armor': r(t['armorRepair']), 'hull': r(t['hullRepair'])}

        rr = fit.getRemoteReps()
        stable = bool(fit.capStable)
        sensor = fit.scanType
        return {
            'firepower': {
                'dps': r(fit.getTotalDps().total),
                'weaponDps': r(fit.getWeaponDps().total),
                'droneDps': r(fit.getDroneDps().total),
                'volley': r(fit.getTotalVolley().total),
            },
            'defense': {'hp': r(sum(hp.values())), 'ehp': r(sum(ehp.values())), 'layers': layers},
            'repair': {'reinforced': tank(fit.effectiveTank), 'sustained': tank(fit.effectiveSustainableTank)},
            'remoteRepair': {'shield': r(rr.shield), 'armor': r(rr.armor), 'hull': r(rr.hull),
                             'capacitor': r(rr.capacitor)},
            'capacitor': {
                'capacity': r(attr('capacitorCapacity')),
                'rechargeTime': r(attr('rechargeRate') / 1000),
                'stable': stable,
                'stablePercent': r(fit.capState) if stable else None,
                'lastsSeconds': None if stable else r(fit.capState),
                'delta': r(fit.capDelta),
                'recharge': r(fit.capRecharge),
                'usage': r(fit.capUsed),
            },
            'navigation': {
                'maxVelocity': r(fit.maxSpeed),
                'alignTime': r(fit.alignTime),
                'signatureRadius': r(attr('signatureRadius')),
                'warpSpeed': r(fit.warpSpeed),
                'maxTargetRange': r(fit.maxTargetRange),
                'maxTargets': r(fit.maxTargets),
                'scanResolution': r(attr('scanResolution')),
                'sensorType': sensor.lower() if sensor in ('Radar', 'Ladar', 'Magnetometric', 'Gravimetric') else None,
                'sensorStrength': r(fit.scanStrength),
                'droneControlRange': r(fit.extraAttributes['droneControlRange']),
                'mass': r(attr('mass')),
            },
        }

    # -- damage vs range --------------------------------------------------------
    def weapon_dps_at(self, fit, distance_m):
        """DPS of all active weapons at a distance: stationary target, tracking ignored."""
        from eos.calc import calculateRangeFactor
        total = 0.0
        for mod in fit.modules:
            if mod.isEmpty:
                continue
            dps = mod.getDps().total
            if not dps:
                continue
            if mod.hardpoint is self.Hardpoint.TURRET:
                # Same as pyfa's graph: chanceToHit = rangeFactor * trackingFactor (1 here).
                cth = calculateRangeFactor(mod.maxRange or 0, mod.falloff or 0, distance_m, restrictedRange=False)
                total += dps * _calcTurretMult(cth)
            elif mod.hardpoint is self.Hardpoint.MISSILE:
                total += dps if distance_m <= (mod.maxRange or 0) else 0
            else:
                total += dps
        return total

    def curve(self, fit):
        return [r(self.weapon_dps_at(fit, km * 1000), 2) for km in DISTANCES_KM]

    def range_curve(self, fit):
        guns = [m for m in fit.modules if not m.isEmpty and m.charge is not None
                and m.hardpoint in (self.Hardpoint.TURRET, self.Hardpoint.MISSILE) and m.state >= 1]
        if not guns:
            return {'distancesKm': DISTANCES_KM, 'series': [
                {'chargeTypeId': None, 'name': {'en': 'Current', 'zh': '当前'}, 'dps': self.curve(fit)}]}
        current = guns[0].charge
        same = [m for m in guns if m.item.ID == guns[0].item.ID and m.charge.ID == current.ID]
        series = [{'chargeTypeId': current.ID, 'name': self.lname(current), 'dps': self.curve(fit)}]
        # Comparison lines: other T2 charges by range, then the longest-range other charge.
        valid = [c for c in same[0].getValidCharges() if c.ID != current.ID and c.published]
        ranged = []
        for c in valid:
            for m in same:
                m.charge = c
            self.recalc(fit)
            ranged.append((meta_of(c.metaGroupID) == 'tech2', same[0].maxRange or 0, c.name, c))
        t2 = sorted([x for x in ranged if x[0]], key=lambda x: (-x[1], x[2]))
        rest = sorted([x for x in ranged if not x[0]], key=lambda x: (-x[1], x[2]))
        for _, _, _, c in (t2 + rest)[:2]:
            for m in same:
                m.charge = c
            self.recalc(fit)
            series.append({'chargeTypeId': c.ID, 'name': self.lname(c), 'dps': self.curve(fit)})
        for m in same:
            m.charge = current
        self.recalc(fit)
        return {'distancesKm': DISTANCES_KM, 'series': series}

    def calc(self, doc):
        fit, positions = self.build(doc)
        curve = self.range_curve(fit)  # recalcs internally, restores the fit afterwards
        res = self.resources(fit)
        return {
            'dataVersion': self.data_version,
            'ship': {'typeId': fit.ship.item.ID, 'name': self.lname(fit.ship.item),
                     'graphicId': fit.ship.item.graphicID},
            'resources': res,
            'slots': self.slot_rows(fit, positions),
            'stats': self.stats(fit),
            'rangeCurve': curve,
            'warnings': self.warnings(res),
        }

    # -- catalog for the mock engine -----------------------------------------
    def item_row(self, it, key_value=None, key_line=''):
        return {'typeId': it.ID, 'name': self.lname(it), 'iconId': it.iconID,
                'meta': meta_of(self.market.getMetaGroupIdByItem(it, fallback=1)),
                'metaLevel': it.metaLevel, 'keyValue': key_value, 'keyLine': key_line}

    def catalog(self, docs):
        from eos.saveddata.module import Module
        modules, charges = {}, {}
        for doc in docs:
            for kind in SLOT_KINDS:
                for entry in doc['modules'][kind]:
                    if entry is None:
                        continue
                    it = self.item(entry['typeId'])
                    for var in self.market.getVariationsByItems([it]):
                        if not var.published or var.ID in modules:
                            continue
                        modules[var.ID] = {**self.item_row(var), 'slot': kind,
                                           'family': self.market.getParentItemByItem(var).ID}
                    if entry['chargeTypeId'] is not None and it.ID not in charges:
                        rows = []
                        for c in Module(it).getValidCharges():
                            if not c.published:
                                continue
                            dmg = sum(c.getAttribute(a) or 0 for a in
                                      ('emDamage', 'thermalDamage', 'kineticDamage', 'explosiveDamage'))
                            rows.append(self.item_row(c, r(dmg), f'{r(dmg, 1)} dmg'))
                        charges[it.ID] = sorted(rows, key=lambda x: (META_ORDER.index(x['meta']), -x['keyValue'], x['name']['en']))
        mods = sorted(modules.values(), key=lambda x: (x['slot'], x['family'], META_ORDER.index(x['meta']),
                                                     -(x['metaLevel'] or 0), x['name']['en']))
        return {'dataVersion': self.data_version, 'modules': mods,
                'charges': {str(k): v for k, v in charges.items()}}


def _calcTurretMult(chanceToHit):
    # Copied verbatim from vendor/pyfa/graphs/data/fitDamageStats/calc/application.py
    # (importing that module pulls in the graph GUI).
    """Calculate damage multiplier for turret-based weapons."""
    # https://wiki.eveuniversity.org/Turret_mechanics#Damage
    wreckingChance = min(chanceToHit, 0.01)
    wreckingPart = wreckingChance * 3
    normalChance = chanceToHit - wreckingChance
    if normalChance > 0:
        avgDamageMult = (0.01 + chanceToHit) / 2 + 0.49
        normalPart = normalChance * avgDamageMult
    else:
        normalPart = 0
    totalMult = normalPart + wreckingPart
    return totalMult


# ---------------------------------------------------------------------------

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
