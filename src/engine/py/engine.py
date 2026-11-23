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
# Signature radii shown by pyfa's targeting panel.
LOCK_TARGETS = (('pod', 25), ('interceptor', 33), ('frigate', 38), ('destroyer', 83),
                ('cruiser', 130), ('battlecruiser', 265), ('battleship', 420), ('carrier', 3000))
LOCAL_REPAIR_ATTR = {
    'Shield Booster': 'shieldBonus', 'Ancillary Shield Booster': 'shieldBonus',
    'Armor Repair Unit': 'armorDamageAmount', 'Ancillary Armor Repairer': 'armorDamageAmount',
    'Hull Repair Unit': 'structureDamageAmount',
}


def requires_omega(item):
    # pyfa's Omega column reads the dogma restriction even for T1 modules.
    return item.getAttribute('cloneGradeRestriction', 0) > 0


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
        from gui.builtinViewColumns.capacitorUse import CapacitorUse
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
        self.capacitor_column = object.__new__(CapacitorUse)
        self.market = Market.getInstance()
        from sqlalchemy import text
        with eos.db.gamedata_engine.connect() as conn:
            self.client_build = str(conn.execute(text(
                "select field_value from metadata where field_name='client_build'")).scalar())
            self.zh = dict(conn.execute(text('select typeID, typeName_zh from invtypes')).all())
            self.market_zh = dict(conn.execute(text(
                'select marketGroupID, marketGroupName_zh from invmarketgroups')).all())
            self.booster_penalty_zh = dict(conn.execute(text(
                "select attributeName, displayName_zh from dgmattribs where attributeName like 'booster%Penalty'"
            )).all())

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
        if doc.get('modeTypeId') is not None:
            yield doc['modeTypeId']
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
        from eos.const import ImplantLocation, SpoolType
        from eos.utils.spoolSupport import SpoolOptions

        fit = Fit(Ship(self.item(doc['shipTypeId'])))
        fit.name = doc['name']
        options = options or {}
        fit.factorReload = bool(options.get('includeReload'))
        fit.include_reactivation = options.get('includeReactivation', True)
        fit.spool_options = SpoolOptions(SpoolType.SPOOL_SCALE, options.get('defaultSpoolPercent', 100) / 100, False)
        if doc.get('modeTypeId') is not None:
            fit.mode = fit.ship.validateModeItem(self.db.getItem(doc['modeTypeId']))
        fit.character = Character.getAll5() if doc['character'] == 'all5' else Character.getAll0()
        source = doc.get('implantSource')
        use_character = options.get('useCharacterImplants') if source is None else source == 'character'
        fit.implantLocation = ImplantLocation.CHARACTER if use_character else ImplantLocation.FIT
        fit.damagePattern = DamagePattern.getBuiltinById(doc['damagePatternId'])
        if doc['targetProfileId'] is not None:
            fit.targetProfile = TargetProfile.getBuiltinById(doc['targetProfileId'])
        self.db.saveddata_session.add(fit)
        self.db.flush()

        positions = {}  # id(module) -> (kind, index)
        for kind in SLOT_KINDS:
            for index, entry in enumerate(doc['modules'][kind]):
                item = self.db.getItem(entry['typeId']) if entry else None
                valid_slot = item is not None and Module.calculateSlot(item) == self.kind_slot[kind]
                if valid_slot:
                    mod = Module(item)
                    mod.state = mod.getMaxState(STATES[entry['state']])
                    if entry['chargeTypeId'] is not None:
                        charge = self.db.getItem(entry['chargeTypeId'])
                        if charge is not None and charge.category.name == 'Charge' and mod.isValidCharge(charge):
                            mod.charge = charge
                    if entry.get('spoolCycles') is not None:
                        mod.spoolType, mod.spoolAmount = SpoolType.CYCLES, entry['spoolCycles']
                else:
                    mod = Module.buildEmpty(self.kind_slot[kind])
                fit.modules.appendIgnoreEmpty(mod)
                positions[id(mod)] = (kind, index)
        fit.drone_positions = []
        fit.fighter_positions = []
        for key, constructor, category in (('drones', Drone, 'Drone'), ('fighters', Fighter, 'Fighter'),
                                           ('cargo', Cargo, None)):
            collection = getattr(fit, key)
            for index, entry in enumerate(doc.get(key, [])):
                item = self.db.getItem(entry['typeId'])
                if item is None or category is not None and item.category.name != category:
                    continue
                member = constructor(item)
                member.amount = max(0, entry['amount'])
                if key == 'drones':
                    member.amountActive = min(member.amount, max(0, entry['active']))
                    fit.drone_positions.append(index)
                elif key == 'fighters':
                    member.active = entry['active'] and member.amount > 0
                    fit.fighter_positions.append(index)
                collection.append(member)
        for key, constructor in (('implants', Implant), ('boosters', Booster)):
            collection = getattr(fit, key)
            for type_id in doc[key]:
                item = self.db.getItem(type_id)
                if item is None:
                    continue
                member = constructor(item)
                if key == 'boosters':
                    enabled = set(doc.get('boosterSideEffects', {}).get(str(type_id), ()))
                    for effect in member.sideEffects:
                        effect.active = effect.effectID in enabled
                collection.append(member)
        self.db.flush()
        self.recalc(fit)
        if self.check_states(fit):
            self.recalc(fit)
        if self.limit_squadrons(fit):
            self.recalc(fit)
        # service.Fit.getFit can look up this already-calculated fit from a desktop column
        # without filling empty slots or committing our temporary transaction.
        fit.inited = True
        return fit, positions

    @staticmethod
    def recalc(fit):
        fit.clear()
        fit.calculateModifiedAttributes()
        if not fit.include_reactivation:
            for mod in fit.activeModulesIter():
                if mod.reactivationDelay:
                    # Fit's capacitor simulator and Module's cycle helpers both read this dogma attribute.
                    mod.itemModifiedAttributes.force('moduleReactivationDelay', 0)

    @staticmethod
    def check_states(fit, base=None):
        from service.fit import Fit
        return any(Fit.getInstance().checkStates(fit, base))

    @staticmethod
    def limit_squadrons(fit):
        slots = max(0, int(fit.extraAttributes['maxActiveDrones']))
        bandwidth = max(0, fit.ship.getModifiedItemAttr('droneBandwidth'))
        changed = False
        for drone in fit.drones:
            cost = drone.getModifiedItemAttr('droneBandwidthUsed')
            limit = min(slots, int(bandwidth / cost)) if cost else slots
            if drone.amountActive > limit:
                drone.amountActive = limit
                changed = True
            slots -= drone.amountActive
            bandwidth -= cost * drone.amountActive
        tubes = fit.fighterTubesTotal
        for fighter in fit.fighters:
            if fighter.active:
                if tubes <= 0:
                    fighter.active = False
                    changed = True
                else:
                    tubes -= 1
        return changed

    def squadron_controls(self, fit):
        roles = {
            'light': (self.Slot.F_LIGHT, self.Slot.FS_LIGHT),
            'heavy': (self.Slot.F_HEAVY, self.Slot.FS_HEAVY),
            'support': (self.Slot.F_SUPPORT, self.Slot.FS_SUPPORT),
        }
        kind_by_slot = {slot: kind for kind, slots in roles.items() for slot in slots}
        fighter_slots = {kind: structure if fit.isStructure else ship for kind, (ship, structure) in roles.items()}

        def performance(member):
            return {
                'velocity': r(member.getModifiedItemAttr('maxVelocity') or 0),
                'hp': r(sum(value or 0 for value in member.hp.values())),
            }

        return {
            'drones': [{
                'index': index, 'typeId': drone.item.ID, 'active': int(drone.amountActive),
                'bandwidth': r(drone.getModifiedItemAttr('droneBandwidthUsed')),
                'optimalRange': r(drone.maxRange or 0), 'falloff': r(drone.falloff or 0),
                **performance(drone),
            } for index, drone in zip(fit.drone_positions, fit.drones)],
            'fighters': [{
                'index': index, 'typeId': fighter.item.ID, 'active': bool(fighter.active),
                'maxAmount': fighter.fighterSquadronMaxSize, 'kind': kind_by_slot.get(fighter.slot),
                **performance(fighter),
            } for index, fighter in zip(fit.fighter_positions, fit.fighters)],
            'fighterSlots': {
                kind: {'used': fit.getSlotsUsed(slot), 'total': fit.getNumSlots(slot)}
                for kind, slot in fighter_slots.items()
            },
        }

    def extra_items(self, fit):
        items = {}
        for collection in (fit.cargo, fit.drones, fit.fighters, fit.implants, fit.boosters):
            for member in collection:
                item = member.item
                if item.ID not in items:
                    market_group = self.market.getMarketGroupByItem(item) if not item.iconID else None
                    items[item.ID] = {
                        'iconId': item.iconID or (market_group.iconID if market_group else None),
                        'graphicId': item.graphicID,
                    }
        for cargo in fit.cargo:
            items[cargo.item.ID]['volume'] = cargo.getModifiedItemAttr('volume') or 0
        for member in (*fit.implants, *fit.boosters):
            items[member.item.ID]['slot'] = member.slot
        for booster in fit.boosters:
            effects = []
            for effect in sorted(booster.sideEffects, key=lambda effect: effect.effectID):
                name = effect.effect.getattr('displayName') or effect.effect.name
                effects.append({
                    'id': effect.effectID,
                    'name': {'en': name, 'zh': self.booster_penalty_zh.get(effect.attr) or name},
                    'percent': r(booster.getModifiedItemAttr(effect.attr) or 0),
                })
            items[booster.item.ID]['sideEffects'] = effects
        return items

    @staticmethod
    def max_spool_cycles(mod):
        from eos.const import SpoolType
        from eos.utils.spoolSupport import SpoolOptions
        return mod.getSpoolData(SpoolOptions(SpoolType.SPOOL_SCALE, 1, True))[0]

    def missing_skills(self, fit):
        from service.character import Character
        levels = {}

        def collect(requirements):
            for level, type_id, prerequisites in requirements.values():
                levels[type_id] = max(level, levels.get(type_id, 0))
                collect(prerequisites)

        for requirements in Character.getInstance().checkRequirements(fit).values():
            collect(requirements)
        return [
            {'typeId': type_id, 'name': self.lname(self.item(type_id)),
             'requiredLevel': level, 'currentLevel': int(fit.character.getSkill(type_id).level)}
            for type_id, level in sorted(levels.items())
        ]

    # -- result --------------------------------------------------------------
    def key_columns(self, mod):
        self.misc.fittingView = SimpleNamespace(getActiveFit=lambda: mod.owner.ID)
        try:
            return self.range.getText(mod), self.misc.getText(mod)
        finally:
            del self.misc.fittingView

    def module_metrics(self, fit, mod):
        view = SimpleNamespace(getActiveFit=lambda: fit.ID)
        self.misc.fittingView = view
        self.capacitor_column.fittingView = view
        try:
            range_text = self.range.getText(mod)
            misc = self.misc.getText(mod)
            cap = self.capacitor_column.getText(mod)
            misc_tooltip = self.misc.getToolTip(mod) if misc else None
        finally:
            del self.misc.fittingView
            del self.capacitor_column.fittingView

        parts = [part for part in (range_text, misc) if part]
        metrics = {'keyLine': ' · '.join(parts), 'keyParts': parts}
        if range_text:
            metrics['rangeText'] = range_text
        if misc:
            metrics['miscText'] = misc
        if misc_tooltip:
            metrics['miscTooltip'] = misc_tooltip
        if cap:
            metrics['capacitor'] = cap

        dps = mod.getDps(spoolOptions=fit.spool_options, ignoreState=True).total
        if dps:
            metrics['dps'] = r(dps)
        if range_text and (missile_range := mod.missileMaxRangeData) is not None:
            low, high, high_chance = missile_range
            if 0 < round(high_chance, 3) < 1:
                metrics['missileRange'] = {'low': r(low), 'high': r(high), 'highChance': r(high_chance)}

        group = mod.item.group.name
        attr = mod.getModifiedItemAttr
        if group == 'Propulsion Module' and attr('speedFactor'):
            metrics['velocityBonus'] = r(attr('speedFactor'))
        if (repair_attr := LOCAL_REPAIR_ATTR.get(group)) and mod.rawCycleTime:
            amount = attr(repair_attr, 0)
            if group == 'Ancillary Armor Repairer' and mod.charge:
                amount *= attr('chargedArmorDamageMultiplier', 1)
            if amount:
                metrics['repairPerSecond'] = r(amount * 1000 / mod.rawCycleTime)
        if group == 'Damage Control' and (resonance := attr('hullEmDamageResonance', 1)) != 1:
            metrics['hullResistanceBonus'] = r((1 - resonance) * 100)
        if calibration := attr('upgradeCost', 0):
            metrics['calibration'] = r(calibration)
        return metrics

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
                state_adjusted = STATES[entry['state']] != mod.state
                key = ('module', mod.item.ID, mod.state, entry['chargeTypeId'], entry.get('spoolCycles'), state_adjusted)
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
                    item = self.db.getItem(key[1])
                    rows[kind].append({
                        'kind': 'removed', 'typeId': key[1],
                        'name': self.lname(item) if item is not None else self.saved_name(doc, key[1]),
                        'count': len(members), 'positions': idx,
                        **({'adjustment': 'slot'} if item is not None else {}),
                    })
                    continue
                mod = members[0][1]
                charge = None
                if mod.charge is not None:
                    charge = {'typeId': mod.charge.ID, 'name': self.lname(mod.charge),
                              'iconId': mod.charge.iconID, 'count': int(mod.numCharges),
                              'cycles': int(mod.numShots), 'omega': requires_omega(mod.charge)}
                elif key[3] is not None:
                    charge = {'typeId': key[3], 'name': self.saved_name(doc, key[3]),
                              'iconId': None, 'count': 0, 'removed': True}
                spool_max = self.max_spool_cycles(mod)
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
                    **({'adjustment': 'state'} if key[5] else {}),
                    **({'maxSpoolCycles': spool_max} if spool_max else {}),
                    'charge': charge,
                    'omega': requires_omega(mod.item),
                    **self.module_metrics(fit, mod),
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
            # Module.calculateSlot stores the integer value. eos compares slots by identity.
            'slots': {k: ut(fit.getSlotsUsed(slot.value), fit.getNumSlots(slot))
                      for k, slot in self.kind_slot.items()},
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

        rr = fit.getRemoteReps(spoolOptions=fit.spool_options)
        stable = bool(fit.capStable)
        sensor = fit.scanType
        return {
            'firepower': {
                'dps': r(fit.getTotalDps(spoolOptions=fit.spool_options).total),
                'weaponDps': r(fit.getWeaponDps(spoolOptions=fit.spool_options).total),
                'droneDps': r(fit.getDroneDps().total),
                'volley': r(fit.getTotalVolley(spoolOptions=fit.spool_options).total),
                'includesReload': fit.factorReload,
                'effective': fit.targetProfile is not None,
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
                'sensorType': sensor.lower() if sensor in ('Radar', 'Ladar', 'Magnetometric', 'Gravimetric', 'Multispectral') else None,
                'jamChance': r(fit.jamChance),
                'agility': r(attr('agility') or 0),
                'maxWarpDistance': r(fit.maxWarpDistance),
                'warpCoreStrength': r(-(attr('warpScrambleStatus') or 0)),
                'lockTimes': [{'target': target, 'seconds': r(fit.calculateLockTime(radius))}
                              for target, radius in LOCK_TARGETS]
                             if attr('scanResolution') or attr('scanSpeed') else [],
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
            dps = mod.getDps(targetProfile=fit.targetProfile, spoolOptions=fit.spool_options).total
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
                    dps = lead.getDps(targetProfile=fit.targetProfile, spoolOptions=fit.spool_options).total
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
        extra_items = self.extra_items(fit)
        extras = {'items': extra_items}
        if fit.cargo:
            extras['cargoCapacity'] = float(fit.ship.getModifiedItemAttr('capacity') or 0)
        return {
            'dataVersion': self.data_version,
            'clientBuild': self.client_build,
            'itemNames': self.item_names(doc),
            'ship': {'typeId': fit.ship.item.ID, 'name': self.lname(fit.ship.item),
                     'graphicId': fit.ship.item.graphicID, 'group': self.group_name(fit.ship.item.group)},
            'resources': res,
            'missingSkills': self.missing_skills(fit),
            **({'squadrons': self.squadron_controls(fit)} if fit.drones or fit.fighters or fit.fighterTubesTotal else {}),
            **({'extras': extras} if extra_items else {}),
            **({'modes': {
                'selected': fit.mode.item.ID,
                'options': [{'typeId': mode.ID, 'name': self.lname(mode)} for mode in fit.ship.modeItems],
            }} if fit.mode is not None else {}),
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
                damage = module.getDps(targetProfile=fit.targetProfile, spoolOptions=fit.spool_options)
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
