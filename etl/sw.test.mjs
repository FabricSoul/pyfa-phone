import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { tmpdir } from 'node:os'
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

const listOf = (source) => {
  const match = source.match(/^const CACHE_LAYERS = (.*)$/m)
  assert.ok(match, 'CACHE_LAYERS found in SW')
  const { shell, runtime, data, icons } = JSON.parse(match[1])
  return [shell, runtime, icons, ...data].filter(Boolean).flatMap(({ urls }) => urls)
}

test('price API domains are not in precache list', () => {
  const list = listOf(fs.readFileSync(SW_PATH, 'utf8'))
  assert.ok(list.every((url) => url.startsWith('/') && !url.startsWith('//')))
})

test('precache list includes ship renders and fit item icons, but not all 1734 icons', () => {
  const list = listOf(fs.readFileSync(SW_PATH, 'utf8'))

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

function runSw(source, { failing = [], store = new Map([['pyfa-old-1', new Map()]]) } = {}) {
  const listeners = {}
  const requested = []
  let skipped = false
  const caches = {
    async open(name) {
      if (!store.has(name)) store.set(name, new Map())
      const entries = store.get(name)
      return {
        async addAll(urls) {
          requested.push(...urls)
          for (const u of urls) entries.set(u, 'partial')
          if (urls.some((u) => failing.includes(u))) throw new TypeError('network error')
        },
        async match(url) { return entries.get(url) },
        async put(url, response) { entries.set(url, response) },
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
  return { store, dispatch, requested, skipped: () => skipped }
}

test('app deploys preserve runtime and data caches, and a new database replaces only that cache', async () => {
  const dir = fs.mkdtempSync(path.join(tmpdir(), 'pyfa-sw-'))
  const sha = (digit) => digit.repeat(64)
  const dbUrl = (digit) => `/data/eve.${sha(digit)}.db.gz`
  const pyUrl = `/data/py.${sha('b')}.zip`
  const runtimeUrl = '/pyodide/0.29.3/pyodide.asm.wasm'
  const legacy = `pyfa-old-app-${sha('a')}`
  const store = new Map([[legacy, new Map([
    [dbUrl('a'), 'legacy DB'], [runtimeUrl, 'legacy runtime'],
  ])]])
  const deploy = async (app, db) => {
    fs.copyFileSync('public/sw.js', path.join(dir, 'sw.js'))
    fs.rmSync(path.join(dir, 'assets'), { force: true, recursive: true })
    fs.mkdirSync(path.join(dir, 'assets'))
    fs.writeFileSync(path.join(dir, 'index.html'), `<script src="/assets/index-${app}.js"></script>`)
    fs.writeFileSync(path.join(dir, 'assets', `index-${app}.js`), app)
    fs.writeFileSync(path.join(dir, 'data', 'manifest.json'), JSON.stringify({
      dataVersion: sha(db), db: { file: path.basename(dbUrl(db)), sha256: sha(db) },
      py: { file: path.basename(pyUrl), sha256: sha('b') },
      pyodide: { version: '0.29.3', files: [{ file: runtimeUrl }] },
    }))
    stampSw(dir)
    const sw = runSw(fs.readFileSync(path.join(dir, 'sw.js'), 'utf8'), { store })
    await sw.dispatch('install')
    await sw.dispatch('activate')
    return sw.requested
  }
  const containing = (url) => [...store.values()].find((cache) => cache.has(url))
  try {
    fs.mkdirSync(path.join(dir, 'data'))
    const first = await deploy('one', 'a')
    assert.ok(!first.includes(runtimeUrl) && !first.includes(dbUrl('a')), 'migrate the legacy cache without HTTP')
    assert.ok(!store.has(legacy))
    const runtime = containing(runtimeUrl)
    const database = containing(dbUrl('a'))
    const sources = containing(pyUrl)
    assert.ok(runtime && database && sources)
    assert.equal(runtime.get(runtimeUrl), 'legacy runtime')
    assert.equal(database.get(dbUrl('a')), 'legacy DB')
    const second = await deploy('two', 'a')
    assert.equal(containing(runtimeUrl), runtime)
    assert.equal(containing(dbUrl('a')), database)
    assert.equal(containing(pyUrl), sources)
    assert.ok(!second.includes(runtimeUrl) && !second.includes(dbUrl('a')) && !second.includes(pyUrl))
    assert.equal(containing('/assets/index-one.js'), undefined)
    const shell = containing('/assets/index-two.js')
    const third = await deploy('two', 'c')
    assert.equal(containing(runtimeUrl), runtime)
    assert.equal(containing(pyUrl), sources)
    assert.equal(containing('/assets/index-two.js'), shell)
    assert.equal(containing(dbUrl('a')), undefined)
    assert.ok(third.includes(dbUrl('c')))
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

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
  assert.ok(sw.store.has('pyfa:app:dev'))
})

test('dist/sw.js precaches pyfa gui icons so the home page and boot page work offline', () => {
  assert.ok(fs.existsSync(path.join(DIST, 'img', 'gui', 'pyfa.png')), 'dist/img/gui/pyfa.png exists (run pnpm etl)')
  const swContent = fs.readFileSync(SW_PATH, 'utf8')
  for (const name of ['pyfa', 'turret_big', 'shieldActive_big', 'maxVelocity_big', 'capacitorInfo_big']) {
    assert.ok(swContent.includes(`/img/gui/${name}.png`), `precache list includes ${name}.png`)
  }
})

// 2026-11-23 outage: Cloudflare Pages answers /index.html with a 308 to /, so the precached
// /index.html is a redirected response, and Chrome fails a navigation answered with one (ERR_FAILED).
async function navigate(entries) {
  const source = fs.readFileSync(path.resolve('public', 'sw.js'), 'utf8')
  const shellName = JSON.parse(source.match(/^const CACHE_LAYERS = (.*)$/m)[1]).shell.name
  const store = new Map([[shellName, new Map(entries)]])
  const listeners = {}
  const caches = {
    async open(name) { if (!store.has(name)) store.set(name, new Map()); const e = store.get(name); return { async match(u) { return e.get(u) }, async put() {}, async addAll() {} } },
    async keys() { return [...store.keys()] },
    async delete(name) { return store.delete(name) },
  }
  const self = { addEventListener: (type, fn) => { listeners[type] = fn }, skipWaiting: async () => {}, clients: { claim: async () => {} } }
  vm.runInNewContext(source, { self, caches, console, URL, Headers, location: { origin: 'http://x' }, fetch: async () => new Response('network'), Response })
  let answer
  listeners.fetch({ request: { method: 'GET', mode: 'navigate', url: 'http://x/', headers: new Headers() }, respondWith: (p) => { answer = p } })
  return await answer
}

test('a navigation is never answered with a redirected cached response', async () => {
  const cached = new Response('index via redirect', { status: 200 })
  Object.defineProperty(cached, 'redirected', { value: true })
  const response = await navigate([['/index.html', cached]])
  assert.equal(response.redirected, false)
  assert.equal(await response.text(), 'index via redirect')
})

test('a navigation prefers the cached / over /index.html', async () => {
  const index = new Response('index'); Object.defineProperty(index, 'redirected', { value: true })
  const response = await navigate([['/', new Response('root')], ['/index.html', index]])
  assert.equal(await response.text(), 'root')
})
