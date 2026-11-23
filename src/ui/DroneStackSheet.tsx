import { useState } from 'react'
import { _t } from '../i18n/t'
import { ActionSheet, SheetAction } from './ActionSheet'
import { fmt } from './format'

export function DroneStackSheet({ label, amount, targets, onClose, onSplit, onMerge }: {
  label: string
  amount: number
  targets: { index: number; amount: number; active: number }[]
  onClose: () => void
  onSplit?: (amount: number) => void
  onMerge?: (target: number) => void
}) {
  const [split, setSplit] = useState(String(Math.floor(amount / 2)))
  const quantity = Number(split)
  const valid = Number.isSafeInteger(quantity) && quantity > 0 && quantity < amount
  const title = onSplit ? _t('Split stack') : _t('Merge stacks')
  return <ActionSheet open title={title} onClose={onClose}>
    <div className="fit-section-title" aria-hidden="true"><h3>{title}</h3></div>
    {onSplit ? <form className="fit-inset extra-sheet-form" onSubmit={(event) => {
      event.preventDefault()
      if (valid) onSplit(quantity)
    }}>
      <label>
        <span className="fit-caption">{_t('Quantity to split')}</span>
        <input className="fit-input num extra-quantity" type="number" min={1} max={amount - 1}
          value={split} onChange={(event) => setSplit(event.currentTarget.value)} />
      </label>
      <button className="fit-button primary" type="submit" disabled={!valid}>{title}</button>
    </form> : <div>
      <p className="page-message fit-caption">{_t('Choose the stack to merge into')}</p>
      {targets.map((target) => <SheetAction key={target.index} onClick={() => onMerge?.(target.index)}>
        {label} <span className="num">×{fmt(target.amount)}</span> · {_t('Active')} <span className="num">{fmt(target.active)}</span>
      </SheetAction>)}
    </div>}
  </ActionSheet>
}
