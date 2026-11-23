"""FitDoc construction and pyfa's numerical result serialized for the UI."""

import math
from collections import Counter
from types import SimpleNamespace

# Capacities exposed by pyfa's targeting/misc panel. All are measured in m³.
SPECIALIZED_BAYS = (
    'fleetHangarCapacity', 'shipMaintenanceBayCapacity', 'specialColonyResourcesHoldCapacity',
    'specialAmmoHoldCapacity', 'specialFuelBayCapacity', 'specialShipHoldCapacity',
    'specialSmallShipHoldCapacity', 'specialMediumShipHoldCapacity', 'specialLargeShipHoldCapacity',
    'specialIndustrialShipHoldCapacity', 'generalMiningHoldCapacity', 'specialIceHoldCapacity',
    'specialGasHoldCapacity', 'specialMineralHoldCapacity', 'specialMaterialBayCapacity',
    'specialSalvageHoldCapacity', 'specialCommandCenterHoldCapacity', 'specialPlanetaryCommoditiesHoldCapacity',
    'specialQuafeHoldCapacity', 'specialMobileDepotHoldCapacity', 'specialExpeditionHoldCapacity',
)
DAMAGE_TYPES = ('em', 'thermal', 'kinetic', 'explosive')


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
    def __init__(self, data_version):
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
        # The column constructors expect wx controls. The ancillary repair column also
        # reads the active fit and pyfa's default effective-HP setting when rendering ammo.
        self.misc = object.__new__(Miscellanea)
        self.misc.mainFrame = SimpleNamespace(statsPane=SimpleNamespace(
            nameViewMap={'resistancesViewFull': SimpleNamespace(showEffective=True)},
        ))
        self.range = object.__new__(MaxRange)
        self.market = Market.getInstance()
        from sqlalchemy import text
        with eos.db.gamedata_engine.connect() as conn:
            self.client_build = str(conn.execute(text(
                "select field_value from metadata where field_name='client_build'")).scalar())
            self.zh = dict(conn.execute(text('select typeID, typeName_zh from invtypes')).all())
            self.market_zh = dict(conn.execute(text(
                'select marketGroupID, marketGroupName_zh from invmarketgroups')).all())

        self.data_version = data_version
        self.market_groups = {}

    def item(self, type_id):
        it = self.db.getItem(type_id)
        if it is None:
            raise ValueError(f'typeID {type_id} not in eve.db')
        return it

    def lname(self, it):
        return {'en': it.name, 'zh': self.zh.get(it.ID) or it.name}

    @staticmethod
    def group_name(group):
        return {'en': group.name, 'zh': group.name_zh or group.name}

    @staticmethod
    def supported_states(module):
        return [name for name, state in STATES.items() if module.isValidState(state)]

    @staticmethod
    def item_ids(doc):
        yield doc['shipTypeId']
        for rack in doc['modules'].values():
            for entry in rack:
                if entry is not None:
                    yield entry['typeId']
                    if entry['chargeTypeId'] is not None:
                        yield entry['chargeTypeId']
        for key in ('drones', 'fighters', 'cargo'):
            yield from (entry['typeId'] for entry in doc.get(key, []))
        yield from doc['implants']
        yield from doc['boosters']

    @staticmethod
    def saved_name(doc, type_id):
        fallback = f'typeID {type_id}'
        return (doc.get('itemNames') or {}).get(str(type_id), {'en': fallback, 'zh': fallback})

    def item_names(self, doc):
        names = {}
        for type_id in sorted(set(self.item_ids(doc))):
            item = self.db.getItem(type_id)
            names[str(type_id)] = self.lname(item) if item is not None else self.saved_name(doc, type_id)
        return names

    # -- build ---------------------------------------------------------------
    def build(self, doc, options=None):
        from eos.saveddata.booster import Booster
        from eos.saveddata.cargo import Cargo
        from eos.saveddata.character import Character
        from eos.saveddata.damagePattern import DamagePattern
        from eos.saveddata.drone import Drone
        from eos.saveddata.fit import Fit
        from eos.saveddata.fighter import Fighter
        from eos.saveddata.implant import Implant
        from eos.saveddata.module import Module
        from eos.saveddata.ship import Ship
        from eos.saveddata.targetProfile import TargetProfile

        fit = Fit(Ship(self.item(doc['shipTypeId'])))
        fit.name = doc['name']
        fit.factorReload = bool((options or {}).get('includeReload'))
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
                item = self.db.getItem(entry['typeId']) if entry else None
                if item is None:
                    mod = Module.buildEmpty(self.kind_slot[kind])
                else:
                    mod = Module(item)
                    if self.slot_of.get(mod.slot) != kind:
                        raise ValueError(f'{mod.item.name} does not go in a {kind} slot')
                    if entry['chargeTypeId'] is not None:
                        mod.charge = self.db.getItem(entry['chargeTypeId'])
                    state = STATES[entry['state']]
                    if not mod.isValidState(state):
                        raise ValueError(f'{mod.item.name} cannot be {entry["state"]}')
                fit.modules.appendIgnoreEmpty(mod)
                if item is not None:
                    mod.state = state
                positions[id(mod)] = (kind, index)
        for key, constructor in (('drones', Drone), ('fighters', Fighter), ('cargo', Cargo)):
            collection = getattr(fit, key)
            for entry in doc.get(key, []):
                item = self.db.getItem(entry['typeId'])
                if item is None:
                    continue
                member = constructor(item)
                member.amount = entry['amount']
                if key == 'drones':
                    member.amountActive = entry['active']
                elif key == 'fighters':
                    member.active = entry['active']
                collection.append(member)
        for key, constructor in (('implants', Implant), ('boosters', Booster)):
            collection = getattr(fit, key)
            for type_id in doc[key]:
                item = self.db.getItem(type_id)
                if item is not None:
                    collection.append(constructor(item))
        self.db.flush()
        self.recalc(fit)
        # service.Fit.getFit can look up this already-calculated fit from a desktop column
        # without filling empty slots or committing our temporary transaction.
        fit.inited = True
        return fit, positions

    @staticmethod
    def recalc(fit):
        fit.clear()
        fit.calculateModifiedAttributes()

    # -- result --------------------------------------------------------------
    def key_columns(self, mod):
        self.misc.fittingView = SimpleNamespace(getActiveFit=lambda: mod.owner.ID)
        try:
            return self.range.getText(mod), self.misc.getText(mod)
        finally:
            del self.misc.fittingView

    def key_parts(self, mod):
        return [part for part in self.key_columns(mod) if part]

    def slot_rows(self, fit, positions, doc):
        out = {k: [] for k in SLOT_KINDS}
        totals = {k: int(fit.getNumSlots(self.kind_slot[k])) for k in SLOT_KINDS}
        groups = {k: {} for k in SLOT_KINDS}
        for mod in fit.modules:
            kind, index = positions[id(mod)]
            entry = doc['modules'][kind][index]
            if entry is None:
                key = ('empty',)
            elif mod.isEmpty:
                key = ('removed', entry['typeId'])
            else:
                key = ('module', mod.item.ID, mod.state, entry['chargeTypeId'])
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
            order = [k for k in out[kind] if k[0] != 'empty'] + [k for k in out[kind] if k[0] == 'empty']
            for key in order:
                members = groups[kind][key]
                idx = [i for i, _ in members]
                if key[0] == 'empty':
                    rows[kind].append({'kind': 'empty', 'count': len(members), 'positions': idx})
                    continue
                if key[0] == 'removed':
                    rows[kind].append({
                        'kind': 'removed', 'typeId': key[1], 'name': self.saved_name(doc, key[1]),
                        'count': len(members), 'positions': idx,
                    })
                    continue
                mod = members[0][1]
                charge = None
                if mod.charge is not None:
                    charge = {'typeId': mod.charge.ID, 'name': self.lname(mod.charge),
                              'iconId': mod.charge.iconID, 'count': int(mod.numCharges)}
                elif key[3] is not None:
                    charge = {'typeId': key[3], 'name': self.saved_name(doc, key[3]),
                              'iconId': None, 'count': 0, 'removed': True}
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
                    'supportedStates': self.supported_states(mod),
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
            'activeDrones': ut(fit.activeDrones, fit.extraAttributes['maxActiveDrones']),
            'fighterBay': ut(fit.fighterBayUsed, attr('fighterCapacity')),
            'fighterTubes': ut(fit.fighterTubesUsed, fit.fighterTubesTotal),
            'specializedBays': {name: r(capacity) for name in SPECIALIZED_BAYS if (capacity := attr(name, 0))},
            'droneBandwidth': ut(fit.droneBandwidthUsed, attr('droneBandwidth')),
            'slots': {k: ut(fit.getSlotsUsed(self.kind_slot[k]), fit.getNumSlots(self.kind_slot[k]))
                      for k in SLOT_KINDS},
        }

    @staticmethod
    def warnings(res):
        out = []
        for key in ['cpu', 'powergrid', 'calibration', 'turretHardpoints', 'launcherHardpoints',
                    'cargo', 'droneBay', 'droneBandwidth', 'activeDrones', 'fighterBay', 'fighterTubes']:
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
                'includesReload': fit.factorReload,
            },
            'mining': {'unit': 'm³/s', 'miner': r(fit.minerYield),
                       'drone': r(fit.droneYield), 'total': r(fit.totalYield)},
            'defense': {'hp': r(sum(hp.values())), 'ehp': r(sum(ehp.values())), 'layers': layers},
            'repair': {
                'unit': 'EHP/s',
                'reinforced': tank(fit.effectiveTank), 'sustained': tank(fit.effectiveSustainableTank),
                'raw': {'unit': 'HP/s', 'reinforced': tank(fit.tank), 'sustained': tank(fit.sustainableTank)},
            },
            'remoteRepair': {'shield': r(rr.shield), 'armor': r(rr.armor), 'hull': r(rr.hull),
                             'capacitor': r(rr.capacitor)},
            'capacitor': {
                'capacity': r(attr('capacitorCapacity')),
                'neutralizerResistance': r(1 - attr('energyWarfareResistance', 1)),
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
    def _weapons(self, fit):
        for mod in fit.modules:
            if mod.isEmpty:
                continue
            dps = mod.getDps(targetProfile=fit.targetProfile).total
            if dps:
                yield mod, dps, mod.maxRange or 0, mod.falloff or 0

    def _range_snapshot(self, fit):
        return [(module.hardpoint, dps, optimal, falloff)
                for module, dps, optimal, falloff in self._weapons(fit)]

    def _dps_at(self, weapons, distance_m):
        from eos.calc import calculateRangeFactor

        total = 0.0
        for hardpoint, dps, optimal, falloff in weapons:
            if hardpoint == self.Hardpoint.TURRET:
                hit = calculateRangeFactor(optimal, falloff, distance_m, restrictedRange=False)
                total += dps * _calcTurretMult(hit)
            elif optimal > 0:
                total += dps if distance_m <= optimal else 0
            else:
                total += dps
        return r(total, 2)

    def range_curve(self, fit):
        active = list(self._weapons(fit))
        if not active:
            return {'distancesKm': [], 'series': []}
        lead = next((m for m, _, _, _ in active if m.charge is not None), None)
        current = lead.charge if lead is not None else None
        comparisons = [(current, [(m.hardpoint, dps, opt, falloff) for m, dps, opt, falloff in active])]
        if current is not None:
            same = [m for m, _, _, _ in active if m.item.ID == lead.item.ID and m.charge == current]
            # The weapon's compatible charge set includes related T1/T2 dogma groups.
            candidates = [c for c in lead.getValidCharges() if c.ID != current.ID]
            ranked = []
            try:
                for charge in candidates:
                    for module in same:
                        module.charge = charge
                    self.recalc(fit)
                    dps = lead.getDps(targetProfile=fit.targetProfile).total
                    distance = (lead.maxRange or 0) + 3 * (lead.falloff or 0)
                    ranked.append((charge, dps, distance, self._range_snapshot(fit)))
            finally:
                for module in same:
                    module.charge = current
                self.recalc(fit)
            if ranked:
                strongest = min(ranked, key=lambda entry: (-entry[1], entry[0].ID))
                farthest = min(ranked, key=lambda entry: (-entry[2], entry[0].ID))
                comparisons.append((strongest[0], strongest[3]))
                if farthest[0].ID != strongest[0].ID:
                    comparisons.append((farthest[0], farthest[3]))

        max_distance = max((optimal + 3 * falloff for _, weapons in comparisons
                            for _, _, optimal, falloff in weapons), default=0)
        # Keep a bounded sample count and a whole-kilometre right edge even for long-range fits.
        end_km = max(1, math.ceil(max_distance / 1000))
        distances = [r(end_km * index / 30, 3) for index in range(31)]
        series = [
            {'chargeTypeId': charge.ID if charge else None,
             'name': self.lname(charge) if charge else {'en': 'Current', 'zh': '当前'},
             'dps': [self._dps_at(weapons, km * 1000) for km in distances]}
            for charge, weapons in comparisons
        ]
        return {'distancesKm': distances, 'series': series}

    @staticmethod
    def price_items(fit):
        def counts(entries):
            totals = Counter()
            for type_id, quantity in entries:
                if quantity:
                    totals[type_id] += quantity
            return [{'typeId': type_id, 'quantity': quantity} for type_id, quantity in sorted(totals.items())]

        modules = [m for m in fit.modules if not m.isEmpty]
        return {
            'ship': counts([(fit.ship.item.ID, 1)]),
            'modules': counts((m.item.ID, 1) for m in modules),
            'loadedCharges': counts((m.charge.ID, m.numCharges or 1) for m in modules if m.charge),
            'drones': counts((d.item.ID, d.amount) for d in fit.drones),
            'fighters': counts((f.item.ID, f.amount) for f in fit.fighters),
            'cargo': counts((c.item.ID, c.amount) for c in fit.cargo),
            'implants': counts((i.item.ID, 1) for i in fit.appliedImplants),
            'boosters': counts((b.item.ID, 1) for b in fit.boosters),
        }

    def calc(self, doc, options=None):
        fit, positions = self.build(doc, options)
        curve = self.range_curve(fit)  # recalcs internally, restores the fit afterwards
        res = self.resources(fit)
        return {
            'dataVersion': self.data_version,
            'clientBuild': self.client_build,
            'itemNames': self.item_names(doc),
            'ship': {'typeId': fit.ship.item.ID, 'name': self.lname(fit.ship.item),
                     'graphicId': fit.ship.item.graphicID, 'group': self.group_name(fit.ship.item.group)},
            'resources': res,
            'slots': self.slot_rows(fit, positions, doc),
            'stats': self.stats(fit),
            'priceItems': self.price_items(fit),
            'rangeCurve': curve,
            'warnings': self.warnings(res),
        }

    # -- catalog for the mock engine -----------------------------------------
    def item_row(self, it, key_value=None, key_line=''):
        return {'typeId': it.ID, 'name': self.lname(it), 'iconId': it.iconID,
                'meta': meta_of(self.market.getMetaGroupIdByItem(it, fallback=1)),
                'metaLevel': it.metaLevel, 'keyValue': key_value, 'keyLine': key_line}

    def market_group(self, item):
        leaf = self.market.getMarketGroupByItem(item)
        return self.market_path(leaf.ID) if leaf is not None else None

    def market_path(self, group_id):
        if group_id not in self.market_groups:
            path = []
            node = self.market.getMarketGroup(group_id)
            while node is not None:
                path.append({'id': node.ID, 'name': {'en': node.name, 'zh': self.market_zh.get(node.ID) or node.name}})
                node = node.parent
            self.market_groups[group_id] = {**path[0], 'ancestors': list(reversed(path[1:]))} if path else None
        return self.market_groups[group_id]

    def charge_row(self, charge):
        damage = sum(charge.getAttribute(attr) or 0 for attr in
                     ('emDamage', 'thermalDamage', 'kineticDamage', 'explosiveDamage'))
        return self.item_row(charge, r(damage), f'{r(damage, 1)} dmg')

    def charge_options(self, fit, module, meta_group=None):
        rows = []
        original = module.charge
        try:
            for ammo in sorted(module.getValidCharges(), key=lambda item: item.ID):
                meta = meta_of(self.market.getMetaGroupIdByItem(ammo, fallback=1))
                if meta_group is not None and meta_group != meta:
                    continue
                module.charge = ammo
                self.recalc(fit)
                damage = module.getDps(targetProfile=fit.targetProfile)
                dps = r(damage.total)
                rows.append({
                    **self.item_row(ammo, dps), 'dps': dps,
                    'optimalRange': r(module.maxRange or 0), 'falloff': r(module.falloff or 0),
                    'damageMix': {name: r(getattr(damage, name)) for name in DAMAGE_TYPES},
                })
        finally:
            module.charge = original
            if rows:
                self.recalc(fit)
        return rows

    def catalog(self, docs):
        modules, charges = {}, {}
        for doc in docs:
            fit, positions = self.build(doc)
            sample_charges = {}
            charges[str(doc['shipTypeId'])] = sample_charges
            for module in fit.modules:
                if module.isEmpty:
                    continue
                kind, _ = positions[id(module)]
                item = module.item
                for var in self.market.getVariationsByItems([item]):
                    if not var.published or var.ID in modules:
                        continue
                    modules[var.ID] = {**self.item_row(var), 'slot': kind, 'groupId': var.groupID,
                                       'family': self.market.getParentItemByItem(var).ID}
                if module.charge is not None:
                    key = f'{kind}/{item.ID}/{STATE_NAMES[int(module.state)]}/{module.charge.ID}'
                    if key not in sample_charges:
                        sample_charges[key] = self.charge_options(fit, module)
        mods = sorted(modules.values(), key=lambda x: (x['slot'], x['family'], META_ORDER.index(x['meta']),
                                                     -(x['metaLevel'] or 0), x['name']['en']))
        return {'dataVersion': self.data_version, 'clientBuild': self.client_build,
                'modules': mods, 'charges': charges}


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
