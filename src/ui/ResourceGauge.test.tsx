import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ResourceGauge } from './ResourceGauge'

afterEach(cleanup)

describe('ResourceGauge', () => {
  it('uses the warning colour class on the whole bar and the number when over the limit', () => {
    const { container } = render(<ResourceGauge label="CPU" used={230.5} total={225} />)
    const gauge = screen.getByTestId('gauge')
    expect(gauge.dataset.over).toBe('true')
    expect(screen.getByText('230.5/225').className).toContain('warn')
    expect(container.querySelectorAll('.cells i.over')).toHaveLength(20)
  })

  it('is not an error when exactly full', () => {
    const { container } = render(<ResourceGauge label="Calibration" used={400} total={400} />)
    expect(screen.getByTestId('gauge').dataset.over).toBe('false')
    expect(screen.getByText('400/400').className).not.toContain('warn')
    expect(container.querySelectorAll('.cells i.on')).toHaveLength(20)
    expect(container.querySelectorAll('.cells i.over')).toHaveLength(0)
  })

  it('fills 20 cells proportionally', () => {
    const { container } = render(<ResourceGauge label="Powergrid" used={32.91} total={56.38} />)
    expect(container.querySelectorAll('.cells i')).toHaveLength(20)
    expect(container.querySelectorAll('.cells i.on')).toHaveLength(12)
  })
})

describe('ResourceGauge motion', () => {
  it('rolls the used number to the new value and ends on it exactly', async () => {
    const { rerender } = render(<ResourceGauge label="CPU" used={132.3} total={162.5} />)
    rerender(<ResourceGauge label="CPU" used={162.3} total={162.5} />)
    const number = screen.getByTestId('rolling')
    expect(number.getAttribute('data-value')).toBe('162.3')
    expect(number.textContent).not.toBe('162.3/162.5')
    await waitFor(() => expect(number.textContent).toBe('162.3/162.5'), { timeout: 2000 })
  })
  it('lets the cells change colour smoothly', () => {
    expect(readFileSync(resolve(process.cwd(), 'src/ui/ui.css'), 'utf8')).toMatch(/\.cells i\s*\{[^}]*transition:\s*background-color/)
  })
})
