"""F1 regression checks for the same API invoked by the Worker."""
import copy
import json
import math
import unittest
from unittest.mock import patch

import api


def call(operation, *args):
    return json.loads(api.invoke(operation, json.dumps(args)))


def regression_results(fits, data_version, client_build):
    rifter = fits['rifter']

    class EngineRegressions(unittest.TestCase):
        def test_chinese_eft_round_trip_preserves_ambiguous_type_id(self):
            fit = copy.deepcopy(rifter)
            fit['modules']['low'] = [{'typeId': 15070, 'state': 'active', 'chargeTypeId': None}]
            text = call('export_text', fit, 'eft', 'zh')
            result = call('import_text', text)
            self.assertEqual([15070], [m['typeId'] for m in result['fits'][0]['modules']['low'] if m])
            self.assertIn("Raysere's Modified Explosive Armor Hardener", text)
            self.assertEqual([], result['warnings'])

        def test_ambiguous_eft_warns_with_every_candidate_without_fitting_one(self):
            result = call('import_text', '[Rifter, Audit]\n莱塞勒氏改良型爆炸装甲增强器')
            self.assertEqual([], result['fits'][0]['modules']['low'])
            warning = '\n'.join(result['warnings'])
            for candidate in (15054, 15070):
                self.assertIn(str(candidate), warning)

        def test_removed_module_keeps_snapshot_and_position_without_affecting_stats(self):
            fit = copy.deepcopy(rifter)
            unknown = 987654321
            fit['itemNames'] = {str(unknown): {'en': 'Lost gun', 'zh': '旧火炮'}}
            fit['modules']['high'][1]['typeId'] = unknown
            result = call('calc', fit)
            rows = result['slots']['high']
            missing = next(row for row in rows if row['kind'] == 'removed')
            self.assertEqual([1], missing['positions'])
            self.assertEqual({'en': 'Lost gun', 'zh': '旧火炮'}, missing['name'])
            self.assertEqual([0, 2], rows[0]['positions'])
            fit['modules']['high'][1] = None
            self.assertEqual(call('calc', fit)['stats'], result['stats'])

        def test_removed_charge_does_not_remove_the_weapon(self):
            fit = copy.deepcopy(rifter)
            unknown = 987654322
            fit['itemNames'] = {str(unknown): {'en': 'Lost ammo', 'zh': '旧弹药'}}
            fit['modules']['high'][0]['chargeTypeId'] = unknown
            row = call('calc', fit)['slots']['high'][0]
            self.assertEqual('module', row['kind'])
            self.assertEqual(2889, row['typeId'])
            self.assertTrue(row['charge']['removed'])
            self.assertEqual('Lost ammo', row['charge']['name']['en'])

        def test_charge_group_uses_actual_weapon_dps_range_and_damage_mix(self):
            pos = {'slot': 'high', 'index': 0}
            from engine import meta_of
            native = api._engine.recalc
            tested_ammo = set()

            def record(fit):
                module = fit.modules[0]
                tested_ammo.add(module.charge.ID)
                return native(fit)

            with patch.object(api._engine, 'recalc', record):
                groups = call('charges_for', rifter, pos, 'tech2')
            self.assertEqual(['tech2'], [group['meta'] for group in groups])
            tested_ammo.discard(rifter['modules']['high'][0]['chargeTypeId'])
            self.assertEqual({'tech2'}, {
                meta_of(api._engine.item(type_id).metaGroupID) for type_id in tested_ammo
            })
            option = groups[0]['items'][0]
            fit = {**rifter, 'modules': {**rifter['modules'], 'high': [
                {**rifter['modules']['high'][0], 'chargeTypeId': option['typeId']},
            ]}}
            self.assertAlmostEqual(option['dps'], call('calc', fit)['stats']['firepower']['weaponDps'], places=3)
            self.assertGreater(option['optimalRange'], 0)
            self.assertGreater(option['falloff'], 0)
            self.assertAlmostEqual(sum(option['damageMix'].values()), option['dps'], places=3)
            all0 = call('charges_for', {**rifter, 'character': 'all0'}, pos, 'tech2')[0]['items']
            self.assertNotEqual(option['dps'], next(row['dps'] for row in all0 if row['typeId'] == option['typeId']))

        def test_item_filters_skip_recalculation_for_other_groups(self):
            group_id = api._engine.item(2889).groupID
            from eos.saveddata.fit import Fit
            native = Fit.calculateModifiedAttributes
            trial = []

            def record(fit, *args, **kwargs):
                if len(fit.modules) > sum(len(rack) for rack in rifter['modules'].values()):
                    item = fit.modules[-1].item
                    trial.append((item.groupID, item.metaGroupID))
                return native(fit, *args, **kwargs)

            with patch.object(Fit, 'calculateModifiedAttributes', record):
                groups = call('items_for_slot', rifter, 'high', {
                    'group': group_id, 'metaGroup': 'tech2', 'query': 'autocannon',
                })
            self.assertEqual(['tech2'], [group['meta'] for group in groups])
            self.assertTrue(trial)
            self.assertEqual({(group_id, 2)}, set(trial))

        def test_stats_expose_eos_repairs_reload_mining_bays_and_price_inputs(self):
            current = call('calc', rifter)
            stats = current['stats']
            self.assertEqual('EHP/s', stats['repair']['unit'])
            self.assertEqual('HP/s', stats['repair']['raw']['unit'])
            self.assertGreater(stats['repair']['reinforced']['armor'], stats['repair']['raw']['reinforced']['armor'])
            self.assertEqual('m³/s', stats['mining']['unit'])
            self.assertLess(call('calc', rifter, {'includeReload': True})['stats']['firepower']['dps'],
                            stats['firepower']['dps'])
            self.assertAlmostEqual(stats['capacitor']['neutralizerResistance'], 0)
            self.assertEqual({'used': 0, 'total': 0}, current['resources']['fighterBay'])
            self.assertEqual([{'typeId': 587, 'quantity': 1}], current['priceItems']['ship'])
            self.assertIn({'typeId': 2889, 'quantity': 3}, current['priceItems']['modules'])
            venture = {**rifter, 'shipTypeId': 32880, 'modules': {slot: [] for slot in rifter['modules']}}
            venture['modules']['high'] = [{'typeId': 483, 'state': 'active', 'chargeTypeId': None}]
            result = call('calc', venture)
            self.assertGreater(result['resources']['specializedBays']['generalMiningHoldCapacity'], 0)
            self.assertGreater(result['stats']['mining']['total'], 0)
            carrier = {**venture, 'shipTypeId': 23911, 'modules': {slot: [] for slot in rifter['modules']},
                       'fighters': [{'typeId': 23059, 'amount': 3, 'active': True}]}
            result = call('calc', carrier)
            self.assertGreater(result['resources']['fighterBay']['used'], 0)
            self.assertEqual(1, result['resources']['fighterTubes']['used'])
            self.assertEqual([{'typeId': 23059, 'quantity': 3}], result['priceItems']['fighters'])

        def test_range_axis_and_comparison_charges_follow_fitted_weapons(self):
            fit = copy.deepcopy(rifter)
            fit['modules']['high'] = [{'typeId': 2977, 'state': 'active', 'chargeTypeId': 21898}]
            result = call('calc', fit)
            curve = result['rangeCurve']
            self.assertNotEqual(30, curve['distancesKm'][-1])
            options = [c for group in call('charges_for', fit, {'slot': 'high', 'index': 0})
                       for c in group['items'] if c['typeId'] != 21898]
            fastest = min(options, key=lambda c: (-c['dps'], c['typeId']))
            farthest = min(options, key=lambda c: (-(c['optimalRange'] + 3 * c['falloff']), c['typeId']))
            self.assertEqual(list(dict.fromkeys([21898, fastest['typeId'], farthest['typeId']])),
                             [series['chargeTypeId'] for series in curve['series']])
            self.assertGreaterEqual(curve['distancesKm'][-1], math.floor(
                (farthest['optimalRange'] + 3 * farthest['falloff']) / 1000))
            self.assertTrue(all(len(s['dps']) == len(curve['distancesKm']) for s in curve['series']))

        def test_no_damage_weapons_means_no_range_curve(self):
            empty = {**rifter, 'modules': {slot: [] for slot in rifter['modules']}}
            self.assertEqual({'distancesKm': [], 'series': []}, call('calc', empty)['rangeCurve'])

        def test_market_queries_do_not_pollute_item_cache_for_matching_numeric_ids(self):
            from eos.gamedata import Item, MarketGroup
            self.assertIsInstance(api._engine.db.getItem(603), Item)
            self.assertIsInstance(api._engine.db.getMarketGroup(603), MarketGroup)
            self.assertEqual(603, call('calc', fits['merlin'])['ship']['typeId'])

        def test_manifest_version_is_used_for_calc_and_import_separately_from_client_build(self):
            result = call('calc', rifter)
            self.assertEqual(data_version, result['dataVersion'])
            self.assertEqual(client_build, result['clientBuild'])
            imported = call('import_text', '[Rifter, Audit]')['fits'][0]
            self.assertEqual(data_version, imported['dataVersion'])
            self.assertEqual(client_build, imported['clientBuild'])

    EngineRegressions.__qualname__ = 'EngineRegressions'
    return unittest.defaultTestLoader.loadTestsFromTestCase(EngineRegressions)
