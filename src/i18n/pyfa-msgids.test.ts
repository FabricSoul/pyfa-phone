import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// 这些界面文字在 pyfa 里有原文，msgid 必须逐字一致（含尾随空格和冒号），才能复用 pyfa 的中文翻译。
const PYFA_EXACT = ['Remote Repairs', 'Lasts ', 'Warp Speed', 'PowerGrid', 'Current', 'Stable: ', 'Cargo bay']
const zh = JSON.parse(readFileSync(resolve(process.cwd(), 'src/i18n/locales/zh_CN.json'), 'utf8')) as Record<string, string>
const pyfaPot = readFileSync(resolve(process.cwd(), 'vendor/pyfa/locale/lang.pot'), 'utf8')
const used = readFileSync(resolve(process.cwd(), 'locale/lang.pot'), 'utf8')

describe('msgids copied verbatim from pyfa', () => {
  for (const id of PYFA_EXACT) {
    it(`"${id}" exists in pyfa, is used here and has a Chinese translation`, () => {
      expect(pyfaPot).toContain(`msgid "${id}"`)
      expect(used).toContain(`msgid "${id}"`)
      expect(zh[id]).toBeTruthy()
    })
  }
})
