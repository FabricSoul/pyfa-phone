import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import rifter from '../engine/fixtures/rifter.json'
import { CalcResultSchema, type ModuleSlotRow, type ModuleState } from '../engine/types'
import { ModuleRow } from './ModuleRow'

afterEach(cleanup)

const calc = CalcResultSchema.parse(rifter)
const merged = calc.slots.high[0] as ModuleSlotRow // 3 × 200mm AutoCannon II with a charge

describe('ModuleRow', () => {
  it('shows ×3 for merged modules, charge on line one and key parts on line two', () => {
    render(<ModuleRow row={merged} />)
    expect(screen.getByText('×3')).toBeTruthy()
    expect(screen.getByText('Republic Fleet EMP S', { exact: false })).toBeTruthy()
    expect(screen.getByText(merged.keyParts[0]!).tagName).toBe('B')
  })

  it('cycles the state offline → online → active → online on tap', () => {
    const seen: ModuleState[] = []
    function Harness() {
      const [state, setState] = useState<ModuleState>('offline')
      return <ModuleRow row={{ ...merged, state }} onStateChange={(s) => { seen.push(s); setState(s) }} />
    }
    render(<Harness />)
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByTestId('state-button'))
    expect(seen).toEqual(['online', 'active', 'online'])
  })

  it('passive modules only toggle online/offline', () => {
    const onStateChange = vi.fn()
    render(<ModuleRow row={{ ...merged, state: 'online' }} passive onStateChange={onStateChange} />)
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
})
