"""Write public/data/names.<ver>.json: item name -> typeID, for EFT import.

  {"zh": {name: typeID}, "en": {name: typeID}, "conflicts": [...]}

Only published items. When several published items share a name, the one with a
market group wins (lowest typeID breaks ties); every such name is listed in
"conflicts" as {"lang", "name", "typeID", "others"}.
Reads build/eve.db and build/data_version written by 10_build_db.py.
"""

import json
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BUILD = ROOT / "build"
DATA = ROOT / "public" / "data"
COLUMNS = {"zh": "typeName_zh", "en": "typeName"}


def build_index(conn: sqlite3.Connection) -> dict:
    out: dict = {"zh": {}, "en": {}, "conflicts": []}
    for lang, column in COLUMNS.items():
        # Preferred row first for each name: has a market group, then lowest typeID.
        rows = conn.execute(
            f"""SELECT {column}, typeID FROM invtypes
                WHERE published = 1 AND {column} IS NOT NULL AND {column} != ''
                ORDER BY {column}, marketGroupID IS NULL, typeID"""
        ).fetchall()
        groups: dict[str, list[int]] = {}
        for name, type_id in rows:
            groups.setdefault(name, []).append(type_id)
        for name, ids in groups.items():
            out[lang][name] = ids[0]
            if len(ids) > 1:
                out["conflicts"].append(
                    {"lang": lang, "name": name, "typeID": ids[0], "others": ids[1:]}
                )
    return out


def main() -> None:
    ver = (BUILD / "data_version").read_text(encoding="utf-8").strip()
    conn = sqlite3.connect(BUILD / "eve.db")
    index = build_index(conn)
    conn.close()
    path = DATA / f"names.{ver}.json"
    path.write_text(
        json.dumps(index, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )
    print(
        f"{path.name}: zh {len(index['zh'])}, en {len(index['en'])}, "
        f"conflicts {len(index['conflicts'])}, {path.stat().st_size} bytes"
    )


if __name__ == "__main__":
    main()
