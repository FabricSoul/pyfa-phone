// Run after building dist and stamping dist/sw.js.
import assert from 'node:assert/strict'
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { chromium } from 'playwright-core'
import { preview } from 'vite'

const executablePath = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  chromium.executablePath(),
].find((path) => path && existsSync(path))
assert.ok(executablePath, 'Install Chromium with pnpm exec playwright-core install chromium')

// Serve the same-origin static app without Vite's development CORS Vary header.
const server = await preview({ preview: { host: '127.0.0.1', port: 0, cors: false }, logLevel: 'error' })
const base = `http://127.0.0.1:${server.httpServer.address().port}/`
const fitName = '端到端装配'
const eft = `[长尾鲛级, ${fitName}]
200mm自动加农炮 II, 共和舰队电磁脉冲弹 S`
const ms = (start) => Math.round(performance.now() - start)
let browser
let page
const browserErrors = []
let step = 'launch Chromium'
try {
  browser = await chromium.launch({ executablePath, headless: true })
  const context = await browser.newContext({
    locale: 'zh-CN', viewport: { width: 402, height: 874 }, isMobile: true, hasTouch: true,
  })
  await context.route(/^https:\/\/(market\.fuzzwork\.co\.uk|esi\.evetech\.net)\//, (route) => route.abort())
  page = await context.newPage()
  page.on('pageerror', (error) => browserErrors.push(String(error)))
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  page.setDefaultTimeout(Number(process.env.SMOKE_TIMEOUT_MS ?? 90000))
  const shotDir = process.env.G3_SCREENSHOT_DIR ?? process.env.G2_SCREENSHOT_DIR ?? process.env.UI2B_SCREENSHOT_DIR
  if (shotDir) mkdirSync(shotDir, { recursive: true })
  const screenshot = (name) => shotDir && page.screenshot({ path: join(shotDir, `${name}.png`) })
  const dps = page.locator('.hero > div').filter({ hasText: /^总 DPS/ }).locator('b')
  const fitRow = (name) => page.getByTestId('fit-row').filter({ hasText: name })
  const readDps = async () => Number((await dps.innerText()).replaceAll(',', ''))
  const waitForChangedDps = (previous) => page.waitForFunction((before) =>
    Array.from(document.querySelectorAll('.hero > div')).some((metric) => {
      const value = Number(metric.querySelector('b')?.textContent?.replaceAll(',', ''))
      return metric.querySelector('small')?.textContent === '总 DPS' && value > 0 && value !== before
    }), previous)
  const pasteFit = async () => {
    await page.getByRole('link', { name: '粘贴导入' }).click()
    await page.getByRole('textbox').fill(eft)
  }

  // F3 usability assertions, measured in real Chromium on the page that is on screen right now.
  const usability = async (name) => {
    const found = await page.evaluate(() => {
      const hits = (el, x, y) => { const at = document.elementFromPoint(x, y); return Boolean(at && (at === el || el.contains(at))) }
      const reach = (el, rect, dx, dy) => {
        const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2
        let n = 0
        while (n < 30 && hits(el, cx + dx * (rect.width / 2 + n + 1), cy + dy * (rect.height / 2 + n + 1))) n++
        return n
      }
      const small = []
      for (const el of document.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, [role=tab], [role=switch]')) {
        if (el.closest('[inert], [aria-hidden="true"]') || getComputedStyle(el).visibility === 'hidden') continue
        if (!el.getBoundingClientRect().width) continue
        el.scrollIntoView({ block: 'center' })
        const rect = el.getBoundingClientRect()
        const w = rect.width + reach(el, rect, -1, 0) + reach(el, rect, 1, 0)
        const h = rect.height + reach(el, rect, 0, -1) + reach(el, rect, 0, 1)
        if (w < 43.5 || h < 43.5) small.push(`${(el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 24)} ${Math.round(w)}x${Math.round(h)}`)
      }
      const fields = [...document.querySelectorAll('input:not([type=hidden]), select, textarea')]
        .filter((el) => el.getBoundingClientRect().width > 0 && parseFloat(getComputedStyle(el).fontSize) < 16)
        .map((el) => `${el.tagName} ${getComputedStyle(el).fontSize}`)
      window.scrollTo(0, 0)
      return { small, fields, h1: document.querySelectorAll('h1').length, overflow: document.documentElement.scrollWidth > window.innerWidth }
    })
    assert.deepEqual(found.small, [], `${name}: tap targets under 44×44`)
    assert.deepEqual(found.fields, [], `${name}: form fields under 16px`)
    assert.equal(found.h1, 1, `${name}: exactly one h1`)
    assert.equal(found.overflow, false, `${name}: horizontal overflow`)
  }

  step = 'open settings and about, and see the fit list, before the engine is ready (#13)'
  {
    const early = await browser.newContext({ locale: 'zh-CN', serviceWorkers: 'block' })
    // Hold the engine's first download so it cannot be ready.
    await early.route('**/data/manifest.json', () => {})
    const p = await early.newPage()
    p.setDefaultTimeout(15000)
    await p.goto(`${base}#/settings`)
    await p.getByRole('heading', { level: 1, name: '设置' }).waitFor()
    await p.getByRole('button', { name: '导出全部装配备份' }).waitFor()
    await p.goto(`${base}#/about`)
    await p.getByRole('heading', { level: 1, name: '关于' }).waitFor()
    await p.goto(`${base}#/`)
    await p.getByTestId('fit-row').first().waitFor()
    await early.close()
  }

  step = 'wait for the engine and Chinese UI'
  let documentLoads = 0
  page.on('request', (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documentLoads++
  })
  const start = performance.now()
  await page.goto(base)
  await page.getByRole('link', { name: '粘贴导入' }).waitFor()
  const ready = ms(start)
  assert.equal(await page.locator('html').getAttribute('lang'), 'zh-CN')
  await usability('home')
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  assert.equal(documentLoads, 1, 'Initial Service Worker claim must preserve the booted page')
  console.log(`Engine ready in ${ready} ms`)

  step = 'recognize the audit Rifter XML and ESI pastes in the import sheet'
  const importText = page.getByRole('textbox', { name: '粘贴装配文本' })
  const openImport = () => page.getByRole('link', { name: '粘贴导入' }).click()
  for (const [format, text] of [
    ['XML', '<?xml version="1.0"?><fittings><fitting name="Audit XML"><shipType value="Rifter"/></fitting></fittings>'],
    ['ESI', '{"name":"Audit ESI","ship_type_id":587,"items":[],"description":""}'],
  ]) {
    await openImport()
    await importText.fill(text)
    await page.getByText(`识别为 ${format} 装配`, { exact: true }).waitFor()
    await page.getByText('装得下', { exact: true }).waitFor()
    await screenshot(`g2-import-${format.toLowerCase()}`)
    await page.getByRole('button', { name: '返回', exact: true }).click()
  }
  console.log('M09 XML and ESI both recognized Rifter and showed fitting capacity')

  step = 'report an overloaded EFT and a translated ambiguous item'
  await openImport()
  const overloaded = `[Rifter, Audit overfit]\n${Array(3).fill('Large Shield Extender II').join('\n')}`
  await importText.fill(overloaded)
  const overage = page.getByRole('dialog').getByRole('status').filter({ hasText: '装配超限' })
  await overage.waitFor()
  assert.match(await overage.innerText(), /栅格 超 [\d.]+/)
  console.log(`D02 ${(await overage.innerText()).replaceAll('\n', ' · ')}`)
  await screenshot('g2-import-overfit')
  await importText.fill('[Rifter, Audit]\n莱塞勒氏改良型爆炸装甲增强器')
  const ambiguity = page.getByText(/物品名称有歧义.*15054.*15070/)
  await ambiguity.waitFor()
  console.log('P17 Chinese ambiguity includes both candidate IDs 15054 and 15070')
  await page.getByRole('button', { name: '返回', exact: true }).click()

  step = 'open and recalculate a temporary Chinese EFT fit'
  await pasteFit()
  await page.getByRole('button', { name: '保存并打开' }).waitFor()
  await usability('import')
  await page.getByRole('button', { name: '仅查看，不保存', exact: true }).click()
  await page.getByText('未保存的装配预览', { exact: true }).waitFor()
  await page.getByRole('tab', { name: '属性', exact: true }).click()
  const withoutReload = await readDps()
  await page.getByRole('button', { name: '考虑换弹时间', exact: true }).click()
  await waitForChangedDps(withoutReload)
  const reloading = await readDps()
  assert.ok(withoutReload > reloading, 'Projectile DPS should drop when reload time is considered (pyfa default: off)')
  await page.getByRole('button', { name: '返回', exact: true }).click()
  await page.getByTestId('fit-row').first().waitFor()
  assert.equal(await fitRow(fitName).count(), 0)
  console.log(`Unsaved preview and reload toggle passed: DPS ${reloading} → ${withoutReload}`)

  step = 'save a Chinese EFT fit'
  await pasteFit()
  await page.getByRole('button', { name: '保存并打开' }).click()
  await page.getByText('200mm自动加农炮 II', { exact: true }).waitFor()
  await usability('fit slots')

  step = 'undo a removal from the module sheet (C4) and reload the stats tab from the URL (I6)'
  await page.getByText('200mm自动加农炮 II', { exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: /^移除装备/ }).click()
  const toast = page.locator('[role="status"][aria-live="polite"]').filter({ hasText: '已移除' })
  await toast.waitFor()
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  assert.equal(await page.getByText('200mm自动加农炮 II', { exact: true }).count(), 0)
  await toast.getByRole('button', { name: '撤销', exact: true }).click()
  await page.getByText('200mm自动加农炮 II', { exact: true }).waitFor()
  await page.getByRole('tab', { name: '属性', exact: true }).click()
  assert.match(page.url(), /[?&]view=stats/)
  await usability('fit stats')
  await page.reload()
  await page.getByRole('tab', { name: '属性', exact: true }).waitFor()
  assert.equal(await page.getByRole('tab', { name: '属性', exact: true }).getAttribute('aria-selected'), 'true')

  step = 'change ammo and verify DPS'
  await page.getByRole('tab', { name: '属性', exact: true }).click()
  const before = await readDps()
  assert.ok(before > 0, 'Imported weapon must deal damage')
  await page.getByRole('tab', { name: '槽位', exact: true }).click()
  await page.getByText('200mm自动加农炮 II', { exact: true }).click()
  const sheet = page.getByRole('dialog')
  await sheet.getByRole('button', { name: /^二级.*[0-9]/ }).click()
  await sheet.getByRole('button', { name: /^雷暴 S\b/ }).click()
  await page.keyboard.press('Escape')
  await page.getByRole('tab', { name: '属性', exact: true }).click()
  await waitForChangedDps(before)
  const after = await readDps()
  assert.ok(after > 0 && after !== before, `DPS must change after replacing ammo: ${before} → ${after}`)
  console.log(`Chinese EFT and ammo swap passed: DPS ${before} → ${after}`)

  step = 'overheat a module using a real touch hold with vertical drift'
  const cdp = await context.newCDPSession(page)
  const rack = (name) => page.locator('section').filter({ has: page.getByRole('heading', { name, exact: true }) })
  await page.getByRole('button', { name: '返回', exact: true }).click()
  await fitRow('裂谷级 · 示例').click()
  // The earlier reload test changes a global preference. The Rifter reference uses the pyfa default.
  await page.getByRole('tab', { name: '属性', exact: true }).click()
  const reloadOption = page.getByRole('button', { name: '考虑换弹时间', exact: true })
  const hadReload = await reloadOption.getAttribute('aria-pressed') === 'true'
  if (hadReload) await reloadOption.tap()
  await dps.filter({ hasText: /^180\.9$/ }).waitFor()
  await page.getByRole('tab', { name: '槽位', exact: true }).tap()
  const high = rack('高槽')
  const stateButton = high.getByTestId('state-button').first()
  await stateButton.scrollIntoViewIfNeeded()
  await page.evaluate(() => {
    window.__heatPointerCancels = 0
    document.addEventListener('pointercancel', (event) => {
      if (event.target.closest('[data-testid="state-button"]')) window.__heatPointerCancels++
    }, true)
  })
  const bounds = await stateButton.boundingBox()
  assert.ok(bounds)
  const x = Math.round(bounds.x + bounds.width / 2)
  const y = Math.round(bounds.y + bounds.height / 2)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
  await page.waitForTimeout(100)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + 18 }] })
  await page.waitForTimeout(650)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  assert.equal(await page.evaluate(() => window.__heatPointerCancels), 0,
    'Vertical drift must not give the state-key press to the browser scroll gesture')
  await high.locator('[data-testid="state-button"][data-state="overheated"]').first().waitFor()
  console.log('Touch hold with vertical drift overheats the weapon')

  step = 'show the module sheet overheat delta and read the Rifter rack DPS and volley'
  const heatRack = high.getByRole('switch', { name: '整排超载' })
  await heatRack.tap()
  await high.locator('[data-state="active"]').first().waitFor()
  await high.getByRole('button', { name: /^200mm自动加农炮 II/ }).tap()
  await sheet.getByRole('radio', { name: '超载', exact: true }).tap()
  await sheet.getByText(/180\.9 → 208\.1/).waitFor()
  await sheet.getByText(/249\.5 → 286\.9/).waitFor()
  await screenshot('oh-b-module-state')
  await sheet.getByRole('radio', { name: '激活', exact: true }).tap()
  await sheet.getByText(/208\.1 → 180\.9/).waitFor()
  await page.keyboard.press('Escape')
  assert.equal(await heatRack.getAttribute('aria-checked'), 'false')
  await heatRack.tap()
  await page.getByText(/秒伤 208\.1.*高槽超载/).waitFor()
  await page.evaluate(() => window.scrollTo(0, 0))
  await screenshot('oh-a-rack-overheat')
  await page.getByRole('tab', { name: '属性', exact: true }).click()
  await dps.filter({ hasText: /^208\.1$/ }).waitFor()
  assert.equal(await readDps(), 208.1)
  await page.getByText('286.9', { exact: true }).first().waitFor()
  console.log('Rifter rack overheat passed: DPS 208.1, volley 286.9')
  await page.getByRole('tab', { name: '槽位', exact: true }).click()
  await heatRack.tap()
  await high.locator('[data-state="active"]').first().waitFor()

  step = 'open the Rifter low slot market tree and expand Armor Plates'
  const rifterLow = rack('低槽').getByRole('button', { name: /空槽/ })
  await rifterLow.tap()
  const market = page.getByRole('region', { name: '按市场分类' })
  const armor = market.getByRole('button', { name: /^船体和装甲 717$/ })
  await armor.waitFor()
  assert.equal(await page.getByRole('searchbox').getAttribute('placeholder'), '搜索全部 999 种低槽装备')
  assert.equal(await page.locator('.fit-chips[aria-label]').count(), 0, 'Market groups must not use a horizontal tab row')
  assert.equal(await page.getByRole('combobox').count(), 0)
  assert.equal(await armor.getAttribute('aria-expanded'), 'false')
  await armor.tap()
  const plates = market.getByRole('button', { name: /^装甲附甲板 [0-9]/ })
  await plates.tap()
  await market.getByRole('button', { name: /^二级.*[0-9]/ }).tap()
  await market.locator('button.candidate').first().waitFor()
  await market.getByText('正在试装…', { exact: true }).waitFor({ state: 'hidden' })
  assert.equal(await market.getByText('无法检查装配资源', { exact: true }).count(), 0)
  await page.evaluate(() => window.scrollTo(0, 0))
  await screenshot('add-a-market-tree')
  console.log('Rifter low slot market tree passed: 999 modules, Hull & Armor → Armor Plates')
  const plateCandidate = market.locator('button.candidate').first()
  const plateName = await plateCandidate.locator('.mn > span').textContent()
  await market.getByRole('button', { name: `${plateName}的操作`, exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: '加入货柜', exact: true }).click()
  await page.getByText(`已将${plateName}加入货柜`, { exact: true }).waitFor()
  await page.getByRole('link', { name: '返回', exact: true }).click()
  await rifterLow.waitFor()
  await page.getByRole('tab', { name: '附加', exact: true }).click()
  await page.getByRole('link', { name: plateName, exact: true }).waitFor()
  console.log('G3 market candidate went to cargo without occupying a module slot')
  if (hadReload) {
    await page.getByRole('tab', { name: '属性', exact: true }).tap()
    await reloadOption.tap()
  }

  step = 'verify independent item-name language'
  await page.getByRole('button', { name: '返回', exact: true }).click()
  await page.getByRole('link', { name: '设置', exact: true }).click()
  await usability('settings')
  await page.getByRole('button', { name: /物品名称/ }).click()
  const english = page.getByRole('radio', { name: 'English', exact: true })
  await english.click()
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 402)
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '返回', exact: true }).click()
  await fitRow(fitName).getByText('Thrasher', { exact: true }).waitFor()
  await page.getByRole('link', { name: '粘贴导入' }).waitFor()

  step = 'verify reload and recalculation offline'
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  await page.reload()
  await fitRow(fitName).click()
  await page.getByRole('tab', { name: '属性', exact: true }).click()
  assert.equal(await readDps(), after, 'Offline engine must recalculate the saved fit')
  console.log('Offline home and fit recalculation passed')
  await context.setOffline(false)

  step = 'measure Rifter low-slot browser performance at 4× CPU throttling'
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  await page.getByRole('button', { name: '返回', exact: true }).click()
  await page.getByRole('button', { name: '新建', exact: true }).click()
  await page.getByRole('searchbox', { name: '搜索舰船' }).fill('Rifter')
  await page.getByRole('button', { name: 'Rifter', exact: true }).click()
  const add = page.locator('section').filter({ has: page.getByRole('heading', { name: '低槽', exact: true }) })
    .getByRole('button', { name: /空槽/ })
  await page.evaluate(() => sessionStorage.removeItem('pyfa.addModule.market.low'))
  const entering = performance.now()
  await add.click()
  await page.locator('.market-tree .market-category > button').first().waitFor()
  const listed = ms(entering)
  // Category names follow the item-name language, which was switched to English above.
  const expanding = performance.now()
  await page.getByRole('button', { name: /^Hull & Armor/ }).click()
  await page.getByRole('button', { name: /^Armor Plates/ }).click()
  const group = page.getByRole('button', { name: /^二级.*[0-9]/ }).first()
  await group.click()
  const expanded = group.locator('..')
  await expanded.locator('.candidate').first().waitFor()
  await expanded.getByText('正在试装…', { exact: true }).waitFor({ state: 'hidden' })
  assert.equal(await page.getByText('无法检查装配资源', { exact: true }).count(), 0)
  console.log(`Rifter low slot at 4× CPU: list ${listed} ms, group preview ${ms(expanding)} ms`)

  await usability('add module')

  step = 'remember module search query across visits'
  const moduleSearch = page.getByRole('searchbox', { name: '搜索装备' })
  await moduleSearch.fill('Gyrostabilizer')
  await page.getByRole('link', { name: '返回', exact: true }).click()
  await add.click()
  assert.equal(await moduleSearch.inputValue(), 'Gyrostabilizer', 'Search query must persist in session when returning to add module')
  await moduleSearch.fill('')

  step = 'create a non-example Vexor, add a module and export DNA'
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
  await page.getByRole('link', { name: '返回', exact: true }).click()
  await page.getByRole('button', { name: '返回', exact: true }).click()
  await page.getByRole('button', { name: '新建', exact: true }).click()
  await page.getByRole('button', { name: 'Cruiser', exact: true }).click()
  await page.getByRole('combobox', { name: '舰船阵营' }).selectOption({ label: '盖伦特' })
  await page.getByRole('searchbox', { name: '搜索舰船' }).fill('狂怒者')
  await usability('ship browser')
  await page.getByRole('button', { name: 'Vexor', exact: true }).click()
  await page.locator('section').filter({ has: page.getByRole('heading', { name: '低槽', exact: true }) })
    .getByRole('button', { name: /空槽/ }).click()
  await page.getByRole('searchbox').fill('Damage Control II')
  await page.locator('.candidate').filter({ hasText: 'Damage Control II' }).click()
  await page.getByText('Damage Control II', { exact: true }).waitFor()
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true }))
  await page.getByRole('button', { name: '更多', exact: true }).click()
  await page.getByRole('button', { name: '复制 DNA', exact: true }).click()
  const dna = await page.getByRole('textbox', { name: '导出的装配' }).inputValue()
  assert.match(dna, /^626:.*2048;1:/)
  console.log('Non-example ship creation, module addition and DNA fallback passed')

  step = 'show a 404 page with a way home (I7) and reach home from a directly opened settings page (C1)'
  await page.goto(`${base}#/nonsense/route`)
  await page.getByRole('heading', { level: 1, name: '找不到此页面' }).waitFor()
  await page.getByRole('link', { name: '返回装配列表' }).click()
  await page.getByRole('link', { name: '粘贴导入' }).waitFor()
  await page.goto(`${base}#/about`)
  await page.getByRole('heading', { level: 1, name: '关于' }).waitFor()
  await page.getByRole('button', { name: '返回', exact: true }).click()
  await page.getByRole('link', { name: '粘贴导入' }).waitFor()

  step = 'change a Vexor cargo stack and fill it to the exact hold capacity (M06, P18)'
  const extras = () => page.getByRole('tab', { name: '附加', exact: true }).click()
  const extraRow = (name) => page.locator('li').filter({ has: page.getByRole('link', { name, exact: true }) })
  const importExtraFit = async (text) => {
    await page.getByRole('link', { name: '粘贴导入' }).click()
    await page.getByRole('textbox').fill(text)
    await page.getByRole('button', { name: '保存并打开' }).click()
    await extras()
  }
  const verifyIcon = async (row) => {
    const icon = row.locator('img')
    await icon.scrollIntoViewIfNeeded()
    assert.equal(await icon.evaluate(async (img) => { await img.decode(); return img.naturalWidth > 0 }), true)
  }
  await importExtraFit('[Vexor, G3 Vexor]\n\nHammerhead II x5\n\nRepublic Fleet EMP S x1000')
  const ammo = extraRow('Republic Fleet EMP S')
  await ammo.getByText('单件 0.0025 m³ · 小计 2.5 m³', { exact: true }).waitFor()
  const amount = ammo.getByRole('spinbutton')
  await amount.fill('2000')
  await amount.press('Enter')
  await ammo.getByText('单件 0.0025 m³ · 小计 5 m³', { exact: true }).waitFor()
  await ammo.getByRole('button', { name: /增加.*总数量/ }).click()
  assert.equal(await amount.inputValue(), '2001')
  await ammo.getByRole('button', { name: '填满货柜' }).click()
  await ammo.getByText('单件 0.0025 m³ · 小计 480 m³', { exact: true }).waitFor()
  assert.equal(await amount.inputValue(), '192000')
  await verifyIcon(ammo)
  await usability('fit extras')
  await screenshot('g3-extras-cargo')
  console.log('G3 cargo volume: 0.0025 m³ each, quantity 192000, 480/480 m³')

  step = 'split and merge active Hammerhead II stacks without changing drone DPS (P05, P18)'
  const drone = extraRow('Hammerhead II')
  await drone.getByText(/射程.*速度.*生命值/).waitFor()
  await verifyIcon(drone)
  await page.getByRole('button', { name: /全部激活/ }).click()
  await page.getByText(/无人机带宽 50\/75/).waitFor()
  await page.getByRole('tab', { name: '属性', exact: true }).click()
  const droneDps = await readDps()
  assert.equal(droneDps, 237.6)
  await extras()
  await drone.getByRole('button', { name: '拆分堆叠', exact: true }).click()
  const splitSheet = page.getByRole('dialog', { name: '拆分堆叠' })
  await splitSheet.getByRole('spinbutton').fill('1')
  await splitSheet.getByRole('button', { name: '拆分堆叠' }).click()
  assert.equal(await drone.count(), 2)
  await page.getByRole('tab', { name: '属性', exact: true }).click()
  assert.equal(await readDps(), droneDps)
  await extras()
  await drone.first().scrollIntoViewIfNeeded()
  await screenshot('g3-extras-drones')
  await drone.last().getByRole('button', { name: '合并堆叠' }).click()
  await page.getByRole('dialog', { name: '合并堆叠' }).getByRole('button', { name: /Hammerhead II.*×4/ }).click()
  assert.equal(await drone.count(), 1)
  console.log(`G3 drones: 4 + 1 active Hammerhead II, ${droneDps} DPS preserved`)

  step = 'send a drone search candidate to the bay when cargo is full (M05)'
  await page.getByRole('button', { name: '添加货柜物品' }).click()
  await page.getByRole('dialog').getByRole('searchbox').fill('Hammerhead II')
  await page.getByRole('button', { name: '将Hammerhead II加入无人机舱' }).click()
  await page.getByText(/60\/125 m³/).waitFor()
  console.log('G3 drone candidate went directly to its bay 60/125 m³ while cargo was full')

  step = 'choose fit or character implants and apply a pyfa preset (P07, P18)'
  const source = page.getByRole('combobox', { name: '植入体来源' })
  await source.selectOption('fit')
  await page.getByRole('button', { name: '应用植入体配置' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'High-grade Snake', exact: true }).click()
  const implant = extraRow('High-grade Snake Alpha')
  await verifyIcon(implant)
  await source.selectOption('character')
  await implant.waitFor({ state: 'hidden' })
  await source.selectOption('fit')
  await implant.waitFor()
  await screenshot('g3-extras-implants')

  step = 'set independent booster side effects and show the booster slot (M07, P18)'
  await page.getByRole('button', { name: '添加增效剂' }).click()
  await page.getByRole('dialog').getByRole('searchbox').fill('Standard Exile Booster')
  await page.getByRole('dialog').getByRole('button', { name: 'Standard Exile Booster', exact: true }).click()
  const booster = extraRow('Standard Exile Booster')
  await booster.getByText('槽位 1', { exact: true }).waitFor()
  await verifyIcon(booster)
  const armorPenalty = booster.getByRole('switch', { name: /Armor Capacity/ })
  const capacitorPenalty = booster.getByRole('switch', { name: /Cap Capacity/ })
  assert.equal(await armorPenalty.getAttribute('aria-checked'), 'false')
  await armorPenalty.click()
  assert.equal(await armorPenalty.getAttribute('aria-checked'), 'true')
  assert.equal(await capacitorPenalty.getAttribute('aria-checked'), 'false')
  await screenshot('g3-extras-booster')
  console.log('G3 implants and booster: High-grade Snake applied, Exile slot 1, individual penalty switched')

  step = 'show Thanatos class limits with fitted squadron speed and HP (P06, P18)'
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.waitForFunction(() => document.documentElement.dataset.appearance === 'dark')
  await page.getByRole('button', { name: '返回', exact: true }).click()
  await importExtraFit('[Thanatos, G3 Thanatos]\n\nDragonfly I x6')
  const fighter = extraRow('Dragonfly I')
  await fighter.getByText(/速度.*生命值/).waitFor()
  await fighter.getByText('6/6', { exact: true }).waitFor()
  const activateFighter = fighter.getByRole('switch')
  if (await activateFighter.getAttribute('aria-checked') === 'false') await activateFighter.click()
  await page.getByRole('heading', { name: '轻型舰载机 1/3' }).waitFor()
  await page.getByRole('heading', { name: '重型舰载机 0/0' }).waitFor()
  await page.getByRole('heading', { name: '支援舰载机 0/2' }).waitFor()
  await verifyIcon(fighter)
  await usability('fit extras in dark mode')
  await screenshot('g3-extras-fighters')
  console.log('G3 Thanatos: light 1/3, heavy 0/0, support 0/2, Dragonfly I 6/6')

  await context.close()

  step = 'retry a failed engine startup'
  const recovery = await browser.newContext({ locale: 'zh-CN', serviceWorkers: 'block' })
  await recovery.route('**/data/manifest.json', (route) => route.fulfill({ status: 503 }), { times: 1 })
  page = await recovery.newPage()
  page.setDefaultTimeout(Number(process.env.SMOKE_TIMEOUT_MS ?? 90000))
  await page.goto(base)
  await page.getByRole('alert').filter({ hasText: '无法启动装配引擎' }).waitFor()
  await page.getByRole('button', { name: '重试', exact: true }).click()
  await page.getByRole('link', { name: '粘贴导入' }).waitFor()
  console.log('Engine startup retry after HTTP 503 passed')
  await recovery.close()
} catch (error) {
  const screen = await page?.locator('main').first().textContent({ timeout: 1000 }).catch(() => '')
  console.error(browserErrors.slice(-8).join('\n'))
  console.error(new Error(`Smoke failed: ${step} (${screen?.trim().slice(0, 400)})`, { cause: error }))
  process.exitCode = 1
} finally {
  try {
    await browser?.close()
  } finally {
    await new Promise((resolve, reject) => server.httpServer.close((error) => error ? reject(error) : resolve()))
  }
}
