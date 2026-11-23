import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetSettings, updateSettings } from '../settings/settings'
import { setUiLanguage } from '../i18n/t'

const { saveFit, navigate } = vi.hoisted(() => ({ saveFit: vi.fn(), navigate: vi.fn() }))

vi.mock('../store/fits', () => ({ saveFit: (...a: unknown[]) => saveFit(...a) }))
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => navigate }
})

import Import from './Import'

const eft = `[Thrasher, Test thrasher]
200mm AutoCannon II, Republic Fleet EMP S
200mm AutoCannon II, Republic Fleet EMP S

1MN Afterburner II

Damage Control II

Small Projectile Burst Aerator I`

beforeEach(async () => {
  saveFit.mockReset().mockResolvedValue('fit-1')
  navigate.mockReset()
  resetSettings()
  updateSettings({ itemNameLanguage: 'en' })
  await setUiLanguage('en_US')
})
afterEach(cleanup)

async function paste() {
  render(<Import />)
  fireEvent.change(screen.getByRole('textbox'), { target: { value: eft } })
  await waitFor(() => expect(screen.getByText(/EFT/)).toBeTruthy())
}

describe('Import page', () => {
  it('previews the ship name and item count after EFT text is pasted', async () => {
    await paste()
    expect(screen.getByText(/Thrasher · 15 items recognized/)).toBeTruthy()
    expect(screen.getByText(/382/)).toBeTruthy()
  })

  it('does not save when "View only without saving" is tapped', async () => {
    await paste()
    fireEvent.click(screen.getByRole('button', { name: /View only without saving|只看不保存|Preview only/i }))
    expect(saveFit).not.toHaveBeenCalled()
    expect(navigate).toHaveBeenCalledWith('/')
  })

  it('saves and opens the recognized fit', async () => {
    await paste()
    fireEvent.click(screen.getByRole('button', { name: 'Save and open' }))
    await waitFor(() => expect(saveFit).toHaveBeenCalledTimes(1))
    expect(navigate).toHaveBeenCalledWith('/fit/fit-1')
  })
})
