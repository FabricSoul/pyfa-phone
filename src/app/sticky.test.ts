import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSticky } from './sticky'

describe('useSticky', () => {
  beforeEach(() => {
    sessionStorage.clear()
    vi.restoreAllMocks()
  })

  it('returns initial value when sessionStorage is empty', () => {
    const { result } = renderHook(() => useSticky('test.key', 'default'))
    expect(result.current[0]).toBe('default')
  })

  it('returns stored value from sessionStorage', () => {
    sessionStorage.setItem('test.key', JSON.stringify('saved-value'))
    const { result } = renderHook(() => useSticky('test.key', 'default'))
    expect(result.current[0]).toBe('saved-value')
  })

  it('updates state and persists to sessionStorage', () => {
    const { result } = renderHook(() => useSticky('test.key', 10))
    expect(result.current[0]).toBe(10)

    act(() => {
      result.current[1](20)
    })

    expect(result.current[0]).toBe(20)
    expect(JSON.parse(sessionStorage.getItem('test.key')!)).toBe(20)
  })

  it('supports functional updater in setter', () => {
    const { result } = renderHook(() => useSticky('test.counter', 1))
    act(() => {
      result.current[1]((prev) => prev + 5)
    })
    expect(result.current[0]).toBe(6)
    expect(JSON.parse(sessionStorage.getItem('test.counter')!)).toBe(6)
  })

  it('safely falls back to initial value when sessionStorage contains malformed JSON', () => {
    sessionStorage.setItem('test.bad', '{not valid json}')
    const { result } = renderHook(() => useSticky('test.bad', { ok: true }))
    expect(result.current[0]).toEqual({ ok: true })
  })

  it('safely handles sessionStorage.getItem throwing', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError: storage disabled')
    })
    const { result } = renderHook(() => useSticky('test.throw', 'fallback'))
    expect(result.current[0]).toBe('fallback')
  })

  it('safely handles sessionStorage.setItem throwing on update', () => {
    const { result } = renderHook(() => useSticky('test.failSet', 'initial'))
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    expect(() => {
      act(() => {
        result.current[1]('new-val')
      })
    }).not.toThrow()
    expect(result.current[0]).toBe('new-val')
  })
})
