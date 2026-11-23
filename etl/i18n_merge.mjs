// Updates locale/<lang>/LC_MESSAGES/lang.po from locale/lang.pot, using pyfa's translations as a
// compendium. Same effect as
//   msgmerge -s --no-fuzzy-matching --compendium vendor/pyfa/locale/<lang>/LC_MESSAGES/lang.po \
//     locale/<lang>/LC_MESSAGES/lang.po locale/lang.pot
// implemented with gettext-parser because GNU gettext is not installed everywhere we build.
// An msgid that is byte-identical to one in pyfa (same msgctxt) gets pyfa's translation.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import gettextParser from 'gettext-parser'
import { LANGS, REPO_ROOT, byMsgid, isMain, nowStamp, renderEntry, renderHeader } from './i18n_po.mjs'

const parse = (text) => gettextParser.po.parse(text)

function entries(table) {
  const out = []
  for (const [ctx, group] of Object.entries(table ?? {}))
    for (const [id, e] of Object.entries(group)) if (id !== '' || ctx !== '') out.push(e)
  return out
}

const keyOf = (e) => `${e.msgctxt ?? ''}\u0004${e.msgid}`
const flagsOf = (e) => (e.comments?.flag ?? '').split(',').map((f) => f.trim()).filter(Boolean)
const isTranslated = (e) => e && !flagsOf(e).includes('fuzzy') && e.msgstr.length > 0 && e.msgstr.every((s) => s !== '')

const PLURAL_FALLBACK = { zh_CN: 'nplurals=1; plural=0;', en_US: 'nplurals=2; plural=(n != 1);' }

/** @returns the merged .po text. defText is the existing po (or null for a new language). */
export function mergePo({ potText, defText, compendiumText, lang }) {
  const pot = parse(potText)
  const def = defText ? parse(defText) : { headers: {}, translations: {}, obsolete: {} }
  const comp = compendiumText ? parse(compendiumText) : { headers: {}, translations: {} }
  const defMap = new Map([...entries(def.translations), ...entries(def.obsolete)].map((e) => [keyOf(e), e]))
  const compMap = new Map(entries(comp.translations).filter(isTranslated).map((e) => [keyOf(e), e]))

  const potKeys = new Set()
  const live = entries(pot.translations).map((p) => {
    potKeys.add(keyOf(p))
    const old = defMap.get(keyOf(p))
    const src = isTranslated(old) ? old : compMap.get(keyOf(p)) ?? old
    const plural = p.msgid_plural !== undefined
    let msgstr = src ? [...src.msgstr] : []
    if (!plural) msgstr = [msgstr[0] ?? '']
    const flags = flagsOf(p).filter((f) => f !== 'fuzzy')
    if (src && src === old && flagsOf(old).includes('fuzzy')) flags.unshift('fuzzy')
    return {
      msgctxt: p.msgctxt, msgid: p.msgid, msgid_plural: p.msgid_plural, msgstr,
      refs: (p.comments?.reference ?? '').split(/\s+/).filter(Boolean),
      translator: old?.comments?.translator, flags,
    }
  }).sort(byMsgid)

  const obsolete = [...defMap.values()]
    .filter((e) => !potKeys.has(keyOf(e)) && e.msgstr.some((s) => s !== ''))
    .map((e) => ({ msgctxt: e.msgctxt, msgid: e.msgid, msgid_plural: e.msgid_plural, msgstr: e.msgstr }))
    .sort(byMsgid)

  const h = { ...def.headers }
  const header = renderHeader([
    ['Project-Id-Version', h['Project-Id-Version'] ?? 'pyfa-phone'],
    ['Report-Msgid-Bugs-To', h['Report-Msgid-Bugs-To'] ?? ''],
    ['POT-Creation-Date', pot.headers['POT-Creation-Date'] ?? nowStamp()],
    ['PO-Revision-Date', h['PO-Revision-Date'] ?? nowStamp()],
    ['Last-Translator', h['Last-Translator'] ?? ''],
    ['Language-Team', h['Language-Team'] ?? comp.headers['Language-Team'] ?? ''],
    ['Language', lang],
    ['MIME-Version', '1.0'],
    ['Content-Type', 'text/plain; charset=UTF-8'],
    ['Content-Transfer-Encoding', '8bit'],
    ['Plural-Forms', h['Plural-Forms'] ?? comp.headers['Plural-Forms'] ?? PLURAL_FALLBACK[lang] ?? 'nplurals=2; plural=(n != 1);'],
  ])
  const blocks = [header, ...live.map((e) => renderEntry(e)), ...obsolete.map((e) => renderEntry(e, { obsolete: true }))]
  return `${blocks.join('\n\n')}\n`
}

if (isMain(import.meta.url)) {
  const potText = readFileSync(join(REPO_ROOT, 'locale/lang.pot'), 'utf8')
  for (const lang of LANGS) {
    const out = join(REPO_ROOT, `locale/${lang}/LC_MESSAGES/lang.po`)
    const compPath = join(REPO_ROOT, `vendor/pyfa/locale/${lang}/LC_MESSAGES/lang.po`)
    if (!existsSync(compPath)) throw new Error(`missing compendium ${compPath} (run git submodule update --init)`)
    const merged = mergePo({
      potText,
      defText: existsSync(out) ? readFileSync(out, 'utf8') : null,
      compendiumText: readFileSync(compPath, 'utf8'),
      lang,
    })
    mkdirSync(dirname(out), { recursive: true })
    writeFileSync(out, merged)
    console.log(`i18n_merge: ${lang} → locale/${lang}/LC_MESSAGES/lang.po`)
  }
}
