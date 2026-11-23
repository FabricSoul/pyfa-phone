import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// I10: text tokens must reach WCAG AA (4.5:1) on the surfaces they sit on, in both themes.
const css = readFileSync(resolve(process.cwd(), 'src/styles/tokens.css'), 'utf8')
const light = css.slice(0, css.indexOf('[data-appearance="dark"]'))
const dark = css.slice(css.indexOf('[data-appearance="dark"]'))
const token = (block: string, name: string) => new RegExp(`${name}:\\s*(#[0-9A-Fa-f]{6})`).exec(block)?.[1]
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
const lin = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
const lum = ([r, g, b]: number[]) => 0.2126 * lin(r!) + 0.7152 * lin(g!) + 0.0722 * lin(b!)
const ratio = (a: number[], b: number[]) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi! + 0.05) / (lo! + 0.05) }
const mix = (fg: number[], bg: number[], p: number) => fg.map((c, i) => c * p + bg[i]! * (1 - p))

const METAS = ['t2', 't1', 'faction', 'storyline', 'deadspace', 'officer']
describe.each([['light', light], ['dark', dark]])('%s theme', (_, block) => {
  const inherit = (name: string) => token(block, name) ?? token(light, name)!
  it.each(METAS)('meta-%s tag text keeps 4.5:1 on its 16% tint over surface and page background', (meta) => {
    const fg = rgb(token(block, `--meta-${meta}`) ?? token(light, `--meta-${meta}`)!)
    for (const surface of ['--color-surface', '--color-bg']) {
      const bg = mix(fg, rgb(inherit(surface)), 0.16)
      expect(ratio(fg, bg), `${meta} on ${surface}`).toBeGreaterThanOrEqual(4.5)
    }
  })
})
