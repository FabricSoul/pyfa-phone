"""Tests for etl/50_patterns.py output (run the script first to regenerate it).

Checks src/data/patterns.json, generated from the pyfa submodule's built-in
damage patterns and target profiles (vendor/pyfa/eos/saveddata/*.py) plus the
Chinese names in vendor/pyfa/locale/zh_CN/LC_MESSAGES/lang.po.

Run: uv run --python 3.13 --with pytest python -m pytest etl/test_patterns.py
"""

import json
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "src" / "data" / "patterns.json"

DAMAGE_KEYS = ("em", "thermal", "kinetic", "explosive")
TARGET_KEYS = ("maxVelocity", "signatureRadius", "radius", "hp")


@pytest.fixture(scope="module")
def data():
    assert OUT.is_file(), "src/data/patterns.json missing; run `python etl/50_patterns.py`"
    return json.loads(OUT.read_text(encoding="utf-8"))


def test_damage_pattern_count(data):
    assert len(data["damagePatterns"]) == 118


def test_target_profile_count(data):
    # 195 builtins + the id-0 ideal target, which is not in BUILTINS.
    assert len(data["targetProfiles"]) == 196


def test_ideal_target(data):
    ideal = next(p for p in data["targetProfiles"] if p["id"] == 0)
    assert ideal["name"] == {"en": "Ideal Target", "zh": "理想目标"}
    assert ideal["category"] is None
    assert ideal["em"] == 0
    assert ideal["thermal"] == 0
    assert ideal["kinetic"] == 0
    assert ideal["explosive"] == 0
    assert ideal["maxVelocity"] == 0
    assert ideal["signatureRadius"] is None
    assert ideal["radius"] == 0
    assert ideal["hp"] is None


def test_uniform_zh(data):
    uniform = next(p for p in data["damagePatterns"] if p["id"] == -1)
    assert uniform["name"] == {"en": "Uniform", "zh": "均匀"}
    assert uniform["category"] is None
    assert uniform["em"] == 25
    assert uniform["thermal"] == 25
    assert uniform["kinetic"] == 25
    assert uniform["explosive"] == 25


def test_projectile_ammo_category_zh(data):
    entries = [
        p
        for p in data["damagePatterns"]
        if p["category"] is not None and p["category"]["en"] == "Projectile Ammo"
    ]
    assert entries, "no damage pattern with category 'Projectile Ammo'"
    assert all(p["category"]["zh"] == "射弹弹药" for p in entries)


def test_untranslated_name_falls_back_to_english(data):
    # 'Condenser Packs' has no zh translation in lang.po.
    entries = [
        p
        for p in data["damagePatterns"]
        if p["category"] is not None and p["category"]["en"] == "Condenser Packs"
    ]
    assert entries, "no damage pattern with category 'Condenser Packs'"
    assert all(p["category"]["zh"] == "Condenser Packs" for p in entries)


def test_t2_subcategory_split(data):
    # '[Frequency Crystals]|[T2] Aurora' -> category + subcategory + name.
    aurora = next(p for p in data["damagePatterns"] if p["id"] == -6)
    assert aurora["category"] == {"en": "Frequency Crystals", "zh": "频率晶体"}
    assert aurora["subcategory"] == {"en": "T2", "zh": "T2"}
    assert aurora["name"]["en"] == "Aurora"


def test_nested_category_split(data):
    # '[NPC][Burner][Team]Enyo' -> category NPC, subcategory 'Burner / Team'.
    enyo = next(p for p in data["targetProfiles"] if p["id"] == -40)
    assert enyo["category"]["en"] == "NPC"
    assert enyo["subcategory"]["en"] == "Burner / Team"
    assert enyo["name"]["en"] == "Enyo"
    assert enyo["maxVelocity"] == 1020
    assert enyo["signatureRadius"] == 37
    assert enyo["radius"] == 39
    assert enyo["hp"] is None


def test_all_damage_values_are_numbers(data):
    for entry in data["damagePatterns"] + data["targetProfiles"]:
        for key in DAMAGE_KEYS:
            value = entry[key]
            assert isinstance(value, (int, float)) and not isinstance(value, bool), (
                entry["id"],
                key,
                value,
            )


def test_target_extra_fields_are_numbers_or_null(data):
    for entry in data["targetProfiles"]:
        for key in TARGET_KEYS:
            value = entry[key]
            assert value is None or (
                isinstance(value, (int, float)) and not isinstance(value, bool)
            ), (entry["id"], key, value)


def test_ids_are_unique(data):
    for key in ("damagePatterns", "targetProfiles"):
        ids = [entry["id"] for entry in data[key]]
        assert len(ids) == len(set(ids)), key
