import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import { build } from 'vite'

const root = fileURLToPath(new URL('../../', import.meta.url))
const buildDir = join(root, 'build')
await mkdir(buildDir, { recursive: true })
const temp = await mkdtemp(join(buildDir, 'local-worker-'))
const output = join(temp, 'site')
const entry = join(temp, 'worker-test.html')
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.wasm': 'application/wasm', '.json': 'application/json' }

const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost')
  const file = resolve(output, '.' + url.pathname)
  try {
    assert.ok(!relative(output, file).startsWith('..'))
    const content = await readFile(file)
    response.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' }).end(content)
  } catch {
    response.writeHead(404).end()
  }
})

let browser
try {
  await writeFile(entry, `<!doctype html><script type="module">
import { createEngine } from '/src/engine/client.ts'
import fits from '/etl/fixtures/fits.json'
import advanced from '/etl/fixtures/advanced-fits.json'
import { updateSettings } from '/src/settings/settings.ts'
window.testEngine = async () => {
  const stages = []
  const engine = await createEngine((stage) => stages.push(stage))
  const result = await engine.calc(fits.rifter, { includeReload: false })
  const rex = await engine.calc(advanced.vexor, { includeReload: false })
  const tactical = await engine.calc(advanced.confessor)
  const roundTrip = await engine.importText(await engine.exportText(advanced.confessor, 'eft', 'zh'))
  updateSettings({ defaultCharacter: 'all0' })
  const pilot = (await engine.importText('[Vexor, Audit]')).fits[0].character
  updateSettings({ defaultCharacter: 'all5' })
  const fit = { ...fits.rifter, modules: { ...fits.rifter.modules,
    low: [{ typeId: 15070, state: 'active', chargeTypeId: null }] } }
  const eft = await engine.exportText(fit, 'eft', 'zh')
  const imported = await engine.importText(eft)
  const doc = { ...fit, itemNames: { '-1': { en: 'Retired', zh: '已移除' } },
    modules: { ...fit.modules, low: [{ typeId: -1, state: 'active', chargeTypeId: null }] } }
  const [removed, ammo] = await Promise.all([
    engine.calc(doc), engine.chargesFor(fit, { slot: 'high', index: 0 }, 'tech2'),
  ])
  const [info, dataVersion, marketGroups] = await Promise.all([
    engine.itemInfo(2889, fits.rifter, { slot: 'high', index: 0 }),
    engine.getDataVersion(),
    engine.marketGroupsForSlot(fits.rifter, 'low'),
  ])
  const firstMarketGroup = marketGroups[0]
  const candidates = await engine.itemsForSlot(fits.rifter, 'low', undefined,
    { marketGroupId: firstMarketGroup.id, preview: false })
  return { stages, dataVersion, pilot, droneDps: rex.stats.firepower.droneDps,
    tacticalMode: tactical.modes.selected, importedMode: roundTrip.fits[0].modeTypeId, fittedCpu: info.attributes.find((attr) => attr.id === 50).current,
    limitedToGroup: candidates.length > 0 && candidates.every(({items}) => items.every(
      (row) => row.marketGroup.id === firstMarketGroup.id && !('resourceOverages' in row))),
    ship: result.ship.typeId, dps: result.stats.firepower.dps, version: result.dataVersion,
    imported: imported.fits[0]?.modules.low[0]?.typeId, importWarnings: imported.warnings,
    removed: removed.slots.low[0], chargeGroups: ammo.map((group) => group.meta) }
}
</script>`)
  await build({ root, logLevel: 'error', build: { outDir: output, rollupOptions: { input: entry } } })
  const candidates = [process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE, chromium.executablePath(),
    '/Applications/Chromium.app/Contents/MacOS/Chromium', '/usr/bin/chromium']
  let executablePath = candidates.find((candidate) => candidate && existsSync(candidate))
  if (!executablePath) {
    execFileSync(process.execPath, [join(root, 'node_modules/playwright-core/cli.js'), 'install', 'chromium'],
      { stdio: 'inherit' })
    executablePath = chromium.executablePath()
  }
  browser = await chromium.launch({ executablePath, headless: true })
  await new Promise((done) => server.listen(0, '127.0.0.1', done))
  const origin = `http://127.0.0.1:${server.address().port}`
  const context = await browser.newContext({ serviceWorkers: 'block' })
  const page = await context.newPage()
  await page.goto(`${origin}/${relative(root, entry).split('\\').join('/')}`)
  await page.waitForFunction(() => typeof window.testEngine === 'function')

  const external = []
  await context.route('**/*', (route) => {
    if (new URL(route.request().url()).origin === origin) return route.continue()
    external.push(route.request().url())
    return route.abort()
  })
  const result = await page.evaluate(() => window.testEngine())
  const manifest = JSON.parse(await readFile(join(output, 'data/manifest.json'), 'utf8'))
  const rifter = JSON.parse(await readFile(join(root, 'src/engine/fixtures/rifter.json'), 'utf8'))
  assert.deepEqual(result, {
    stages: ['runtime', 'data', 'initialize'], dataVersion: manifest.dataVersion,
    fittedCpu: 6.75, limitedToGroup: true,
    pilot: 'all0', droneDps: 237.6, tacticalMode: 34321, importedMode: 34321,
    ship: 587, dps: rifter.stats.firepower.dps, version: manifest.dataVersion,
    imported: 15070, importWarnings: [], chargeGroups: ['tech2'],
    removed: { kind: 'removed', typeId: -1, name: { en: 'Retired', zh: '已移除' }, count: 1, positions: [0] },
  })
  assert.deepEqual(external, [], 'Worker attempted an external request')
  console.log(`Chromium Worker with external requests blocked: Rifter DPS ${result.dps}, EFT typeID ${result.imported}`)

  const files = await readdir(output, { recursive: true })
  for (const file of files.filter((name) => /\.(?:m?js|json|map|html)$/.test(name))) {
    assert.doesNotMatch(await readFile(join(output, file), 'utf8'), /cdn\.jsdelivr\.net/, file)
  }
  console.log('Production Worker and vendored runtime contain no jsDelivr hostname')
} finally {
  if (browser) await browser.close()
  if (server.listening) await new Promise((done) => server.close(done))
  await rm(temp, { recursive: true, force: true })
}
