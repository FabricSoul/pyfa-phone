import { AnimatePresence, animate, motion } from 'motion/react'
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
export function ExpandItem({ children, className }: { children: ReactNode; className?: string }) {
  return <motion.div className={`xi ${className ?? ''}`.trim()} style={{ overflow: 'hidden' }} {...heightMotion()}>{children}</motion.div>
}

/** Shows `children` while `open`, opening and closing by height. Open on first render means no animation. */
export function Expand({ open, children, className }: { open: boolean; children: ReactNode; className?: string }) {
  return <AnimatePresence initial={false}>{open && <ExpandItem key="body" className={className}>{children}</ExpandItem>}</AnimatePresence>
}

/** Route enter: the next page slides in 24 px from the right with a fade (180 ms); a page returned to comes from the left (120 ms).
 *  The first page of the session and reduced motion do not slide. Keyed by path, so a query change keeps the page. */
const shown = new WeakSet<object>()
export function Page({ children }: { children: ReactNode }) {
  const location = useLocation()
  const type = useNavigationType()
  const router = useContext(UNSAFE_NavigationContext).navigator
  const { standard, fast, ease, reduce } = motionSpec()
  // The very first page of a router (app start) is simply there; every later page enters by push or back.
  const current = useRef<{ path: string; kind: 'none' | 'push' | 'back' }>(undefined)
  if (current.current?.path !== location.pathname)
    current.current = { path: location.pathname, kind: !shown.has(router) ? 'none' : type === NavigationType.Pop ? 'back' : 'push' }
  const kind = current.current.kind
  useEffect(() => { shown.add(router) }, [router])
  const slide = reduce ? 0 : kind === 'back' ? -24 : 24
  return <motion.div key={location.pathname} data-testid="page" data-motion={kind}
    initial={kind === 'none' ? false : { opacity: 0, x: slide }} animate={{ opacity: 1, x: 0 }}
    transition={{ duration: kind === 'back' ? fast : standard, ease }}>{children}</motion.div>
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
