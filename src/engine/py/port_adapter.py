"""Adapt the headless pyfa text formats to the type-ID based FitDoc contract."""

import re
from collections import Counter
from contextlib import contextmanager

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


class PortAdapter:
    def __init__(self, engine, names):
        self.engine = engine
        self.ids = {name.casefold(): type_id for lang in ('zh', 'en')
                    for name, type_id in names[lang].items()}

    @contextmanager
    def _indexed_names(self):
        from service.port import eft

        fetch = eft.fetchItem

        def lookup(name, eagerCat=False):
            type_id = self.ids.get(name.strip().casefold())
            if type_id is not None:
                return self.engine.market.getItem(type_id, eager='group.category' if eagerCat else None)
            # The native parser also has a map of renamed items.
            return fetch(name, eagerCat=eagerCat)

        eft.fetchItem = lookup
        try:
            yield lookup
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
        return {
            'schema': 1, 'dataVersion': self.engine.data_version, 'name': fit.name,
            'shipTypeId': fit.shipID, 'modules': modules,
            'drones': [{'typeId': d.item.ID, 'amount': d.amount, 'active': d.amountActive}
                       for d in fit.drones],
            'cargo': [{'typeId': c.item.ID, 'amount': c.amount} for c in fit.cargo],
            'implants': [i.item.ID for i in fit.implants],
            'boosters': [b.item.ID for b in fit.boosters],
            'notes': '', 'character': 'all5', 'damagePatternId': -1, 'targetProfileId': None,
        }

    def _unparsed_eft(self, lines, fit, lookup):
        modules = [m for m in fit.modules if m.item and m.slot in self.engine.slot_of]
        fitted = Counter(m.item.ID for m in modules)
        for collection in (fit.drones, fit.cargo, fit.implants, fit.boosters):
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

    def import_text(self, text):
        from service.port import dna, eft

        lines = [line.strip() for line in text.removeprefix('\ufeff').strip().splitlines()]
        if not lines:
            return {'fits': [], 'warnings': []}

        if _HEADER.fullmatch(lines[0]):
            fits, warnings = [], []
            starts = [i for i, line in enumerate(lines) if _HEADER.fullmatch(line)] + [len(lines)]
            with self._indexed_names() as lookup:
                for first, last in zip(starts, starts[1:]):
                    block = lines[first:last]
                    try:
                        fit = eft.importEft(block.copy())
                    except (AttributeError, IndexError, TypeError, ValueError):
                        fit = None
                    if fit is None or fit.isStructure:
                        warnings += [line for line in block if line]
                        continue
                    fits.append(self._doc(fit))
                    warnings += self._unparsed_eft(block[1:], fit, lookup)
            return {'fits': fits, 'warnings': warnings}

        if len(lines) == 1:
            fit = self._import_dna(lines[0], dna)
            if fit is not None and not fit.isStructure:
                return {'fits': [self._doc(fit)], 'warnings': []}
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
                if not 0 < count <= 2**31 - 1:
                    return None
                item = self.engine.item(int(type_id))
                if item.category.name not in ('Charge', 'Drone', 'Fighter'):
                    module_count += count
                    if module_count > 256:
                        return None
            return parse(value, fitName=link['name'] if link else None)
        except (ValueError, AttributeError, IndexError, OverflowError):
            return None

    def export_text(self, fit, fmt, language):
        from service.const import PortDnaOptions, PortEftOptions, PortMultiBuyOptions
        from service.port.dna import exportDna
        from service.port.eft import exportEft
        from service.port.multibuy import exportMultiBuy

        if fmt == 'dna':
            return exportDna(fit, {PortDnaOptions.FORMATTING: False}, None)
        if fmt == 'eft':
            text = exportEft(fit, {option: option != PortEftOptions.MUTATIONS for option in PortEftOptions}, None)
        elif fmt == 'multibuy':
            options = {option: option != PortMultiBuyOptions.OPTIMIZE_PRICES for option in PortMultiBuyOptions}
            text = exportMultiBuy(fit, options, None)
        else:
            raise ValueError(f'Unsupported fitting export format: {fmt}')

        if language == 'zh':
            def translate(name):
                return self.engine.zh.get(self.ids.get(name.casefold())) or name

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
        return text
