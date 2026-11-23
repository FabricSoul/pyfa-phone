"""Checks the ETL output in public/data and public/img (run `pnpm etl` first)."""

import gzip
import hashlib
import json
import shutil
import sqlite3
import subprocess
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


def test_manifest_uses_content_hashes_and_separate_client_build(manifest, db):
    assert manifest["clientBuild"] == db.execute(
        "SELECT field_value FROM metadata WHERE field_name='client_build'"
    ).fetchone()[0]
    assert manifest["db"]["encoding"] == "gzip"
    assert manifest["dataVersion"] == hashlib.sha256(
        ''.join(asset["sha256"] for asset in (
            manifest["db"], manifest["names"], manifest["py"], *manifest["pyodide"]["files"],
        )).encode()
    ).hexdigest()
    for key, prefix, suffix in (("db", "eve", "db.gz"), ("names", "names", "json"), ("py", "py", "zip")):
        asset = manifest[key]
        assert asset["file"] == f"{prefix}.{asset['sha256']}.{suffix}"
        content = (DATA / asset["file"]).read_bytes()
        assert hashlib.sha256(content).hexdigest() == asset["sha256"]
        assert len(content) == asset["bytes"]


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
    assert names["zh"]["200mm自动加农炮 II"] == [2889]
    assert names["en"]["200mm AutoCannon II"] == [2889]
    assert set(names["zh"]["莱塞勒氏改良型爆炸装甲增强器"]) == {15054, 15070}


def test_images_exist():
    assert (IMG / "icons" / "387.png").is_file()
    assert (IMG / "renders" / "46.png").is_file()


def test_clean_unreferenced_files(manifest):
    fake_eve = DATA / "eve.20261122-34a39e9.db.gz"
    fake_names = DATA / "names.20261122-34a39e9.json"
    fake_py = DATA / "py.20261122-34a39e9.zip"
    keep_file = DATA / "keep_unrelated.txt"
    pyodide_dir = ROOT / "public" / "pyodide"
    fake_pyodide_dir = pyodide_dir / "0.28.0"

    fake_eve.write_bytes(b"fake eve")
    fake_names.write_text('{"fake": true}', encoding="utf-8")
    fake_py.write_bytes(b"fake py")
    keep_file.write_text("keep me", encoding="utf-8")
    fake_pyodide_dir.mkdir(parents=True, exist_ok=True)
    (fake_pyodide_dir / "dummy.txt").write_text("old pyodide", encoding="utf-8")

    try:
        subprocess.run(["node", str(ROOT / "etl" / "40_bundle_py.mjs")], check=True, cwd=str(ROOT))

        assert not fake_eve.exists(), "Unreferenced eve.* file should be deleted by cleanup"
        assert not fake_names.exists(), "Unreferenced names.* file should be deleted by cleanup"
        assert not fake_py.exists(), "Unreferenced py.* file should be deleted by cleanup"
        assert not fake_pyodide_dir.exists(), "Unreferenced pyodide version directory should be deleted"
        assert keep_file.is_file(), "Non-matching file in public/data should not be touched"

        assert (DATA / manifest["db"]["file"]).is_file()
        assert (DATA / manifest["names"]["file"]).is_file()
        assert (DATA / manifest["py"]["file"]).is_file()
        assert (pyodide_dir / manifest["pyodide"]["version"]).is_dir()
    finally:
        for p in (fake_eve, fake_names, fake_py, keep_file):
            if p.exists():
                p.unlink()
        if fake_pyodide_dir.exists():
            shutil.rmtree(fake_pyodide_dir, ignore_errors=True)



def test_gui_icons_for_home_and_boot_page_are_copied():
    for name in ("turret_big", "shieldActive_big", "maxVelocity_big", "capacitorInfo_big", "cpu_big", "pg_big", "pyfa"):
        icon = IMG / "gui" / f"{name}.png"
        assert icon.is_file() and icon.stat().st_size > 0, f"{icon} missing; run `pnpm etl`"
