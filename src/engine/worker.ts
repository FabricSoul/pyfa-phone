import { expose } from 'comlink'
import type * as Pyodide from 'pyodide'
import pkg from '../../package.json'
import type { EngineWorkerApi } from './client'
import { mountDatabase, prepareDatabase } from './database'
import { countResponse, countingFetch, createProgress, type ReportBytes } from './progress'

async function fetchAsset(url: URL, onBytes?: ReportBytes) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Engine asset request failed (${response.status}): ${url.pathname}`)
  return onBytes ? countResponse(response, onBytes) : response
}

type RuntimeManifest = { version: string; files?: { file: string; bytes: number }[] }

interface EngineManifest {
  dataVersion: string
  clientBuild: string
  db: { file: string; bytes: number; sha256: string; expandedBytes?: number; encoding: 'gzip' }
  names: { file: string; bytes: number }
  py: { file: string; bytes: number }
  pyodide: RuntimeManifest
}

async function loadRuntime(manifestUrl: URL, { version, files = [] }: RuntimeManifest, onBytes: ReportBytes) {
  if (version !== pkg.dependencies.pyodide) throw new Error('Engine assets contain an incompatible Pyodide version')
  const started = performance.now()
  const indexURL = new URL(`../pyodide/${version}/`, manifestUrl).href
  const moduleUrl = new URL('pyodide.mjs', indexURL).href
  const { loadPyodide }: typeof Pyodide = await import(/* @vite-ignore */ moduleUrl)
  // Pyodide downloads its files itself; count the bytes of the ones under its index URL for the boot page.
  const originalFetch = self.fetch
  const fetch = originalFetch.bind(self)
  const wasm = `${indexURL}pyodide.asm.wasm`
  const cache = `pyfa:runtime:${version}`
  const cachedSource = async (url: string) =>
    (await self.caches?.match(url, { cacheName: cache }).catch(() => undefined)) ? 'cache' : 'network'
  const assetBytes = (url: string) => files.find(({ file }) => file === new URL(url).pathname)?.bytes ?? 0
  let packageStart: number | undefined
  self.fetch = countingFetch(async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (url.startsWith(indexURL) && /(?:\.whl|\/sqlite3-[^/]+\.zip)$/.test(url)) packageStart ??= performance.now()
    if (url !== wasm) return fetch(input, init)
    const source = cachedSource(url)
    const response = await fetch(input, init)
    if (response.ok) onBytes(assetBytes(url), await source)
    return response
  }, (url) => url.startsWith(indexURL) && url !== wasm, onBytes)
  try {
    // Loading packages as part of bootstrap overlaps their download with runtime setup.
    const runtime = await loadPyodide({ indexURL, packages: ['sqlalchemy', 'pyyaml', 'sqlite3'] })
    performance.measure('loadPyodide', { start: started })
    if (packageStart !== undefined) performance.measure('loadPackage (overlapping)', { start: packageStart })
    for (const url of [moduleUrl, `${indexURL}pyodide.asm.js`]) onBytes(assetBytes(url), await cachedSource(url))
    return runtime
  } finally {
    self.fetch = originalFetch
  }
}

async function initialize(report: Parameters<EngineWorkerApi['ready']>[0], reportProgress: Parameters<EngineWorkerApi['ready']>[1]) {
  await report?.('runtime')
  const manifestUrl = new URL(`${import.meta.env.BASE_URL}data/manifest.json`, self.location.origin)
  const manifest: EngineManifest = await fetchAsset(manifestUrl).then((response) => response.json())
  // Real byte counts for the boot page, throttled so the Worker does not flood the main thread.
  let last = 0
  const progress = createProgress({
    runtime: (manifest.pyodide.files ?? []).reduce((sum, file) => sum + (file.file.endsWith('/package.json') ? 0 : file.bytes), 0),
    data: manifest.db.bytes + manifest.names.bytes + manifest.py.bytes,
  }, (snapshot) => {
    const now = Date.now()
    if (now - last < 100) return
    last = now
    void reportProgress?.(snapshot)
  })
  const count: ReportBytes = (bytes, source) => progress.add('data', bytes, source)
  const dbStart = performance.now()
  const [runtime, database, sources, names] = await Promise.all([
    loadRuntime(manifestUrl, manifest.pyodide, (bytes, source) => progress.add('runtime', bytes, source))
      .then(async (runtime) => {
        void reportProgress?.(progress.snapshot())
        await report?.('data')
        return runtime
      }),
    prepareDatabase(manifest.db,
      () => fetchAsset(new URL(manifest.db.file, manifestUrl), count),
      () => count(manifest.db.bytes, 'cache'),
    ).then((database) => {
      performance.measure('eve.db preparation', { start: dbStart })
      return database
    }),
    fetchAsset(new URL(manifest.py.file, manifestUrl), count).then((response) => response.arrayBuffer()),
    fetchAsset(new URL(manifest.names.file, manifestUrl), count).then((response) => response.arrayBuffer()),
  ])
  const mountStart = performance.now()
  await mountDatabase(runtime, database)
  performance.measure('eve.db mount/write', { start: mountStart })
  void reportProgress?.(progress.snapshot())
  await report?.('initialize')
  const pyStart = performance.now()
  runtime.FS.writeFile('/pyfa.zip', new Uint8Array(sources))
  runtime.FS.writeFile('/names.json', new Uint8Array(names))
  runtime.globals.set('_asset_version', manifest.dataVersion)
  runtime.globals.set('_client_build', manifest.clientBuild)
  runtime.runPython(`
import sys
sys.path.insert(0, '/pyfa.zip')
import api
`)
  performance.measure('py.zip setup', { start: pyStart })
  const eosStart = performance.now()
  runtime.runPython(`
api.initialize('/eve.db', '/names.json', _asset_version, _client_build)
del _asset_version, _client_build
`)
  performance.measure('import eos and initialize', { start: eosStart })
  return runtime
}

let startup: ReturnType<typeof initialize> | undefined
const runtime = (report?: Parameters<EngineWorkerApi['ready']>[0], progress?: Parameters<EngineWorkerApi['ready']>[1]) => (startup ??= initialize(report, progress))

let firstCalcMeasured = false

type Operation = Exclude<keyof EngineWorkerApi, 'ready'>
const pythonFunction: Record<Operation, string> = {
  calc: 'calc',
  shipCatalog: 'ship_catalog',
  itemsForExtra: 'items_for_extra',
  implantSets: 'implant_sets',
  fillEmptySlots: 'fill_empty_slots',
  itemInfo: 'item_info',
  getDataVersion: 'get_data_version',
  marketGroupsForSlot: 'market_groups_for_slot',
  marketTreeForSlot: 'market_tree_for_slot',
  itemsForSlot: 'items_for_slot',
  chargesFor: 'charges_for',
  variationsOf: 'variations_of',
  importText: 'import_text',
  importAdditions: 'import_additions',
  exportText: 'export_text',
  missingSkills: 'missing_skills',
}

async function call<K extends Operation>(
  operation: K, ...args: Parameters<EngineWorkerApi[K]>
): Promise<Awaited<ReturnType<EngineWorkerApi[K]>>> {
  const pyodide = await runtime()
  const payload = JSON.stringify(args)
  // Pass arguments as data to Python. No user-provided text is evaluated as code.
  pyodide.globals.set('_payload', payload)
  try {
    const calcStart = performance.now()
    const result: string = pyodide.runPython(`api.invoke('${pythonFunction[operation]}', _payload)`)
    if (operation === 'calc' && !firstCalcMeasured) {
      performance.measure('calc', { start: calcStart })
      firstCalcMeasured = true
    }
    return JSON.parse(result)
  } finally {
    pyodide.globals.delete('_payload')
  }
}

expose({
  async ready(report, progress) { await runtime(report, progress) },
  calc: (...args) => call('calc', ...args),
  shipCatalog: (...args) => call('shipCatalog', ...args),
  itemsForExtra: (...args) => call('itemsForExtra', ...args),
  implantSets: () => call('implantSets'),
  fillEmptySlots: (...args) => call('fillEmptySlots', ...args),
  itemInfo: (...args) => call('itemInfo', ...args),
  getDataVersion: () => call('getDataVersion'),
  marketGroupsForSlot: (...args) => call('marketGroupsForSlot', ...args),
  marketTreeForSlot: (...args) => call('marketTreeForSlot', ...args),
  itemsForSlot: (...args) => call('itemsForSlot', ...args),
  chargesFor: (...args) => call('chargesFor', ...args),
  variationsOf: (...args) => call('variationsOf', ...args),
  importText: (...args) => call('importText', ...args),
  importAdditions: (...args) => call('importAdditions', ...args),
  exportText: (...args) => call('exportText', ...args),
  missingSkills: (...args) => call('missingSkills', ...args),
} satisfies EngineWorkerApi)
