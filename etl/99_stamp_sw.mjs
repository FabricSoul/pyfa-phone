/* 构建后把 dist 的文件清单和 manifest 内容写进 dist/sw.js。
 *
 * 缓存名带 dataVersion 和构建哈希，任何一个变了就清掉旧缓存。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export function extractManifestFiles(manifest) {
  const files = new Set(['/data/manifest.json'])
  function walk(val, key) {
    if (val == null) return
    if (typeof val === 'string') {
      if (key === 'file' || key === 'path' || /\.(gz|json|js|wasm|zip|whl|bin|data|db)$/i.test(val)) {
        if (key !== 'dataVersion' && key !== 'sha256' && key !== 'encoding' && key !== 'bytes') {
          const normalized = val.startsWith('/') ? val : `/data/${val}`
          files.add(normalized)
        }
      }
    } else if (Array.isArray(val)) {
      for (const item of val) walk(item, key)
    } else if (typeof val === 'object') {
      for (const [k, v] of Object.entries(val)) {
        walk(v, k)
      }
    }
  }
  walk(manifest)
  return Array.from(files)
}

export function stampSw(distDir = path.resolve('dist')) {
  const swPath = path.join(distDir, 'sw.js')
  const assetsDir = path.join(distDir, 'assets')
  const manifestPath = path.join(distDir, 'data', 'manifest.json')

  if (!fs.existsSync(swPath)) {
    const pubSw = path.resolve('public', 'sw.js')
    if (fs.existsSync(pubSw)) {
      fs.copyFileSync(pubSw, swPath)
    } else {
      console.error('❌ sw.js not found in dist or public')
      process.exit(1)
    }
  }

  // 1. 构建哈希：优先从 index-*.js 提取
  let buildHash = 'dev'
  if (fs.existsSync(assetsDir)) {
    const assets = fs.readdirSync(assetsDir)
    const main = assets.find((f) => /^index-.*\.js$/.test(f))
    if (main) {
      buildHash = main.replace(/^index-|\.js$/g, '')
    }
  }

  // 2. dataVersion 及数据文件列表
  let dataVersion = 'dev'
  let dataFiles = []
  if (fs.existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
      if (manifest.dataVersion) {
        dataVersion = manifest.dataVersion
      }
      dataFiles = extractManifestFiles(manifest)
    } catch (err) {
      console.warn('⚠️ 读取 manifest.json 失败:', err)
    }
  }

  // 3. 应用壳文件（HTML、JS/CSS、manifest、图标）
  const precacheUrls = new Set([
    '/',
    '/index.html',
    '/manifest.webmanifest',
  ])

  if (fs.existsSync(assetsDir)) {
    for (const f of fs.readdirSync(assetsDir)) {
      precacheUrls.add(`/assets/${f}`)
    }
  }

  for (const icon of ['icon-192.png', 'icon-512.png']) {
    if (fs.existsSync(path.join(distDir, icon))) {
      precacheUrls.add(`/${icon}`)
    }
  }

  for (const df of dataFiles) {
    precacheUrls.add(df)
  }

  const cacheName = `pyfa-${buildHash}-${dataVersion}`
  const precacheList = Array.from(precacheUrls)

  let sw = fs.readFileSync(swPath, 'utf8')
  sw = sw.replace(/const BUILD_HASH = '[^']*'/, `const BUILD_HASH = '${buildHash}'`)
  sw = sw.replace(/const DATA_VERSION = '[^']*'/, `const DATA_VERSION = '${dataVersion}'`)
  sw = sw.replace(/const CACHE_NAME = '[^']*'/, `const CACHE_NAME = '${cacheName}'`)
  sw = sw.replace(/const PRECACHE_URLS = \[\s*[\s\S]*?\s*\];?/, `const PRECACHE_URLS = ${JSON.stringify(precacheList, null, 2)}`)

  fs.writeFileSync(swPath, sw, 'utf8')
  console.log(`✅ sw.js 盖印完成: cacheName = ${cacheName}, precached ${precacheList.length} files`)
  return { buildHash, dataVersion, cacheName, precacheList }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  stampSw()
}
