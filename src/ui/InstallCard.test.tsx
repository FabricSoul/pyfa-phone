import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'
import * as installModule from '../app/install'
import { InstallCard } from './InstallCard'

describe('InstallCard', () => {
  const originalUserAgent = navigator.userAgent
  const originalPlatform = navigator.platform
  const originalMaxTouchPoints = navigator.maxTouchPoints

  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    vi.restoreAllMocks()
    // Default to mobile, non-standalone, non-iOS
    vi.spyOn(installModule, 'isMobile').mockReturnValue(true)
    vi.spyOn(installModule, 'isStandalone').mockReturnValue(false)
    vi.spyOn(installModule, 'isIOS').mockReturnValue(false)
    vi.spyOn(installModule, 'getInstallPrompt').mockReturnValue(null)
  })

  afterEach(() => {
    cleanup()
    Object.defineProperty(navigator, 'userAgent', { value: originalUserAgent, configurable: true })
    Object.defineProperty(navigator, 'platform', { value: originalPlatform, configurable: true })
    Object.defineProperty(navigator, 'maxTouchPoints', { value: originalMaxTouchPoints, configurable: true })
  })

  it('does not render on desktop browsers', () => {
    vi.spyOn(installModule, 'isMobile').mockReturnValue(false)
    const { container } = render(<InstallCard />)
    expect(container.firstChild).toBeNull()
  })

  it('does not render if already running as standalone', () => {
    vi.spyOn(installModule, 'isStandalone').mockReturnValue(true)
    const { container } = render(<InstallCard />)
    expect(container.firstChild).toBeNull()
  })

  it('ignores and clears the old permanent dismissal: only installing hides the card for good', () => {
    localStorage.setItem('pyfa.installDismissed', '1')
    render(<InstallCard />)
    expect(screen.getByText('Add to Home Screen')).toBeTruthy()
    expect(localStorage.getItem('pyfa.installDismissed')).toBeNull()
  })

  it('X hides the card for this session only; a new session shows it again', () => {
    render(<InstallCard />)
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByText('Add to Home Screen')).toBeNull()
    cleanup()
    render(<InstallCard />)
    expect(screen.queryByText('Add to Home Screen')).toBeNull()
    cleanup()
    sessionStorage.clear() // a new session
    render(<InstallCard />)
    expect(screen.getByText('Add to Home Screen')).toBeTruthy()
  })

  it('never shows again once the app was installed (appinstalled)', () => {
    render(<InstallCard />)
    act(() => { window.dispatchEvent(new Event('appinstalled')) })
    expect(screen.queryByText('Add to Home Screen')).toBeNull()
    cleanup()
    sessionStorage.clear()
    render(<InstallCard />)
    expect(screen.queryByText('Add to Home Screen')).toBeNull()
  })

  it('renders instructions for iOS Safari when no beforeinstallprompt exists', () => {
    vi.spyOn(installModule, 'isIOS').mockReturnValue(true)
    render(<InstallCard />)
    expect(screen.getByText('Add to Home Screen')).toBeTruthy()
    expect(screen.getByText('Tap the share button')).toBeTruthy()
    expect(screen.getByText('Select "Add to Home Screen"')).toBeTruthy()
  })

  it('renders install button and triggers prompt on Android/Chrome with BIP', async () => {
    const promptMock = vi.fn().mockResolvedValue(undefined)
    const mockBIP = {
      prompt: promptMock,
      userChoice: Promise.resolve({ outcome: 'accepted' }),
    } as unknown as installModule.BIP

    vi.spyOn(installModule, 'getInstallPrompt').mockReturnValue(mockBIP)
    render(<InstallCard />)

    const installBtn = screen.getByRole('button', { name: 'Install now' })
    expect(installBtn).toBeTruthy()

    await act(async () => {
      fireEvent.click(installBtn)
    })

    expect(promptMock).toHaveBeenCalled()
  })

  it('dismissing writes nothing permanent', () => {
    render(<InstallCard />)
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(localStorage.getItem('pyfa.installDismissed')).toBeNull()
    expect(screen.queryByText('Add to Home Screen')).toBeNull()
  })

  it('safely handles localStorage errors on dismissal', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    render(<InstallCard />)
    const closeBtn = screen.getByRole('button', { name: 'Dismiss' })
    expect(() => fireEvent.click(closeBtn)).not.toThrow()
    expect(screen.queryByText('Add to Home Screen')).toBeNull()
  })

  it('safely handles localStorage errors on checking dismissed state', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    render(<InstallCard />)
    expect(screen.getByText('Add to Home Screen')).toBeTruthy()
  })
})
