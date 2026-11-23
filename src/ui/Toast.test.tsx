import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider, useToast } from './Toast'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

function Trigger({ onAction }: { onAction?: () => void }) {
  const toast = useToast()
  return <button onClick={() => toast.show({ message: 'Removed X', actionLabel: 'Undo', onAction })}>show</button>
}

describe('Toast motion', () => {
  it('slides in from below while fading in, and slides out before it leaves the page', async () => {
    render(<ToastProvider><Trigger /></ToastProvider>)
    fireEvent.click(screen.getByText('show'))
    const toast = screen.getByText('Removed X').closest('.toast') as HTMLElement
    expect(toast.style.opacity).toBe('0')
    expect(toast.style.transform).toBe('translateY(12px)')
    await waitFor(() => expect(toast.style.opacity).toBe('1'), { timeout: 2000 })
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(screen.queryByText('Removed X')).toBeTruthy()
    await waitFor(() => expect(screen.queryByText('Removed X')).toBeNull(), { timeout: 2000 })
  })
  it('still removes itself after 5 s', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    render(<ToastProvider><Trigger /></ToastProvider>)
    fireEvent.click(screen.getByText('show'))
    await act(async () => { await vi.advanceTimersByTimeAsync(5500) })
    await waitFor(() => expect(screen.queryByText('Removed X')).toBeNull())
    vi.useRealTimers()
  })
})
