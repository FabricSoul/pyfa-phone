import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { useState } from 'react'
import rifter from '../engine/fixtures/rifter.json'
import { CalcResultSchema, type ModuleSlotRow, type ModuleState } from '../engine/types'
import { ModuleRow } from './ModuleRow'

afterEach(cleanup)

const calc = CalcResultSchema.parse(rifter)
const ALL: ModuleState[] = ['offline', 'online', 'active', 'overheated']
const merged = calc.slots.high[0] as ModuleSlotRow // 3 × 200mm AutoCannon II with a charge

describe('ModuleRow', () => {
  it('shows ×3 for merged modules, charge on line one and key parts on line two', () => {
    render(<ModuleRow row={merged} />)
    expect(screen.getByText('×3')).toBeTruthy()
    expect(screen.getByText('Republic Fleet EMP S', { exact: false })).toBeTruthy()
    expect(screen.getByText(merged.keyParts[0]!).tagName).toBe('B')
  })

  it('cycles the state offline → online → active → offline on tap', () => {
    const seen: ModuleState[] = []
    function Harness() {
      const [state, setState] = useState<ModuleState>('offline')
      return <ModuleRow row={{ ...merged, state }} availableStates={ALL} onStateChange={(s) => { seen.push(s); setState(s) }} />
    }
    render(<Harness />)
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByTestId('state-button'))
    expect(seen).toEqual(['online', 'active', 'offline'])
  })

  it('passive modules only toggle online/offline', () => {
    const onStateChange = vi.fn()
    render(<ModuleRow row={{ ...merged, state: 'online' }} availableStates={['offline', 'online']} onStateChange={onStateChange} />)
    fireEvent.click(screen.getByTestId('state-button'))
    expect(onStateChange).toHaveBeenCalledWith('offline')
  })

  it('long press picks overheated', () => {
    vi.useFakeTimers()
    const onStateChange = vi.fn()
    render(<ModuleRow row={{ ...merged, state: 'active' }} onStateChange={onStateChange} />)
    const b = screen.getByTestId('state-button')
    fireEvent.pointerDown(b)
    vi.advanceTimersByTime(600)
    fireEvent.pointerUp(b)
    fireEvent.click(b)
    vi.useRealTimers()
    expect(onStateChange).toHaveBeenCalledTimes(1)
    expect(onStateChange).toHaveBeenCalledWith('overheated')
  })

  it('dims offline rows and marks over-slot rows with the warning colour', () => {
    const { rerender } = render(<ModuleRow row={{ ...merged, state: 'offline' }} />)
    expect(screen.getByTestId('module-row').className).toContain('off')
    rerender(<ModuleRow row={{ ...merged, overSlots: true }} />)
    expect(screen.getByTestId('module-row').className).toContain('warn')
  })

  it('renders an empty slot with a plus and a hint', () => {
    render(<ModuleRow row={{ kind: 'empty', count: 2, positions: [3, 4] }} />)
    expect(screen.getByTestId('empty-row')).toBeTruthy()
  })

  it('cycles through the engine-provided states, whatever they are', () => {
    const seen: ModuleState[] = []
    function Harness({ states }: { states: ModuleState[] }) {
      const [state, setState] = useState<ModuleState>(states[0]!)
      return <ModuleRow row={{ ...merged, state }} availableStates={states} onStateChange={(s) => { seen.push(s); setState(s) }} />
    }
    const { unmount } = render(<Harness states={['online', 'active']} />)
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByTestId('state-button'))
    expect(seen).toEqual(['active', 'online', 'active'])
    unmount()
    seen.length = 0
    render(<Harness states={['offline', 'online', 'active']} />)
    for (let i = 0; i < 4; i++) fireEvent.click(screen.getByTestId('state-button'))
    expect(seen).toEqual(['online', 'active', 'offline', 'online'])
  })

  it('long press only picks overheated when the engine offers it', () => {
    vi.useFakeTimers()
    const onStateChange = vi.fn()
    render(<ModuleRow row={{ ...merged, state: 'active' }} availableStates={['offline', 'online', 'active']} onStateChange={onStateChange} />)
    fireEvent.pointerDown(screen.getByTestId('state-button'))
    vi.advanceTimersByTime(600)
    vi.useRealTimers()
    expect(onStateChange).not.toHaveBeenCalled()
  })

  it('the row body is a native button', () => {
    const onTap = vi.fn()
    render(<ModuleRow row={merged} onTap={onTap} />)
    const body = screen.getByRole('button', { name: /200mm AutoCannon II/ })
    expect(body.tagName).toBe('BUTTON')
    fireEvent.click(body)
    expect(onTap).toHaveBeenCalledTimes(1)
  })

  it('hides the swipe actions from keyboard and screen readers until opened', () => {
    const onRemove = vi.fn()
    render(<ModuleRow row={merged} onRemove={onRemove} />)
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Offline' })).toBeNull()
    fireEvent.keyDown(screen.getByRole('button', { name: /200mm AutoCannon II/ }), { key: 'ArrowLeft' })
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    expect(onRemove).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull()
  })

  it('the state button has a hit area of at least 44×44 with a 32px visual', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/ui/ui.css'), 'utf8')
    const rule = (sel: string) => new RegExp(`${sel.replace('.', '\\.')}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? ''
    expect(rule('.sb')).toMatch(/min-width:\s*44px/)
    expect(rule('.sb')).toMatch(/min-height:\s*44px/)
    expect(rule('.sb .sbi')).toMatch(/width:\s*32px/)
  })
})
