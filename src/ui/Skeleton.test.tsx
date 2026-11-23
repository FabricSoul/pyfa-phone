import { cleanup, render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Skeleton, SkeletonGauges, SkeletonList, SkeletonRow, SkeletonStats } from './Skeleton'

afterEach(cleanup)
const css = readFileSync(resolve(process.cwd(), 'src/ui/ui.css'), 'utf8')

describe('Skeleton', () => {
  it('draws one shimmering block with the requested size, hidden from assistive tech', () => {
    const { container } = render(<Skeleton width="60%" height={16} />)
    const block = container.querySelector('.sk') as HTMLElement
    expect(block.getAttribute('aria-hidden')).toBe('true')
    expect(block.style.width).toBe('60%')
    expect(block.style.height).toBe('16px')
  })
  it('a row has an icon block, two text lines and a trailing block', () => {
    const { container } = render(<SkeletonRow />)
    expect(container.querySelectorAll('.sk').length).toBe(4)
  })
  it('a list announces itself once as busy with its label and draws the requested rows', () => {
    const { container } = render(<SkeletonList rows={3} label="Loading fits" />)
    const status = screen.getByRole('status', { name: 'Loading fits' })
    expect(status.getAttribute('aria-busy')).toBe('true')
    expect(container.querySelectorAll('.skrow').length).toBe(3)
  })
  it('gauges and stats blocks come in threes', () => {
    const gauges = render(<SkeletonGauges />)
    expect(gauges.container.querySelectorAll('.sktile').length).toBe(3)
    gauges.unmount()
    const stats = render(<SkeletonStats />)
    expect(stats.container.querySelectorAll('.sktile').length).toBe(3)
  })
  it('shimmers, and stands still under prefers-reduced-motion', () => {
    expect(css).toMatch(/\.sk\s*\{[^}]*animation:\s*shim/)
    expect(css).toMatch(/prefers-reduced-motion: reduce\)\s*\{\s*\.sk\s*\{\s*animation:\s*none/)
  })
})
