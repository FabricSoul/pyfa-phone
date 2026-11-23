import { AnimatePresence, animate, motion, useIsPresent } from 'motion/react'
import { NavigationType, UNSAFE_NavigationContext, useLocation, useNavigationType } from 'react-router-dom'
import { useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { motionTokens } from './format'

/** Every duration and curve of the motion system (motion.html), derived from the tokens: --dur, --dur-fast, --ease. */
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
    stagger: reduce ? 0 : 0.03,
    staggerRows: 8,
    reduce,
  }
}

/** Delay of the nth row of a list that appears for the first time; null once past the 8th row. */
export function delayFor(index: number): number | null {
  const { stagger, staggerRows, reduce } = motionSpec()
  return reduce || index >= staggerRows ? null : index * stagger
}

/** Fades a row in, staggered 30 ms per row, for the first 8 rows only. */
export function Appear({ index, children, className }: { index: number; children: ReactNode; className?: string }) {
  const [delay] = useState(() => delayFor(index))
  if (delay === null) return <>{children}</>
  const { standard, ease } = motionSpec()
  return <motion.div className={className} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: standard, ease, delay }}>{children}</motion.div>
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
  const { standard, fast, ease, reduce } = motionSpec()
  return reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1, transition: { duration: standard, ease } }, exit: { opacity: 0, transition: { duration: standard, ease } } }
    : {
      initial: { height: 0, opacity: 0 },
      animate: { height: 'auto', opacity: 1, transition: { duration: standard, ease } },
      exit: { height: 0, opacity: 0, transition: { duration: fast, ease } },
    }
}

/** One row (or panel body) that opens from zero height in 180 ms and closes in 120 ms. Place it inside an `AnimatePresence initial={false}`. */
export function ExpandItem({ children, className, as = 'div' }: { children: ReactNode; className?: string; as?: 'div' | 'li' }) {
  const Tag = as === 'li' ? motion.li : motion.div
  return <Tag className={`xi ${className ?? ''}`.trim()} style={{ overflow: 'hidden' }} {...heightMotion()}>{children}</Tag>
}

/** Shows `children` while `open`, opening and closing by height. Open on first render means no animation. */
export function Expand({ open, children, className }: { open: boolean; children: ReactNode; className?: string }) {
  return <AnimatePresence initial={false}>{open && <ExpandItem key="body" className={className}>{children}</ExpandItem>}</AnimatePresence>
}

/** Which way the page just navigated: forward (push), back (history pop or a `state.back` link). */
export type NavKind = 'none' | 'push' | 'back'
const shown = new WeakSet<object>()

/** One page of a stage. The page that is leaving is inert (not clickable, hidden from assistive tech) while it fades. */
function StageItem({ kind, children }: { kind: NavKind; children: ReactNode }) {
  const present = useIsPresent()
  const { standard, fast, ease, reduce } = motionSpec()
  const slide = reduce ? 0 : 24
  return <motion.div data-testid="page" data-motion={kind} className="stage-page" inert={!present} aria-hidden={present ? undefined : true}
    custom={kind}
    initial={kind === 'none' ? false : { opacity: 0, x: kind === 'back' ? -slide : slide }} animate={{ opacity: 1, x: 0, transition: { duration: kind === 'back' ? fast : standard, ease } }}
    // Forward: the old page drifts 12 px left; back: it leaves to the right. Both fade in 120 ms.
    exit={{ opacity: 0, x: kind === 'back' ? slide : -slide / 2, transition: { duration: fast, ease } }}>{children}</motion.div>
}

/** Route stage: the page keyed `pageKey` slides in 24 px from the right with a fade (180 ms); a page returned to comes from the left (120 ms),
 *  and the page that leaves fades out in 120 ms at the same time. Pages sharing a key keep their state (the fit workspace).
 *  The first page of a router and reduced motion do not slide. Hand it a frozen `<Routes location>` / outlet so the leaving page keeps its content. */
export function Stage({ pageKey, children }: { pageKey: string; children: ReactNode }) {
  const location = useLocation()
  const type = useNavigationType()
  const router = useContext(UNSAFE_NavigationContext).navigator
  const current = useRef<{ key: string; kind: NavKind }>(undefined)
  if (current.current?.key !== pageKey) {
    const back = type === NavigationType.Pop || (location.state as { back?: boolean } | null)?.back === true
    current.current = { key: pageKey, kind: !shown.has(router) ? 'none' : back ? 'back' : 'push' }
  }
  const { kind } = current.current
  useEffect(() => { shown.add(router) }, [router])
  return <div className="stage">
    <AnimatePresence mode="popLayout" initial={false} custom={kind}>
      <StageItem key={pageKey} kind={kind}>{children}</StageItem>
    </AnimatePresence>
  </div>
}

/** Fades content in over 180 ms when it replaces a skeleton or a different panel (opacity only). `x` adds a short slide. */
export function Reveal({ children, className, x = 0 }: { children: ReactNode; className?: string; x?: number }) {
  const { standard, ease, reduce } = motionSpec()
  return <motion.div className={className} initial={{ opacity: 0, x: reduce ? 0 : x }} animate={{ opacity: 1, x: 0 }} transition={{ duration: standard, ease }}>{children}</motion.div>
}

/** The body of a tab strip: a new tab's content fades in, sliding 12 px from the side it sits on; content that arrives after
 *  a skeleton (`ready` turns true) fades in without sliding. Keyed by `value`; the first render is still. */
export function TabPanel({ value, order, ready = true, children }: { value: string; order: readonly string[]; ready?: boolean; children: ReactNode }) {
  const previous = useRef({ value, ready })
  const motionOf = useRef<number | undefined>(undefined)
  const epoch = useRef(0)
  const arrived = useRef(false)
  if (previous.current.value !== value) {
    motionOf.current = order.indexOf(value) >= order.indexOf(previous.current.value) ? 12 : -12
    epoch.current++
  } else if (!previous.current.ready && ready) {
    arrived.current = true
  }
  previous.current = { value, ready }
  // Content arriving after a skeleton fades in by a CSS animation: nothing remounts, so state and DOM nodes stay.
  return motionOf.current === undefined ? <div className={arrived.current ? 'reveal-in' : undefined}>{children}</div> : <Reveal key={epoch.current} x={motionOf.current}>{children}</Reveal>
}

/** The selected-tab backdrop of a segmented control: slides between buttons with a shared layout (transform only). */
export function SlidingPill({ group }: { group: string }) {
  const { standard, ease } = motionSpec()
  return <motion.span layoutId={`pill-${group}`} className="seg-pill" aria-hidden="true" transition={{ duration: standard, ease }} />
}

/** Bottom sheet: up with a slight overshoot (1.5 × standard), down in 1.5 × fast; reduced motion only fades. */
export function sheetMotion() {
  const { standard, fast, ease, reduce } = motionSpec()
  return reduce
    ? { from: { opacity: 0 }, enter: { opacity: 1, transition: { duration: standard, ease } }, exit: { opacity: 0, transition: { duration: standard, ease } } }
    : {
      from: { y: '110%' },
      enter: { y: ['110%', '-2%', '0%'], transition: { duration: standard * 1.5, ease } },
      exit: { y: '110%', transition: { duration: fast * 1.5, ease } },
    }
}
