// pyfa msgids the upcoming stats screens will use, listed here so they stay in locale/lang.pot
// (and get pyfa's translations from the compendium) before those screens exist.
// Delete an entry once a real component calls _t() with it. Nothing imports this module.
import { _t } from './t'

export const seedMessages = (): string[] => [
  _t('Firepower'),
  _t('%d attribute.', '%d attributes.', 0),
]
