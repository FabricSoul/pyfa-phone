import { expose } from 'comlink'
import type * as Pyodide from 'pyodide'
import pkg from '../../package.json'
import type { EngineWorkerApi } from './client'

async function fetchAsset(url: URL) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Engine asset request failed (${response.status}): ${url.pathname}`)
  return response
}

interface EngineManifest {
  dataVersion: string
  clientBuild: string
  db: { file: string; encoding: 'gzip' }
  names: { file: string }
  py: { file: string }
  pyodide: { version: string }
}

async function loadRuntime(manifestUrl: URL, version: string) {
  if (version !== pkg.dependencies.pyodide) throw new Error('Engine assets contain an incompatible Pyodide version')
  const indexURL = new URL(`../pyodide/${version}/`, manifestUrl).href
  const moduleUrl = new URL('pyodide.mjs', indexURL).href
  const { loadPyodide }: typeof Pyodide = await import(/* @vite-ignore */ moduleUrl)
  return loadPyodide({ indexURL, packages: ['sqlalchemy', 'pyyaml', 'cryptography', 'sqlite3'] })
}

async function initialize() {
  const manifestUrl = new URL(`${import.meta.env.BASE_URL}data/manifest.json`, self.location.origin)
  const manifest: EngineManifest = await fetchAsset(manifestUrl).then((response) => response.json())
  const [runtime, database, sources, names] = await Promise.all([
    loadRuntime(manifestUrl, manifest.pyodide.version),
    fetchAsset(new URL(manifest.db.file, manifestUrl)),
    fetchAsset(new URL(manifest.py.file, manifestUrl)).then((response) => response.arrayBuffer()),
    fetchAsset(new URL(manifest.names.file, manifestUrl)).then((response) => response.arrayBuffer()),
  ])
  if (!database.body) throw new Error('Game database response has no body')

  // Stream the expanded database into MEMFS instead of keeping a second 100 MB buffer.
  const stream = runtime.FS.open('/eve.db', 'w')
  const reader = database.body.pipeThrough(new DecompressionStream(manifest.db.encoding)).getReader()
  try {
    for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
      runtime.FS.write(stream, chunk.value, 0, chunk.value.byteLength)
    }
  } finally {
    await reader.cancel()
    runtime.FS.close(stream)
  }
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
const runtime = () => (startup ??= initialize())

// 只列出 Worker 已实现的操作；EngineClient 里的可选方法（itemInfo 等）由集成任务补上。
type Operation = Exclude<keyof EngineWorkerApi, 'ready' | 'itemInfo'>
const pythonFunction: Record<Operation, string> = {
  calc: 'calc',
  getDataVersion: 'get_data_version',
  marketGroupsForSlot: 'market_groups_for_slot',
  itemsForSlot: 'items_for_slot',
  chargesFor: 'charges_for',
  variationsOf: 'variations_of',
  importText: 'import_text',
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
  async ready() { await runtime() },
  calc: (...args) => call('calc', ...args),
  getDataVersion: () => call('getDataVersion'),
  marketGroupsForSlot: (...args) => call('marketGroupsForSlot', ...args),
  itemsForSlot: (...args) => call('itemsForSlot', ...args),
  chargesFor: (...args) => call('chargesFor', ...args),
  variationsOf: (...args) => call('variationsOf', ...args),
  importText: (...args) => call('importText', ...args),
  exportText: (...args) => call('exportText', ...args),
  missingSkills: (...args) => call('missingSkills', ...args),
} satisfies EngineWorkerApi)
