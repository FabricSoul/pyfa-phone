"""Copy the icons and renders that published items use into public/img.

  vendor/pyfa/imgs/icons/<iconID>@2x.png      -> public/img/icons/<iconID>.png
  vendor/pyfa/imgs/renders/<graphicID>@2x.png -> public/img/renders/<graphicID>.png

Reads build/eve.db written by 10_build_db.py. IDs without a source image are skipped.
"""

import shutil
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
IMGS = ROOT / "vendor" / "pyfa" / "imgs"
OUT = ROOT / "public" / "img"
DB = ROOT / "build" / "eve.db"


def published_ids(column: str) -> set[int]:
    conn = sqlite3.connect(DB)
    rows = conn.execute(
        f"SELECT DISTINCT {column} FROM invtypes WHERE published = 1 AND {column} IS NOT NULL"
    ).fetchall()
    conn.close()
    return {r[0] for r in rows}


def copy_set(ids: set[int], src_dir: Path, dest_dir: Path) -> tuple[int, int]:
    # Start clean so images no longer used by the data do not linger.
    if dest_dir.exists():
        shutil.rmtree(dest_dir)
    dest_dir.mkdir(parents=True)
    copied = missing = 0
    for i in sorted(ids):
        src = src_dir / f"{i}@2x.png"
        if src.is_file():
            shutil.copyfile(src, dest_dir / f"{i}.png")
            copied += 1
        else:
            missing += 1
    return copied, missing


def main() -> None:
    for column, sub in (("iconID", "icons"), ("graphicID", "renders")):
        copied, missing = copy_set(published_ids(column), IMGS / sub, OUT / sub)
        print(f"{sub}: copied {copied}, no source image for {missing}")


if __name__ == "__main__":
    main()
