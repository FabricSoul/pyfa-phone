"""Stage a content-addressed EFT name index of published typeIDs."""

import hashlib
import json
import sqlite3
from contextlib import closing
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BUILD = ROOT / "build"
DATA = ROOT / "public" / "data"
COLUMNS = {"zh": "typeName_zh", "en": "typeName"}


def build_index(conn: sqlite3.Connection) -> dict[str, dict[str, list[int]]]:
    out = {}
    for lang, column in COLUMNS.items():
        rows = conn.execute(
            f"""SELECT {column}, typeID FROM invtypes
                WHERE published = 1 AND {column} IS NOT NULL AND {column} != ''
                ORDER BY {column}, typeID"""
        )
        groups = {}
        for name, type_id in rows:
            groups.setdefault(name, []).append(type_id)
        out[lang] = groups
    return out


def main() -> None:
    database = json.loads((BUILD / "game-db.json").read_text())
    with closing(sqlite3.connect(BUILD / "eve.db")) as conn:
        index = build_index(conn)
    content = json.dumps(index, ensure_ascii=False, separators=(",", ":")).encode()
    digest = hashlib.sha256(content).hexdigest()
    name = f"names.{digest}.json"
    pending = DATA / f"{name}.tmp"
    pending.write_bytes(content)
    pending.replace(DATA / name)
    (BUILD / "names.json").write_text(json.dumps({
        "file": name, "bytes": len(content), "sha256": digest, "dbSha256": database["db"]["sha256"],
    }))
    print(f"{name}: zh {len(index['zh'])}, en {len(index['en'])}, {len(content)} bytes")


if __name__ == "__main__":
    main()
