"""Checks the ETL output in public/data and public/img (run `pnpm etl` first)."""

import gzip
import hashlib
import json
import sqlite3
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "public" / "data"
IMG = ROOT / "public" / "img"
MAX_BYTES = 25 * 1024 * 1024


@pytest.fixture(scope="module")
def manifest():
    path = DATA / "manifest.json"
    assert path.is_file(), "public/data/manifest.json missing; run `pnpm etl`"
    return json.loads(path.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def db(manifest, tmp_path_factory):
    gz = DATA / manifest["db"]["file"]
    out = tmp_path_factory.mktemp("db") / "eve.db"
    with gzip.open(gz, "rb") as src, open(out, "wb") as dst:
        while chunk := src.read(1 << 20):
            dst.write(chunk)
    conn = sqlite3.connect(out)
    yield conn
    conn.close()


def test_manifest_shape(manifest):
    assert manifest["dataVersion"]
    assert manifest["db"]["encoding"] == "gzip"
    assert manifest["db"]["file"] == f"eve.{manifest['dataVersion']}.db.gz"
    assert manifest["names"]["file"] == f"names.{manifest['dataVersion']}.json"


def test_db_gzip_under_limit_and_matches_manifest(manifest):
    gz = DATA / manifest["db"]["file"]
    raw = gz.read_bytes()
    assert len(raw) < MAX_BYTES
    assert len(raw) == manifest["db"]["bytes"]
    assert hashlib.sha256(raw).hexdigest() == manifest["db"]["sha256"]


def test_rifter_names(db):
    row = db.execute(
        "SELECT typeName, typeName_zh FROM invtypes WHERE typeID = 587"
    ).fetchone()
    assert row == ("Rifter", "裂谷级")


def test_names_index_maps_both_languages(manifest):
    names = json.loads((DATA / manifest["names"]["file"]).read_text(encoding="utf-8"))
    assert names["zh"]["200mm自动加农炮 II"] == 2889
    assert names["en"]["200mm AutoCannon II"] == 2889
    assert isinstance(names["conflicts"], list)


def test_images_exist():
    assert (IMG / "icons" / "387.png").is_file()
    assert (IMG / "renders" / "46.png").is_file()
