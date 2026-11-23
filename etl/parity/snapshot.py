"""Exercise every engine entry point with the same inputs under both interpreters."""
import json
import sys
import unittest
from pathlib import Path

if __name__ == '__main__' and sys.platform != 'emscripten':
    root = Path(__file__).resolve().parents[2]
    sys.path[:0] = [str(root / 'src/engine/py'), str(root / 'vendor/pyfa')]

import api
from regressions import regression_results


def module_ids(doc, slot):
    return sorted(m['typeId'] for m in doc['modules'][slot] if m)


def content_snapshot(doc):
    catalog = api.ship_catalog()
    cruiser = next(group for group in catalog['groups'] if group['name']['en'] == 'Cruiser')
    vexor = next(ship for ship in cruiser['ships'] if ship['typeId'] == 626)
    assert vexor['name'] == {'en': 'Vexor', 'zh': '狂怒者级'}, vexor
    assert vexor['raceId'] == 8, vexor
    empty = {**doc, 'shipTypeId': vexor['typeId'], 'name': 'Vexor',
             'modules': {slot: [] for slot in doc['modules']}}
    result = api.calc(empty)
    assert result['ship']['name'] == vexor['name']
    assert result['resources']['slots']['high']['used'] == 0

    drones = api.items_for_extra(empty, 'drones', '战锤')
    assert any(row['name']['en'] == 'Hammerhead II' for group in drones for row in group['items'])
    assert api.items_for_extra({**empty, 'shipTypeId': 587}, 'drones', 'Hammerhead') == []
    assert api.items_for_extra(empty, 'fighters', 'Templar') == []
    fighters = api.items_for_extra({**empty, 'shipTypeId': 23911}, 'fighters', 'Templar')
    assert any(row['name']['en'] == 'Templar I' for group in fighters for row in group['items'])
    cargo = api.items_for_extra(empty, 'cargo', 'Antimatter Charge S')
    assert any(row['name']['en'] == 'Antimatter Charge S' for group in cargo for row in group['items'])
    implants = api.items_for_extra(empty, 'implants', 'Ocular Filter')
    assert implants and api.items_for_extra({**empty, 'implants': [10216]}, 'implants', 'Ocular Filter') == []
    boosters = api.items_for_extra(empty, 'boosters', 'Blue Pill')
    assert boosters

    fills = api.fill_empty_slots(doc, {'slot': 'low', 'index': 0})
    assert fills == [{'index': 3, 'module': doc['modules']['low'][0]}], fills
    assert api.fill_empty_slots(doc, {'slot': 'low', 'index': 2}) == []
    return {'vexor': vexor, 'shipCount': sum(len(group['ships']) for group in catalog['groups']),
            'resources': result['resources'], 'drones': drones, 'fighters': fighters,
            'cargo': cargo, 'implants': implants, 'boosters': boosters, 'fills': fills}


def snapshot(doc):
    result = api.calc(doc)
    assert result['ship']['group']['en']
    assert all(row['state'] in row['supportedStates']
               for rack in result['slots'].values() for row in rack if row['kind'] == 'module')
    market = api.market_groups_for_slot(doc, 'low')
    assert market and any(group['ancestors'] for group in market), market
    item = api.item_info(doc['modules']['high'][0]['typeId'], doc, {'slot': 'high', 'index': 0})
    assert item['name']['zh'] and item['group']['zh'] and item['description']['zh']
    assert item['skills'] and any(a['base'] != a['current'] for a in item['attributes'])
    assert api.item_info(987654321) is None
    # Give the high-slot preview a free turret hardpoint on each baseline fit.
    preview_doc = {**doc, 'modules': {**doc['modules'], 'high': [None, *doc['modules']['high'][1:]]}}
    items = {
        slot: api.items_for_slot(preview_doc if slot == 'high' else doc, slot, query)
        for slot, query in (
            ('high', 'autocannon'), ('mid', 'stasis webifier'), ('low', 'damage control'),
            ('rig', 'projectile'), ('subsystem', ''),
        )
    }
    charges = {
        meta: api.charges_for(doc, {'slot': 'high', 'index': 0}, meta)
        for meta in ('tech2', 'tech1', 'faction', 'storyline', 'deadspace', 'officer')
    }
    assert items['high'] and items['mid'] and items['low'] and items['rig'], items
    assert charges['tech2'], charges
    if doc['shipTypeId'] == 587:
        # The high-slot catalogue includes remote repair gear whose pyfa column reads its owning fit.
        remote = api.items_for_slot(preview_doc, 'high', 'remote shield booster')
        assert remote and any(row['keyLine'] for group in remote for row in group['items']), remote
        items['remoteShieldBoosters'] = remote
    assert any(row.get('resourceOverages') for group in items['high'] for row in group['items'])
    for groups in items.values():
        for group in groups:
            for row in group['items']:
                for warning in row.get('resourceOverages', []):
                    assert warning['overBy'] > 0
                    assert abs(warning['overBy'] - (warning['used'] - warning['total'])) < 1e-6

    for groups in (*items.values(), *charges.values()):
        priority = ('tech2', 'tech1', 'faction', 'storyline', 'deadspace', 'officer')
        order = [priority.index(group['meta']) for group in groups]
        assert order == sorted(set(order)), order
        for group in groups:
            values = [float('-inf') if row['keyValue'] is None else row['keyValue'] for row in group['items']]
            assert values == sorted(values, reverse=True), values
            assert group['best'] == group['items'][0]['keyValue']

    exports = {fmt: api.export_text(doc, fmt) for fmt in ('eft', 'dna', 'multibuy')}
    chinese = api.export_text(doc, 'eft', 'zh')
    linked = f"<url=fitting:{exports['dna']}>Shared fit</url>"
    for text in (exports['eft'], exports['dna'], chinese, linked):
        imported = api.import_text(text)
        assert not imported['warnings'] and len(imported['fits']) == 1, imported
        actual = imported['fits'][0]
        assert actual['shipTypeId'] == doc['shipTypeId'], actual
        for slot in doc['modules']:
            assert module_ids(actual, slot) == module_ids(doc, slot), (text, slot, actual)
        if text == linked:
            assert actual['name'] == 'Shared fit'
    assert api.import_text('not a fit')['warnings']
    assert api.import_text('587:2889;100000000::')['fits'] == []
    assert api.import_text('DNA:587:2889*1')['fits'][0]['shipTypeId'] == 587
    assert len(api.import_text(f"{exports['eft']}\n\n{chinese}")['fits']) == 2
    assert api.import_text(f"{exports['eft']}\nUnknown module")['warnings'] == ['Unknown module']
    variations = api.variations_of(doc['modules']['high'][0]['typeId'])
    assert any(group['meta'] == 'tech2' for group in variations), variations
    assert api.missing_skills(doc) == []
    missing = api.missing_skills({**doc, 'character': 'all0'})
    assert missing and all(s['requiredLevel'] > s['currentLevel'] == 0 for s in missing), missing
    return {
        **({'content': content_snapshot(doc)} if doc['shipTypeId'] == 587 else {}),
        'calc': result, 'marketGroupsForSlot': market, 'itemInfo': item,
        'getDataVersion': api.get_data_version(), 'itemsForSlot': items, 'chargesFor': charges,
        'exports': exports, 'chineseEft': chinese, 'variations': variations, 'missingSkills': missing,
    }


data_version, client_build = sys.argv[4:6]
api.initialize(sys.argv[1], sys.argv[2], data_version, client_build)
fits = json.loads(Path(sys.argv[3]).read_text())
advanced = json.loads(Path(sys.argv[6]).read_text())
platform = 'Pyodide' if sys.platform == 'emscripten' else 'CPython'
print(f'{platform} Worker API regressions', file=sys.stderr)
runner = unittest.TextTestRunner(stream=sys.stderr, verbosity=2)
assert runner.run(regression_results({**fits, **advanced}, data_version, client_build)).wasSuccessful()
snapshots = {name: snapshot(doc) for name, doc in fits.items()}
snapshots.update({name: {'calc': api.calc(doc), 'getDataVersion': api.get_data_version()}
                  for name, doc in advanced.items()})
serialized = json.dumps(snapshots, allow_nan=False)
if sys.platform != 'emscripten':
    print(serialized)
serialized
