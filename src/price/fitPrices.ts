import { useEffect, useState } from 'react'
import type { CalcResult } from '../engine/types'
import type { PriceItem } from '../settings/settings'
import { getPrices } from './price'

type PriceItems = CalcResult['priceItems']
type Stack = PriceItems['ship'][number]
type Quotes = Record<number, number | null>

export function usePriceQuotes(stacks: Stack[]): Quotes | undefined {
  const ids = [...new Set(stacks.map(({ typeId }) => typeId))].sort((a, b) => a - b).join(',')
  const [loaded, setLoaded] = useState<{ ids: string; quotes: Quotes }>()
  useEffect(() => {
    if (!ids) return
    let current = true
    // The timer lets React finish rendering and deduplicates the initial StrictMode effect.
    const timer = setTimeout(() => {
      void getPrices(ids.split(',').map(Number)).then(
        (quotes) => { if (current) setLoaded({ ids, quotes }) },
        () => { if (current) setLoaded({ ids, quotes: {} }) },
      )
    }, 0)
    return () => { current = false; clearTimeout(timer) }
  }, [ids])
  return loaded?.ids === ids ? loaded.quotes : undefined
}

export function totalPriceItems(items: PriceItems, included: PriceItem[]): Stack[] {
  return [
    ...items.ship, ...items.modules, ...items.loadedCharges,
    ...(included.includes('drones') ? [...items.drones, ...items.fighters] : []),
    ...(included.includes('cargo') ? items.cargo : []),
    ...(included.includes('implants') ? [...items.implants, ...items.boosters] : []),
  ]
}

export function priceTotal(items: Stack[], quotes?: Quotes): number | null | undefined {
  if (!quotes) return undefined
  let total = 0
  for (const { typeId, quantity } of items) {
    const quote = quotes[typeId]
    if (quote == null) return null
    total += quote * quantity
  }
  return total
}
