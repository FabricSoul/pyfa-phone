"""JSON-compatible bridge to the original pyfa fitting engine and services."""

import json
import math
import re
from contextlib import contextmanager
from functools import lru_cache
from pathlib import Path

from engine import Engine, META_ORDER, SLOT_KINDS, meta_of, r
from headless import bootstrap

_engine = None
_port = None
_character = None

_SLOT_EFFECT = {
    'high': 'hiPower', 'mid': 'medPower', 'low': 'loPower',
    'rig': 'rigSlot', 'subsystem': 'subSystem',
}
_NUMBER = re.compile(r'([+-]?(?:\d+(?:\.\d*)?|\.\d+))([kMG]?)')
_MAGNITUDE = {'': 1, 'k': 1000, 'M': 10**6, 'G': 10**9}


def initialize(db_path, names_path, data_version, client_build):
    global _engine, _port, _character
    from port_adapter import PortAdapter

    bootstrap(db_path)
    from service.character import Character

    _engine = Engine(data_version)
    _slot_items.cache_clear()
    if _engine.client_build != client_build:
        raise ValueError('Game database client build does not match the asset manifest')
    # Construct the built-in characters once, before the temporary fit transactions.
    _character = Character.getInstance()
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


def calc(fit_json, options=None):
    with _temporary_fit():
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


def _eligible_modules(ids, hull, slot):
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
            mod = Module(item)
            if mod.fits(hull):
                yield mod


def items_for_slot(fit_json, slot, filters=None, options=None):
    from gui.fitCommands.helpers import activeStateLimit

    filters = {**(options or {}), **({'query': filters} if isinstance(filters, str) else filters or {})}
    term = (filters.get('query') or '').strip().casefold()
    group = filters.get('group')
    market_id = filters.get('marketGroupId')
    meta = filters.get('metaGroup') or filters.get('meta')
    preview = filters.get('preview', True)
    valid_market_ids = None
    if market_id is not None:
        valid_market_ids = {market_id}
        for leaf in {row[5] for row in _slot_items(slot) if row[5] is not None}:
            path = _engine.market_path(leaf)
            if path and any(node['id'] == market_id for node in path['ancestors']):
                valid_market_ids.add(leaf)
    selected = {
        type_id: leaf for type_id, en, zh, group_id, item_meta, leaf in _slot_items(slot)
        if (group is None or group == group_id)
        and (valid_market_ids is None or leaf in valid_market_ids)
        and (meta is None or item_meta == meta)
        and (not term or term in en.casefold() or (zh and term in zh.casefold()))
    }
    if not selected:
        return []

    with _temporary_fit():
        hull = _slot_hull(fit_json, slot)
        fit = _engine.build(fit_json)[0] if preview else None
        rows = []
        for mod in _eligible_modules(selected, hull, slot):
            fields = {
                'supportedStates': _engine.supported_states(mod),
                'fitting': {'cpu': r(mod.getModifiedItemAttr('cpu') or 0),
                            'powergrid': r(mod.getModifiedItemAttr('power') or 0)},
            }
            leaf = selected[mod.item.ID]
            if leaf is not None:
                fields['marketGroup'] = _engine.market_path(leaf)
            if not preview:
                rows.append({**_engine.item_row(mod.item), **fields})
                continue
            mod.owner = fit  # required by pyfa's module columns before the next flush
            fit.modules.appendIgnoreEmpty(mod)
            try:
                if mod.isValidState(1):
                    mod.state = activeStateLimit(mod.item)
                _engine.recalc(fit)
                overages = _engine.warnings(_engine.resources(fit))
                rows.append({**_module_row(mod), **fields, 'resourceOverages': [
                    {**warning, 'overBy': r(warning['used'] - warning['total'])} for warning in overages
                ]})
            finally:
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
        groups = {first[mod.item.ID] for mod in _eligible_modules(first, hull, slot)}
        remaining = {
            type_id: leaf for leaf, ids in leaves.items() if leaf not in groups for type_id in ids[1:]
        }
        groups.update(remaining[mod.item.ID] for mod in _eligible_modules(remaining, hull, slot))
    return [_engine.market_path(group_id) for group_id in sorted(groups)]


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


def item_info(type_id, fit_json=None, pos=None):
    from eos.saveddata.character import Character

    item = _engine.db.getItem(type_id)
    if item is None:
        return None

    with _temporary_fit():
        current = None
        character = Character.getAll5()
        if fit_json is not None:
            character = Character.getAll5() if fit_json['character'] == 'all5' else Character.getAll0()
            if pos is not None or type_id == fit_json['shipTypeId']:
                fit, positions = _engine.build(fit_json)
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

        result = {
            'typeId': item.ID, 'name': _engine.lname(item), 'iconId': item.iconID,
            'meta': meta_of(_engine.market.getMetaGroupIdByItem(item, fallback=1)),
            'group': _engine.group_name(item.group),
            'attributes': _item_attributes(item, current),
            'skills': [
                {'typeId': skill.ID, 'name': _engine.lname(skill), 'requiredLevel': level,
                 'currentLevel': int(character.getSkill(skill.ID).level)}
                for skill, level in sorted(item.requiredSkills.items(), key=lambda entry: entry[0].ID)
            ],
        }
        if item.description or item._description_zh:
            result['description'] = {'en': item.description or item._description_zh,
                                     'zh': item._description_zh or item.description}
        return result


def charges_for(fit_json, pos, meta_group=None):
    slot, index = pos['slot'], pos['index']
    entries = fit_json['modules'][slot]
    if not 0 <= index < len(entries) or entries[index] is None:
        return []

    with _temporary_fit():
        fit, positions = _engine.build(fit_json)
        module = next(mod for mod in fit.modules if positions[id(mod)] == (slot, index))
        if module.isEmpty:
            return []
        return _groups(_engine.charge_options(fit, module, meta_group))


def variations_of(type_id):
    from eos.saveddata.fit import Fit
    from eos.saveddata.module import Module

    item = _engine.item(type_id)
    rows = []
    neutral = Fit()  # Base module attributes with pyfa's default reload policy.
    for variant in _engine.market.getVariationsByItems([item]):
        if not variant.published:
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
        rows.append(_module_row(mod))
    return _groups(rows)


def import_text(text):
    return _port.import_text(text)


def export_text(fit_json, fmt, language='en'):
    with _temporary_fit():
        fit, _ = _engine.build(fit_json)
        return _port.export_text(fit, fmt, language)


def missing_skills(fit_json):
    with _temporary_fit():
        fit, _ = _engine.build(fit_json)
        levels = {}

        def collect(requirements):
            for level, type_id, prerequisites in requirements.values():
                levels[type_id] = max(level, levels.get(type_id, 0))
                collect(prerequisites)

        for requirements in _character.checkRequirements(fit).values():
            collect(requirements)
        return [
            {'typeId': type_id, 'name': _engine.lname(_engine.item(type_id)),
             'requiredLevel': level, 'currentLevel': int(fit.character.getSkill(type_id).level)}
            for type_id, level in sorted(levels.items())
        ]


def invoke(operation, arguments_json):
    # The worker supplies operation from its static method table.
    args = json.loads(arguments_json)
    return json.dumps(globals()[operation](*args), allow_nan=False)
