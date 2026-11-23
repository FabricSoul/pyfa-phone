"""JSON-compatible bridge to the original pyfa fitting engine and services."""

import json
import re
from contextlib import contextmanager
from functools import lru_cache
from pathlib import Path

from engine import Engine, META_ORDER, SLOT_KINDS, r
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


def initialize(db_path, names_path):
    global _engine, _port, _character
    from port_adapter import PortAdapter

    bootstrap(db_path)
    from service.character import Character

    _engine = Engine()
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


def calc(fit_json):
    with _temporary_fit():
        return _engine.calc(fit_json)


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

    # Limit the ORM load to published items with this slot effect.
    with _engine.db.gamedata_engine.connect() as conn:
        return conn.execute(text('''
            SELECT invtypes.typeID, typeName, typeName_zh
            FROM invtypes JOIN dgmtypeeffects USING (typeID) JOIN dgmeffects USING (effectID)
            WHERE invtypes.published AND effectName = :effect
        '''), {'effect': _SLOT_EFFECT[slot]}).all()


def items_for_slot(fit_json, slot, query=''):
    from eos.saveddata.module import Module
    from gui.fitCommands.helpers import activeStateLimit
    from eos.gamedata import Item
    from sqlalchemy.orm import selectinload

    term = (query or '').strip().casefold()
    ids = [type_id for type_id, en, zh in _slot_items(slot)
           if term in en.casefold() or (zh and term in zh.casefold())]
    if not ids:
        return []

    with _temporary_fit():
        fit, _ = _engine.build(fit_json)
        # Test permanent restrictions on a hull with its slot layout, then preview resource
        # use on the actual fitting. A full rack can still be browsed for replacements.
        hull_doc = {**fit_json, 'modules': {
            k: fit_json['modules'][k] if k == 'subsystem' and slot != 'subsystem' else []
            for k in SLOT_KINDS
        }}
        hull, _ = _engine.build(hull_doc)
        rows = []
        candidates = _engine.db.gamedata_session.query(Item).filter(Item.ID.in_(ids)).options(
            selectinload(Item.effects), selectinload(Item._Item__attributes),
        ).all()
        for item in candidates:
            if Module.calculateSlot(item) != _engine.kind_slot[slot] or item.category.name not in (
                'Module', 'Subsystem', 'Structure Module',
            ):
                continue
            mod = Module(item)
            if not mod.fits(hull):
                continue
            mod.owner = fit  # required by pyfa's module columns before the next flush
            fit.modules.appendIgnoreEmpty(mod)
            try:
                if mod.isValidState(1):
                    mod.state = activeStateLimit(item)
                _engine.recalc(fit)
                overages = _engine.warnings(_engine.resources(fit))
                rows.append({**_module_row(mod), 'resourceOverages': [
                    {**warning, 'overBy': r(warning['used'] - warning['total'])} for warning in overages
                ]})
            finally:
                fit.modules.remove(mod)
                mod.owner = None
        return _groups(rows)


def charges_for(fit_json, pos):
    from eos.saveddata.module import Module

    entries = fit_json['modules'][pos['slot']]
    index = pos['index']
    if not 0 <= index < len(entries) or entries[index] is None:
        return []
    module = Module(_engine.item(entries[index]['typeId']))
    return _groups(_engine.charge_rows(module))


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
