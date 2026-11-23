import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TOKEN_GROUPS } from './TokensPage'

// 守卫测试：tokens.css 里声明的每个变量都必须在 /dev/tokens 页面列出（设计文档 §7）。
const css = readFileSync(resolve(process.cwd(), 'src/styles/tokens.css'), 'utf8')
const declared = [...new Set([...css.matchAll(/(--[a-z0-9-]+)\s*:/g)].map(m => m[1]!))]

describe('tokens page', () => {
  it('lists every token declared in tokens.css', () => {
    const listed = new Set(TOKEN_GROUPS.flatMap(g => g.tokens.map(t => t.name)))
    const missing = declared.filter(n => !listed.has(n))
    expect(missing).toEqual([])
  })
  it('does not list tokens that tokens.css lacks', () => {
    const extra = TOKEN_GROUPS.flatMap(g => g.tokens.map(t => t.name)).filter(n => !declared.includes(n))
    expect(extra).toEqual([])
  })
})
