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
        def empty_ship(self, type_id, **fields):
            return {**rifter, 'shipTypeId': type_id,
                    'modules': {slot: [] for slot in rifter['modules']}, **fields}

        def native_fit(self, ship_id):
            from eos.saveddata.character import Character
            from eos.saveddata.fit import Fit
            from eos.saveddata.ship import Ship
            db = api._engine.db
            fit = Fit(Ship(db.getItem(ship_id)))
            fit.character = Character.getAll5()
            fit.implantLocation = 0
            db.saveddata_session.add(fit)
            db.flush()
            return fit

        def test_vexor_eft_inactive_then_five_hammerheads_match_native_eos(self):
            from eos.saveddata.drone import Drone
            parsed = call('import_text', '[Vexor, Drone test]\n\nHammerhead II x5')
            self.assertEqual([], parsed['warnings'])
            doc = parsed['fits'][0]
            self.assertEqual(0, doc['drones'][0]['active'])
            self.assertEqual(0, call('calc', doc)['stats']['firepower']['droneDps'])
            doc['drones'][0].update(amount=10, active=10)
            actual = call('calc', doc)
            with api._temporary_fit():
                fit = self.native_fit(626)
                drone = Drone(api._engine.item(2185))
                drone.amount, drone.amountActive = 10, 5
                fit.drones.append(drone)
                api._engine.db.flush()
                fit.clear()
                fit.calculateModifiedAttributes()
                self.assertAlmostEqual(fit.getDroneDps().total, actual['stats']['firepower']['droneDps'], places=4)
                self.assertEqual(5, actual['resources']['activeDrones']['used'])
                self.assertEqual(50, actual['resources']['droneBandwidth']['used'])
            # A smaller hull hits bandwidth before the pilot reaches 5 drones.
            limited = call('calc', {**doc, 'shipTypeId': 593, 'drones': [
                {'typeId': 2185, 'amount': 5, 'active': 5},
                {'typeId': 2205, 'amount': 5, 'active': 5},
            ]})
            self.assertEqual(25, limited['resources']['droneBandwidth']['used'])
            self.assertEqual(3, limited['resources']['activeDrones']['used'])

        def test_confessor_localized_eft_mode_round_trip_and_native_stats(self):
            from eos.saveddata.mode import Mode
            parsed = call('import_text', '[Confessor, Mode test]\nConfessor Sharpshooter Mode')
            self.assertEqual([], parsed['warnings'])
            doc = parsed['fits'][0]
            self.assertEqual(34321, doc['modeTypeId'])
            chinese = call('export_text', doc, 'eft', 'zh')
            self.assertIn('忏悔者级狙击模式', chinese)
            self.assertEqual(34321, call('import_text', chinese)['fits'][0]['modeTypeId'])
            actual = call('calc', doc)
            self.assertEqual({34319, 34321, 34323}, {mode['typeId'] for mode in actual['modes']['options']})
            self.assertEqual(34321, actual['modes']['selected'])
            with api._temporary_fit():
                fit = self.native_fit(34317)
                fit.mode = Mode(api._engine.item(34321))
                fit.clear()
                fit.calculateModifiedAttributes()
                self.assertAlmostEqual(fit.maxTargetRange, actual['stats']['navigation']['maxTargetRange'], places=4)
            self.assertNotEqual(actual['stats']['navigation']['maxTargetRange'],
                                call('calc', {**doc, 'modeTypeId': 34319})['stats']['navigation']['maxTargetRange'])

        def test_candidate_fitting_rules_and_default_state(self):
            def rows(doc, slot, query):
                return [row for group in call('items_for_slot', doc, slot, query, {'preview': False})
                        for row in group['items']]

            result = rows(rifter, 'low', 'damage control')
            self.assertEqual('groupLimit', next(row for row in result if row['typeId'] == 2048)['fitRestriction'])
            result = rows(self.empty_ship(587), 'high', 'prototype cloaking device')
            self.assertEqual('online', result[0]['initialState'])
            result = rows(self.empty_ship(587), 'mid', 'stasis webifier ii')
            self.assertEqual('active', next(row for row in result if row['typeId'] == 527)['initialState'])
            result = rows(rifter, 'rig', 'medium trimark armor pump i')
            self.assertEqual('rigSize', next(row for row in result if row['typeId'] == 31055)['fitRestriction'])
            from eos.gamedata import Item
            native = Item.getAttribute

            def dogma(item, key, *args, **kwargs):
                if item.ID == 519 and key == 'maxTypeFitted':
                    return 1
                return native(item, key, *args, **kwargs)

            with patch.object(Item, 'getAttribute', dogma):
                result = rows(rifter, 'low', 'gyrostabilizer ii')
            self.assertEqual('typeLimit', next(row for row in result if row['typeId'] == 519)['fitRestriction'])
            legion = self.empty_ship(29986)
            legion['modules']['subsystem'] = [{'typeId': 45623, 'state': 'online', 'chargeTypeId': None}]
            result = rows(legion, 'subsystem', 'legion core')
            self.assertEqual('subsystemSlot', next(row for row in result if row['typeId'] == 45622)['fitRestriction'])

        def test_old_slot_and_state_still_open_with_row_diagnostics(self):
            fit = copy.deepcopy(rifter)
            fit['modules']['low'][2]['state'] = 'active'
            fit['modules']['mid'][0] = {'typeId': 2048, 'state': 'online', 'chargeTypeId': None}
            result = call('calc', fit)
            bad_slot = next(row for row in result['slots']['mid'] if row.get('typeId') == 2048)
            self.assertEqual('slot', bad_slot['adjustment'])
            downgraded = next(row for row in result['slots']['low'] if row.get('typeId') == 2048)
            self.assertEqual('online', downgraded['state'])
            self.assertEqual('state', downgraded['adjustment'])
            fit['modules']['low'][2]['state'] = 'online'
            fit['modules']['mid'][0] = None
            self.assertEqual(call('calc', fit)['stats'], result['stats'])

        def test_character_skill_and_reactivation_options(self):
            doc = {**rifter, 'character': 'all0'}
            restricted = call('calc', doc, {'strictSkills': True})
            unrestricted = call('calc', doc, {'strictSkills': False})
            self.assertTrue(restricted['missingSkills'])
            self.assertEqual(restricted['missingSkills'], unrestricted['missingSkills'])
            self.assertEqual([], call('calc', rifter)['missingSkills'])
            self.assertLess(restricted['stats']['firepower']['dps'], call('calc', rifter)['stats']['firepower']['dps'])
            from eos import config
            self.assertTrue(config.settings['strictSkillLevels'])
            # The drive has a capacitor draw and an actual reactivation delay.
            doc = self.empty_ship(28710)
            doc['modules']['mid'] = [{'typeId': 4383, 'state': 'active', 'chargeTypeId': None}]
            with_delay = call('calc', doc, {'includeReactivation': True})
            without_delay = call('calc', doc, {'includeReactivation': False})
            self.assertEqual(call('calc', doc)['stats']['capacitor'], with_delay['stats']['capacitor'])
            self.assertLess(with_delay['stats']['capacitor']['usage'], without_delay['stats']['capacitor']['usage'])

        def test_weapon_and_mutadaptive_repair_spool_cycles_match_native_eos(self):
            from eos.const import SpoolType
            from eos.saveddata.module import Module
            for hull, module, charge, section, field, native in (
                (47269, 47914, 47926, 'firepower', 'weaponDps', lambda f: f.getWeaponDps().total),
                (47269, 49773, None, 'remoteRepair', 'armor', lambda f: f.getRemoteReps().armor),
            ):
                with self.subTest(module=module):
                    doc = self.empty_ship(hull)
                    doc['modules']['high'] = [{'typeId': module, 'state': 'active', 'chargeTypeId': charge}]
                    early = call('calc', doc, {'defaultSpoolPercent': 0})['stats'][section][field]
                    full = call('calc', doc, {'defaultSpoolPercent': 100})['stats'][section][field]
                    doc['modules']['high'][0]['spoolCycles'] = 3
                    result = call('calc', doc, {'defaultSpoolPercent': 100})
                    actual = result['stats'][section][field]
                    self.assertGreater(actual, early)
                    self.assertLess(actual, full)
                    with api._temporary_fit():
                        fit = self.native_fit(hull)
                        mod = Module(api._engine.item(module))
                        if charge is not None:
                            mod.charge = api._engine.item(charge)
                        fit.modules.appendIgnoreEmpty(mod)
                        mod.state = 1
                        mod.spoolType, mod.spoolAmount = SpoolType.CYCLES, 3
                        api._engine.db.flush()
                        fit.clear()
                        fit.calculateModifiedAttributes()
                        self.assertAlmostEqual(native(fit), actual, places=4)

        def test_expanded_calculation_parity_covers_all_six_scenarios(self):
            self.assertEqual({'vexor', 'thanatos', 'legion', 'confessor', 'unstable', 'overfit'}, fits.keys() - {
                'rifter', 'merlin', 'thrasher',
            })
            results = {name: call('calc', fits[name]) for name in ('vexor', 'thanatos', 'legion', 'confessor', 'unstable', 'overfit')}
            self.assertGreater(results['vexor']['stats']['firepower']['droneDps'], 0)
            thanatos = results['thanatos']
            self.assertEqual(1, thanatos['resources']['fighterTubes']['used'])
            self.assertGreater(thanatos['stats']['firepower']['dps'], 0)
            self.assertGreater(results['legion']['resources']['slots']['subsystem']['used'], 0)
            self.assertEqual(34321, results['confessor']['modes']['selected'])
            self.assertFalse(results['unstable']['stats']['capacitor']['stable'])
            self.assertGreater(results['unstable']['stats']['capacitor']['lastsSeconds'], 0)
            self.assertTrue({'cpu', 'highSlots'} <= {row['kind'] for row in results['overfit']['warnings']})

        def test_chinese_eft_round_trip_preserves_ambiguous_type_id(self):
            fit = copy.deepcopy(rifter)
            fit['modules']['low'] = [{'typeId': 15070, 'state': 'active', 'chargeTypeId': None}]
            text = call('export_text', fit, 'eft', 'zh')
            result = call('import_text', text)
            self.assertEqual([15070], [m['typeId'] for m in result['fits'][0]['modules']['low'] if m])
            self.assertIn("Raysere's Modified Explosive Armor Hardener", text)
            self.assertEqual([], result['warnings'])

        def test_audit_rifter_xml_and_esi_round_trip_to_eft(self):
            cases = (
                ('XML', 'Audit XML', '<?xml version="1.0"?><fittings><fitting name="Audit XML"><shipType value="Rifter"/></fitting></fittings>'),
                ('ESI', 'Audit ESI', '{"name":"Audit ESI","ship_type_id":587,"items":[],"description":""}'),
            )
            for format_name, name, text in cases:
                with self.subTest(format=format_name):
                    parsed = call('import_text', text)
                    self.assertEqual([name], [fit['name'] for fit in parsed['fits']])
                    self.assertEqual(format_name, parsed['format'])
                    self.assertEqual([], parsed['warnings'])
                    doc = parsed['fits'][0]
                    self.assertEqual(587, doc['shipTypeId'])
                    eft = call('import_text', '[Rifter, ' + name + ']')['fits'][0]
                    exported = call('export_text', doc, 'eft')
                    round_tripped = call('import_text', exported)['fits'][0]
                    actual = call('calc', round_tripped)
                    self.assertEqual(call('calc', eft), actual)
                    with api._temporary_fit():
                        native = self.native_fit(587)
                        native.clear()
                        native.calculateModifiedAttributes()
                        self.assertAlmostEqual(native.ship.getModifiedItemAttr("maxVelocity"), actual['stats']['navigation']['maxVelocity'], places=3)

        def test_paste_additions_resolves_stacks_and_reports_skipped_rows(self):
            drones = call('import_additions', 'Hammerhead II x2\nHammerhead II x3\nMissing drone x4', 'drones')
            self.assertEqual([{'typeId': 2185, 'amount': 2}, {'typeId': 2185, 'amount': 3}], drones['items'])
            self.assertEqual(['Missing drone x4'], drones['warnings'])
            cargo = call('import_additions', 'Antimatter Charge S x1000\nAntimatter Charge S x0', 'cargo')
            self.assertEqual([{'typeId': 222, 'amount': 1000}], cargo['items'])
            self.assertEqual(['Antimatter Charge S x0'], cargo['warnings'])

        def test_eft_export_options_exclude_each_native_section_independently(self):
            fit = {**rifter, 'cargo': [{'typeId': 222, 'amount': 777}], 'implants': [10216], 'boosters': [9950]}
            markers = {
                'charges': ', Republic Fleet EMP S', 'cargo': 'Antimatter Charge S x777',
                'implants': 'Ocular Filter', 'boosters': 'Blue Pill',
            }
            baseline = call('export_text', fit, 'eft')
            for key, marker in markers.items():
                with self.subTest(section=key):
                    self.assertIn(marker, baseline)
                    exported = call('export_text', fit, 'eft', 'en', {key: False})
                    self.assertNotIn(marker, exported)
                    for other in markers.keys() - {key}:
                        self.assertIn(markers[other], exported)

        def test_ambiguous_eft_warns_with_every_candidate_without_fitting_one(self):
            result = call('import_text', '[Rifter, Audit]\n莱塞勒氏改良型爆炸装甲增强器')
            self.assertEqual([], result['fits'][0]['modules']['low'])
            [warning] = result['ambiguities']
            self.assertEqual('莱塞勒氏改良型爆炸装甲增强器', warning['name'])
            self.assertEqual([15054, 15070], [item['typeId'] for item in warning['candidates']])

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
            fit_doc = copy.deepcopy(rifter)
            fit_doc['modules']['high'][0] = None
            from eos.saveddata.fit import Fit
            native = Fit.calculateModifiedAttributes
            trial = []

            def record(fit, *args, **kwargs):
                if len(fit.modules) > sum(len(rack) for rack in rifter['modules'].values()):
                    item = fit.modules[-1].item
                    trial.append((item.groupID, item.metaGroupID))
                return native(fit, *args, **kwargs)

            with patch.object(Fit, 'calculateModifiedAttributes', record):
                groups = call('items_for_slot', fit_doc, 'high', {
                    'group': group_id, 'metaGroup': 'tech2', 'query': 'autocannon',
                })
            self.assertEqual(['tech2'], [group['meta'] for group in groups])
            self.assertTrue(trial)
            self.assertEqual({(group_id, 2)}, set(trial))

        def test_market_leaf_and_meta_filter_only_trial_the_requested_candidates(self):
            market = api._engine.market_group(api._engine.item(2889))
            fit_doc = copy.deepcopy(rifter)
            fit_doc['modules']['high'][0] = None
            self.assertIn(market, call('market_groups_for_slot', fit_doc, 'high'))
            self.assertEqual(data_version, call('get_data_version'))
            with patch.object(api._engine, 'recalc', wraps=api._engine.recalc) as recalc:
                catalog = call('items_for_slot', fit_doc, 'high', None, {
                    'marketGroupId': market['id'], 'preview': False,
                })
                self.assertNotIn('resourceOverages', catalog[0]['items'][0])
                self.assertEqual(1, recalc.call_count)  # Calculate hull layout once.
                recalc.reset_mock()
                preview = call('items_for_slot', fit_doc, 'high', None, {
                    'marketGroupId': market['id'], 'meta': 'tech2', 'preview': True,
                })
                self.assertEqual(['tech2'], [group['meta'] for group in preview])
                self.assertEqual({market['id']}, {row['marketGroup']['id'] for row in preview[0]['items']})
                trials = [row for row in preview[0]['items'] if not row.get('fitRestriction')]
                self.assertEqual(1 + len(trials), recalc.call_count)

        def test_item_info_reports_fitted_cpu_only_for_the_matching_position(self):
            base = call('item_info', 2889)
            fitted = call('item_info', 2889, rifter, {'slot': 'high', 'index': 0})
            wrong = call('item_info', 2889, rifter, {'slot': 'low', 'index': 0})
            cpu = lambda info: next(a for a in info['attributes'] if a['id'] == 50)
            self.assertEqual(9, cpu(base)['base'])
            self.assertEqual(6.75, cpu(fitted)['current'])
            self.assertNotIn('current', cpu(wrong))
            self.assertIsNone(call('item_info', 987654321))

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
