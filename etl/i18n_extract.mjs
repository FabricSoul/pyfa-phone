// Extracts _t(...) messages from src/**/*.{ts,tsx} into locale/lang.pot.
// Equivalent of pyfa's `xgettext -k_t -k_t:1,2,3t -s`, but parsed with the TypeScript
// compiler API because xgettext cannot read TSX. Call forms:
//   _t("msgid")   _t("msgid", "plural", n)   _t("msgid", { context: "ctx" })
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { CTX_SEP, REPO_ROOT, byMsgid, isMain, lineOf, listSources, literalValue, nowStamp, parseSource, renderEntry, renderHeader, ts } from './i18n_po.mjs'

/** @returns Map<ctx\u0004msgid, { msgctxt?, msgid, msgid_plural?, refs: string[] }> */
export function extractMessages(root) {
  const messages = new Map()
  const errors = []
  for (const rel of listSources(root)) {
    const sf = parseSource(root, rel)
    const visit = (node) => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === '_t') {
        const where = `${rel}:${lineOf(sf, node)}`
        const [a0, a1, a2] = node.arguments
        const msgid = literalValue(a0)
        let msgctxt, msgid_plural
        if (msgid === undefined) errors.push(`${where}: _t() msgid must be a string literal`)
        else if (a1 && ts.isObjectLiteralExpression(a1)) {
          const prop = a1.properties.find((p) => ts.isPropertyAssignment(p) && p.name.getText(sf) === 'context')
          msgctxt = prop && literalValue(prop.initializer)
          if (msgctxt === undefined) errors.push(`${where}: _t() context must be a string literal`)
        } else if (a1) {
          msgid_plural = literalValue(a1)
          if (msgid_plural === undefined || !a2) errors.push(`${where}: plural _t() needs (msgid, "plural", n)`)
        }
        if (msgid !== undefined) {
          const key = `${msgctxt ?? ''}${CTX_SEP}${msgid}`
          const prev = messages.get(key)
          if (prev) {
            if (!prev.refs.includes(where)) prev.refs.push(where)
            if (msgid_plural !== undefined && prev.msgid_plural !== undefined && prev.msgid_plural !== msgid_plural)
              errors.push(`${where}: "${msgid}" used with two different plurals`)
            prev.msgid_plural ??= msgid_plural
          } else {
            messages.set(key, { msgctxt, msgid, msgid_plural, refs: [where] })
          }
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(sf)
  }
  if (errors.length) throw new Error(errors.join('\n'))
  return messages
}

const POT_COMMENT = `# SOME DESCRIPTIVE TITLE.
# Copyright (C) YEAR THE PACKAGE'S COPYRIGHT HOLDER
# This file is distributed under the same license as the PACKAGE package.
# FIRST AUTHOR <EMAIL@ADDRESS>, YEAR.
#
#, fuzzy`

/** Renders the template in pyfa's lang.pot layout. Keeps prevPot's date when nothing changed. */
export function renderPot(messages, prevPot = null) {
  const body = [...messages.values()].sort(byMsgid).map((m) => renderEntry({ ...m, msgstr: [] })).join('\n\n')
  const prevDate = prevPot && prevPot.slice(prevPot.indexOf('\n\n#')).trim() === body.trim()
    ? prevPot.match(/"POT-Creation-Date: ([^\\]*)\\n"/)?.[1] : undefined
  const header = renderHeader([
    ['Project-Id-Version', 'PACKAGE VERSION'],
    ['Report-Msgid-Bugs-To', ''],
    ['POT-Creation-Date', prevDate ?? nowStamp()],
    ['PO-Revision-Date', 'YEAR-MO-DA HO:MI+ZONE'],
    ['Last-Translator', 'FULL NAME <EMAIL@ADDRESS>'],
    ['Language-Team', 'LANGUAGE <LL@li.org>'],
    ['Language', ''],
    ['MIME-Version', '1.0'],
    ['Content-Type', 'text/plain; charset=CHARSET'],
    ['Content-Transfer-Encoding', '8bit'],
    ['Plural-Forms', 'nplurals=INTEGER; plural=EXPRESSION;'],
  ], POT_COMMENT)
  return `${header}\n\n${body}\n`
}

if (isMain(import.meta.url)) {
  const out = join(REPO_ROOT, 'locale/lang.pot')
  const messages = extractMessages(REPO_ROOT)
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, renderPot(messages, existsSync(out) ? readFileSync(out, 'utf8') : null))
  console.log(`i18n_extract: ${messages.size} msgids → locale/lang.pot`)
}
