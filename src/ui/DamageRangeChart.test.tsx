import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import rifter from '../engine/fixtures/rifter.json'
import { CalcResultSchema } from '../engine/types'
import { DamageRangeChart } from './DamageRangeChart'

afterEach(cleanup)
const curve = CalcResultSchema.parse(rifter).rangeCurve

it('M6 summarises the chart in a sentence and offers a collapsed data table', () => {
  render(<DamageRangeChart curve={curve} />)
  const chart = screen.getByRole('img')
  const summaryId = chart.getAttribute('aria-describedby')!
  expect(summaryId).toBeTruthy()
  expect(document.getElementById(summaryId)!.textContent).toMatch(/peaks at .* DPS/)
  const details = screen.getByText('Data table').closest('details')!
  expect(details.open).toBe(false)
  const table = within(details).getByRole('table', { hidden: true })
  expect(within(table).getAllByRole('row', { hidden: true }).length).toBe(curve.distancesKm.length + 1)
})
