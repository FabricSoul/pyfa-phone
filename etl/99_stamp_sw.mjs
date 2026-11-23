/* Build the offline cache layers from the production assets and data manifest. */
import fs from 'node:fs'
import { createHash } from 'node:crypto'
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

  const manifestBytes = fs.existsSync(manifestPath) ? fs.readFileSync(manifestPath) : undefined
  const manifest = manifestBytes ? JSON.parse(manifestBytes) : undefined
  const shellUrls = ['/', '/index.html', '/manifest.webmanifest']
  if (fs.existsSync(assetsDir)) {
    for (const file of fs.readdirSync(assetsDir).sort()) shellUrls.push(`/assets/${file}`)
  }
  const digest = (urls) => {
    const hash = createHash('sha256')
    for (const url of urls.sort()) {
      const file = path.join(distDir, url === '/' ? '/index.html' : url)
      hash.update(url).update('\0')
      if (fs.existsSync(file)) hash.update(createHash('sha256').update(fs.readFileSync(file)).digest())
    }
    return hash.digest('hex')
  }
  const iconUrls = new Set()
  const allIconUrls = new Set()
  for (const icon of ['favicon.png', 'icon-192.png', 'icon-512.png']) {
    if (fs.existsSync(path.join(distDir, icon))) iconUrls.add(`/${icon}`)
  }

  // pyfa's own UI icons (home key numbers, boot page logo) so they work offline from the first launch
  const guiDir = path.join(distDir, 'img', 'gui')
  if (fs.existsSync(guiDir)) {
    for (const f of fs.readdirSync(guiDir).sort()) {
      if (f.endsWith('.png')) iconUrls.add(`/img/gui/${f}`)
    }
  }

  // 4. 离线图标与舰船渲染图预缓存（P19：装配里已有的物品和全部舰船渲染图，不含全部 1734 个图标）
  const rendersDir = path.join(distDir, 'img', 'renders')
  if (fs.existsSync(rendersDir)) {
    for (const f of fs.readdirSync(rendersDir).sort()) {
      if (f.endsWith('.png')) iconUrls.add(`/img/renders/${f}`)
    }
  }

  const iconsDir = path.join(distDir, 'img', 'icons')
  if (fs.existsSync(iconsDir)) {
    const fitIcons = new Set()
    const fixtureDirs = [
      path.resolve('src/engine/fixtures'),
      path.resolve('etl/fixtures'),
    ]
    for (const dir of fixtureDirs) {
      if (fs.existsSync(dir)) {
        for (const file of fs.readdirSync(dir)) {
          if (file.endsWith('.json') && file !== 'catalog.json') {
            try {
              const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'))
              JSON.stringify(data, (key, val) => {
                if (key === 'iconId' && typeof val === 'number') fitIcons.add(val)
                return val
              })
            } catch { /* skip */ }
          }
        }
      }
    }
    for (const id of fitIcons) {
      if (fs.existsSync(path.join(iconsDir, `${id}.png`))) {
        iconUrls.add(`/img/icons/${id}.png`)
      }
    }

    // 全部图标清单供设置页“下载全部图标供离线使用”读取
    const allIcons = fs.readdirSync(iconsDir)
      .filter((f) => f.endsWith('.png'))
      .sort((a, b) => parseInt(a, 10) - parseInt(b, 10))
      .map((f) => `/img/icons/${f}`)
    for (const url of allIcons) allIconUrls.add(url)
    const distData = path.join(distDir, 'data')
    if (fs.existsSync(distData)) {
      fs.writeFileSync(path.join(distData, 'icons.json'), JSON.stringify(allIcons))
      iconUrls.add('/data/icons.json')
    }
    const pubData = path.resolve('public', 'data')
    if (fs.existsSync(pubData)) {
      fs.writeFileSync(path.join(pubData, 'icons.json'), JSON.stringify(allIcons))
    }
  }

  const data = []
  if (manifest) {
    data.push({ name: `pyfa:manifest:${createHash('sha256').update(manifestBytes).digest('hex')}`,
      urls: ['/data/manifest.json'] })
    for (const asset of [manifest.db, manifest.names, manifest.py]) {
      if (asset) data.push({ name: `pyfa:data:${asset.sha256}`, urls: [`/data/${asset.file}`] })
    }
  }
  const cacheLayers = {
    shell: { name: `pyfa:app:${digest([...shellUrls])}`, urls: shellUrls },
    icons: { name: `pyfa-icons-${digest([...new Set([...iconUrls, ...allIconUrls])])}`, urls: [...iconUrls] },
    runtime: manifest?.pyodide ? {
      name: `pyfa:runtime:${manifest.pyodide.version}`,
      urls: manifest.pyodide.files.map(({ file }) => file),
    } : null,
    data,
  }
  const sw = fs.readFileSync(swPath, 'utf8').replace(
    /^const CACHE_LAYERS = .*$/m, () => `const CACHE_LAYERS = ${JSON.stringify(cacheLayers)}`,
  )
  fs.writeFileSync(swPath, sw, 'utf8')
  console.log(`✅ sw.js 盖印完成: ${cacheLayers.shell.name}, ${cacheLayers.runtime?.name ?? 'no runtime'}`)
  return cacheLayers
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  stampSw()
}
