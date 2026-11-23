import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  getInstallPrompt,
  onInstallPrompt,
  isStandalone,
  isIOS,
  isMobile,
  type BIP,
} from './install'

describe('install module', () => {
  const originalUserAgent = navigator.userAgent
  const originalPlatform = navigator.platform
  const originalMaxTouchPoints = navigator.maxTouchPoints

  afterEach(() => {
    Object.defineProperty(navigator, 'userAgent', { value: originalUserAgent, configurable: true })
    Object.defineProperty(navigator, 'platform', { value: originalPlatform, configurable: true })
    Object.defineProperty(navigator, 'maxTouchPoints', { value: originalMaxTouchPoints, configurable: true })
    delete (navigator as unknown as Record<string, unknown>).standalone
  })

  it('captures beforeinstallprompt, calls preventDefault, and notifies listeners', () => {
    let notified: BIP | null = null
    const unsubscribe = onInstallPrompt((prompt) => {
      notified = prompt
    })

    const preventDefault = vi.fn()
    const event = new Event('beforeinstallprompt')
    Object.assign(event, {
      preventDefault,
      prompt: vi.fn(),
      userChoice: Promise.resolve({ outcome: 'accepted' }),
    })

    window.dispatchEvent(event)

    expect(preventDefault).toHaveBeenCalled()
    expect(getInstallPrompt()).toBeDefined()
    expect(notified).toBeDefined()

    // Now test appinstalled clears deferred prompt
    window.dispatchEvent(new Event('appinstalled'))
    expect(getInstallPrompt()).toBeNull()
    expect(notified).toBeNull()

    unsubscribe()
  })

  it('correctly identifies standalone display modes', () => {
    // Normal browser
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
    expect(isStandalone()).toBe(false)

    // display-mode: standalone
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('standalone'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
    expect(isStandalone()).toBe(true)

    // iOS navigator.standalone
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
    Object.defineProperty(navigator, 'standalone', { value: true, configurable: true })
    expect(isStandalone()).toBe(true)
  })

  it('identifies iOS devices including iPadOS', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
      configurable: true,
    })
    expect(isIOS()).toBe(true)

    // iPadOS pretending to be MacIntel
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      configurable: true,
    })
    Object.defineProperty(navigator, 'platform', { value: 'MacIntel', configurable: true })
    Object.defineProperty(navigator, 'maxTouchPoints', { value: 5, configurable: true })
    expect(isIOS()).toBe(true)

    // Regular desktop Mac
    Object.defineProperty(navigator, 'maxTouchPoints', { value: 0, configurable: true })
    expect(isIOS()).toBe(false)
  })

  it('identifies mobile devices correctly', () => {
    // Android phone
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Linux; Android 14; Pixel 8)',
      configurable: true,
    })
    expect(isMobile()).toBe(true)

    // Desktop browser without touch
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      configurable: true,
    })
    Object.defineProperty(navigator, 'platform', { value: 'Win32', configurable: true })
    Object.defineProperty(navigator, 'maxTouchPoints', { value: 0, configurable: true })
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
    expect(isMobile()).toBe(false)
  })
})
