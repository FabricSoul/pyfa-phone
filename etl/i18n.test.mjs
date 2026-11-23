import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { extractMessages, renderPot } from './i18n_extract.mjs'
import { mergePo } from './i18n_merge.mjs'
import { compilePo } from './i18n_compile.mjs'
import { findLiterals } from './i18n_check_literals.mjs'

function sampleRoot(files) {
  const root = mkdtempSync(join(tmpdir(), 'i18n-test-'))
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(join(root, rel, '..'), { recursive: true })
    writeFileSync(join(root, rel), text)
  }
  return root
}

const SAMPLE = `import { _t } from '../i18n/t'
export function Demo({ n }: { n: number }) {
  return (
    <div title={_t("Tooltip")}>
      <h1>{_t("A")}</h1>
      <p>{_t("%d ship", "%d ships", n)}</p>
      <button>{_t('Open', { context: 'menu' })}</button>
      <span>{_t(\`Quote "me"\`)}</span>
      <span>{_t("A")}</span>
    </div>
  )
}
`

test('extract: plain, plural, context, references, sorted', () => {
  const root = sampleRoot({ 'src/components/Demo.tsx': SAMPLE, 'src/components/Demo.test.tsx': '_t("Only in test")' })
  const msgs = extractMessages(root)
  const pot = renderPot(msgs)
  assert.match(pot, /#: src\/components\/Demo\.tsx:5 src\/components\/Demo\.tsx:9\nmsgid "A"\nmsgstr ""/)
  assert.match(pot, /msgid "%d ship"\nmsgid_plural "%d ships"\nmsgstr\[0\] ""\nmsgstr\[1\] ""/)
  assert.match(pot, /msgctxt "menu"\nmsgid "Open"\nmsgstr ""/)
  assert.match(pot, /msgid "Quote \\"me\\""/)
  assert.doesNotMatch(pot, /Only in test/)
  const ids = [...pot.matchAll(/^msgid "(.+)"$/gm)].map((m) => m[1])
  assert.deepEqual(ids, [...ids].sort())
  assert.match(pot, /^msgid ""\nmsgstr ""\n"Project-Id-Version: /m)
})

test('extract: non-literal argument is an error', () => {
  const root = sampleRoot({ 'src/x.ts': 'const s = "a"; _t(s)' })
  assert.throws(() => extractMessages(root), /src\/x\.ts:1/)
})

const POT = renderPot(new Map([
  ['\u0004Firepower', { msgid: 'Firepower', refs: ['src/a.tsx:1'] }],
  ['\u0004Brand new', { msgid: 'Brand new', refs: ['src/a.tsx:2'] }],
  ['\u0004Kept', { msgid: 'Kept', refs: ['src/a.tsx:3'] }],
]))
const COMPENDIUM = `msgid ""
msgstr ""
"Language: zh_CN\\n"
"Content-Type: text/plain; charset=UTF-8\\n"
"Plural-Forms: nplurals=1; plural=0;\\n"

msgid "Firepower"
msgstr "火力"

msgid "Kept"
msgstr "pyfa 的译文"
`
const EXISTING = `msgid ""
msgstr ""
"Language: zh_CN\\n"

msgid "Kept"
msgstr "我们自己的译文"

msgid "Removed"
msgstr "已删除"
`

test('merge: compendium fills exact matches, existing translations win, removed become obsolete', () => {
  const po = mergePo({ potText: POT, defText: EXISTING, compendiumText: COMPENDIUM, lang: 'zh_CN' })
  assert.match(po, /msgid "Firepower"\nmsgstr "火力"/)
  assert.match(po, /msgid "Kept"\nmsgstr "我们自己的译文"/)
  assert.match(po, /msgid "Brand new"\nmsgstr ""/)
  assert.match(po, /#~ msgid "Removed"\n#~ msgstr "已删除"/)
  assert.match(po, /"Plural-Forms: nplurals=1; plural=0;\\n"/)
  const fresh = mergePo({ potText: POT, defText: null, compendiumText: COMPENDIUM, lang: 'zh_CN' })
  assert.match(fresh, /msgid "Kept"\nmsgstr "pyfa 的译文"/)
})

test('compile: translated entries only, context and plural keys', () => {
  const json = compilePo(`msgid ""
msgstr ""

msgid "A"
msgstr "甲"

msgid "Empty"
msgstr ""

#, fuzzy
msgid "Fuzzy"
msgstr "模糊"

msgctxt "menu"
msgid "Open"
msgstr "打开"

msgid "%d ship"
msgid_plural "%d ships"
msgstr[0] "%d 艘船"
`)
  assert.deepEqual(json, { A: '甲', 'menu\u0004Open': '打开', '%d ship': ['%d 艘船'] })
})

test('check literals: flags raw JSX text and attributes, skips _t, tests and src/dev', () => {
  const root = sampleRoot({
    'src/Bad.tsx': `export const B = () => <div>
  <h1>Hello</h1>
  <input placeholder="搜索" aria-label={'Search'} title={_t("ok")} />
  <p>{_t("fine")} — 12</p>
</div>`,
    'src/Good.tsx': `export const G = () => <p className="x">{_t("Hi")} {42}</p>`,
    'src/Bad.test.tsx': `export const T = () => <p>Test text</p>`,
    'src/dev/Page.tsx': `export const D = () => <p>Dev text</p>`,
  })
  const found = findLiterals(root).map((f) => `${f.file}:${f.line}:${f.text}`)
  assert.deepEqual(found, ['src/Bad.tsx:2:Hello', 'src/Bad.tsx:3:搜索', 'src/Bad.tsx:3:Search'])
})

test('check literals: flags strings in JSX expression children and every text-like attribute', () => {
  const root = sampleRoot({
    'src/Expr.tsx': `export const E = ({ on }: { on: boolean }) => <div aria-description="Long text" alt="Ship" aria-roledescription={on ? 'Dial' : _t('ok')}>
  {'Hello'}
  {on && 'Shown'}
  {on ? 'Yes' : _t('No')}
  {\`Tpl \${on}\`}
  {on === true ? _t('ok') : null}
  <img src="/x.png" data-state="active" className={on ? 'row on' : 'row'} />
</div>`,
  })
  const found = findLiterals(root).map((f) => f.text)
  assert.deepEqual(found, ['Long text', 'Ship', 'Dial', 'Hello', 'Shown', 'Yes', 'Tpl'])
})

test('extract and check literals: follow an aliased _t import', () => {
  const root = sampleRoot({
    'src/Alias.tsx': `import { _t as tr } from '../i18n/t'
export const A = () => <div title={tr('Aliased')}>{tr('Body')}{'raw'}</div>`,
  })
  assert.deepEqual([...extractMessages(root).values()].map((m) => m.msgid).sort(), ['Aliased', 'Body'])
  assert.deepEqual(findLiterals(root).map((f) => f.text), ['raw'])
})
