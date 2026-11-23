// Shared helpers for the i18n scripts: source discovery, TSX parsing and PO text writing.
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript-api'

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))
export const LANGS = ['zh_CN', 'en_US']
/** Joins msgctxt and msgid, the same separator gettext uses inside .mo files. */
export const CTX_SEP = '\u0004'

const isTestFile = (p) => /\.test\.(ts|tsx)$/.test(p)

/** Lists src/**\/*.{ts,tsx} under root as repo-relative POSIX paths (sorted). */
export function listSources(root, { skipTests = true, skipDev = false } = {}) {
  const out = []
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, e.name)
      if (e.isDirectory()) { if (e.name !== 'node_modules') walk(abs); continue }
      if (!/\.(ts|tsx)$/.test(e.name) || e.name.endsWith('.d.ts')) continue
      const rel = relative(root, abs).split(sep).join('/')
      if (skipTests && isTestFile(rel)) continue
      if (skipDev && rel.startsWith('src/dev/')) continue
      out.push(rel)
    }
  }
  walk(join(root, 'src'))
  return out.sort()
}

export function parseSource(root, rel) {
  const text = readFileSync(join(root, rel), 'utf8')
  const kind = rel.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  return ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, kind)
}

export const lineOf = (sf, node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1

/** String value of a literal or no-substitution template, else undefined. */
export function literalValue(node) {
  if (node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))) return node.text
  return undefined
}

export { ts }

function escape(s) {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\t/g, '\\t').replace(/\r/g, '\\r').replace(/\n/g, '\\n')
}

/** Renders `keyword "value"`, splitting on newlines the way xgettext does. */
export function poString(keyword, value, prefix = '') {
  const parts = value.split(/(?<=\n)/)
  if (parts.length <= 1 || (parts.length === 2 && parts[1] === '')) return `${prefix}${keyword} "${escape(value)}"`
  return [`${prefix}${keyword} ""`, ...parts.filter((p) => p !== '').map((p) => `${prefix}"${escape(p)}"`)].join('\n')
}

export function renderHeader(headers, comment = '') {
  const lines = []
  if (comment) lines.push(comment)
  lines.push('msgid ""', 'msgstr ""')
  for (const [k, v] of headers) lines.push(`"${escape(`${k}: ${v}`)}\\n"`)
  return lines.join('\n')
}

/**
 * Renders one entry. e = { msgctxt?, msgid, msgid_plural?, msgstr: string[], refs?: string[],
 * translator?: string, flags?: string[] }. obsolete=true writes the `#~` form msgmerge uses.
 */
export function renderEntry(e, { obsolete = false } = {}) {
  const p = obsolete ? '#~ ' : ''
  const lines = []
  if (e.translator) for (const l of e.translator.split('\n')) lines.push(l ? `# ${l}` : '#')
  if (!obsolete && e.refs?.length) lines.push(`#: ${e.refs.join(' ')}`)
  if (e.flags?.length) lines.push(`#, ${e.flags.join(', ')}`)
  if (e.msgctxt !== undefined) lines.push(poString('msgctxt', e.msgctxt, p))
  lines.push(poString('msgid', e.msgid, p))
  if (e.msgid_plural !== undefined) {
    lines.push(poString('msgid_plural', e.msgid_plural, p))
    const strs = e.msgstr.length ? e.msgstr : ['', '']
    strs.forEach((s, i) => lines.push(poString(`msgstr[${i}]`, s, p)))
  } else {
    lines.push(poString('msgstr', e.msgstr[0] ?? '', p))
  }
  return lines.join('\n')
}

/** Sort like `xgettext -s` / `msgmerge -s`: by msgid, then msgctxt. */
export const byMsgid = (a, b) =>
  a.msgid < b.msgid ? -1 : a.msgid > b.msgid ? 1 : (a.msgctxt ?? '') < (b.msgctxt ?? '') ? -1 : (a.msgctxt ?? '') > (b.msgctxt ?? '') ? 1 : 0

export function nowStamp(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  const off = -d.getTimezoneOffset()
  const sign = off >= 0 ? '+' : '-'
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}` +
    `${sign}${pad(Math.floor(Math.abs(off) / 60))}${pad(Math.abs(off) % 60)}`
}

/** True when the module at metaUrl is the script node was started with. */
export const isMain = (metaUrl) => process.argv[1] && fileURLToPath(metaUrl) === process.argv[1]

/** Local names the file binds to the `_t` export (`import { _t as tr }`), plus `_t` itself. */
export function tNames(sf) {
  const names = new Set(['_t'])
  for (const st of sf.statements) {
    const b = ts.isImportDeclaration(st) && st.importClause?.namedBindings
    if (!b || !ts.isNamedImports(b)) continue
    for (const el of b.elements) if ((el.propertyName ?? el.name).text === '_t') names.add(el.name.text)
  }
  return names
}
