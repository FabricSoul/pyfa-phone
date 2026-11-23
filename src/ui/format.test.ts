import { describe, expect, it } from 'vitest'
import { fmt, fmtAlignTime, fmtAttribute } from './format'

describe('format utilities', () => {
  it('formats basic numbers according to DESIGN.md: at most 1 decimal, no trailing .0', () => {
    expect(fmt(12.34)).toBe('12.3')
    expect(fmt(12.0)).toBe('12')
    expect(fmt(1000)).toBe('1,000')
  })

  it('fmtAlignTime limits align time to 1 decimal place instead of 2', () => {
    expect(fmtAlignTime(3.456)).toBe('3.5')
    expect(fmtAlignTime(4.0)).toBe('4')
    expect(fmtAlignTime(2.81)).toBe('2.8')
  })

  it('fmtAttribute formats attribute numbers based on unit and value type', () => {
    // Percentages and seconds capped at 1 decimal
    expect(fmtAttribute(12.345, '%')).toBe('12.3')
    expect(fmtAttribute(5.678, 's')).toBe('5.7')

    // Multipliers under 10 can have up to 2 decimals, not 3
    expect(fmtAttribute(1.234, 'x')).toBe('1.23')
    expect(fmtAttribute(1.2, 'x')).toBe('1.2')
    expect(fmtAttribute(2.0, 'x')).toBe('2')

    // Standard attributes default to 1 decimal max
    expect(fmtAttribute(453.678, 'HP')).toBe('453.7')
    expect(fmtAttribute(100.0, 'MW')).toBe('100')
  })
})
