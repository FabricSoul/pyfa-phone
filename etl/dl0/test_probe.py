"""Observable checks for the display experiment, shared by CPython and Pyodide."""

import unittest


class DisplayProbeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        try:
            from probe import capture
        except ModuleNotFoundError as error:
            if error.name != "probe":
                raise
            cls.report = None
            return
        cls.report = capture()

    def result(self, fit):
        self.assertIsNotNone(self.report, "The original display capture is not implemented")
        self.assertIn(fit, self.report)
        return self.report[fit]

    def test_default_fitting_columns(self):
        for name in ("rifter", "confessor"):
            rows = self.result(name)["columns"]
            self.assertTrue(rows)
            for row in rows:
                self.assertEqual(len(row["cells"]), 13)
                self.assertEqual(row["errors"], {})
            self.assertTrue(any(row["cells"]["Base Name"][0] for row in rows))
        rifter = self.result("rifter")["columns"]
        self.assertIn(["Republic Fleet EMP S (120)", None], [row["cells"]["Ammo"] for row in rifter])

    def test_heat_for_an_overheated_row(self):
        rows = self.result("rifterOverheated")["columns"]
        self.assertTrue(any(
            text and tooltip == "Estimated time til burnout"
            for text, tooltip in (row["cells"]["Heat"] for row in rows)
        ), [row["errors"] for row in rows])

    def test_stats_refresh_labels(self):
        for name in ("rifter", "confessor"):
            stats = self.result(name)["stats"]
            self.assertEqual(stats["capacitorViewFull"]["labelFullCapacitorResist"]["text"], "0%")
            self.assertTrue(stats["firepowerViewFull"]["labelFullDpsWeapon"]["text"].endswith(" DPS"))
            self.assertGreater(float(stats["resourcesViewFull"]["labelFullTotalCpu"]["text"]), 0)

    def test_context_menu_visibility_and_text(self):
        for name in ("rifter", "confessor"):
            menus = self.result(name)["menus"]
            visible = {key: result["text"] for key, result in menus.items() if result["visible"]}
            self.assertGreaterEqual(len(visible), 10)
            self.assertEqual(visible["module/RemoveItem"], "Remove Module")
            self.assertEqual(visible["module/ChangeModuleAmmo"], "Charge")
            self.assertFalse(menus["empty/RemoveItem"]["visible"])


if __name__ == "__main__":
    unittest.main()
