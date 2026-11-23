import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ActionSheet } from './ActionSheet'

afterEach(cleanup)

function Harness({ onClose }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)}>trigger</button>
      <ActionSheet open={open} title="Module actions" onClose={() => { onClose?.(); setOpen(false) }}>
        <button>inside</button>
      </ActionSheet>
    </>
  )
}

describe('ActionSheet accessibility', () => {
  it('is a labelled dialog', () => {
    render(<Harness />)
    fireEvent.click(screen.getByText('trigger'))
    const dialog = screen.getByRole('dialog', { name: 'Module actions' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
  })

  it('moves focus into the dialog on open and back to the trigger on close', () => {
    render(<Harness />)
    const trigger = screen.getByText('trigger')
    trigger.focus()
    fireEvent.click(trigger)
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true)
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(document.activeElement).toBe(trigger)
  })

  it('closes on Escape', () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    fireEvent.click(screen.getByText('trigger'))
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('only the grab handle starts the drag; the panel keeps native vertical scrolling', () => {
    render(<Harness />)
    fireEvent.click(screen.getByText('trigger'))
    const dialog = screen.getByRole('dialog')
    expect(String(dialog.style.touchAction ?? '')).not.toMatch(/pan-x|none/)
    expect(screen.getByTestId('sheet-grab').style.touchAction).toBe('none')
  })
})
