"""Export pyfa built-in damage patterns and target profiles as JSON.

  python etl/50_patterns.py

Reads the pyfa submodule (vendor/pyfa, do not modify) and writes
src/data/patterns.json:

  {"damagePatterns": [...], "targetProfiles": [...]}

Each entry is:
  {id, category: {en, zh} | null, subcategory: {en, zh} | null,
   name: {en, zh}, em, thermal, kinetic, explosive}
Target profiles additionally carry maxVelocity, signatureRadius, radius, hp
(number | null; null when the source tuple does not provide the value).

Sources:
  - damage patterns: vendor/pyfa/eos/saveddata/damagePattern.py BUILTINS (118)
  - target profiles: vendor/pyfa/eos/saveddata/targetProfile.py BUILTINS (195)
    plus pyfa's id-0 ideal target, which is NOT in BUILTINS but composed by
    TargetProfile.getIdeal() in the same file (listed first).
  - Chinese names: vendor/pyfa/locale/zh_CN/LC_MESSAGES/lang.po
    (msgid -> msgstr; a segment with no translation falls back to English).

Name splitting: the source builds a display string from _t()/_c() pieces,
e.g. '[Frequency Crystals]|[T2] Aurora' or '[NPC][Burner][Team]Enyo'.
Leading '[...]' groups are category levels: the first is `category`, the
rest (from the head and from after '|' if present) are joined with ' / '
into `subcategory`; the remainder, stripped, is `name`. Each segment is
translated separately.

pyfa modules are never imported (they import wx); the sources are parsed
with ast only. Standard library only.
"""

import ast
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DAMAGE_PATTERN_SRC = ROOT / "vendor" / "pyfa" / "eos" / "saveddata" / "damagePattern.py"
TARGET_PROFILE_SRC = ROOT / "vendor" / "pyfa" / "eos" / "saveddata" / "targetProfile.py"
PO_PATH = ROOT / "vendor" / "pyfa" / "locale" / "zh_CN" / "LC_MESSAGES" / "lang.po"
OUT = ROOT / "src" / "data" / "patterns.json"

TARGET_FIELDS = ("maxVelocity", "signatureRadius", "radius", "hp")
_GROUP_RE = re.compile(r"\[([^\]]+)\]")


def _eval_name(node):
    """Evaluate a name expression built from _t(), _c(), '+' and literals."""
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
        arg = _eval_name(node.args[0])
        if node.func.id == "_t":
            return arg
        if node.func.id == "_c":
            return "[" + arg + "]"
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Add):
        return _eval_name(node.left) + _eval_name(node.right)
    raise ValueError("unsupported name expression: " + ast.dump(node))


def _eval_int(node):
    if isinstance(node, ast.Constant) and isinstance(node.value, int):
        return node.value
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.USub):
        return -_eval_int(node.operand)
    raise ValueError("not an int literal: " + ast.dump(node))


def _eval_number(node):
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
        return node.value
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.USub):
        return -_eval_number(node.operand)
    raise ValueError("not a number literal: " + ast.dump(node))


def load_builtins(path):
    """Return [(id, display_name, (numbers...))] from a BUILTINS assignment."""
    tree = ast.parse(path.read_text(encoding="utf-8"))
    for node in ast.walk(tree):
        if (
            isinstance(node, ast.Assign)
            and len(node.targets) == 1
            and isinstance(node.targets[0], ast.Name)
            and node.targets[0].id == "BUILTINS"
            and isinstance(node.value, ast.Call)
        ):
            entries = []
            for elt in node.value.args[0].elts:
                key = _eval_int(elt.elts[0])
                values = elt.elts[1].elts
                name = _eval_name(values[0])
                numbers = tuple(_eval_number(v) for v in values[1:])
                entries.append((key, name, numbers))
            return entries
    raise ValueError(f"BUILTINS not found in {path}")


def load_ideal_target(path):
    """Return (0, display_name, (em, thermal, kinetic, explosive,
    maxVelocity, signatureRadius, radius, hp)) from TargetProfile.getIdeal()."""
    tree = ast.parse(path.read_text(encoding="utf-8"))
    for node in ast.walk(tree):
        if isinstance(node, ast.FunctionDef) and node.name == "getIdeal":
            kwargs = {}
            raw_name = None
            target_id = None
            for sub in ast.walk(node):
                if (
                    isinstance(sub, ast.Call)
                    and isinstance(sub.func, ast.Name)
                    and sub.func.id == "cls"
                ):
                    for kw in sub.keywords:
                        if isinstance(kw.value, ast.Constant):
                            kwargs[kw.arg] = kw.value.value
                        else:
                            raise ValueError("unexpected ideal-target value: " + ast.dump(kw.value))
                if isinstance(sub, ast.Assign) and len(sub.targets) == 1:
                    target = sub.targets[0]
                    if isinstance(target, ast.Attribute) and target.attr == "rawName":
                        raw_name = _eval_name(sub.value)
                    if isinstance(target, ast.Attribute) and target.attr == "ID":
                        target_id = _eval_int(sub.value)
            if raw_name is None or target_id is None or not kwargs:
                raise ValueError("could not parse ideal target in getIdeal()")
            numbers = (
                kwargs.get("emAmount", 0),
                kwargs.get("thermalAmount", 0),
                kwargs.get("kineticAmount", 0),
                kwargs.get("explosiveAmount", 0),
                kwargs.get("maxVelocity"),
                kwargs.get("signatureRadius"),
                kwargs.get("radius"),
                kwargs.get("hp"),
            )
            return (target_id, raw_name, numbers)
    raise ValueError(f"getIdeal() not found in {path}")


def load_translations(path):
    """Parse a .po file into {msgid: msgstr}; skips header, fuzzy and plurals."""
    text = path.read_text(encoding="utf-8")
    lines = text.splitlines()
    translations = {}
    i = 0
    n = len(lines)
    while i < n:
        # Collect any comment lines directly above the entry (for fuzzy flag).
        fuzzy = False
        while i < n and lines[i].startswith("#"):
            if lines[i].startswith("#,") and "fuzzy" in lines[i]:
                fuzzy = True
            i += 1
        if i >= n or not lines[i].startswith("msgid "):
            i += 1
            continue
        msgid, i = _read_po_string(lines, i, "msgid")
        if i < n and lines[i].startswith("msgid_plural"):
            # Plural entry: skip it and its msgstr[N] lines.
            _, i = _read_po_string(lines, i, "msgid_plural")
            while i < n and lines[i].startswith("msgstr["):
                _, i = _read_po_string(lines, i, lines[i].split(" ", 1)[0])
            continue
        if i >= n or not lines[i].startswith("msgstr "):
            continue
        msgstr, i = _read_po_string(lines, i, "msgstr")
        if msgid and not fuzzy:
            translations[msgid] = msgstr
    return translations


def _read_po_string(lines, i, keyword):
    """Read a (possibly multi-line) PO string starting at lines[i]."""
    first = lines[i]
    assert first.startswith(keyword + " "), first
    parts = [_po_unquote(first[len(keyword) + 1 :])]
    i += 1
    while i < len(lines) and lines[i].startswith('"'):
        parts.append(_po_unquote(lines[i]))
        i += 1
    return "".join(parts), i


def _po_unquote(quoted):
    # PO strings use C-style escapes; Python literal syntax matches.
    return ast.literal_eval(quoted.strip())


def _leading_groups(text):
    """Return ([groups], rest) for leading '[...]' groups of text."""
    groups = []
    rest = text
    while True:
        match = _GROUP_RE.match(rest)
        if not match:
            return groups, rest
        groups.append(match.group(1))
        rest = rest[match.end() :]


def split_name(display):
    """Split a display string into (category, subcategory, name).

    category: first '[...]' group, or None. subcategory: any further groups
    (before and after '|'), joined with ' / ', or None. name: the remainder.
    """
    head, sep, tail = display.partition("|")
    head_groups, head_rest = _leading_groups(head)
    if sep:
        tail_groups, tail_rest = _leading_groups(tail)
        rest = tail_rest
    else:
        tail_groups, rest = [], head_rest
    groups = head_groups + tail_groups
    category = groups[0] if groups else None
    subcategory = " / ".join(groups[1:]) if len(groups) > 1 else None
    name = rest.strip()
    if not name:
        raise ValueError(f"empty name after splitting {display!r}")
    return category, subcategory, name


def _localize(text, translations):
    if text is None:
        return None
    return {"en": text, "zh": translations.get(text, text)}


def _localize_joined(text, translations):
    """Localize a ' / '-joined string segment by segment."""
    if text is None:
        return None
    en_parts = text.split(" / ")
    zh_parts = [translations.get(part, part) for part in en_parts]
    return {"en": text, "zh": " / ".join(zh_parts)}


def make_entry(entry_id, display, numbers, translations, target=False):
    category, subcategory, name = split_name(display)
    entry = {
        "id": entry_id,
        "category": _localize(category, translations),
        "subcategory": _localize_joined(subcategory, translations),
        "name": _localize(name, translations),
        "em": numbers[0],
        "thermal": numbers[1],
        "kinetic": numbers[2],
        "explosive": numbers[3],
    }
    if target:
        for index, field in enumerate(TARGET_FIELDS):
            entry[field] = numbers[4 + index] if len(numbers) > 4 + index else None
    return entry


def build():
    translations = load_translations(PO_PATH)
    damage = [
        make_entry(entry_id, name, numbers, translations)
        for entry_id, name, numbers in load_builtins(DAMAGE_PATTERN_SRC)
    ]
    profiles = load_builtins(TARGET_PROFILE_SRC)
    ideal_id, ideal_name, ideal_numbers = load_ideal_target(TARGET_PROFILE_SRC)
    targets = [make_entry(ideal_id, ideal_name, ideal_numbers, translations, target=True)]
    targets += [
        make_entry(entry_id, name, numbers, translations, target=True)
        for entry_id, name, numbers in profiles
    ]
    return {"damagePatterns": damage, "targetProfiles": targets}


def main():
    data = build()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(
        f"wrote {OUT} "
        f"({len(data['damagePatterns'])} damage patterns, "
        f"{len(data['targetProfiles'])} target profiles)"
    )


if __name__ == "__main__":
    main()
