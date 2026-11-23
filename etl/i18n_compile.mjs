// Compiles locale/<lang>/LC_MESSAGES/lang.po into src/i18n/locales/<lang>.json for the runtime
// (src/i18n/t.ts imports it on demand). Keys are msgid, or msgctxt + "\u0004" + msgid; values are
// the msgstr, or the msgstr[] array for plurals. Untranslated and fuzzy entries are left out.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import gettextParser from 'gettext-parser'
import { CTX_SEP, LANGS, REPO_ROOT, isMain } from './i18n_po.mjs'

export function compilePo(text) {
  const po = gettextParser.po.parse(text)
  const out = {}
  const all = []
  for (const group of Object.values(po.translations)) for (const e of Object.values(group)) all.push(e)
  all.sort((a, b) => (a.msgid < b.msgid ? -1 : a.msgid > b.msgid ? 1 : 0))
  for (const e of all) {
    if (e.msgid === '' && !e.msgctxt) continue
    if ((e.comments?.flag ?? '').split(',').some((f) => f.trim() === 'fuzzy')) continue
    if (!e.msgstr.length || e.msgstr.some((s) => s === '')) continue
    const key = e.msgctxt !== undefined ? `${e.msgctxt}${CTX_SEP}${e.msgid}` : e.msgid
    out[key] = e.msgid_plural !== undefined ? [...e.msgstr] : e.msgstr[0]
  }
  return out
}

if (isMain(import.meta.url)) {
  const dir = join(REPO_ROOT, 'src/i18n/locales')
  mkdirSync(dir, { recursive: true })
  for (const lang of LANGS) {
    const json = compilePo(readFileSync(join(REPO_ROOT, `locale/${lang}/LC_MESSAGES/lang.po`), 'utf8'))
    writeFileSync(join(dir, `${lang}.json`), `${JSON.stringify(json, null, 2)}\n`)
    console.log(`i18n_compile: ${lang} → src/i18n/locales/${lang}.json (${Object.keys(json).length} strings)`)
  }
}
