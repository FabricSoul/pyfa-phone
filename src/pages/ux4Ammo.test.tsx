import { IDBFactory } from 'fake-indexeddb'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { FittingRoutes } from '../App'
import { mockEngine } from '../engine/mockClient'
import type { EngineClient } from '../engine/types'
import { resetSettings } from '../settings/settings'
import { createFitStore } from '../store/fits'

afterEach(() => { cleanup(); resetSettings() })

// jsdom has no PointerEvent: without it fireEvent drops clientX and pointerId.
if (typeof window.PointerEvent === 'undefined') {
  class PointerEventPolyfill extends MouseEvent {
    pointerId: number; isPrimary: boolean
    constructor(type: string, init: PointerEventInit = {}) { super(type, init); this.pointerId = init.pointerId ?? 1; this.isPrimary = init.isPrimary ?? true }
  }
  window.PointerEvent = PointerEventPolyfill as unknown as typeof PointerEvent
}

/** An engine whose charge lists arrive only when `release()` is called. */
function slowCharges() {
  const waiting: (() => void)[] = []
  const chargesFor = vi.fn((...args: Parameters<EngineClient['chargesFor']>) =>
    new Promise<Awaited<ReturnType<EngineClient['chargesFor']>>>((resolve) => { waiting.push(() => void mockEngine.chargesFor(...args).then(resolve)) }))
  return { chargesFor, release: () => { while (waiting.length) waiting.shift()!() } }
}

const open = (engine: EngineClient) => render(<MemoryRouter initialEntries={['/fit/rifter']}><FittingRoutes
  engine={engine} store={createFitStore(new IDBFactory())} /></MemoryRouter>)

it('starts loading the charges when a module row is pressed, before the tap opens the sheet', async () => {
  const slow = slowCharges()
  open({ ...mockEngine, chargesFor: slow.chargesFor })
  const row = (await screen.findAllByTestId('module-row', {}, { timeout: 4000 }))[0]!
  fireEvent.pointerDown(row, { clientX: 100, clientY: 10, pointerId: 1, isPrimary: true })
  expect(slow.chargesFor).toHaveBeenCalledTimes(1)
  fireEvent.click(row.querySelector('.body')!)
  expect(slow.chargesFor).toHaveBeenCalledTimes(1)
}, 12_000)

it('the sheet has its charges area from the first frame: a skeleton of fixed height until the list arrives in place', async () => {
  const slow = slowCharges()
  open({ ...mockEngine, chargesFor: slow.chargesFor })
  const row = (await screen.findAllByTestId('module-row', {}, { timeout: 4000 }))[0]!
  fireEvent.click(row.querySelector('.body')!)
  const area = await screen.findByTestId('module-ammo')
  expect(area.getAttribute('aria-busy')).toBe('true')
  expect(area.querySelectorAll('.sk').length).toBeGreaterThan(0)
  slow.release()
  await waitFor(() => expect(screen.getByTestId('module-ammo').getAttribute('aria-busy')).toBeNull())
  expect(screen.getByTestId('module-ammo').querySelectorAll('.ar').length + screen.getByTestId('module-ammo').querySelectorAll('.mh').length).toBeGreaterThan(0)
}, 12_000)

it('a second opening of the same module shows the charges at once, without asking the engine again', async () => {
  const chargesFor = vi.fn(mockEngine.chargesFor)
  open({ ...mockEngine, chargesFor })
  const row = () => screen.getAllByTestId('module-row')[0]!
  await screen.findAllByTestId('module-row', {}, { timeout: 4000 })
  fireEvent.click(row().querySelector('.body')!)
  await waitFor(() => expect(screen.getByTestId('module-ammo').getAttribute('aria-busy')).toBeNull())
  fireEvent.keyDown(document, { key: 'Escape' })
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), { timeout: 3000 })
  const calls = chargesFor.mock.calls.length
  fireEvent.click(row().querySelector('.body')!)
  const area = await screen.findByTestId('module-ammo')
  expect(area.getAttribute('aria-busy')).toBeNull()
  expect(chargesFor.mock.calls.length).toBe(calls)
}, 12_000)
