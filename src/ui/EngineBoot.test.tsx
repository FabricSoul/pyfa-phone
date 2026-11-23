import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setUiLanguage } from '../i18n/t'
import type { EngineProgress } from '../engine/progress'
import { EngineBar, EngineBoot, formatMb } from './EngineBoot'

beforeEach(async () => { await setUiLanguage('en_US') })
afterEach(cleanup)
const MB = 1024 * 1024
const progress: EngineProgress = {
  runtime: { loaded: 17 * MB, total: 17 * MB },
  data: { loaded: 11 * MB, total: 17.7 * MB },
}
const boot = (stage: 'runtime' | 'data' | 'initialize', p?: EngineProgress) =>
  render(<MemoryRouter><EngineBoot stage={stage} progress={p} /></MemoryRouter>)

describe('EngineBoot (load.html ①)', () => {
  it('formats sizes in MB with one decimal, dropping a trailing .0', () => {
    expect(formatMb(11 * MB)).toBe('11 MB')
    expect(formatMb(17.7 * MB)).toBe('17.7 MB')
  })
  it('shows the pyfa icon with a spinning ring and the three steps with real byte counts', () => {
    const { container } = boot('data', progress)
    expect(container.querySelector('.boot-logo img')?.getAttribute('src')).toBe('/img/gui/pyfa.png')
    expect(container.querySelector('.boot-ring')).toBeTruthy()
    const steps = screen.getAllByRole('listitem')
    expect(steps.length).toBe(3)
    expect(steps[0]!.getAttribute('data-step')).toBe('done')
    expect(within(steps[0]!).getByText('17 MB')).toBeTruthy()
    expect(steps[1]!.getAttribute('data-step')).toBe('now')
    expect(within(steps[1]!).getByText('11.0 / 17.7 MB')).toBeTruthy()
    expect(within(steps[1]!).getByRole('progressbar').getAttribute('aria-valuenow')).toBe('62')
    expect(steps[2]!.getAttribute('data-step')).toBe('todo')
  })
  it('names the first launch download and tells you the list and settings already work, with a way to the list', () => {
    boot('runtime')
    expect(screen.getByText(/Fittings list, settings and backups work right now/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Browse fittings first' }).getAttribute('href')).toBe('/')
    expect(screen.getByRole('heading', { level: 1, name: 'Preparing the fitting engine' })).toBeTruthy()
  })
})

describe('EngineBar (load.html ② floating bar)', () => {
  it('names the step and its percentage', () => {
    render(<EngineBar stage="data" progress={progress} />)
    const bar = screen.getByRole('status')
    expect(bar.textContent).toContain('Starting engine · Game data 62%')
  })
  it('has no percentage while the engine initializes', () => {
    render(<EngineBar stage="initialize" progress={progress} />)
    expect(screen.getByRole('status').textContent).not.toMatch(/%/)
  })
})
