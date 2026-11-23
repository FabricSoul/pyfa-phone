// Run after pnpm etl. The browser context starts empty and installs the production SW.
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import { build } from 'vite'
import { stampSw } from './99_stamp_sw.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const buildDir = join(root, 'build')
await mkdir(buildDir, { recursive: true })
const temp = await mkdtemp(join(buildDir, 'startup-perf-'))
const output = join(temp, 'site')
const entry = join(temp, 'index.html')
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.wasm': 'application/wasm', '.json': 'application/json' }
const requests = []
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname
  if (/^\/(?:data|pyodide)\//.test(pathname)) requests.push(pathname)
  const file = resolve(output, '.' + pathname, pathname.endsWith('/') ? 'index.html' : '')
  if (relative(output, file).startsWith('..')) {
    response.writeHead(404).end()
    return
  }
  try {
    const bytes = await readFile(file)
    response.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream',
      'cache-control': 'no-cache' }).end(bytes)
  } catch {
    response.writeHead(404).end()
  }
})

let browser
try {
  await writeFile(entry, `<!doctype html><script type="module">
import { createEngine } from '/src/engine/client.ts'
import fits from '/etl/fixtures/fits.json'
window.runPerf = async () => {
  let progress
  const start = performance.now()
  const engine = await createEngine(undefined, (current) => { progress = current })
  const ready = performance.now() - start
  await engine.calc(fits.rifter, { includeReload: false })
  return { ready, total: performance.now() - start, progress }
}
</script>`)
  await build({ root, logLevel: 'error', build: { outDir: output, rollupOptions: { input: entry } } })
  await writeFile(join(output, 'index.html'), await readFile(join(output, relative(root, entry))))
  stampSw(output)
  const executablePath = [process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE, chromium.executablePath(),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium']
    .find((candidate) => candidate && existsSync(candidate))
  browser = await chromium.launch({ executablePath, headless: true })
  await new Promise((done) => server.listen(0, '127.0.0.1', done))
  const url = `http://127.0.0.1:${server.address().port}/`
  const page = await browser.newPage({ viewport: { width: 402, height: 874 } })
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  console.log(`Chromium ${browser.version()}, DevTools CPU rate 4×`)
  await page.goto(url)
  await page.evaluate(async () => {
    await navigator.serviceWorker.register('/sw.js')
    await navigator.serviceWorker.ready
    if (!navigator.serviceWorker.controller) {
      await new Promise((done) => navigator.serviceWorker.addEventListener('controllerchange', done, { once: true }))
    }
  })
  for (let i = 0; i <= 5; i++) {
    requests.length = 0
    await page.reload()
    const worker = page.waitForEvent('worker', { predicate: (worker) => worker.url().includes('/worker-') })
    const result = await page.evaluate(() => window.runPerf())
    const measures = await (await worker).evaluate(() => Object.fromEntries(
      performance.getEntriesByType('measure').map((entry) => [entry.name, Math.round(entry.duration)]),
    ))
    assert.deepEqual(requests, [], 'warmed Service Worker must serve all runtime and data requests')
    console.log(JSON.stringify({ sample: i === 0 ? 'seed' : 'warm', ...result, measures, requests }))
  }
} finally {
  if (browser) await browser.close()
  if (server.listening) await new Promise((done) => server.close(done))
  await rm(temp, { recursive: true, force: true })
}
