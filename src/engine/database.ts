/// <reference lib="dom.asynciterable" />

import type { PyodideAPI } from 'pyodide'

interface DatabaseAsset { sha256: string; expandedBytes?: number; encoding: 'gzip' }

function databaseLock(name: string) { return `pyfa-db:${name}` }

async function pruneOldDatabases(directory: FileSystemDirectoryHandle, name: string) {
  for await (const old of directory.values()) {
    if (old.name === name || !/^[a-f0-9]{64}\.sqlite$/.test(old.name)) continue
    // An active reader may still be copying its database into memory.
    await navigator.locks.request(databaseLock(old.name), { ifAvailable: true }, (lock) =>
      lock ? directory.removeEntry(old.name) : undefined).catch(() => {})
  }
}

async function decodeDatabase(response: Response, encoding: 'gzip'): Promise<ReadableStream<Uint8Array>> {
  if (!response.body) throw new Error('Game database response has no body')
  // Vite preview can mark this asset Content-Encoding: gzip, which fetch decodes.
  const [probe, data] = response.body.tee()
  const head = probe.getReader()
  const { value } = await head.read()
  void head.cancel().catch(() => {})
  return value?.[0] === 0x1f ? data.pipeThrough(new DecompressionStream(encoding)) : data
}

async function storedDatabase(asset: DatabaseAsset, fetchDatabase: () => Promise<Response>) {
  const directory = await (await navigator.storage.getDirectory()).getDirectoryHandle('pyfa-db', { create: true })
  const name = `${asset.sha256}.sqlite`
  return navigator.locks.request(databaseLock(name), async () => {
    const handle = await directory.getFileHandle(name, { create: true })
    const file = await handle.getFile()
    if (file.size > 0 && (asset.expandedBytes === undefined || file.size === asset.expandedBytes)) {
      return { bytes: new Uint8Array(await file.arrayBuffer()), reused: true }
    }
    const writer = await handle.createWritable()
    try {
      let size = 0
      const decoded = await decodeDatabase(await fetchDatabase(), asset.encoding)
      await decoded.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          size += chunk.byteLength
          controller.enqueue(chunk)
        },
        flush() {
          if (!size || (asset.expandedBytes !== undefined && size !== asset.expandedBytes)) {
            throw new Error('Expanded game database length does not match the manifest')
          }
        },
      })).pipeTo(writer)
    } catch (error) {
      await writer.abort().catch(() => {})
      throw error
    }
    await pruneOldDatabases(directory, name).catch(() => {})
    return { bytes: new Uint8Array(await (await handle.getFile()).arrayBuffer()), reused: false }
  })
}

export async function prepareDatabase(asset: DatabaseAsset, fetchDatabase: () => Promise<Response>, onReuse: () => void) {
  if (typeof navigator.storage?.getDirectory === 'function' && navigator.locks && /^[a-f0-9]{64}$/.test(asset.sha256)) {
    try {
      const { bytes, reused } = await storedDatabase(asset, fetchDatabase)
      if (reused) onReuse()
      return bytes
    } catch {
      // Private browsing, old browser implementations and quota errors can disable OPFS.
    }
  }
  return decodeDatabase(await fetchDatabase(), asset.encoding)
}

export async function mountDatabase(runtime: PyodideAPI, database: Uint8Array | ReadableStream<Uint8Array>) {
  const { FS } = runtime
  if (database instanceof Uint8Array) {
    FS.writeFile('/eve.db', database, { canOwn: true })
    return
  }
  const reader = database.getReader()
  const stream = FS.open('/eve.db', 'w')
  try {
    for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
      FS.write(stream, chunk.value, 0, chunk.value.byteLength)
    }
  } finally {
    FS.close(stream)
    await reader.cancel().catch(() => {})
  }
}
