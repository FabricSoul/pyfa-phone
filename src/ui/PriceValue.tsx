import { _t } from '../i18n/t'
import { fmt } from './format'

export function PriceValue({ value }: { value: number | null | undefined }) {
  if (value === undefined) return _t('Updating prices…')
  if (value === null) return '—'
  return <>{fmt(value, 0)} {_t('ISK')}</>
}
