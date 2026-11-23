import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resetSettings, updateSettings } from '../../settings/settings'
import { TargetProfilePicker } from './TargetProfilePicker'

afterEach(cleanup)
beforeEach(() => {
  resetSettings()
  updateSettings({ itemNameLanguage: 'en' })
})

describe('TargetProfilePicker', () => {
  it('puts "None" first and lets the user clear the profile', () => {
    let picked: number | null | undefined
    render(<TargetProfilePicker value={-5} onPick={(id) => { picked = id }} />)
    const none = screen.getByText('None')
    expect(none).toBeTruthy()
    fireEvent.click(none)
    expect(picked).toBeNull()
  })

  it('expands only the group holding the current profile', () => {
    render(<TargetProfilePicker value={-5} onPick={() => {}} />)
    expect(screen.getByText(/Shield/)).toBeTruthy()
    expect(screen.queryByText(/Amarr/)).toBeNull()
  })
})
