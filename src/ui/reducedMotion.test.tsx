import { cleanup, render, screen } from '@testing-library/react'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ActionSheet } from './ActionSheet'
import { motionTokens } from './format'

const css = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8')

beforeAll(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('prefers-reduced-motion'), media: query, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
  }))
})
afterAll(() => { cleanup(); vi.unstubAllGlobals() })

describe('C3 prefers-reduced-motion', () => {
  it('opens the sheet without a slide (no translate) when the user asks for reduced motion', () => {
    render(<ActionSheet open title="Sheet" onClose={() => {}}><button>inside</button></ActionSheet>)
    const sheet = screen.getByRole('dialog')
    expect(sheet.style.transform).not.toMatch(/translate/)
  })
  it('keeps motion durations at or under 100 ms', () => {
    expect(motionTokens().duration).toBeLessThanOrEqual(0.1)
  })
  it('drops transform transitions in CSS under reduced motion', () => {
    const ui = css('src/ui/ui.css')
    const block = /@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/.exec(ui)?.[1] ?? ''
    expect(block).toMatch(/\.swipe \.row/)
    expect(block).toMatch(/\.cv/)
    expect(block).toMatch(/transition:\s*none/)
    expect(css('src/styles/tokens.css')).toMatch(/prefers-reduced-motion: reduce\)\s*\{\s*:root\s*\{[^}]*--dur:\s*\d{1,2}ms/)
  })
})
