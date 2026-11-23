import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resetSettings, updateSettings } from '../../settings/settings'
import { DamagePatternPicker } from './DamagePatternPicker'

afterEach(cleanup)
beforeEach(() => {
  resetSettings()
  updateSettings({ itemNameLanguage: 'en' })
})

describe('DamagePatternPicker', () => {
  it('expands the group holding the current pattern and leaves other groups collapsed', () => {
    render(<DamagePatternPicker value={-41} onPick={() => {}} />)
    expect(screen.getByText(/Tremor/)).toBeTruthy()
    expect(screen.queryByText('Thermal')).toBeNull()
    expect(screen.queryByText(/Antimatter/)).toBeNull()
  })

  it('expands a collapsed group when its header is tapped', () => {
    render(<DamagePatternPicker value={-41} onPick={() => {}} />)
    const header = screen.getByRole('button', { name: /Generic/ })
    expect(header.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(header)
    expect(screen.getByText('Thermal')).toBeTruthy()
    expect(header.getAttribute('aria-expanded')).toBe('true')
  })

  it('shows all four damage ratios and reports the picked pattern', () => {
    let picked: number | undefined
    updateSettings({ itemNameLanguage: 'en' })
    render(<DamagePatternPicker value={-1} onPick={(id) => { picked = id }} />)
    expect(screen.getByText(/25 · Thermal 25 · Kinetic 25 · Explosive 25/)).toBeTruthy()
    fireEvent.click(screen.getByText(/Uniform/))
    expect(picked).toBe(-1)
  })
})
