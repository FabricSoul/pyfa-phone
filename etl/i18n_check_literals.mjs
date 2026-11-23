// Fails when UI text is written straight into JSX instead of going through _t():
// JSX text nodes, and string values of the placeholder / aria-label / title attributes.
// Text counts as UI text when it contains a Latin letter or a CJK character.
// Test files (*.test.ts[x]) and src/dev/ are not checked.
import { REPO_ROOT, isMain, lineOf, listSources, parseSource, ts } from './i18n_po.mjs'

const TEXT_ATTRS = new Set(['placeholder', 'aria-label', 'title'])
const WORDY = /[A-Za-z㐀-鿿豈-﫿぀-ヿ]/

/** @returns {{file: string, line: number, text: string}[]} */
export function findLiterals(root) {
  const found = []
  for (const rel of listSources(root, { skipTests: true, skipDev: true })) {
    const sf = parseSource(root, rel)
    const report = (node, text) => {
      const t = text.replace(/\s+/g, ' ').trim()
      if (WORDY.test(t)) found.push({ file: rel, line: lineOf(sf, node), text: t })
    }
    // Literals inside an attribute expression, not descending into _t() calls.
    const visitExpr = (node) => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === '_t') return
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return report(node, node.text)
      if (ts.isTemplateExpression(node)) {
        report(node.head, node.head.text)
        for (const s of node.templateSpans) { visitExpr(s.expression); report(s.literal, s.literal.text) }
        return
      }
      ts.forEachChild(node, visitExpr)
    }
    const visit = (node) => {
      if (ts.isJsxText(node)) report(node, node.text)
      else if (ts.isJsxAttribute(node) && TEXT_ATTRS.has(node.name.getText(sf)) && node.initializer) {
        const init = node.initializer
        if (ts.isStringLiteral(init)) report(init, init.text)
        else if (ts.isJsxExpression(init) && init.expression) visitExpr(init.expression)
        return
      }
      ts.forEachChild(node, visit)
    }
    visit(sf)
  }
  return found
}

if (isMain(import.meta.url)) {
  const found = findLiterals(REPO_ROOT)
  for (const f of found) console.error(`${f.file}:${f.line}: UI text not wrapped in _t(): ${JSON.stringify(f.text)}`)
  if (found.length) {
    console.error(`i18n_check_literals: ${found.length} untranslated UI string(s)`)
    process.exit(1)
  }
  console.log('i18n_check_literals: ok')
}
