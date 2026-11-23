"""JSON-compatible bridge to the original pyfa fitting engine and services."""

import html
import json
import math
import re
from contextlib import contextmanager
from functools import lru_cache
from pathlib import Path

from engine import Engine, META_ORDER, SLOT_KINDS, STATE_NAMES, meta_of, r
from headless import bootstrap

_engine = None
_port = None

_SLOT_EFFECT = {
    'high': 'hiPower', 'mid': 'medPower', 'low': 'loPower',
    'rig': 'rigSlot', 'subsystem': 'subSystem',
}
_NUMBER = re.compile(r'([+-]?(?:\d+(?:\.\d*)?|\.\d+))([kMG]?)')
_MAGNITUDE = {'': 1, 'k': 1000, 'M': 10**6, 'G': 10**9}


def _name_matcher(term):
    """pyfa's market search: tokens split on spaces, `*` and `?` are wildcards, all tokens must match."""
    from service.market import SearchWorkerThread

    tokens = [re.compile(token, re.IGNORECASE)
              for token in SearchWorkerThread._prepareRequestNormal(None, term or '')]
    if not tokens:
        return None
    return lambda *names: any(all(token.search(name) for token in tokens) for name in names if name)


def initialize(db_path, names_path, data_version, client_build):
    global _engine, _port
    from port_adapter import PortAdapter

    bootstrap(db_path)
    from service.character import Character

    _engine = Engine(data_version)
    _slot_items.cache_clear()
    market_tree_for_slot.cache_clear()
    _market_tree_data.cache_clear()
    if _engine.client_build != client_build:
        raise ValueError('Game database client build does not match the asset manifest')
    # Construct the built-in characters once, before the temporary fit transactions.
    Character.getInstance()
    _port = PortAdapter(_engine, json.loads(Path(names_path).read_text(encoding='utf-8')))


@contextmanager
def _temporary_fit():
    # eos requires flushed relationships, even though the UI owns fit persistence.
    transaction = _engine.db.saveddata_session.begin_nested()
    try:
        yield
    finally:
        if transaction.is_active:
            transaction.rollback()


@contextmanager
def _calculation_settings(options):
    from eos import config
    options = options or {}
    overrides = {
        'strictSkillLevels': options.get('strictSkills', config.settings['strictSkillLevels']),
        'globalDefaultSpoolupPercentage': options.get('defaultSpoolPercent', 100) / 100,
    }
    previous = {key: config.settings[key] for key in overrides}
    config.settings.update(overrides)
    try:
        yield
    finally:
        config.settings.update(previous)


def calc(fit_json, options=None):
    with _temporary_fit(), _calculation_settings(options):
        return _engine.calc(fit_json, options)


def _groups(rows):
    groups = {meta: [] for meta in META_ORDER}
    for row in rows:
        groups[row['meta']].append(row)

    def sort_key(row):
        value = row['keyValue']
        return (value is None, -(value or 0), -(row['metaLevel'] or 0),
                row['name']['en'].casefold(), row['typeId'])

    result = []
    for meta, items in groups.items():
        if items:
            items.sort(key=sort_key)
            result.append({'meta': meta, 'items': items, 'best': items[0]['keyValue']})
    return result


def _module_row(mod):
    range_text, misc_text = _engine.key_columns(mod)
    number = _NUMBER.search(misc_text) if misc_text else None
    value = None
    if range_text:
        value = (mod.maxRange or 0) + (mod.falloff or 0)
    elif number:
        value = abs(float(number[1])) * _MAGNITUDE[number[2]]
    return _engine.item_row(
        mod.item, r(value) if value is not None else None,
        ' · '.join(part for part in (range_text, misc_text) if part),
    )


@lru_cache(maxsize=len(SLOT_KINDS))
def _slot_items(slot):
    from sqlalchemy import text

    # Pull lightweight metadata before loading ORM attributes or doing any fitting work.
    with _engine.db.gamedata_engine.connect() as conn:
        records = conn.execute(text("""
            SELECT item.typeID, item.typeName, item.typeName_zh, item.groupID, item.metaGroupID,
                   coalesce(nullif(item.marketGroupID, 0), parent.marketGroupID)
            FROM invtypes item JOIN dgmtypeeffects USING (typeID) JOIN dgmeffects USING (effectID)
            JOIN invgroups ON invgroups.groupID = item.groupID JOIN invcategories USING (categoryID)
            LEFT JOIN invtypes parent ON parent.typeID = item.variationParentTypeID
            WHERE item.published AND effectName = :effect
              AND invcategories.name IN ('Module', 'Subsystem', 'Structure Module')
        """), {'effect': _SLOT_EFFECT[slot]}).all()

    catalog = []
    market = _engine.market
    for type_id, en, zh, group_id, meta_id, market_id in records:
        if en in market.ITEMS_FORCEDMARKETGROUP or en in market.ITEMS_FORCEDMETAGROUP:
            item = _engine.item(type_id)
            meta_id = market.getMetaGroupIdByItem(item, fallback=1)
            leaf = market.getMarketGroupByItem(item)
            market_id = leaf.ID if leaf is not None else None
        elif market_id not in market.SHOWN_MARKET_GROUPS:
            market_id = None
        catalog.append((type_id, en, zh, group_id, meta_of(meta_id), market_id))
    return catalog


def _slot_hull(fit_json, slot):
    # Check permanent restrictions on a hull with its subsystem layout.
    hull_doc = {**fit_json, 'modules': {
        k: fit_json['modules'][k] if k == 'subsystem' and slot != 'subsystem' else []
        for k in SLOT_KINDS
    }}
    return _engine.build(hull_doc)[0]


def _slot_modules(ids, slot):
    if not ids:
        return
    from eos.gamedata import Item
    from eos.saveddata.module import Module
    from sqlalchemy.orm import selectinload

    candidates = _engine.db.gamedata_session.query(Item).filter(Item.ID.in_(ids)).options(
        selectinload(Item.effects), selectinload(Item._Item__attributes),
    )
    for item in candidates:
        if Module.calculateSlot(item) == _engine.kind_slot[slot]:
            yield Module(item)


def _fit_restriction(mod, fit):
    # Module.fits owns hull, slot, rig, subsystem, hardpoint and group checks.
    # maxTypeFitted is a separate dogma maximum which this pyfa version does not test.
    item_max = mod.item.getAttribute('maxTypeFitted')
    if item_max and sum(other is not mod and other.itemID == mod.item.ID for other in fit.modules) >= item_max:
        return 'typeLimit'
    if mod.fits(fit):
        return None

    if not fit.canFit(mod.item):
        return 'hull'
    slot = mod.slot
    attr = mod.getModifiedItemAttr
    if slot == _engine.Slot.RIG and attr('rigSize') != fit.ship.getModifiedItemAttr('rigSize'):
        return 'rigSize'
    if slot == _engine.Slot.SUBSYSTEM and any(
        other is not mod and not other.isEmpty and other.slot == slot
        and other.getModifiedItemAttr('subSystemSlot') == attr('subSystemSlot') for other in fit.modules
    ):
        return 'subsystemSlot'
    group_max = mod.item.getAttribute('maxGroupFitted')
    if group_max and sum(other is not mod and not other.isEmpty and other.item.groupID == mod.item.groupID
                         for other in fit.modules) >= group_max:
        return 'groupLimit'
    if mod.isCapitalSize and fit.ship.getModifiedItemAttr('isCapitalSize', 0) != 1 and not fit.isStructure:
        return 'capitalSize'
    if fit.getSlotsFree(slot) <= (0 if mod.owner is not fit else -1):
        return 'slotLimit'
    if fit.getHardpointsFree(mod.hardpoint) < (1 if mod.owner is not fit else 0):
        return 'hardpointLimit'
    return 'hull'


def _initial_state(mod, fit):
    from gui.fitCommands.helpers import activeStateLimit
    proposed = mod.getMaxState(activeStateLimit(mod.item))
    # canHaveState counts the candidate in the rack along with existing modules.
    if mod.getModifiedItemAttr('maxGroupActive') or mod.getModifiedItemAttr('maxGroupOnline'):
        mod.owner = fit
        fit.modules.appendIgnoreEmpty(mod)
        try:
            mod.state = proposed
            allowed = mod.canHaveState(proposed)
            if allowed is not True:
                proposed = allowed
        finally:
            fit.modules.remove(mod)
            mod.owner = None
    return proposed


def items_for_slot(fit_json, slot, filters=None, options=None):
    from eos.saveddata.fit import Fit

    filters = {**(options or {}), **({'query': filters} if isinstance(filters, str) else filters or {})}
    matches = _name_matcher(filters.get('query'))
    group = filters.get('group')
    market_id = filters.get('marketGroupId')
    meta = filters.get('metaGroup') or filters.get('meta')
    preview = filters.get('preview', True)
    type_ids = filters.get('typeIds')
    if type_ids is not None:
        type_ids = set(type_ids)
    valid_market_ids = None if market_id is None else {market_id}
    if market_id is not None and not filters.get('exactMarketGroup'):
        for leaf in {row[5] for row in _slot_items(slot) if row[5] is not None}:
            path = _engine.market_path(leaf)
            if path and any(node['id'] == market_id for node in path['ancestors']):
                valid_market_ids.add(leaf)
    selected = {
        type_id: leaf for type_id, en, zh, group_id, item_meta, leaf in _slot_items(slot)
        if (type_ids is None or type_id in type_ids)
        and (group is None or group == group_id)
        and (valid_market_ids is None or leaf in valid_market_ids)
        and (meta is None or item_meta == meta)
        and (matches is None or matches(en, zh))
    }
    if not selected:
        return []

    calc_options = filters.get('calcOptions')
    with _temporary_fit(), _calculation_settings(calc_options):
        fit = _engine.build(fit_json, calc_options)[0]
        neutral = Fit()
        rows = []
        candidates = [(mod, _fit_restriction(mod, fit), _initial_state(mod, fit))
                      for mod in _slot_modules(selected, slot)]
        for mod, restriction, state in candidates:
            fields = {
                'initialState': STATE_NAMES[int(state)],
                'supportedStates': _engine.supported_states(mod),
                'fitting': {'cpu': r(mod.getModifiedItemAttr('cpu') or 0),
                            'powergrid': r(mod.getModifiedItemAttr('power') or 0)},
            }
            leaf = selected[mod.item.ID]
            if leaf is not None:
                fields['marketGroup'] = _engine.market_path(leaf)

            if restriction:
                rows.append({**_engine.item_row(mod.item), **fields, 'fitRestriction': restriction})
                continue
            if not preview:
                # Base key values, so each technology group can show its best before it is opened.
                mod.owner = neutral
                try:
                    rows.append({**_module_row(mod), **fields})
                finally:
                    mod.owner = None
                continue

            mod.owner = fit  # required by pyfa's module columns before the next flush
            fit.modules.appendIgnoreEmpty(mod)
            mod.state = state
            previous_states = [(existing, existing.state) for existing in fit.modules if existing is not mod]
            try:
                _engine.recalc(fit)
                restriction = _fit_restriction(mod, fit)
                if restriction:
                    rows.append({**_engine.item_row(mod.item), **fields, 'fitRestriction': restriction})
                    continue
                allowed = mod.canHaveState(mod.state)
                if allowed is not True:
                    mod.state = allowed
                    fields['initialState'] = STATE_NAMES[int(allowed)]
                    _engine.recalc(fit)
                if _engine.check_states(fit, mod):
                    _engine.recalc(fit)
                overages = _engine.warnings(_engine.resources(fit))
                rows.append({**_module_row(mod), **fields, 'resourceOverages': [
                    {**warning, 'overBy': r(warning['used'] - warning['total'])} for warning in overages
                ]})
            finally:
                for existing, old_state in previous_states:
                    existing.state = old_state
                fit.modules.remove(mod)
                mod.owner = None
        return _groups(rows)


def market_groups_for_slot(fit_json, slot):
    leaves = {}
    for type_id, _, _, _, _, market_id in _slot_items(slot):
        if market_id is not None:
            leaves.setdefault(market_id, []).append(type_id)
    with _temporary_fit():
        hull = _slot_hull(fit_json, slot)
        # One compatible module establishes that a group is available. Only load the other
        # variants when the group's first module fails the hull's fitting restrictions.
        first = {ids[0]: leaf for leaf, ids in leaves.items()}
        groups = {first[mod.item.ID] for mod in _slot_modules(first, slot) if mod.fits(hull)}
        remaining = {
            type_id: leaf for leaf, ids in leaves.items() if leaf not in groups for type_id in ids[1:]
        }
        groups.update(remaining[mod.item.ID] for mod in _slot_modules(remaining, slot) if mod.fits(hull))
    return [_engine.market_path(group_id) for group_id in sorted(groups)]


# Rigs and strategic-cruiser subsystems have dedicated market roots outside Ship Equipment.
_MARKET_ROOTS = {'rig': 1111, 'subsystem': 1112}


@lru_cache(maxsize=1)
def _market_tree_data():
    from sqlalchemy import text

    with _engine.db.gamedata_engine.connect() as conn:
        groups = conn.execute(text("""
            SELECT marketGroupID, parentGroupID, marketGroupName, marketGroupName_zh, iconID
            FROM invmarketgroups ORDER BY marketGroupID
        """)).all()
        # The web asset bundle includes icons used by published items.
        icons = dict(conn.execute(text("""
            SELECT typeID, iconID FROM invtypes WHERE published AND iconID > 0
        """)).all())
    return groups, icons, set(icons.values())


@lru_cache(maxsize=len(SLOT_KINDS))
def market_tree_for_slot(slot):
    root_id = _MARKET_ROOTS.get(slot, 9)
    groups, item_icons, bundled_icons = _market_tree_data()
    children_by_parent = {}
    for row in groups:
        children_by_parent.setdefault(row[1], []).append(row)

    types_by_group = {}
    for type_id, _, _, _, _, market_id in _slot_items(slot):
        if market_id is not None:
            types_by_group.setdefault(market_id, set()).add(type_id)

    def children(group_id):
        return sorted(
            (node for row in children_by_parent.get(group_id, ()) if (node := visit(row))),
            key=lambda node: (-node['count'], node['id']),
        )

    def visit(row):
        group_id, _, en, zh, icon = row
        nested = children(group_id)
        direct = types_by_group.get(group_id, ())
        count = len(direct) + sum(node['count'] for node in nested)
        if not count:
            return None
        node = {'id': group_id, 'name': {'en': en, 'zh': zh or en}, 'iconId': icon,
                'count': count, 'directCount': len(direct), 'children': nested}
        if icon not in bundled_icons:
            representative = next((item_icons[i] for i in sorted(direct) if i in item_icons), None)
            if representative is None:
                representative = next((child.get('displayIconId', child['iconId']) for child in nested
                                       if child.get('displayIconId', child['iconId']) in bundled_icons), None)
            if representative is not None:
                node['displayIconId'] = representative
        return node

    categories = children(root_id)
    return {'rootId': root_id, 'total': sum(node['count'] for node in categories), 'groups': categories}


def get_data_version():
    return _engine.data_version


def _item_attributes(item, current):
    rows = []
    for name, attr in sorted(item.attributes.items(), key=lambda pair: pair[1].ID):
        if not attr.published or not math.isfinite(attr.value):
            continue
        label = attr.displayName or name
        value = current(name) if current else None
        base, unit = attr.unit.PreformatValue(attr.value) if attr.unit else (attr.value, None)
        # Some dogma units display item names or other strings. Keep numeric raw values for those.
        numeric = isinstance(base, (int, float)) and math.isfinite(base)
        row = {'id': attr.ID, 'name': {'en': label, 'zh': attr.info.displayName_zh or label},
               'base': r(base if numeric else attr.value)}
        if unit and numeric:
            row['unit'] = unit
        if value is not None and math.isfinite(value):
            converted = attr.unit.PreformatValue(value)[0] if attr.unit and numeric else value
            row['current'] = r(converted if isinstance(converted, (int, float)) and math.isfinite(converted) else value)
        rows.append(row)
    return rows


_TAG = re.compile(r'<[^>]+>')
_TRAIT_SECTION = re.compile(r'<b>(.*?)</b>(.*?)(?=<b>|\Z)', re.S)
_LINE_BREAK = re.compile(r'<br\s*/?>', re.I)


def _trait_sections(text):
    sections = []
    for header, body in _TRAIT_SECTION.findall(text or ''):
        lines = [html.unescape(_TAG.sub('', line)).strip() for line in _LINE_BREAK.split(body)]
        sections.append((html.unescape(_TAG.sub('', header)).strip(), [line for line in lines if line]))
    return sections


def _traits(item):
    """Ship traits grouped by the skill (or role) that grants them, in both languages."""
    traits = item.traits
    if traits is None:
        return []
    en = _trait_sections(traits.traitText)
    zh = _trait_sections(traits.traitText_zh)
    if [len(lines) for _, lines in zh] != [len(lines) for _, lines in en]:
        zh = en
    return [{'header': {'en': head, 'zh': zh_head or head},
             'bonuses': [{'en': line, 'zh': zh_line} for line, zh_line in zip(lines, zh_lines)]}
            for (head, lines), (zh_head, zh_lines) in zip(en, zh)]


def item_info(type_id, fit_json=None, pos=None, options=None):
    from eos.saveddata.character import Character

    item = _engine.db.getItem(type_id)
    if item is None:
        return None

    with _temporary_fit(), _calculation_settings(options):
        current = None
        character = Character.getAll5()
        if fit_json is not None:
            character = Character.getAll5() if fit_json['character'] == 'all5' else Character.getAll0()
            if pos is not None or type_id == fit_json['shipTypeId']:
                fit, positions = _engine.build(fit_json, options)
                if pos is None:
                    current = fit.ship.getModifiedItemAttr
                else:
                    position = (pos['slot'], pos['index'])
                    module = next((mod for mod in fit.modules if positions[id(mod)] == position), None)
                    if module is not None and not module.isEmpty:
                        if module.item.ID == type_id:
                            current = module.getModifiedItemAttr
                        elif module.charge is not None and module.charge.ID == type_id:
                            current = module.getModifiedChargeAttr

        def skill_nodes(owner, seen=()):
            return [
                {'typeId': skill.ID, 'name': _engine.lname(skill), 'requiredLevel': level,
                 'currentLevel': int(character.getSkill(skill.ID).level),
                 'requires': skill_nodes(skill, seen + (skill.ID,)) if skill.ID not in seen else []}
                for skill, level in sorted(owner.requiredSkills.items(), key=lambda entry: entry[0].ID)
            ]

        tree = skill_nodes(item)
        result = {
            'typeId': item.ID, 'name': _engine.lname(item), 'iconId': item.iconID,
            'meta': meta_of(_engine.market.getMetaGroupIdByItem(item, fallback=1)),
            'group': _engine.group_name(item.group),
            'attributes': _item_attributes(item, current),
            'skills': [{key: value for key, value in node.items() if key != 'requires'}
                       for node in tree],
            'skillTree': tree,
        }
        traits = _traits(item)
        if traits:
            result['traits'] = traits
        if item.description or item._description_zh:
            result['description'] = {'en': item.description or item._description_zh,
                                     'zh': item._description_zh or item.description}
        return result


def charges_for(fit_json, pos, meta_group=None, options=None):
    slot, index = pos['slot'], pos['index']
    entries = fit_json['modules'][slot]
    if not 0 <= index < len(entries) or entries[index] is None:
        return []

    with _temporary_fit(), _calculation_settings(options):
        fit, positions = _engine.build(fit_json, options)
        module = next(mod for mod in fit.modules if positions[id(mod)] == (slot, index))
        if module.isEmpty:
            return []
        return _groups(_engine.charge_options(fit, module, meta_group))


def variations_of(type_id, fit_json=None, pos=None, count=1):
    """Same-family items. With a fit and position, each module also reports how it differs from the fitted one."""
    from eos.saveddata.fit import Fit
    from eos.saveddata.module import Module

    item = _engine.item(type_id)
    rows = []
    neutral = Fit()  # Base module attributes with pyfa's default reload policy.
    with _temporary_fit():
        fit = current = None
        if fit_json is not None and pos is not None:
            fit, positions = _engine.build(fit_json)
            current = next((mod for mod in fit.modules if positions[id(mod)] == (pos['slot'], pos['index'])), None)
            if current is None or current.isEmpty or current.item.ID != type_id:
                fit = current = None
        if current is not None:
            resource = _engine.resources(fit)['cpu']
            cpu_left = resource['total'] - resource['used']
            current_cpu = current.getModifiedItemAttr('cpu') or 0
            current_damage = current.item.getAttribute('damageMultiplier')

        for variant in _engine.market.getVariationsByItems([item]):
            if not variant.published or (current is not None and variant.ID == type_id):
                continue
            if variant.category.name == 'Charge':
                rows.append(_engine.charge_row(variant))
                continue
            if variant.category.name not in ('Module', 'Subsystem', 'Structure Module') or (
                'burst projector' in variant.name.lower()
            ):
                # Burst projectors need the equipped ship radius for their range.
                rows.append(_engine.item_row(variant))
                continue
            try:
                mod = Module(variant)
            except ValueError:
                rows.append(_engine.item_row(variant))
                continue
            mod.owner = neutral
            row = _module_row(mod)
            if current is not None:
                # Fitted CPU includes the pilot's skills and fitted bonuses, so measure it on the fit.
                mod.owner = fit
                fit.modules.appendIgnoreEmpty(mod)
                try:
                    _engine.recalc(fit)
                    cpu = mod.getModifiedItemAttr('cpu') or 0
                finally:
                    fit.modules.remove(mod)
                    mod.owner = None
                damage = variant.getAttribute('damageMultiplier')
                row['compare'] = {
                    'damage': r(damage / current_damage - 1) if damage and current_damage else None,
                    'cpu': r(cpu - current_cpu),
                    'cpuLeft': r(cpu_left + count * (current_cpu - cpu)),
                }
            rows.append(row)
        if current is not None:
            _engine.recalc(fit)
    return _groups(rows)


def import_text(text):
    return _port.import_text(text)


def import_additions(text, destination):
    return _port.import_additions(text, destination)


def export_text(fit_json, fmt, language='en', eft_options=None):
    with _temporary_fit():
        fit, _ = _engine.build(fit_json)
        return _port.export_text(fit, fmt, language, eft_options)


def missing_skills(fit_json):
    with _temporary_fit():
        fit, _ = _engine.build(fit_json)
        return _engine.missing_skills(fit)


def invoke(operation, arguments_json):
    # The worker supplies operation from its static method table.
    args = json.loads(arguments_json)
    return json.dumps(globals()[operation](*args), allow_nan=False)


def ship_catalog():
    from sqlalchemy import text

    with _engine.db.gamedata_engine.connect() as conn:
        records = conn.execute(text("""
            SELECT item.typeID, item.typeName, item.typeName_zh, item.graphicID, item.raceID,
                   hull.groupID, hull.name, hull.name_zh
            FROM invtypes item JOIN invgroups hull USING (groupID) JOIN invcategories category USING (categoryID)
            WHERE item.published AND category.name = 'Ship'
            ORDER BY hull.name, hull.groupID, item.typeName, item.typeID
        """)).all()
    groups = {}
    for type_id, en, zh, graphic, race, group_id, group_en, group_zh in records:
        group = groups.setdefault(group_id, {
            'id': group_id, 'name': {'en': group_en, 'zh': group_zh or group_en}, 'ships': [],
        })
        group['ships'].append({
            'typeId': type_id, 'name': {'en': en, 'zh': zh or en}, 'graphicId': graphic, 'raceId': race,
        })
    return {'dataVersion': _engine.data_version, 'groups': list(groups.values())}


def _extra_catalog(collection, query, remaining=None, attribute=None, occupied=()):
    from sqlalchemy import text

    category = {'drones': 'Drone', 'fighters': 'Fighter', 'implants': 'Implant'}.get(collection)
    with _engine.db.gamedata_engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT item.typeID, item.typeName, item.typeName_zh, item.iconID, item.metaGroupID, item.metaLevel,
                   value.value
            FROM invtypes item JOIN invgroups USING (groupID) JOIN invcategories category USING (categoryID)
            JOIN dgmtypeattribs value USING (typeID) JOIN dgmattribs attr USING (attributeID)
            WHERE item.published AND attr.attributeName = :attribute AND value.value > 0
              AND (:category IS NULL OR category.name = :category)
              AND (:collection != 'boosters' OR invgroups.name = 'Booster')
              AND (:remaining IS NULL OR value.value <= :remaining)
        """), {'category': category, 'attribute': attribute, 'collection': collection, 'remaining': remaining}).all()
    matches = _name_matcher(query)
    return [(type_id, en, zh, icon, meta, level) for type_id, en, zh, icon, meta, level, value in rows
            if value not in occupied and (matches is None or matches(en, zh))]


def _extra_key(collection, type_id):
    """Base damage per second of one drone or fighter, the figure pyfa sorts these by."""
    from eos.saveddata.drone import Drone
    from eos.saveddata.fighter import Fighter
    from eos.saveddata.fit import Fit

    none = {'keyValue': None, 'keyLine': ''}
    if collection not in ('drones', 'fighters'):
        return none
    try:
        unit = (Drone if collection == 'drones' else Fighter)(_engine.item(type_id))
        unit.owner = Fit()
        if collection == 'drones':
            unit.amount = unit.amountActive = 1
        dps = r(unit.getDps().total)
    except (AttributeError, TypeError, ValueError):
        return none
    return {'keyValue': dps, 'keyLine': f'{r(dps, 1)} DPS'} if dps else none


def items_for_extra(fit_json, collection, query=''):
    from eos.saveddata.drone import Drone
    from eos.saveddata.fighter import Fighter

    bay = {'cargo': 'cargo', 'drones': 'droneBay', 'fighters': 'fighterBay'}.get(collection)
    if collection == 'cargo' and not query.strip():
        return []
    with _temporary_fit():
        fit, _ = _engine.build(fit_json)
        if bay:
            resource = _engine.resources(fit)[bay]
            remaining = resource['total'] - resource['used']
            if remaining <= 0:
                return []
            rows = _extra_catalog(collection, query, remaining=remaining + 1e-9, attribute='volume')
        else:
            attribute = {'implants': 'implantness', 'boosters': 'boosterness'}[collection]
            occupied = {item.slot for item in getattr(fit, collection)}
            rows = _extra_catalog(collection, query, attribute=attribute, occupied=occupied)
        if collection in ('drones', 'fighters'):
            constructor = Drone if collection == 'drones' else Fighter
            rows = [row for row in rows if constructor(_engine.item(row[0])).fits(fit)]
        return _groups([
            {'typeId': type_id, 'name': {'en': en, 'zh': zh or en}, 'iconId': icon,
             'meta': meta_of(meta), 'metaLevel': level, **_extra_key(collection, type_id)}
            for type_id, en, zh, icon, meta, level in rows
        ])


def fill_empty_slots(fit_json, source):
    from engine import STATES, STATE_NAMES
    from eos.saveddata.module import Module

    slot, source_index = source['slot'], source['index']
    rack = fit_json['modules'][slot]
    if not 0 <= source_index < len(rack) or rack[source_index] is None:
        return []
    template = rack[source_index]
    with _temporary_fit():
        fit, positions = _engine.build(fit_json)
        fitted = next(mod for mod in fit.modules if positions[id(mod)] == (slot, source_index))
        if fitted.isEmpty:
            return []
        fills = []
        for index in range(int(fit.getNumSlots(fitted.slot))):
            if index < len(rack) and rack[index] is not None:
                continue
            clone = Module(fitted.item)
            if _fit_restriction(clone, fit):
                break
            clone.charge = fitted.charge
            clone.owner = fit
            clone.state = clone.getMaxState(STATES[template['state']])
            fit.modules.appendIgnoreEmpty(clone)
            allowed = clone.canHaveState(clone.state)
            if allowed is not True:
                clone.state = allowed
            _engine.recalc(fit)
            fills.append({'index': index, 'module': {**template, 'state': STATE_NAMES[clone.state]}})
        return fills
