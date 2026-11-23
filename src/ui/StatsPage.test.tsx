import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import merlin from '../engine/fixtures/merlin.json'
import rifter from '../engine/fixtures/rifter.json'
import { CalcResultSchema } from '../engine/types'
import { StatsPage } from './StatsPage'

afterEach(cleanup)

const stable = CalcResultSchema.parse(merlin)
const unstable = CalcResultSchema.parse(rifter)

describe('StatsPage capacitor', () => {
  it('uses the normal colour when stable', () => {
    const cap = { ...stable.stats.capacitor, stable: true, stablePercent: 49.2, lastsSeconds: null }
    render(<StatsPage result={{ ...stable, stats: { ...stable.stats, capacitor: cap } }} />)
    const status = screen.getByTestId('cap-status')
    expect(status.textContent).toContain('49.2')
    expect(status.className).not.toContain('warn')
    expect(status.dataset.warn).toBe('false')
  })

  it('uses the warning colour when it runs dry', () => {
    render(<StatsPage result={unstable} />)
    const status = screen.getByTestId('cap-status')
    expect(unstable.stats.capacitor.stable).toBe(false)
    expect(status.className).toContain('warn')
  })

  it('panels collapse on click', () => {
    render(<StatsPage result={unstable} />)
    const head = screen.getByRole('button', { name: /Capacitor/ })
    expect(head.getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(head)
    expect(head.getAttribute('aria-expanded')).toBe('false')
  })
})
