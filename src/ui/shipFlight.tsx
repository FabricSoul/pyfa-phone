import { animate } from 'motion/react'
import { useLayoutEffect, useState, type RefObject } from 'react'
import { motionSpec } from './motion'

/** Shared ship icon (UX4 #10): the ship render on a library row flies to the fit page's header while the page pushes in.
 *  The two icons live on two different pages that are themselves moving (and the header may only get its ship after the fit is
 *  calculated), so motion's layoutId cannot pair them; the row hands over its picture and position, and the header flies a copy in. */
export interface FlightRect { left: number; top: number; width: number; height: number }
let pending: { src: string; rect: FlightRect; at: number } | null = null
/** A flight not picked up within this time (the fit took long to calculate) is dropped: a late flight would look like a glitch. */
const FRESH_MS = 1200

export function launchShipFlight(src: string, rect: FlightRect) {
  pending = { src, rect, at: performance.now() }
}

/** Where `element` will be once every page it is on has finished sliding in. */
function landingRect(element: HTMLElement): FlightRect {
  const rect = element.getBoundingClientRect()
  let shift = 0
  for (let page = element.closest<HTMLElement>('.stage-page'); page; page = page.parentElement?.closest<HTMLElement>('.stage-page') ?? null) {
    const parent = page.parentElement
    if (parent) shift += page.getBoundingClientRect().left - parent.getBoundingClientRect().left
  }
  return { left: rect.left - shift, top: rect.top, width: rect.width, height: rect.height }
}

/** For the header icon (`selector` inside `root`): lands a pending flight of the same picture and keeps the icon hidden until it has landed. */
export function useShipLanding(root: RefObject<HTMLElement | null>, selector: string, src?: string): boolean {
  const [landing, setLanding] = useState(false)
  useLayoutEffect(() => {
    const flight = pending
    const target = root.current?.querySelector<HTMLElement>(selector)
    if (!src || !flight || flight.src !== src || !target) return
    pending = null
    const { reduce, ios } = motionSpec()
    if (reduce || performance.now() - flight.at > FRESH_MS) return
    const to = landingRect(target)
    const from = flight.rect
    const flyer = document.createElement('img')
    flyer.src = src
    flyer.alt = ''
    flyer.dataset.testid = 'ship-flight'
    flyer.className = 'ship-flight'
    Object.assign(flyer.style, { left: `${to.left}px`, top: `${to.top}px`, width: `${to.width || from.width}px`, height: `${to.height || from.height}px` })
    document.body.append(flyer)
    setLanding(true)
    const scale = to.width ? from.width / to.width : 1
    const controls = animate(flyer, { x: [from.left - to.left, 0], y: [from.top - to.top, 0], scale: [scale, 1] }, { duration: 0.5, ease: ios })
    let done = false
    const finish = () => { if (done) return; done = true; flyer.remove(); setLanding(false) }
    void controls.then(finish)
    return () => { controls.stop(); finish() }
  }, [root, selector, src])
  return landing
}
