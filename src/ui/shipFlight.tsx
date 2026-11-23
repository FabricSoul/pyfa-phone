import { animate } from 'motion/react'
import { useLayoutEffect, useState, type RefObject } from 'react'
import { motionSpec } from './motion'

/** Shared ship icon (UX4 #10): the ship render on a library row flies to the fit page's header while the page pushes in.
 *  The two icons live on two different pages that are themselves moving (and the header may only get its ship after the fit is
 *  calculated), so motion's layoutId cannot pair them; the row hands over its picture and position, and the header flies a copy in. */
export interface FlightRect { left: number; top: number; width: number; height: number }
let pending: { src: string; rect: FlightRect; radius: number; at: number } | null = null
/** A flight not picked up within this time (the fit took long to calculate) is dropped: a late flight would look like a glitch. */
const FRESH_MS = 1200

export function launchShipFlight(src: string, rect: FlightRect, radius = 0) {
  pending = { src, rect, radius, at: performance.now() }
}

/** The outermost page `element` is on: the flight is drawn inside it so it layers with the page's own content. */
function hostPage(element: HTMLElement): HTMLElement | null {
  let host: HTMLElement | null = null
  for (let page = element.closest<HTMLElement>('.stage-page'); page; page = page.parentElement?.closest<HTMLElement>('.stage-page') ?? null) host = page
  return host
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
    // The copy is the source picture at its own size, scaled down on the way (a downscaled image stays sharp), with its corners
    // turning into the header icon's. It flies inside the page, under the resource readings (ui.css: .res sits above it).
    const host = hostPage(target)
    const origin = host?.getBoundingClientRect() ?? { left: 0, top: 0 }
    const rect = target.getBoundingClientRect()
    const to = { left: rect.left - origin.left, top: rect.top - origin.top, width: rect.width || flight.rect.width }
    const from = { left: flight.rect.left - origin.left, top: flight.rect.top - origin.top, width: flight.rect.width || to.width }
    const end = to.width / from.width
    const radius = parseFloat(getComputedStyle(target).borderTopLeftRadius) || 0
    const flyer = document.createElement('img')
    flyer.src = src
    flyer.alt = ''
    flyer.dataset.testid = 'ship-flight'
    flyer.className = 'ship-flight'
    Object.assign(flyer.style, { position: host ? 'absolute' : 'fixed', left: `${to.left}px`, top: `${to.top}px`, width: `${from.width}px`, height: `${from.width}px` })
    ;(host ?? document.body).append(flyer)
    setLanding(true)
    const controls = animate(flyer, {
      x: [from.left - to.left, 0], y: [from.top - to.top, 0], scale: [1, end], borderRadius: [`${flight.radius}px`, `${radius / end}px`],
    }, { duration: 0.5, ease: ios })
    let done = false
    const finish = () => { if (done) return; done = true; flyer.remove(); setLanding(false) }
    void controls.then(finish)
    return () => { controls.stop(); finish() }
  }, [root, selector, src])
  return landing
}
