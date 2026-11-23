import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Appear, RollingNumber, delayFor, motionSpec } from './motion'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

function reduced(on: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: on && query.includes('prefers-reduced-motion'), media: query, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
  }))
}

describe('motion spec', () => {
  it('takes durations from the tokens: fast 120 ms, standard 180 ms, bar 270 ms, roll 300 ms, stagger 30 ms × 8 rows', () => {
    reduced(false)
    const spec = motionSpec()
    expect(spec.fast).toBeCloseTo(0.12)
    expect(spec.standard).toBeCloseTo(0.18)
    expect(spec.bar).toBeCloseTo(0.27)
    expect(spec.roll).toBeCloseTo(0.3)
    expect(spec.ease).toEqual([0.2, 0, 0, 1])
    expect(spec.stagger).toBeCloseTo(0.03)
    expect(spec.staggerRows).toBe(8)
  })
  it('keeps only short fades under reduced motion', () => {
    reduced(true)
    const spec = motionSpec()
    expect(spec.reduce).toBe(true)
    expect(spec.standard).toBeLessThanOrEqual(0.1)
    expect(spec.roll).toBe(0)
  })
  it('staggers 30 ms per row and stops after 8 rows', () => {
    reduced(false)
    expect(delayFor(0)).toBe(0)
    expect(delayFor(3)).toBeCloseTo(0.09)
    expect(delayFor(7)).toBeCloseTo(0.21)
    expect(delayFor(8)).toBeNull()
    expect(delayFor(40)).toBeNull()
  })
})

describe('RollingNumber', () => {
  const fmt = (n: number) => n.toFixed(1)
  it('shows the first value at once', () => {
    reduced(false)
    render(<RollingNumber value={132.3} format={fmt} />)
    expect(screen.getByText('132.3').getAttribute('data-value')).toBe('132.3')
  })
  it('rolls to a new value over 300 ms instead of jumping, and ends exactly on it', async () => {
    reduced(false)
    const { rerender } = render(<RollingNumber value={100} format={fmt} />)
    rerender(<RollingNumber value={200} format={fmt} />)
    const el = screen.getByTestId('rolling')
    expect(el.getAttribute('data-value')).toBe('200')
    expect(el.textContent).not.toBe('200.0')
    await waitFor(() => expect(el.textContent).toBe('200.0'), { timeout: 2000 })
  })
  it('jumps straight to the new value under reduced motion, without the accent flash', async () => {
    reduced(true)
    const { rerender } = render(<RollingNumber value={100} format={fmt} />)
    act(() => { rerender(<RollingNumber value={200} format={fmt} />) })
    expect(screen.getByTestId('rolling').getAttribute('data-rolling')).toBe('false')
    await waitFor(() => expect(screen.getByTestId('rolling').textContent).toBe('200.0'), { timeout: 500 })
  })
})

describe('Appear', () => {
  it('fades a row in with its stagger delay, but only the first 8 rows animate', () => {
    reduced(false)
    const { container } = render(<>{[0, 8].map((i) => <Appear key={i} index={i}><b>row {i}</b></Appear>)}</>)
    expect((container.children[0] as HTMLElement).style.opacity).toBe('0')
    expect((container.children[1] as HTMLElement).style.opacity).not.toBe('0')
  })
})
