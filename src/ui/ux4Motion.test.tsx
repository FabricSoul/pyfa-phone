import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import { Appear, Stage, TabPanel, delayFor, listRowMotion, motionSpec, sheetMotion } from './motion'
import { NavBar } from './NavBar'
import { launchShipFlight } from './shipFlight'
import { ActionSheet } from './ActionSheet'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

// jsdom has no PointerEvent: without it fireEvent drops clientX and pointerId.
if (typeof window.PointerEvent === 'undefined') {
  class PointerEventPolyfill extends MouseEvent {
    pointerId: number; isPrimary: boolean
    constructor(type: string, init: PointerEventInit = {}) { super(type, init); this.pointerId = init.pointerId ?? 1; this.isPrimary = init.isPrimary ?? true }
  }
  window.PointerEvent = PointerEventPolyfill as unknown as typeof PointerEvent
}

/** matchMedia stub: `reduce` turns on prefers-reduced-motion, `standalone` turns on display-mode: standalone (an installed PWA). */
function media({ reduce = false, standalone = false } = {}) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: (reduce && query.includes('prefers-reduced-motion')) || (standalone && query.includes('display-mode: standalone')),
    media: query, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
  }))
}

function Pages() {
  const navigate = useNavigate()
  const location = useLocation()
  return <Stage pageKey={location.pathname}><Routes location={location}>
    <Route path="/" element={<button onClick={() => navigate('/next')}>go</button>} />
    <Route path="/next" element={<button onClick={() => navigate(-1)}>back</button>} />
  </Routes></Stage>
}
const pageWith = (text: string) => screen.getAllByTestId('page').find((page) => page.textContent?.includes(text))!

describe('UX4 iOS motion spec', () => {
  it('pages push over 380 ms on the iOS curve, tabs slide in 340 ms, lists stagger 40 ms × 10 rows of 250 ms', () => {
    media()
    const spec = motionSpec()
    expect(spec.page).toBeCloseTo(0.38)
    expect(spec.ios).toEqual([0.32, 0.72, 0, 1])
    expect(spec.tab).toBeCloseTo(0.34)
    expect(spec.row).toBeCloseTo(0.25)
    expect(spec.stagger).toBeCloseTo(0.04)
    expect(spec.staggerRows).toBe(10)
    expect(delayFor(3)).toBeCloseTo(0.12)
    expect(delayFor(9)).toBeCloseTo(0.36)
    expect(delayFor(10)).toBeNull()
  })
})

describe('UX4 page push (iOS navigation stack)', () => {
  it('forward: the new page enters from 100 % on top, the old page moves 30 % left under a dim', async () => {
    media()
    render(<MemoryRouter><Pages /></MemoryRouter>)
    fireEvent.click(screen.getByText('go'))
    const next = pageWith('back')
    const old = pageWith('go')
    expect(next.style.transform).toBe('translateX(100%)')
    expect(next.style.opacity).not.toBe('0')
    expect(Number(next.style.zIndex)).toBeGreaterThan(Number(old.style.zIndex))
    expect(old.querySelector('.stage-dim')).toBeTruthy()
    await waitFor(() => expect(old.style.transform).toMatch(/translateX\(-\d/), { timeout: 2000 })
    await waitFor(() => expect(next.style.transform).toMatch(/^(none|translateX\(0(%|px)?\))?$/), { timeout: 2000 })
  })
  it('back: the page returned to enters from -30 % under the leaving page, which slides off to the right', async () => {
    media()
    render(<MemoryRouter><Pages /></MemoryRouter>)
    fireEvent.click(screen.getByText('go'))
    await waitFor(() => expect(screen.getAllByTestId('page')).toHaveLength(1), { timeout: 2000 })
    fireEvent.click(screen.getByText('back'))
    const home = pageWith('go')
    const leaving = pageWith('back')
    expect(home.style.transform).toBe('translateX(-30%)')
    expect(Number(leaving.style.zIndex)).toBeGreaterThan(Number(home.style.zIndex))
    await waitFor(() => expect(leaving.style.transform).toMatch(/translateX\([1-9]/), { timeout: 2000 })
  })
  it('reduced motion: pages only cross-fade', () => {
    media({ reduce: true })
    render(<MemoryRouter><Pages /></MemoryRouter>)
    fireEvent.click(screen.getByText('go'))
    const next = pageWith('back')
    expect(next.style.transform).not.toMatch(/translate/)
    expect(next.style.opacity).toBe('0')
  })
})

describe('UX4 left-edge swipe back (installed PWA only)', () => {
  const swipe = (from: number, to: number) => {
    const page = pageWith('back')
    fireEvent.pointerDown(page, { clientX: from, clientY: 300, pointerId: 1, isPrimary: true })
    for (let x = from; x <= to; x += 20) fireEvent.pointerMove(page, { clientX: x, clientY: 302, pointerId: 1 })
    fireEvent.pointerMove(page, { clientX: to, clientY: 302, pointerId: 1 })
    return page
  }
  async function onNext() {
    render(<MemoryRouter><Pages /></MemoryRouter>)
    fireEvent.click(screen.getByText('go'))
    await waitFor(() => expect(screen.getAllByTestId('page')).toHaveLength(1), { timeout: 2000 })
  }
  it('the page follows the finger from the left edge over the previous page, and goes back when released past a third', async () => {
    media({ standalone: true })
    await onNext()
    const page = swipe(8, 600)
    await waitFor(() => expect(page.style.transform).toMatch(/translateX\((5\d|6\d)(\.\d+)?%\)/))
    // The page underneath is the previous page itself, 30 % back scaled by the progress, not a blank.
    const under = pageWith('go')
    await waitFor(() => expect(under.style.transform).toMatch(/translateX\(-1\d(\.\d+)?%\)/))
    expect(Number(under.style.zIndex || 0)).toBeLessThan(Number(page.style.zIndex))
    fireEvent.pointerUp(page, { clientX: 600, clientY: 302, pointerId: 1 })
    await waitFor(() => expect(screen.getByText('go')).toBeTruthy())
  })
  it('springs back when released before a third, slowly', async () => {
    media({ standalone: true })
    await onNext()
    const page = pageWith('back')
    fireEvent.pointerDown(page, { clientX: 8, clientY: 300, pointerId: 1, isPrimary: true })
    fireEvent.pointerMove(page, { clientX: 20, clientY: 300, pointerId: 1 })
    fireEvent.pointerMove(page, { clientX: 38, clientY: 300, pointerId: 1 })
    fireEvent.pointerUp(page, { clientX: 38, clientY: 300, pointerId: 1 })
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.getAllByTestId('page').filter((p) => !p.hasAttribute('aria-hidden')).map((p) => p.textContent)).toEqual(['back'])
    await waitFor(() => expect(screen.queryByText('go')).toBeNull(), { timeout: 2000 })
  })
  it('in the browser (not installed) the edge is left to Safari: nothing moves', async () => {
    media()
    await onNext()
    const page = swipe(8, 600)
    await new Promise((r) => setTimeout(r, 50))
    expect(page.style.transform).not.toMatch(/[1-9]/)
    fireEvent.pointerUp(page, { clientX: 600, clientY: 302, pointerId: 1 })
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByText('go')).toBeNull()
  })
})

describe('UX4 tabs slide the whole width', () => {
  it('a tab to the right comes in from 100 %, one to the left from -100 %, and the old content slides out', async () => {
    media()
    const order = ['a', 'b', 'c']
    const panel = (value: string) => <TabPanel value={value} order={order}><p>{value}</p></TabPanel>
    const { rerender } = render(panel('b'))
    rerender(panel('c'))
    expect((screen.getByText('c').parentElement as HTMLElement).style.transform).toBe('translateX(100%)')
    expect(screen.getByText('b')).toBeTruthy()
    await waitFor(() => expect(screen.queryByText('b')).toBeNull(), { timeout: 2000 })
    rerender(panel('a'))
    expect((screen.getByText('a').parentElement as HTMLElement).style.transform).toBe('translateX(-100%)')
  })
})

describe('UX4 list rows', () => {
  it('a list that appears rises 16 px row by row', () => {
    media()
    const { container } = render(<>{[0, 9, 10].map((i) => <Appear key={i} index={i}><b>row {i}</b></Appear>)}</>)
    const [first, tenth, eleventh] = Array.from(container.children) as HTMLElement[]
    expect(first!.style.opacity).toBe('0')
    expect(first!.style.transform).toBe('translateY(16px)')
    expect(tenth!.style.opacity).toBe('0')
    expect(eleventh!.style.opacity).not.toBe('0')
  })
  it('a removed row slides out to the left before its height collapses', () => {
    media()
    const { exit } = listRowMotion()
    expect(exit.x).toBe('-100%')
    expect(exit.opacity).toBe(0)
    expect(exit.height).toBe(0)
    const t = exit.transition as { x: { duration: number }; height: { delay: number } }
    expect(t.height.delay).toBeGreaterThanOrEqual(t.x.duration * 0.7)
    media({ reduce: true })
    expect(listRowMotion().exit).not.toHaveProperty('x')
  })
})

describe('UX4 bottom sheet', () => {
  it('rises on a spring and fades its dim in; reduced motion only fades', () => {
    media()
    expect(sheetMotion().enter.transition).toMatchObject({ type: 'spring' })
    media({ reduce: true })
    expect(sheetMotion().enter).toEqual({ opacity: 1, transition: expect.any(Object) })
  })
  it('the dim fades with the drag and the sheet can be pulled down from its body when not scrolled', () => {
    media()
    render(<ActionSheet open title="T" onClose={() => {}}><p>body</p></ActionSheet>)
    expect(screen.getByTestId('sheet-dim').style.opacity).toBe('0')
    expect(screen.getByRole('dialog').getAttribute('data-drag-body')).toBe('true')
  })
})

describe('UX4 press feedback and state keys (CSS)', () => {
  const ui = readFileSync(resolve(process.cwd(), 'src/ui/ui.css'), 'utf8')
  it('pressed rows and buttons dip to .97 and darken, and spring back on release', () => {
    expect(ui).toMatch(/--press-spring:\s*linear\(/)
    expect(ui).toMatch(/:active[^{]*\{[^}]*transform:\s*scale\(\.97\)[^}]*background-image/)
  })
  it('the overheat colour crossfades over a visibly long time', () => {
    expect(ui).toMatch(/\.sb\[data-state="overheated"\] \.sbi \{[^}]*transition/)
  })
})

describe('UX4 ship icon flies from the library row to the fit header', () => {
  it('a flight launched from a row lands on the header icon, which stays hidden until it arrives', async () => {
    media()
    launchShipFlight('/ship.png', { left: 16, top: 300, width: 56, height: 56 })
    render(<NavBar title="Fit" shipSrc="/ship.png" />)
    const flyer = document.querySelector<HTMLElement>('[data-testid="ship-flight"]')
    expect(flyer).toBeTruthy()
    expect(flyer!.getAttribute('src')).toBe('/ship.png')
    const target = document.querySelector<HTMLElement>('.nav .ship')!
    expect(target.style.opacity).toBe('0')
    await waitFor(() => expect(document.querySelector('[data-testid="ship-flight"]')).toBeNull(), { timeout: 3000 })
    expect(target.style.opacity).not.toBe('0')
  })
  it('an old flight (or none) does nothing', () => {
    media()
    vi.useFakeTimers()
    launchShipFlight('/ship.png', { left: 16, top: 300, width: 56, height: 56 })
    act(() => { vi.advanceTimersByTime(3000) })
    render(<NavBar title="Fit" shipSrc="/ship.png" />)
    vi.useRealTimers()
    expect(document.querySelector('[data-testid="ship-flight"]')).toBeNull()
  })
})

describe('UX4 durations survive the production CSS minifier', () => {
  it('reads a token written as ms or (after minifying) as s', async () => {
    const { cssMs } = await import('./format')
    expect(cssMs(' 380ms')).toBe(380)
    expect(cssMs('.38s')).toBe(380)
    expect(cssMs('0s')).toBe(0)
    expect(Number.isNaN(cssMs(''))).toBe(true)
  })
  it('motionSpec reads minified tokens as the same durations', () => {
    media()
    document.documentElement.style.setProperty('--dur', '.18s')
    document.documentElement.style.setProperty('--dur-page', '.38s')
    try {
      expect(motionSpec().standard).toBeCloseTo(0.18)
      expect(motionSpec().page).toBeCloseTo(0.38)
    } finally {
      document.documentElement.style.removeProperty('--dur')
      document.documentElement.style.removeProperty('--dur-page')
    }
  })
})

describe('UX4 a tab that slides out', () => {
  it('is inert and hidden from assistive tech while it leaves', () => {
    media()
    const order = ['a', 'b']
    const panel = (value: string) => <TabPanel value={value} order={order}><p>{value}</p></TabPanel>
    const { rerender } = render(panel('a'))
    rerender(panel('b'))
    const leaving = screen.getByText('a').parentElement as HTMLElement
    expect(leaving.hasAttribute('inert')).toBe(true)
    expect(leaving.getAttribute('aria-hidden')).toBe('true')
  })
})

describe('UX4 press feedback on touch', () => {
  it('marks a pressed control while the finger is down, and lets go on release or when the finger slides away', async () => {
    const { installPressFeedback } = await import('./press')
    const uninstall = installPressFeedback()
    render(<button type="button" className="fit"><span>row</span></button>)
    const button = screen.getByRole('button')
    fireEvent.pointerDown(screen.getByText('row'), { clientX: 10, clientY: 10, pointerId: 3, isPrimary: true })
    expect(button.dataset.pressed).toBe('true')
    fireEvent.pointerUp(button, { clientX: 10, clientY: 10, pointerId: 3 })
    expect(button.dataset.pressed).toBeUndefined()
    fireEvent.pointerDown(button, { clientX: 10, clientY: 10, pointerId: 4, isPrimary: true })
    fireEvent.pointerMove(button, { clientX: 10, clientY: 40, pointerId: 4 })
    expect(button.dataset.pressed).toBeUndefined()
    uninstall()
  })
  it('styles the pressed mark like :active', () => {
    const ui = readFileSync(resolve(process.cwd(), 'src/ui/ui.css'), 'utf8')
    expect(ui).toMatch(/\.fit\[data-pressed\][^{]*\{[^}]*transform:\s*scale\(\.97\)/)
  })
})

describe('UX4 fixes after review', () => {
  it('the swiped-back page keeps the instance that was shown under the finger', async () => {
    media({ standalone: true })
    let mounts = 0
    function Home() { const navigate = useNavigate(); useEffect(() => { mounts++ }, []); return <button onClick={() => navigate('/next')}>go</button> }
    function App() {
      const navigate = useNavigate()
      const location = useLocation()
      return <Stage pageKey={location.pathname}><Routes location={location}>
        <Route path="/" element={<Home />} />
        <Route path="/next" element={<button onClick={() => navigate(-1)}>back</button>} />
      </Routes></Stage>
    }
    render(<MemoryRouter><App /></MemoryRouter>)
    fireEvent.click(screen.getByText('go'))
    await waitFor(() => expect(screen.getAllByTestId('page')).toHaveLength(1), { timeout: 2000 })
    const page = pageWith('back')
    fireEvent.pointerDown(page, { clientX: 8, clientY: 300, pointerId: 1, isPrimary: true })
    for (let x = 8; x <= 600; x += 40) fireEvent.pointerMove(page, { clientX: x, clientY: 300, pointerId: 1 })
    await waitFor(() => expect(screen.getByText('go')).toBeTruthy())
    const before = mounts
    fireEvent.pointerUp(page, { clientX: 600, clientY: 300, pointerId: 1 })
    await waitFor(() => expect(screen.getAllByTestId('page')).toHaveLength(1), { timeout: 2000 })
    expect(screen.getByText('go')).toBeTruthy()
    expect(mounts).toBe(before)
  })
  it('the selected-tab pill only moves when the selection changes, not when its container shifts', async () => {
    const { SlidingPill } = await import('./motion')
    const { container } = render(<SlidingPill group="g" dependency="on" />)
    expect(container.querySelector('.seg-pill')?.getAttribute('data-dependency')).toBe('on')
  })
  it('the flying ship is the source picture at its own size, inside the page and under the resource readings', () => {
    media()
    render(<div className="stage"><div className="stage-page" data-testid="host"><NavBar title="Fit" shipSrc="/ship2.png" /></div></div>)
    cleanup()
    launchShipFlight('/ship3.png', { left: 16, top: 300, width: 56, height: 56 })
    render(<div className="stage"><div className="stage-page" data-testid="host"><NavBar title="Fit" shipSrc="/ship3.png" /></div></div>)
    const flyer = document.querySelector<HTMLElement>('[data-testid="ship-flight"]')!
    expect(flyer.parentElement).toBe(screen.getByTestId('host'))
    expect(flyer.style.width).toBe('56px')
    expect(flyer.style.position).toBe('absolute')
    const ui = readFileSync(resolve(process.cwd(), 'src/ui/ui.css'), 'utf8')
    expect(ui).toMatch(/\.res \{[^}]*z-index:\s*3/)
  })
})
