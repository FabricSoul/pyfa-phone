import { animate, motion, useMotionValue, useTransform, type MotionValue } from 'motion/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
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
  const motionValue: MotionValue<number> = useMotionValue(value)
  const formatRef = useRef(format)
  formatRef.current = format
  const text = useTransform(motionValue, (n) => formatRef.current(n))
  const [rolling, setRolling] = useState(false)
  useEffect(() => {
    if (motionValue.get() === value) return
    const { roll, ease } = motionSpec()
    if (roll === 0) { motionValue.set(value); return }
    setRolling(true)
    const controls = animate(motionValue, value, { duration: roll, ease, onComplete: () => setRolling(false) })
    return () => controls.stop()
  }, [motionValue, value])
  return <motion.span data-testid="rolling" data-value={value} data-rolling={rolling} className={`roll ${className}`.trim()}>{text}</motion.span>
}
