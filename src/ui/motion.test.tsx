import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AnimatePresence } from 'motion/react'
import { useEffect } from 'react'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { Appear, Expand, ExpandItem, Reveal, RollingNumber, Stage, TabPanel, delayFor, motionSpec, sheetMotion } from './motion'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

function reduced(on: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: on && query.includes('prefers-reduced-motion'), media: query, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
  }))
}

describe('motion spec', () => {
  it('takes durations from the tokens: fast 120 ms, standard 180 ms, bar 270 ms, roll 300 ms, stagger 40 ms × 10 rows (UX4)', () => {
    reduced(false)
    const spec = motionSpec()
    expect(spec.fast).toBeCloseTo(0.12)
    expect(spec.standard).toBeCloseTo(0.18)
    expect(spec.bar).toBeCloseTo(0.27)
    expect(spec.roll).toBeCloseTo(0.3)
    expect(spec.ease).toEqual([0.2, 0, 0, 1])
    expect(spec.stagger).toBeCloseTo(0.04)
    expect(spec.staggerRows).toBe(10)
  })
  it('keeps only short fades under reduced motion', () => {
    reduced(true)
    const spec = motionSpec()
    expect(spec.reduce).toBe(true)
    expect(spec.standard).toBeLessThanOrEqual(0.1)
    expect(spec.roll).toBe(0)
  })
  it('staggers 40 ms per row and stops after 10 rows', () => {
    reduced(false)
    expect(delayFor(0)).toBe(0)
    expect(delayFor(3)).toBeCloseTo(0.12)
    expect(delayFor(9)).toBeCloseTo(0.36)
    expect(delayFor(10)).toBeNull()
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
  it('fades a row in with its stagger delay, but only the first 10 rows animate', () => {
    reduced(false)
    const { container } = render(<>{[0, 10].map((i) => <Appear key={i} index={i}><b>row {i}</b></Appear>)}</>)
    expect((container.children[0] as HTMLElement).style.opacity).toBe('0')
    expect((container.children[1] as HTMLElement).style.opacity).not.toBe('0')
  })
})

describe('Expand (rows and panels open and close by height)', () => {
  it('shows nothing while closed and does not animate a body that is open on first render', () => {
    reduced(false)
    const closed = render(<Expand open={false}><p>body</p></Expand>)
    expect(screen.queryByText('body')).toBeNull()
    closed.unmount()
    render(<Expand open><p>body</p></Expand>)
    expect((screen.getByText('body').parentElement as HTMLElement).style.height).not.toBe('0px')
  })
  it('opens from zero height and keeps the body until the 120 ms close has finished', async () => {
    reduced(false)
    const { rerender } = render(<Expand open={false}><p>body</p></Expand>)
    rerender(<Expand open><p>body</p></Expand>)
    const wrapper = screen.getByText('body').parentElement as HTMLElement
    expect(wrapper.style.height).toBe('0px')
    expect(wrapper.style.overflow).toBe('hidden')
    rerender(<Expand open={false}><p>body</p></Expand>)
    expect(screen.queryByText('body')).toBeTruthy()
    await waitFor(() => expect(screen.queryByText('body')).toBeNull(), { timeout: 2000 })
  })
  it('only fades, without changing height, under reduced motion', () => {
    reduced(true)
    const { rerender } = render(<Expand open={false}><p>body</p></Expand>)
    rerender(<Expand open><p>body</p></Expand>)
    const wrapper = screen.getByText('body').parentElement as HTMLElement
    expect(wrapper.style.height).not.toBe('0px')
    expect(wrapper.style.opacity).toBe('0')
  })
  it('a row added to a list grows in, and a row taken out collapses before it leaves', async () => {
    reduced(false)
    const list = (rows: string[]) => <AnimatePresence initial={false}>{rows.map((row) => <ExpandItem key={row}><span>{row}</span></ExpandItem>)}</AnimatePresence>
    const { rerender } = render(list(['a']))
    expect((screen.getByText('a').parentElement as HTMLElement).style.height).not.toBe('0px')
    rerender(list(['a', 'b']))
    expect((screen.getByText('b').parentElement as HTMLElement).style.height).toBe('0px')
    rerender(list(['a']))
    expect(screen.queryByText('b')).toBeTruthy()
    await waitFor(() => expect(screen.queryByText('b')).toBeNull(), { timeout: 2000 })
  })
})

describe('Stage (route enter, leave and return)', () => {
  function Pages() {
    const navigate = useNavigate()
    const location = useLocation()
    return <Stage pageKey={location.pathname}><Routes location={location}>
      <Route path="/" element={<button onClick={() => navigate('/next')}>go</button>} />
      <Route path="/next" element={<><button onClick={() => navigate(-1)}>back</button><button onClick={() => navigate('/', { state: { back: true } })}>home</button></>} />
    </Routes></Stage>
  }
  it('does not animate the first page, pushes the next one in from the right edge, and returns the other way (UX4)', async () => {
    reduced(false)
    render(<MemoryRouter><Pages /></MemoryRouter>)
    expect(screen.getByTestId('page').getAttribute('data-motion')).toBe('none')
    fireEvent.click(screen.getByText('go'))
    const next = screen.getAllByTestId('page').find((page) => page.textContent?.includes('back'))!
    expect(next.getAttribute('data-motion')).toBe('push')
    expect(next.style.transform).toBe('translateX(100%)')
    await waitFor(() => expect(screen.getAllByTestId('page')).toHaveLength(1), { timeout: 2000 })
    fireEvent.click(screen.getByText('back'))
    const back = screen.getAllByTestId('page').find((page) => page.textContent?.includes('go'))!
    expect(back.getAttribute('data-motion')).toBe('back')
    expect(back.style.transform).toBe('translateX(-30%)')
  })
  it('a link with state.back (an in-app back button) also enters from the left', async () => {
    reduced(false)
    render(<MemoryRouter><Pages /></MemoryRouter>)
    fireEvent.click(screen.getByText('go'))
    await waitFor(() => expect(screen.getAllByTestId('page')).toHaveLength(1), { timeout: 2000 })
    fireEvent.click(screen.getByText('home'))
    expect(screen.getAllByTestId('page').find((page) => page.textContent?.includes('go'))!.getAttribute('data-motion')).toBe('back')
  })
  it('keeps the page that leaves on screen, inert, until it has faded out', async () => {
    reduced(false)
    render(<MemoryRouter><Pages /></MemoryRouter>)
    fireEvent.click(screen.getByText('go'))
    const pages = screen.getAllByTestId('page')
    expect(pages).toHaveLength(2)
    const leaving = pages.find((page) => page.textContent === 'go')!
    expect(leaving.hasAttribute('inert')).toBe(true)
    expect(leaving.getAttribute('aria-hidden')).toBe('true')
    await waitFor(() => expect(screen.getAllByTestId('page')).toHaveLength(1), { timeout: 2000 })
  })
  it('only fades under reduced motion', () => {
    reduced(true)
    render(<MemoryRouter><Pages /></MemoryRouter>)
    fireEvent.click(screen.getByText('go'))
    const next = screen.getAllByTestId('page').find((page) => page.textContent?.includes('back'))!
    expect(next.style.opacity).toBe('0')
    expect(next.style.transform).not.toMatch(/translate/)
  })
  it('pages that share a key stay mounted', () => {
    reduced(false)
    let mounts = 0
    function Probe() { useEffect(() => { mounts++ }, []); return <i /> }
    function Shared() {
      const navigate = useNavigate()
      return <Stage pageKey="same"><Probe /><button onClick={() => navigate('/x')}>x</button></Stage>
    }
    render(<MemoryRouter><Shared /></MemoryRouter>)
    fireEvent.click(screen.getByText('x'))
    expect(mounts).toBe(1)
  })
})

describe('TabPanel and Reveal', () => {
  it('slides a new tab in from the side it sits on, and does not animate the first tab', () => {
    reduced(false)
    const order = ['a', 'b', 'c']
    const panel = (value: string) => <TabPanel value={value} order={order}><p>{value}</p></TabPanel>
    const { rerender } = render(panel('b'))
    expect((screen.getByText('b').parentElement as HTMLElement).style.transform).not.toMatch(/translate/)
    rerender(panel('c'))
    expect((screen.getByText('c').parentElement as HTMLElement).style.transform).toBe('translateX(100%)')
  })
  it('Reveal starts transparent and ends opaque', async () => {
    reduced(false)
    render(<Reveal><p>x</p></Reveal>)
    const el = screen.getByText('x').parentElement as HTMLElement
    expect(el.style.opacity).toBe('0')
    await waitFor(() => expect(el.style.opacity).toBe('1'), { timeout: 2000 })
  })
})

describe('sheet motion', () => {
  it('rises on a spring and leaves in 280 ms (UX4); reduced motion only fades', () => {
    reduced(false)
    const motion = sheetMotion()
    expect(motion.enter).toEqual({ y: 0, transition: expect.objectContaining({ type: 'spring' }) })
    expect(motion.exit).toEqual({ y: '100%', transition: expect.objectContaining({ duration: expect.closeTo(0.28, 5) }) })
    reduced(true)
    expect(sheetMotion().enter).toEqual({ opacity: 1, transition: expect.any(Object) })
  })
})
