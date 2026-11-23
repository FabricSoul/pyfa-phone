// Fails when UI text is written straight into JSX instead of going through _t():
// JSX text nodes, strings in JSX expression children, and string values of the
// placeholder / title / alt / aria-* attributes.
// Text counts as UI text when it contains a Latin letter or a CJK character.
// Test files (*.test.ts[x]) and src/dev/ are not checked.
import { REPO_ROOT, isMain, lineOf, listSources, parseSource, ts } from './i18n_po.mjs'

// aria-* attributes whose value is read out as text (not ids, booleans or tokens).
const TEXT_ATTRS = new Set(['placeholder', 'title', 'alt', 'aria-label', 'aria-description', 'aria-roledescription',
  'aria-placeholder', 'aria-valuetext', 'aria-braillelabel', 'aria-brailleroledescription'])
const isTextAttr = (n) => TEXT_ATTRS.has(n)
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
    // Strings that end up on screen from a JSX expression: literals, templates, ternary branches,
    // `a && 'text'` / `a || 'text'`. Calls (incl. _t) and comparisons are not text.
    const visitExpr = (node) => {
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return report(node, node.text)
      if (ts.isTemplateExpression(node)) {
        report(node.head, node.head.text)
        for (const sp of node.templateSpans) { visitExpr(sp.expression); report(sp.literal, sp.literal.text) }
      } else if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isNonNullExpression(node)) visitExpr(node.expression)
      else if (ts.isConditionalExpression(node)) { visitExpr(node.whenTrue); visitExpr(node.whenFalse) }
      else if (ts.isBinaryExpression(node)) {
        const k = node.operatorToken.kind
        if (k === ts.SyntaxKind.AmpersandAmpersandToken) visitExpr(node.right)
        else if (k === ts.SyntaxKind.BarBarToken || k === ts.SyntaxKind.QuestionQuestionToken) { visitExpr(node.left); visitExpr(node.right) }
      } else if (ts.isArrayLiteralExpression(node)) node.elements.forEach(visitExpr)
    }
    const visit = (node) => {
      if (ts.isJsxText(node)) report(node, node.text)
      else if (ts.isJsxExpression(node) && node.expression && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))) visitExpr(node.expression)
      else if (ts.isJsxAttribute(node) && isTextAttr(node.name.getText(sf)) && node.initializer) {
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
