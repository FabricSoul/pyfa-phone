// UI text translation, the pyfa way: English msgids wrapped in _t(), translations in
// locale/<lang>/LC_MESSAGES/lang.po, compiled to ./locales/<lang>.json by `pnpm i18n`.
// Missing translations fall back to the English msgid.
import { useSyncExternalStore } from 'react'

export type UiLanguage = 'zh_CN' | 'en_US'
/** msgid (or msgctxt + "\u0004" + msgid) → msgstr, or msgstr[] for plural entries. */
export type Catalog = Record<string, string | string[]>
export interface TOptions { context?: string }

const CTX_SEP = '\u0004'
const loaders = import.meta.glob<Catalog>('./locales/*.json', { import: 'default' })

/** Plural-Forms of each UI language, as in its lang.po header. */
const pluralIndex: Record<UiLanguage, (n: number) => number> = {
  zh_CN: () => 0, // nplurals=1; plural=0;
  en_US: (n) => (n !== 1 ? 1 : 0), // nplurals=2; plural=(n != 1);
}

let current: UiLanguage = 'en_US'
let catalog: Catalog = {}
let loadSeq = 0
const listeners = new Set<() => void>()

/** Pure lookup used by _t(); exported for tests. */
export function translate(cat: Catalog, lang: UiLanguage, msgid: string, a?: string | TOptions, n?: number): string {
  const plural = typeof a === 'string' ? a : undefined
  const context = typeof a === 'object' ? a.context : undefined
  const hit = cat[context !== undefined ? `${context}${CTX_SEP}${msgid}` : msgid]
  if (plural === undefined) return typeof hit === 'string' ? hit : msgid
  const count = n ?? 1
  if (Array.isArray(hit)) {
    const form = hit[pluralIndex[lang](count)]
    if (form) return form
  }
  return count === 1 ? msgid : plural
}

export function _t(msgid: string): string
export function _t(msgid: string, options: TOptions): string
export function _t(msgid: string, plural: string, n: number): string
export function _t(msgid: string, a?: string | TOptions, n?: number): string {
  return translate(catalog, current, msgid, a, n)
}

export function getUiLanguage(): UiLanguage {
  return current
}

/** Loads the language's catalog, then switches and notifies subscribers (re-rendering React). */
export async function setUiLanguage(lang: UiLanguage): Promise<void> {
  const seq = ++loadSeq
  const load = loaders[`./locales/${lang}.json`]
  const next = load ? await load() : {}
  if (seq !== loadSeq) return // a later call won
  if (typeof document !== 'undefined') document.documentElement.lang = lang.replace('_', '-')
  if (lang === current && next === catalog) return
  current = lang
  catalog = next
  for (const l of listeners) l()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** Current UI language; components calling it re-render when setUiLanguage() switches. */
export function useUiLanguage(): UiLanguage {
  return useSyncExternalStore(subscribe, getUiLanguage, getUiLanguage)
}
