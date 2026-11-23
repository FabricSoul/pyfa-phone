import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { stampSw } from './99_stamp_sw.mjs'

const DIST = path.resolve('dist')
const SW_PATH = path.join(DIST, 'sw.js')
const MANIFEST_PATH = path.join(DIST, 'data', 'manifest.json')

test('dist/sw.js precache list includes db file from manifest after build and stamp', () => {
  assert.ok(fs.existsSync(SW_PATH), 'dist/sw.js exists')
  assert.ok(fs.existsSync(MANIFEST_PATH), 'dist/data/manifest.json exists')

  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'))
  const swContent = fs.readFileSync(SW_PATH, 'utf8')

  assert.ok(manifest.db && manifest.db.file, 'manifest has db.file')
  assert.ok(
    swContent.includes(manifest.db.file),
    `dist/sw.js should include db file: ${manifest.db.file}`
  )
})

test('changing dataVersion in manifest and restamping changes cache name', () => {
  const originalManifestRaw = fs.readFileSync(MANIFEST_PATH, 'utf8')
  try {
    stampSw(DIST)
    const swOriginal = fs.readFileSync(SW_PATH, 'utf8')
    const matchOriginal = swOriginal.match(/CACHE_NAME\s*=\s*['"`]([^'"`]+)['"`]/)
    assert.ok(matchOriginal, 'CACHE_NAME found in original sw.js')
    const originalCacheName = matchOriginal[1]

    const manifestObj = JSON.parse(originalManifestRaw)
    manifestObj.dataVersion = 'modified-version-9999'
    fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifestObj, null, 2), 'utf8')

    stampSw(DIST)
    const swModified = fs.readFileSync(SW_PATH, 'utf8')
    const matchModified = swModified.match(/CACHE_NAME\s*=\s*['"`]([^'"`]+)['"`]/)
    assert.ok(matchModified, 'CACHE_NAME found in restamped sw.js')
    const modifiedCacheName = matchModified[1]

    assert.notEqual(originalCacheName, modifiedCacheName, 'Cache name must change when dataVersion changes')
    assert.ok(modifiedCacheName.includes('modified-version-9999'), 'New cache name includes new dataVersion')
  } finally {
    fs.writeFileSync(MANIFEST_PATH, originalManifestRaw, 'utf8')
    stampSw(DIST)
  }
})

test('price API domains are not in precache list', () => {
  const swContent = fs.readFileSync(SW_PATH, 'utf8')
  const precacheMatch = swContent.match(/PRECACHE_URLS\s*=\s*\[([\s\S]*?)\]/)
  const precacheBlock = precacheMatch ? precacheMatch[1] : swContent

  assert.ok(!precacheBlock.includes('fuzzwork.co.uk'), 'fuzzwork.co.uk must not be in precache list')
  assert.ok(!precacheBlock.includes('esi.evetech.net'), 'esi.evetech.net must not be in precache list')
})

test('precache list includes ship renders and fit item icons, but not all 1734 icons', () => {
  const swContent = fs.readFileSync(SW_PATH, 'utf8')
  const precacheMatch = swContent.match(/PRECACHE_URLS\s*=\s*(\[[\s\S]*?\]);?/)
  assert.ok(precacheMatch, 'PRECACHE_URLS found in sw.js')
  const list = JSON.parse(precacheMatch[1])

  // Ship renders are precached
  const renders = list.filter((url) => url.startsWith('/img/renders/'))
  assert.ok(renders.length > 0, 'ship renders must be precached')

  // Fit item icons are precached
  const icons = list.filter((url) => url.startsWith('/img/icons/'))
  assert.ok(icons.length > 0, 'fit item icons must be precached')
  // Should NOT precache all 1734 icons
  assert.ok(icons.length < 500, `icons count (${icons.length}) must be bounded, not all 1734 icons`)
})

// ── #11 install / activate safety ───────────────────────────────────────────
import vm from 'node:vm'

function runSw(source, { failing = [], existing = ['pyfa-old-1'] } = {}) {
  const store = new Map(existing.map((n) => [n, new Map()]))
  const listeners = {}
  let skipped = false
  const caches = {
    async open(name) {
      if (!store.has(name)) store.set(name, new Map())
      const entries = store.get(name)
      return {
        async addAll(urls) {
          for (const u of urls) entries.set(u, 'partial')
          if (urls.some((u) => failing.includes(u))) throw new TypeError('network error')
        },
        async match() {}, async put() {},
      }
    },
    async keys() { return [...store.keys()] },
    async delete(name) { return store.delete(name) },
  }
  const self = {
    addEventListener: (type, fn) => { listeners[type] = fn },
    skipWaiting: async () => { skipped = true },
    clients: { claim: async () => {} },
  }
  vm.runInNewContext(source, { self, caches, console: { warn() {} }, URL, location: { origin: 'http://x' }, fetch() {}, Response })
  const dispatch = async (type) => {
    let pending
    listeners[type]({ waitUntil: (p) => { pending = p } })
    await pending
  }
  return { store, dispatch, skipped: () => skipped }
}

test('a failed precache keeps the old cache and fails the install so the old worker stays', async () => {
  const source = fs.readFileSync(path.resolve('public', 'sw.js'), 'utf8')
  const sw = runSw(source, { failing: ['/manifest.webmanifest'] })
  await assert.rejects(sw.dispatch('install'))
  assert.ok(sw.store.has('pyfa-old-1'), 'old cache must survive')
  assert.ok(![...sw.store.keys()].some((k) => k !== 'pyfa-old-1'), 'half-filled new cache is discarded')
  assert.equal(sw.skipped(), false, 'must not skip waiting after a failed install')
})

test('old caches are deleted only after a fully successful install, at activate', async () => {
  const source = fs.readFileSync(path.resolve('public', 'sw.js'), 'utf8')
  const sw = runSw(source)
  await sw.dispatch('install')
  assert.ok(sw.store.has('pyfa-old-1'), 'install alone must not delete the old cache')
  assert.equal(sw.skipped(), true)
  await sw.dispatch('activate')
  assert.ok(!sw.store.has('pyfa-old-1'))
  assert.ok(sw.store.has('pyfa-dev-dev'))
})
