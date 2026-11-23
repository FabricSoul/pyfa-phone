import { AnimatePresence, animate, motion, useIsPresent, useMotionValue, type MotionValue } from 'motion/react'
import { NavigationType, UNSAFE_NavigationContext, useLocation, useNavigate, useNavigationType } from 'react-router-dom'
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { cssMs, motionTokens } from './format'

const msToken = (name: string, fallback: number) => {
  if (typeof document === 'undefined') return fallback
  const ms = cssMs(getComputedStyle(document.documentElement).getPropertyValue(name))
  return Number.isFinite(ms) ? ms / 1000 : fallback
}
const curveToken = (name: string, fallback: [number, number, number, number]) => {
  if (typeof document === 'undefined') return fallback
  const pts = /cubic-bezier\(([^)]+)\)/.exec(getComputedStyle(document.documentElement).getPropertyValue(name))?.[1]?.split(',').map(Number)
  return pts && pts.length === 4 && pts.every(Number.isFinite) ? pts as [number, number, number, number] : fallback
}

/** Every duration and curve of the motion system, from the tokens (--dur, --dur-fast, --ease and the UX4 --dur-page, --dur-tab,
 *  --dur-row, --stagger, --ease-ios). UX4 makes motion as visible as a native iOS app: pages push the full width, tabs slide the full width. */
export function motionSpec() {
  const { duration, fast, ease } = motionTokens()
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  return {
    standard: duration,
    fast,
    /** Resource bars: one and a half standard steps. */
    bar: duration * 1.5,
    /** Numbers (DPS, EHP, resources) always roll for 300 ms; reduced motion snaps. */
    roll: reduce ? 0 : 0.3,
    ease,
    /** UIKit's navigation curve. */
    ios: curveToken('--ease-ios', [0.32, 0.72, 0, 1]),
    /** Page push / pop; under reduced motion a short cross-fade. */
    page: reduce ? duration : msToken('--dur-page', 0.38),
    /** Tab content slide. */
    tab: reduce ? duration : msToken('--dur-tab', 0.34),
    /** One row of a list that appears. */
    row: reduce ? duration : msToken('--dur-row', 0.25),
    stagger: reduce ? 0 : msToken('--stagger', 0.04),
    staggerRows: 10,
    /** Bottom sheet spring. */
    spring: { type: 'spring' as const, stiffness: 400, damping: 36, mass: 1 },
    reduce,
  }
}

/** Delay of the nth row of a list that appears for the first time; null once past the 10th row. */
export function delayFor(index: number): number | null {
  const { stagger, staggerRows, reduce } = motionSpec()
  return reduce || index >= staggerRows ? null : index * stagger
}

/** A row of a list that appears for the first time rises 16 px and fades in over 250 ms, 40 ms after the row above, for the first 10 rows. */
export function Appear({ index, children, className }: { index: number; children: ReactNode; className?: string }) {
  const [delay] = useState(() => delayFor(index))
  if (delay === null) return <>{children}</>
  const { row, ios, reduce } = motionSpec()
  return <motion.div className={className} initial={{ opacity: 0, y: reduce ? 0 : 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: row, ease: ios, delay }}>{children}</motion.div>
}

/** A number that rolls to its new value over 300 ms and flashes the accent colour while it does. */
export function RollingNumber({ value, format, className = '' }: { value: number; format: (n: number) => string; className?: string }) {
  const [shown, setShown] = useState(value)
  const [rolling, setRolling] = useState(false)
  const current = useRef(value)
  useEffect(() => {
    if (current.current === value) return
    const { roll, ease } = motionSpec()
    if (roll === 0) { current.current = value; setShown(value); return }
    setRolling(true)
    const controls = animate(current.current, value, {
      duration: roll, ease,
      onUpdate: (n) => { current.current = n; setShown(n) },
      onComplete: () => { current.current = value; setShown(value); setRolling(false) },
    })
    return () => controls.stop()
  }, [value])
  return <span data-testid="rolling" data-value={value} data-rolling={rolling} className={`roll ${className}`.trim()}>{format(shown)}</span>
}

const heightMotion = () => {
  const { standard, ease, reduce } = motionSpec()
  return reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1, transition: { duration: standard, ease } }, exit: { opacity: 0, transition: { duration: standard, ease } } }
    : {
      initial: { height: 0, opacity: 0 },
      animate: { height: 'auto', opacity: 1, transition: { duration: standard * 1.5, ease } },
      exit: { height: 0, opacity: 0, transition: { duration: standard, ease } },
    }
}

/** A row added to a list (a module, a drone, an implant) grows from zero height and fades in; a row taken out slides out to
 *  the left first and then closes its gap. Reduced motion only fades. */
export function listRowMotion() {
  const { standard, ios, reduce } = motionSpec()
  if (reduce) return { initial: { opacity: 0 }, animate: { opacity: 1, transition: { duration: standard } }, exit: { opacity: 0, transition: { duration: standard } } }
  return {
    initial: { height: 0, opacity: 0, x: 0 },
    animate: { height: 'auto', opacity: 1, x: 0, transition: { height: { duration: 0.3, ease: ios }, opacity: { duration: 0.3, delay: 0.06 } } },
    exit: {
      x: '-100%', opacity: 0, height: 0,
      transition: { x: { duration: 0.26, ease: ios }, opacity: { duration: 0.26 }, height: { delay: 0.22, duration: 0.22, ease: ios } },
    },
  }
}

/** One row (or panel body) that opens from zero height. Place it inside an `AnimatePresence initial={false}`.
 *  `leave="slide"` (list rows) slides the row out to the left before it collapses; panels (the default) just close. */
export function ExpandItem({ children, className, as = 'div', leave = 'collapse' }: { children: ReactNode; className?: string; as?: 'div' | 'li'; leave?: 'collapse' | 'slide' }) {
  const Tag = as === 'li' ? motion.li : motion.div
  return <Tag className={`xi ${className ?? ''}`.trim()} style={{ overflow: 'hidden' }} {...(leave === 'slide' ? listRowMotion() : heightMotion())}>{children}</Tag>
}

/** Shows `children` while `open`, opening and closing by height. Open on first render means no animation. */
export function Expand({ open, children, className }: { open: boolean; children: ReactNode; className?: string }) {
  return <AnimatePresence initial={false}>{open && <ExpandItem key="body" className={className}>{children}</ExpandItem>}</AnimatePresence>
}

/** Which way the page just navigated: forward (push), back (history pop or a `state.back` link). */
export type NavKind = 'none' | 'push' | 'back'
const shown = new WeakSet<object>()
/** How dark the page under a pushed page gets (black at this opacity), as in UIKit. */
const UNDER_DIM = 0.12
/** How far left the page under a pushed page moves. */
const UNDER_SHIFT = 30
/** Width of the left edge a swipe back starts in. */
const EDGE = 20

/** The latest navigation of a stage: pages that leave read it to know which way to go. */
const StageNow = createContext<NavKind>('none')

/** An installed PWA has no browser back gesture, so the app provides one; in Safari the edge belongs to Safari. */
const standalone = () => typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches === true
  || (navigator as Navigator & { standalone?: boolean }).standalone === true)

interface Entry { key: string; kind: NavKind; from: number }
/** Motion values a swipe drives directly: the page's offset and its dim. */
interface Drive { x: MotionValue<string>; dim: MotionValue<number> }

/** One page of a stage. The page that is leaving is inert (not clickable, hidden from assistive tech) while it moves away.
 *  A `preview` page is the previous page shown under a swipe back: the swipe moves it, nothing animates it. */
function StageItem({ entry, preview, onDrive, children }: { entry: Entry; preview?: boolean; onDrive: (drive: Drive, preview: boolean) => void; children: ReactNode }) {
  const present = useIsPresent()
  const now = useContext(StageNow)
  const { page, ios, reduce } = motionSpec()
  const { kind, from } = entry
  const x = useMotionValue(kind === 'push' && !reduce ? '100%' : kind === 'back' && !reduce ? `${from}%` : '0%')
  const dim = useMotionValue(kind === 'back' && !reduce ? UNDER_DIM * (-from / UNDER_SHIFT) : 0)
  useLayoutEffect(() => { if (present) onDrive({ x, dim }, Boolean(preview)) }, [present, preview, x, dim, onDrive])
  const transition = { duration: page, ease: ios }
  // Forward: the new page lies on top; back: the page that leaves lies on top and uncovers the one returned to.
  // The first page of a stage is not lifted at all, so what it holds (the resource readings) can layer with the rest of the app.
  const z = present ? (kind === 'push' ? 2 : kind === 'back' ? 1 : undefined) : (now === 'back' ? 3 : 0)
  const initial = kind === 'none' ? false : reduce ? { opacity: 0 } : { x: kind === 'push' ? '100%' : `${from}%` }
  const exit = reduce ? { opacity: 0, transition } : { x: now === 'back' ? '100%' : `-${UNDER_SHIFT}%`, transition }
  return <motion.div data-testid="page" data-motion={kind} className="stage-page" inert={!present || preview} aria-hidden={present && !preview ? undefined : true}
    style={{ x, zIndex: z }} initial={initial} animate={preview ? undefined : { x: '0%', opacity: 1, transition }} exit={exit}>
    {children}
    <motion.div className="stage-dim" aria-hidden="true" style={{ opacity: dim }}
      animate={preview ? undefined : { opacity: !present && now === 'push' && !reduce ? UNDER_DIM : 0, transition }} />
  </motion.div>
}

/** Route stage, as UIKit's navigation stack: a pushed page slides in from the right edge over 380 ms while the page under it
 *  moves 30 % left and darkens; going back reverses it. Both pages are on screen the whole time and either can be interrupted.
 *  In an installed PWA a swipe from the left edge drags the page back over the previous page (past a third of the width or a
 *  flick goes back; the page shown under the finger becomes the page, it is not mounted again).
 *  Pages sharing a key keep their state (the fit workspace). The first page of a router does not move; reduced motion cross-fades.
 *  Hand it a frozen `<Routes location>` / outlet so the leaving page keeps its content. */
export function Stage({ pageKey, children }: { pageKey: string; children: ReactNode }) {
  const location = useLocation()
  const type = useNavigationType()
  const navigate = useNavigate()
  const router = useContext(UNSAFE_NavigationContext).navigator
  const current = useRef<Entry>(undefined)
  // The pages under this one, each with the element it was last drawn with (a frozen `<Routes location>`), so a swipe back can show it.
  const stack = useRef<{ key: string; element: ReactNode }[]>([])
  const drawn = useRef<ReactNode>(children)
  const swiped = useRef(0)
  const drives = useRef<{ page?: Drive; preview?: Drive }>({})
  const root = useRef<HTMLDivElement>(null)
  const [preview, setPreview] = useState<{ key: string; element: ReactNode } | null>(null)
  if (current.current?.key !== pageKey) {
    const back = type === NavigationType.Pop || (location.state as { back?: boolean } | null)?.back === true
    // The first page of the router, or of a nested stage, does not move.
    const kind: NavKind = !shown.has(router) || !current.current ? 'none' : back ? 'back' : 'push'
    if (current.current && kind === 'push') stack.current.push({ key: current.current.key, element: drawn.current })
    if (kind === 'back') {
      const at = stack.current.map((item) => item.key).lastIndexOf(pageKey)
      stack.current = at >= 0 ? stack.current.slice(0, at) : stack.current.slice(0, -1)
    }
    // A page returned to by a swipe starts where the swipe left it, not 30 % back.
    current.current = { key: pageKey, kind, from: -UNDER_SHIFT * (1 - swiped.current) }
    swiped.current = 0
  }
  drawn.current = children
  const entry = current.current
  useEffect(() => { shown.add(router) }, [router])
  // A preview that became the page (the swipe went back) is no longer a preview.
  useEffect(() => { if (preview && preview.key === pageKey) setPreview(null) }, [preview, pageKey])
  const onDrive = useCallback((drive: Drive, isPreview: boolean) => { drives.current[isPreview ? 'preview' : 'page'] = drive }, [])

  const edge = useRef(false)
  const [edgeOn] = useState(standalone)
  function onPointerDown(event: ReactPointerEvent) {
    const native = event.nativeEvent as PointerEvent & { stageClaimed?: boolean }
    // The innermost stage with a page to go back to takes the gesture.
    const under = stack.current.at(-1)
    if (native.stageClaimed || !edgeOn || event.isPrimary === false || event.clientX > EDGE || !under || edge.current) return
    native.stageClaimed = true
    const page = drives.current.page
    if (!page) return
    const start = { x: event.clientX, y: event.clientY }
    const width = root.current?.clientWidth || window.innerWidth
    let dragging = false
    let last = { x: event.clientX, t: performance.now() }
    let velocity = 0
    let progress = 0
    edge.current = true
    const follow = () => {
      page.x.set(`${progress * 100}%`)
      const below = drives.current.preview
      if (below) { below.x.set(`${-UNDER_SHIFT * (1 - progress)}%`); below.dim.set(UNDER_DIM * (1 - progress)) }
    }
    const move = (e: PointerEvent) => {
      const dx = e.clientX - start.x
      if (!dragging) {
        if (Math.abs(dx) < 8 && Math.abs(e.clientY - start.y) < 8) return
        if (dx <= 0 || Math.abs(e.clientY - start.y) > Math.abs(dx)) { end(); return }
        dragging = true
        drives.current.preview = undefined
        setPreview(under)
      }
      const t = performance.now()
      if (t > last.t) velocity = (e.clientX - last.x) / (t - last.t)
      last = { x: e.clientX, t }
      progress = Math.max(0, dx) / width
      follow()
    }
    // The preview mounts a frame after the drag starts: place it as soon as it is there.
    const placed = () => { if (dragging && edge.current) { follow(); requestAnimationFrame(placed) } }
    const up = (e: PointerEvent) => {
      end()
      if (!dragging) return
      const dx = Math.max(0, e.clientX - start.x)
      if (dx > width / 3 || (dx > 40 && velocity > 0.5)) {
        swiped.current = Math.min(1, dx / width)
        navigate(-1)
      } else {
        void animate(page.x, '0%', { type: 'spring', stiffness: 500, damping: 45 })
        setPreview(null)
      }
    }
    const cancel = () => { end(); if (dragging) { void animate(page.x, '0%', { type: 'spring', stiffness: 500, damping: 45 }); setPreview(null) } }
    function end() {
      edge.current = false
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    requestAnimationFrame(placed)
  }

  const showPreview = preview && preview.key !== pageKey
  return <div className="stage" ref={root} data-edge-swipe={edgeOn || undefined} onPointerDown={onPointerDown}>
    <StageNow.Provider value={entry.kind}>
      {/* Both pages share one grid cell (ui.css), so the leaving page stays laid over the entering one. */}
      <AnimatePresence initial={false}>
        {showPreview && <StageItem key={preview.key} entry={{ key: preview.key, kind: 'back', from: -UNDER_SHIFT }} preview onDrive={onDrive}>{preview.element}</StageItem>}
        <StageItem key={pageKey} entry={entry} onDrive={onDrive}>{children}</StageItem>
      </AnimatePresence>
    </StageNow.Provider>
  </div>
}

/** Fades content in over 180 ms when it replaces a skeleton or a different panel (opacity only). `x` adds a short slide. */
export function Reveal({ children, className, x = 0 }: { children: ReactNode; className?: string; x?: number }) {
  const { standard, ease, reduce } = motionSpec()
  return <motion.div className={className} initial={{ opacity: 0, x: reduce ? 0 : x }} animate={{ opacity: 1, x: 0 }} transition={{ duration: standard, ease }}>{children}</motion.div>
}

const TabNow = createContext(1)

function TabItem({ dir, className, children }: { dir: number; className?: string; children: ReactNode }) {
  const now = useContext(TabNow)
  const present = useIsPresent()
  const { tab, ios, reduce } = motionSpec()
  const transition = { duration: tab, ease: ios }
  // The tab that slides out cannot be tapped and is hidden from assistive tech, as a page that leaves.
  return <motion.div className={`tab-page ${className ?? ''}`.trim()} inert={!present} aria-hidden={present ? undefined : true}
    initial={reduce ? { opacity: 0 } : { x: `${dir * 100}%` }} animate={{ x: '0%', opacity: 1, transition }}
    exit={reduce ? { opacity: 0, transition } : { x: `${-now * 100}%`, transition }}>{children}</motion.div>
}

/** The body of a tab strip: the whole content slides sideways, a tab to the right coming in from the right edge while the old
 *  content leaves to the left (340 ms, iOS curve), and the other way round. Content that arrives after a skeleton (`ready` turns
 *  true) fades in without sliding. Keyed by `value`; the first render is still. */
export function TabPanel({ value, order, ready = true, children }: { value: string; order: readonly string[]; ready?: boolean; children: ReactNode }) {
  const previous = useRef({ value, ready })
  const dir = useRef(1)
  const arrived = useRef(false)
  if (previous.current.value !== value) {
    dir.current = order.indexOf(value) >= order.indexOf(previous.current.value) ? 1 : -1
    arrived.current = false
  } else if (!previous.current.ready && ready) {
    arrived.current = true
  }
  previous.current = { value, ready }
  // Content arriving after a skeleton fades in by a CSS animation: nothing remounts, so state and DOM nodes stay.
  return <div className="tab-stage"><TabNow.Provider value={dir.current}>
    <AnimatePresence initial={false}>
      <TabItem key={value} dir={dir.current} className={arrived.current ? 'reveal-in' : undefined}>{children}</TabItem>
    </AnimatePresence>
  </TabNow.Provider></div>
}

/** The selected-tab backdrop of a segmented control: springs between buttons with a shared layout (transform only). */
export function SlidingPill({ group, dependency }: { group: string; dependency?: string }) {
  const { standard, ease, reduce } = motionSpec()
  // Only a change of selection moves the pill: when the control itself shifts (a sheet growing above it), the pill goes with it
  // instead of trailing behind on its spring.
  return <motion.span layoutId={`pill-${group}`} layoutDependency={dependency} data-dependency={dependency} className="seg-pill" aria-hidden="true"
    transition={reduce ? { duration: standard, ease } : { type: 'spring', stiffness: 520, damping: 38 }} />
}

/** Bottom sheet: rises from below on a spring and leaves in 280 ms on the iOS curve; reduced motion only fades. */
export function sheetMotion() {
  const { standard, ease, ios, spring, reduce } = motionSpec()
  return reduce
    ? { from: { opacity: 0 }, enter: { opacity: 1, transition: { duration: standard, ease } }, exit: { opacity: 0, transition: { duration: standard, ease } } }
    : {
      from: { y: '100%' },
      enter: { y: 0, transition: spring },
      exit: { y: '100%', transition: { duration: 0.28, ease: ios } },
    }
}
