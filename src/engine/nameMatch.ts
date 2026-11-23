/**
 * pyfa's market search for the mock engine: words are split on spaces, `*` and `?` are wildcards, and every
 * word must match. The real engine does the same in Python.
 */
export function nameMatcher(query?: string): ((...names: string[]) => boolean) | undefined {
  const words = (query ?? '').trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return undefined
  const patterns = words.map((word) => new RegExp(
    word.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '\\w*').replace(/\?/g, '\\w?'), 'iu'))
  return (...names) => names.some((name) => name !== '' && patterns.every((pattern) => pattern.test(name)))
}
