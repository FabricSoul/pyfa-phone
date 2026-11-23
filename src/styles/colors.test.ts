import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// 守卫：src/ 下除 tokens.css 外不许出现裸颜色值（#hex、rgb()、hsl()）；颜色只能用 token（DESIGN.md §2）。
const SRC = resolve(process.cwd(), 'src')
const BARE = /#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla)\s*\(/g

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name)
    if (e.isDirectory()) return files(p)
    return /\.(css|tsx?)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) && e.name !== 'tokens.css' ? [p] : []
  })
}

/** Offending `file:line: match` for every bare colour in `text`. */
export function bareColors(text: string, name: string): string[] {
  return text.split('\n').flatMap((line, i) => (line.match(BARE) ?? []).map((m) => `${name}:${i + 1}: ${m}`))
}

describe('colour guard', () => {
  it('detects hex, rgb() and hsl() literals', () => {
    expect(bareColors('a{color:#fff;b:rgba(0,0,0,.4);c:hsl(1 2% 3%);d:var(--x)}', 'x.css')).toHaveLength(3)
  })
  it('has no bare colours under src/ outside tokens.css', () => {
    const bad = files(SRC).flatMap((f) => bareColors(readFileSync(f, 'utf8'), relative(SRC, f)))
    expect(bad).toEqual([])
  })
})
