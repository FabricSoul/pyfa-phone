"""Adapt the headless pyfa text formats to the type-ID based FitDoc contract."""

import re
from collections import Counter
from contextlib import contextmanager
from xml.dom import minidom
from xml.parsers.expat import ExpatError

from engine import SLOT_KINDS, STATE_NAMES

_HEADER = re.compile(r'^\[([^,\]]+),\s*(.*)\]$')
_EMPTY = re.compile(r'^\[Empty .* slot\]$', re.IGNORECASE)
# Capture names separately from loaded-charge, stack count and state syntax.
_EFT_ROW = re.compile(
    r'^([^,\[\]/]+?)(?:,\s*([^,\[\]/]+?))?(\s+(?:x[0-9]+|/OFFLINE))?$',
    re.IGNORECASE,
)
_DNA = re.compile(r'(?<!\d)(\d+(?::[0-9]+(?:;[0-9]+)?)*::)(?!:)')
_DNA_LINK = re.compile(r'<url=fitting:(?P<dna>[^>]+)>(?P<name>[^<>]+)</url>', re.IGNORECASE)
_ALT_DNA = re.compile(r'\d+(?::[0-9]+(?:\*[0-9]+)?)*:?')
# Match pyfa's XML declaration detection and accept a fittings element copied without it.
_XML_START = re.compile(r'<(?:\?xml\s|fittings(?:\s|/?>))')
_MAX_STACK = 2**31 - 1


class PortAdapter:
    def __init__(self, engine, names):
        self.engine = engine
        self.ids = {}
        for lang in ('zh', 'en'):
            for name, candidates in names[lang].items():
                self.ids.setdefault(name.casefold(), set()).update(candidates)

    @contextmanager
    def _indexed_names(self):
        from service.port import eft

        fetch = eft.fetchItem
        ambiguous = {}

        def lookup(name, eagerCat=False):
            candidates = self.ids.get(name.strip().casefold(), ())
            if len(candidates) > 1:
                ambiguous[name] = sorted(candidates)
                return None
            if candidates:
                return self.engine.market.getItem(next(iter(candidates)), eager='group.category' if eagerCat else None)
            # The native parser also has a map of renamed items.
            return fetch(name, eagerCat=eagerCat)

        eft.fetchItem = lookup
        try:
            yield lookup, ambiguous
        finally:
            eft.fetchItem = fetch

    def _doc(self, fit):
        modules = {k: [] for k in SLOT_KINDS}
        for mod in fit.modules:
            slot = self.engine.slot_of.get(mod.slot)
            if slot is not None:
                modules[slot].append(None if mod.isEmpty else {
                    'typeId': mod.item.ID, 'state': STATE_NAMES[int(mod.state)],
                    'chargeTypeId': mod.charge.ID if mod.charge else None,
                })
        for rack in modules.values():
            while rack and rack[-1] is None:
                rack.pop()
        doc = {
            'schema': 1, 'dataVersion': self.engine.data_version, 'clientBuild': self.engine.client_build,
            'name': fit.name,
            'shipTypeId': fit.shipID, 'modules': modules,
            **({'modeTypeId': fit.mode.item.ID} if fit.mode is not None else {}),
            'drones': [{'typeId': d.item.ID, 'amount': d.amount, 'active': d.amountActive}
                       for d in fit.drones],
            'fighters': [{'typeId': f.item.ID, 'amount': f.amount, 'active': f.active}
                         for f in fit.fighters],
            'cargo': [{'typeId': c.item.ID, 'amount': c.amount} for c in fit.cargo],
            'implants': [i.item.ID for i in fit.implants],
            'boosters': [b.item.ID for b in fit.boosters],
            'notes': fit.notes or '', 'character': 'all5', 'damagePatternId': -1, 'targetProfileId': None,
        }
        doc['itemNames'] = self.engine.item_names(doc)
        return doc

    def _unparsed_eft(self, lines, fit, lookup):
        modules = [m for m in fit.modules if m.item and m.slot in self.engine.slot_of]
        fitted = Counter(m.item.ID for m in modules)
        for collection in (fit.drones, fit.fighters, fit.cargo, fit.implants, fit.boosters):
            for entry in collection:
                fitted[entry.item.ID] += getattr(entry, 'amount', 1)
        fitted_charges = Counter((m.item.ID, m.charge.ID) for m in modules if m.charge)
        warnings = []
        for line in lines:
            if not line or _EMPTY.fullmatch(line):
                continue
            match = _EFT_ROW.fullmatch(line)
            if match:
                name, charge, _ = match.groups()
                item = lookup(name)
                if item is not None and fitted[item.ID] > 0:
                    fitted[item.ID] -= 1
                    if not charge:
                        continue
                    ammo = lookup(charge)
                    if ammo is not None and fitted_charges[item.ID, ammo.ID] > 0:
                        fitted_charges[item.ID, ammo.ID] -= 1
                        continue
            warnings.append(line)
        return warnings

    def _eft_mode(self, block, lookup):
        from eos.saveddata.ship import Ship

        ship = lookup(_HEADER.fullmatch(block[0])[1], eagerCat=True)
        if ship is None or (ship.group.name != 'Tactical Destroyer' and ship.name != 'Anhinga'):
            return block, None
        modes = {name.casefold(): item for item in Ship(ship).modeItems
                 for name in self.engine.lname(item).values()}
        for index, line in enumerate(block[1:], start=1):
            mode = modes.get(line.casefold())
            if mode is not None:
                return block[:index] + block[index + 1:], mode
        return block, None

    def _ambiguities(self, ambiguous):
        return [{'name': name, 'candidates': [
            {'typeId': type_id, 'name': self.engine.item(type_id).name} for type_id in ids
        ]} for name, ids in ambiguous.items()]

    def _import_xml(self, text):
        from service.port import Port
        from service.port.xml import importXml

        # EVE/pyfa export a description, but minimal fitting XML can omit it.
        # Reject document types before parsing since fittings do not use them.
        if '<!DOCTYPE' in text:
            return []
        with minidom.parseString(text) as document:
            if document.documentElement.tagName != 'fittings':
                return []
            for element in document.getElementsByTagName('fitting'):
                if not element.getElementsByTagName('description'):
                    element.appendChild(document.createElement('description'))
            # The headless desktop Port stand-in has no preference for description tags.
            if not hasattr(Port, 'is_tag_replace'):
                Port.is_tag_replace = staticmethod(lambda: True)
            return importXml(document.toxml(), None)

    def import_text(self, text):
        from service.port import dna, eft

        text = text.removeprefix('\ufeff').strip()
        lines = [line.strip() for line in text.splitlines()]
        if not lines:
            return {'fits': [], 'warnings': []}

        if _XML_START.match(lines[0]) or lines[0].startswith('{'):
            is_xml = bool(_XML_START.match(lines[0]))
            try:
                if is_xml:
                    parsed = self._import_xml(text)
                else:
                    from service.port.esi import importESI

                    parsed = [importESI(text)]
                fits = [self._doc(fit) for fit in parsed if fit is not None and not fit.isStructure]
            except (ExpatError, AttributeError, KeyError, TypeError, ValueError, OverflowError):
                fits = []
            if fits:
                return {'format': 'XML' if is_xml else 'ESI', 'fits': fits, 'warnings': []}

        if _HEADER.fullmatch(lines[0]):
            fits, warnings = [], []
            starts = [i for i, line in enumerate(lines) if _HEADER.fullmatch(line)] + [len(lines)]
            with self._indexed_names() as (lookup, ambiguous):
                for first, last in zip(starts, starts[1:]):
                    block = lines[first:last]
                    try:
                        block, mode = self._eft_mode(block, lookup)
                        fit = eft.importEft(block.copy())
                    except (AttributeError, IndexError, TypeError, ValueError):
                        fit = None
                    if fit is None or fit.isStructure:
                        warnings += [line for line in block if line]
                        continue
                    if mode is not None:
                        fit.mode = fit.ship.validateModeItem(mode)
                    fits.append(self._doc(fit))
                    warnings += self._unparsed_eft(block[1:], fit, lookup)
            return {'format': 'EFT', 'fits': fits, 'warnings': warnings,
                    'ambiguities': self._ambiguities(ambiguous)}

        if len(lines) == 1:
            fit = self._import_dna(lines[0], dna)
            if fit is not None and not fit.isStructure:
                return {'format': 'DNA', 'fits': [self._doc(fit)], 'warnings': []}
        return {'fits': [], 'warnings': [line for line in lines if line]}

    def _import_dna(self, raw, dna):
        link = _DNA_LINK.search(raw)
        standard = _DNA.fullmatch(link['dna'] if link else raw)
        alternative = raw.removeprefix('DNA:').strip()
        if standard:
            value, separator, parse = standard[1], ';', dna.importDna
        elif _ALT_DNA.fullmatch(alternative) and (':' in raw or raw.startswith('DNA:')):
            value, separator, parse = alternative, '*', dna.importDnaAlt
        else:
            return None

        # The native parser expands quantities into Module objects. Bound that work before
        # handing it the text, while allowing large stacks for ammo, drones and fighters.
        module_count = 0
        try:
            for part in value.rstrip(':').split(':')[1:]:
                type_id, _, quantity = part.partition(separator)
                count = int(quantity or '1')
                if not 0 < count <= _MAX_STACK:
                    return None
                item = self.engine.item(int(type_id))
                if item.category.name not in ('Charge', 'Drone', 'Fighter'):
                    module_count += count
                    if module_count > 256:
                        return None
            return parse(value, fitName=link['name'] if link else None)
        except (ValueError, AttributeError, IndexError, OverflowError):
            return None

    def import_additions(self, text, destination):
        from service.port.eft import NAME_CHARS, lineIter

        if destination not in ('cargo', 'drones'):
            raise ValueError('Unsupported additions destination')
        row_pattern = re.compile(rf'^({NAME_CHARS}+?)(?: x([0-9]+))?$', re.IGNORECASE)
        stacks, drones, warnings = Counter(), [], []
        with self._indexed_names() as (lookup, ambiguous):
            for line in lineIter(text.removeprefix('\ufeff')):
                row = row_pattern.fullmatch(line)
                name, amount = row.groups() if row else ('', None)
                # Strip leading zeroes and cap the digits before calling int on pasted text.
                quantity = (amount or '1').lstrip('0')
                count = int(quantity) if 0 < len(quantity) <= 10 else 0
                item = lookup(name) if name and count > 0 else None
                if (item is None or (destination == 'drones' and not item.isDrone)
                        or item.isAbyssal or stacks[item.ID] + count > _MAX_STACK):
                    warnings.append(line)
                    continue
                if destination == 'drones':
                    drones.append({'typeId': item.ID, 'amount': count})
                else:
                    stacks[item.ID] += count
        items = drones if destination == 'drones' else [
            {'typeId': type_id, 'amount': amount} for type_id, amount in stacks.items()
        ]
        return {'items': items, 'warnings': warnings, 'ambiguities': self._ambiguities(ambiguous)}

    def export_text(self, fit, fmt, language, eft_options=None):
        from service.const import PortDnaOptions, PortEftOptions, PortMultiBuyOptions
        from service.port.dna import exportDna
        from service.port.eft import exportEft
        from service.port.multibuy import exportMultiBuy

        if fmt == 'dna':
            return exportDna(fit, {PortDnaOptions.FORMATTING: False}, None)
        if fmt == 'eft':
            eft_options = eft_options or {}
            options = {
                PortEftOptions.LOADED_CHARGES: eft_options.get('charges', True),
                PortEftOptions.CARGO: eft_options.get('cargo', True),
                PortEftOptions.IMPLANTS: eft_options.get('implants', True),
                PortEftOptions.BOOSTERS: eft_options.get('boosters', True),
                PortEftOptions.MUTATIONS: False,
            }
            text = exportEft(fit, options, None)
        elif fmt == 'multibuy':
            options = {option: option != PortMultiBuyOptions.OPTIMIZE_PRICES for option in PortMultiBuyOptions}
            text = exportMultiBuy(fit, options, None)
        else:
            raise ValueError(f'Unsupported fitting export format: {fmt}')

        if language == 'zh':
            def translate(name):
                candidates = self.ids.get(name.casefold(), ())
                if len(candidates) == 1:
                    type_id = next(iter(candidates))
                    zh = self.engine.zh.get(type_id)
                    if zh and self.ids.get(zh.casefold()) == {type_id}:
                        return zh
                return name

            def localize(line):
                header = _HEADER.fullmatch(line)
                if header:
                    return f'[{translate(header[1])}, {header[2]}]'
                row = _EFT_ROW.fullmatch(line)
                if row:
                    name, charge, suffix = row.groups()
                    return translate(name) + (f', {translate(charge)}' if charge else '') + (suffix or '')
                return line

            text = '\n'.join(map(localize, text.split('\n')))
        if fmt == 'eft' and fit.mode is not None:
            mode_name = self.engine.lname(fit.mode.item)['zh' if language == 'zh' else 'en']
            text = f"{text.rstrip()}\n\n{mode_name}"
        return text
