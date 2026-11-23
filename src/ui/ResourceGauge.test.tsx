import { cleanup, render, screen } from '@testing-library/react'
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
