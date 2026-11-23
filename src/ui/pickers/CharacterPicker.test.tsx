import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resetSettings, updateSettings } from '../../settings/settings'
import { CharacterPicker } from './CharacterPicker'

afterEach(cleanup)
beforeEach(() => {
  resetSettings()
  updateSettings({ itemNameLanguage: 'en' })
})

describe('CharacterPicker', () => {
  it('offers All V and All 0 and reports the picked character', () => {
    let picked: string | undefined
    render(<CharacterPicker value="all5" onPick={(v) => { picked = v }} />)
    expect(screen.getByText('All V')).toBeTruthy()
    expect(screen.getByText('All 0')).toBeTruthy()
    fireEvent.click(screen.getByText('All 0'))
    expect(picked).toBe('all0')
  })
})
