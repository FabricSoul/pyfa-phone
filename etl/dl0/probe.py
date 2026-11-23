"""Run unmodified pyfa constructors and display methods on parity FitDocs."""

import ast
import json
import os
import sys
from copy import deepcopy
from importlib import import_module
from pathlib import Path

from doubles import Control, Gauge, FittingView, install

ROOT = Path(__file__).resolve().parents[2]
UPSTREAM = Path(os.environ.get("DL0_UPSTREAM", ROOT / "vendor/pyfa"))
FIXTURES = Path(os.environ.get("DL0_FIXTURES", ROOT / "etl/fixtures"))
PANELS = ("capacitorViewFull", "firepowerViewFull", "resourcesViewFull")
MENU_CASES = {
    "module": ("fittingModule", "Module", (
        "itemRemove", "itemStats", "moduleAmmoChange", "itemVariationChange",
        "moduleFill", "itemMarketJump", "moduleSpool",
    )),
    "empty": ("fittingModule", "Module", ("itemRemove", "itemStats", "moduleAmmoChange")),
    "marketCharge": ("marketItemGroup", "Charge", (
        "ammoToDmgPattern", "cargoAdd", "cargoAddAmmo", "cargoFill",
    )),
    "marketModule": ("marketItemGroup", "Module", ("itemFill", "cargoAddAmmo")),
    "firepower": ("firepowerViewFull", None, ("factorReload",)),
    "ship": ("fittingShip", "Ship", ("shipModeChange",)),
}


def default_specs():
    """Read the literal without importing the native FittingView widget."""
    source = UPSTREAM / "gui/builtinViews/fittingView.py"
    tree = ast.parse(source.read_text(encoding="utf-8"))
    view = next(node for node in tree.body if isinstance(node, ast.ClassDef) and node.name == "FittingView")
    for node in view.body:
        if isinstance(node, ast.Assign) and any(
            isinstance(target, ast.Name) and target.id == "DEFAULT_COLS" for target in node.targets
        ):
            return ast.literal_eval(node.value)
    raise ValueError("FittingView.DEFAULT_COLS is missing or is no longer a literal")


def capture_columns(fit, view):
    from gui.viewColumn import ViewColumn

    columns = {}
    for spec in default_specs():
        name, _, suffix = spec.partition(":")
        column = ViewColumn.getColumn(name)
        # The two parameterized defaults currently take a single attribute name.
        params = None
        if suffix:
            values = suffix.split(",")
            params = {key: values[i] if i < len(values) else default
                      for i, (key, _, default) in enumerate(column.getParameters())}
        columns[spec] = column(view, params)

    rows = list(fit.modules)
    if fit.mode is not None:
        rows.append(fit.mode)
    results = []
    for item in rows:
        cells = {}
        errors = {}
        for spec, column in columns.items():
            cells[spec] = []
            for method in ("getText", "getToolTip"):
                try:
                    cells[spec].append(getattr(column, method)(item))
                except Exception as error:
                    errors[f"{spec}.{method}"] = f"{type(error).__name__}: {error}"
                    cells[spec].append(None)
        results.append({"typeId": item.item.ID if item.item is not None else None, "cells": cells, "errors": errors})
    return results


def capture_stats(fit):
    from gui.statsView import StatsView

    result = {}
    for name in PANELS:
        parent = Control()
        panel = StatsView.getView(name)(parent)
        panel.populatePanel(Control(parent), Control(parent))
        panel.refreshPanel(fit)
        result[name] = {
            key: {"text": value.label, "tooltip": value.tooltip, "writes": value.labels_written}
            for key, value in vars(panel).items()
            if isinstance(value, Control) and value.labels_written
        }
        result[name]["gauges"] = {key: value.values for key, value in vars(panel).items() if isinstance(value, Gauge)}
    return result


def capture_menus(fit, view):
    from gui.contextMenu import ContextMenu
    from eos.saveddata.module import Module

    module = next(item for item in fit.modules if item.charge is not None)
    items = {
        "module": module, "empty": Module.buildEmpty(module.slot), "marketCharge": module.charge,
        "marketModule": module.item, "firepower": None, "ship": fit.ship,
    }
    output = {}
    for case, (source, category, names) in MENU_CASES.items():
        item = items[case]
        for name in names:
            target = import_module(f"gui.builtinContextMenus.{name}")
            handlers = [handler for handler in ContextMenu.menus if handler.__module__ == target.__name__]
            if not handlers:
                raise ValueError(f"No registered menu handler in {name}")
            for handler in handlers:
                menu = handler()
                selection = [item] if item is not None else []
                visible = bool(menu._baseDisplay(view, source, item, selection))
                output[f"{case}/{handler.__name__}"] = {
                    "visible": visible,
                    "text": menu._baseGetText(view, category, item, selection) if visible else None,
                }
    return output


def capture():
    if sys.platform != "emscripten":
        sys.path[:0] = [str(ROOT / "src/engine/py"), str(UPSTREAM)]

    import api
    from engine import market_service
    from headless import bootstrap

    bootstrap(Path(os.environ["DL0_DB"]).resolve())
    frame = install()
    market_service()
    api._engine = api.Engine("dl0")
    fit_docs = {
        **json.loads((FIXTURES / "fits.json").read_text()),
        **json.loads((FIXTURES / "advanced-fits.json").read_text()),
    }

    heated_rifter = deepcopy(fit_docs["rifter"])
    heated_rifter["modules"]["high"][0]["state"] = "overheated"
    fit_docs["rifterOverheated"] = heated_rifter

    results = {}
    for name in ("rifter", "confessor", "rifterOverheated"):
        with api._temporary_fit(), api._calculation_settings(None):
            fit, _positions = api._engine.build(fit_docs[name])
            # The product engine has already calculated this fit. The desktop
            # service otherwise recalculates, fills and commits it on first read.
            fit.inited = True
            frame.active_fit = fit.ID
            view = FittingView(fit.ID)
            results[name] = {
                "columns": capture_columns(fit, view),
                "stats": capture_stats(fit),
                "menus": capture_menus(fit, view),
            }
    return results


def summary(results):
    for name, result in results.items():
        rows = result["columns"]
        errors = sum(len(row["errors"]) for row in rows)
        visible = sum(menu["visible"] for menu in result["menus"].values())
        labels = sum(len(panel) - 1 for panel in result["stats"].values())  # gauges are separate
        print(f"{name}: {len(rows)} rows × {len(rows[0]['cells'])} default columns × 2 methods, "
              f"{errors} cell errors, {labels} labels across {len(result['stats'])} panels, "
              f"{visible}/{len(result['menus'])} menu cases visible")


if __name__ == "__main__":
    data = capture()
    if "--json" in sys.argv:
        print(json.dumps(data, ensure_ascii=False))
    else:
        summary(data)
