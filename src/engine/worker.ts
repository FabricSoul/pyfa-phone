import { expose } from 'comlink'
import type * as Pyodide from 'pyodide'
import pkg from '../../package.json'
import type { EngineWorkerApi } from './client'
import { countBody, countingFetch, createProgress } from './progress'

async function fetchAsset(url: URL, onBytes?: (bytes: number) => void) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Engine asset request failed (${response.status}): ${url.pathname}`)
  if (!onBytes || !response.body) return response
  return new Response(countBody(response.body, onBytes), { status: response.status, statusText: response.statusText, headers: response.headers })
}

interface EngineManifest {
  dataVersion: string
  clientBuild: string
  db: { file: string; bytes: number; encoding: 'gzip' }
  names: { file: string; bytes: number }
  py: { file: string; bytes: number }
  pyodide: { version: string; files?: { bytes: number }[] }
}

async function loadRuntime(manifestUrl: URL, version: string, onBytes?: (bytes: number) => void) {
  if (version !== pkg.dependencies.pyodide) throw new Error('Engine assets contain an incompatible Pyodide version')
  const indexURL = new URL(`../pyodide/${version}/`, manifestUrl).href
  const moduleUrl = new URL('pyodide.mjs', indexURL).href
  const { loadPyodide }: typeof Pyodide = await import(/* @vite-ignore */ moduleUrl)
  // Pyodide downloads its files itself; count the bytes of the ones under its index URL for the boot page.
  const originalFetch = self.fetch
  if (onBytes) self.fetch = countingFetch(originalFetch.bind(self), (url) => url.startsWith(indexURL), onBytes)
  try {
    return await loadPyodide({ indexURL, packages: ['sqlalchemy', 'pyyaml', 'cryptography', 'sqlite3'] })
  } finally {
    self.fetch = originalFetch
  }
}

async function initialize(report: Parameters<EngineWorkerApi['ready']>[0]) {
  await report?.('runtime')
  const manifestUrl = new URL(`${import.meta.env.BASE_URL}data/manifest.json`, self.location.origin)
  const manifest: EngineManifest = await fetchAsset(manifestUrl).then((response) => response.json())
  // Real byte counts for the boot page, throttled so the Worker does not flood the main thread.
  let stage: 'runtime' | 'data' = 'runtime'
  let last = 0
  const progress = createProgress({
    runtime: (manifest.pyodide.files ?? []).reduce((sum, file) => sum + file.bytes, 0),
    data: manifest.db.bytes + manifest.names.bytes + manifest.py.bytes,
  }, (snapshot) => {
    const now = Date.now()
    if (now - last < 100) return
    last = now
    void report?.(stage, snapshot)
  })
  const runtime = await loadRuntime(manifestUrl, manifest.pyodide.version, (bytes) => progress.add('runtime', bytes))
  stage = 'data'
  await report?.('data', progress.snapshot())
  const count = (bytes: number) => progress.add('data', bytes)
  const [database, sources, names] = await Promise.all([
    fetchAsset(new URL(manifest.db.file, manifestUrl), count),
    fetchAsset(new URL(manifest.py.file, manifestUrl), count).then((response) => response.arrayBuffer()),
    fetchAsset(new URL(manifest.names.file, manifestUrl), count).then((response) => response.arrayBuffer()),
  ])
  if (!database.body) throw new Error('Game database response has no body')
  // Preview servers can serve the gzip asset with Content-Encoding, which fetch decodes.
  // Inspect the bytes so both that response and a raw static asset work.
  const [probe, data] = database.body.tee()
  const head = probe.getReader()
  const { value } = await head.read()
  void head.cancel().catch(() => {})
  const decoded = value?.[0] === 0x1f ? data.pipeThrough(new DecompressionStream(manifest.db.encoding)) : data

  // Stream the expanded database into MEMFS instead of keeping a second 100 MB buffer.
  const stream = runtime.FS.open('/eve.db', 'w')
  const reader = decoded.getReader()
  try {
    for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
      runtime.FS.write(stream, chunk.value, 0, chunk.value.byteLength)
    }
  } finally {
    runtime.FS.close(stream)
    await reader.cancel().catch(() => {})
  }
  await report?.('initialize', progress.snapshot())
  runtime.FS.writeFile('/pyfa.zip', new Uint8Array(sources))
  runtime.FS.writeFile('/names.json', new Uint8Array(names))
  runtime.globals.set('_asset_version', manifest.dataVersion)
  runtime.globals.set('_client_build', manifest.clientBuild)
  runtime.runPython(`
import sys
sys.path.insert(0, '/pyfa.zip')
import api
api.initialize('/eve.db', '/names.json', _asset_version, _client_build)
del _asset_version, _client_build
`)
  return runtime
}

let startup: ReturnType<typeof initialize> | undefined
const runtime = (report?: Parameters<EngineWorkerApi['ready']>[0]) => (startup ??= initialize(report))

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
    const result: string = pyodide.runPython(`api.invoke('${pythonFunction[operation]}', _payload)`)
    return JSON.parse(result)
  } finally {
    pyodide.globals.delete('_payload')
  }
}

expose({
  async ready(report) { await runtime(report) },
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
