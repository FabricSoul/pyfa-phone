import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
  it('shows the three steps with real byte counts', () => {
    boot('data', progress)
    const steps = screen.getAllByRole('listitem')
    expect(steps.length).toBe(3)
    expect(steps[0]!.getAttribute('data-step')).toBe('done')
    expect(within(steps[0]!).getByText('17 MB')).toBeTruthy()
    expect(steps[1]!.getAttribute('data-step')).toBe('now')
    expect(within(steps[1]!).getByText('11.0 / 17.7 MB')).toBeTruthy()
    expect(within(steps[1]!).getByRole('progressbar').getAttribute('aria-valuenow')).toBe('62')
    expect(steps[2]!.getAttribute('data-step')).toBe('todo')
  })
  it('names the first launch download; nothing else is offered, the whole app waits for the engine (UX4)', () => {
    boot('runtime')
    expect(screen.getByText(/The first launch downloads about 35 MB/)).toBeTruthy()
    expect(screen.queryByRole('link')).toBeNull()
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

describe('UX4 boot page: capacitor ring', () => {
  it('draws a capacitor of 3 rings × 30 cells that light by real download bytes, smoothly, with the percentage in the centre', async () => {
    const { container } = boot('data', progress)
    const cells = container.querySelectorAll('.cap-cell')
    expect(cells.length).toBe(90)
    // 28 of 34.7 MB → 81 % → 24 of 30 columns, three cells each, once the smoothing settles.
    expect(container.querySelectorAll('.cap-cell[data-on="true"]').length).toBeLessThan(72)
    await waitFor(() => {
      expect(container.querySelectorAll('.cap-cell[data-on="true"]').length).toBe(72)
      expect(screen.getByTestId('boot-percent').textContent).toBe('81%')
    }, { timeout: 4000 })
    expect(screen.getByTestId('boot-bytes').textContent).toBe('28.0 / 34.7 MB')
  })
  it('lists the stages with checks and fades the current one in a status line', () => {
    boot('initialize', progress)
    const steps = screen.getAllByRole('listitem')
    expect(steps.map((step) => step.getAttribute('data-step'))).toEqual(['done', 'done', 'now'])
    expect(screen.getByTestId('boot-status').textContent).toBe('Starting the pyfa engine')
  })
  it('draws drifting stars on a dark ground', () => {
    const { container } = boot('runtime')
    expect(container.querySelector('.boot')?.getAttribute('data-appearance')).toBe('dark')
    expect(container.querySelector('.boot-stars')).toBeTruthy()
  })
  it('flashes the whole ring once when the engine is ready', () => {
    const { container } = render(<MemoryRouter><EngineBoot stage="initialize" progress={progress} complete /></MemoryRouter>)
    expect(container.querySelector('.cap')?.getAttribute('data-complete')).toBe('true')
    expect(container.querySelectorAll('.cap-cell[data-on="true"]').length).toBe(90)
  })
  it('shows a failure in the same style with a retry button', () => {
    const retry = vi.fn()
    render(<MemoryRouter><EngineBoot stage="data" progress={progress} failed onRetry={retry} /></MemoryRouter>)
    expect(screen.getByRole('alert').textContent).toMatch(/Could not start the fitting engine/)
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(retry).toHaveBeenCalled()
  })
})

describe('UX4 boot page: cached start (source from PERF1, optional)', () => {
  it('says it is loading from this device and shows no download sizes when the source is the cache', () => {
    const cached = { ...progress, source: 'cache' as const }
    const { container } = boot('data', cached)
    expect(screen.getByTestId('boot-status').textContent).toBe('Loading from this device…')
    expect(screen.queryByTestId('boot-bytes')).toBeNull()
    expect(container.textContent).not.toMatch(/MB/)
    expect(screen.getByTestId('boot-percent')).toBeTruthy()
  })
  it('treats a missing source as a download', () => {
    boot('data', progress)
    expect(screen.getByTestId('boot-status').textContent).toBe('Game data')
    expect(screen.getByTestId('boot-bytes')).toBeTruthy()
  })
})
