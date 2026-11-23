// Run after building dist and stamping dist/sw.js.
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
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
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  assert.equal(documentLoads, 1, 'Initial Service Worker claim must preserve the booted page')
  console.log(`Engine ready in ${ready} ms`)

  step = 'open and recalculate a temporary Chinese EFT fit'
  await pasteFit()
  await page.getByRole('button', { name: '仅查看，不保存', exact: true }).click()
  await page.getByText('未保存的装配预览', { exact: true }).waitFor()
  await page.getByRole('radio', { name: '属性', exact: true }).click()
  const reloading = await readDps()
  await page.getByRole('button', { name: '考虑换弹时间', exact: true }).click()
  await waitForChangedDps(reloading)
  const withoutReload = await readDps()
  assert.ok(withoutReload > reloading, 'Projectile DPS should increase when reload time is excluded')
  await page.getByRole('button', { name: '返回', exact: true }).click()
  await page.getByTestId('fit-row').first().waitFor()
  assert.equal(await fitRow(fitName).count(), 0)
  console.log(`Unsaved preview and reload toggle passed: DPS ${reloading} → ${withoutReload}`)

  step = 'save a Chinese EFT fit'
  await pasteFit()
  await page.getByRole('button', { name: '保存并打开' }).click()
  await page.getByText('200mm自动加农炮 II', { exact: true }).waitFor()

  step = 'change ammo and verify DPS'
  await page.getByRole('radio', { name: '属性', exact: true }).click()
  const before = await readDps()
  assert.ok(before > 0, 'Imported weapon must deal damage')
  await page.getByRole('radio', { name: '槽位', exact: true }).click()
  await page.getByText('200mm自动加农炮 II', { exact: true }).click()
  const sheet = page.getByRole('dialog')
  await sheet.getByRole('button', { name: /^二级.*[0-9]/ }).click()
  await sheet.getByRole('button', { name: /^雷暴 S\b/ }).click()
  await page.keyboard.press('Escape')
  await page.getByRole('radio', { name: '属性', exact: true }).click()
  await waitForChangedDps(before)
  const after = await readDps()
  assert.ok(after > 0 && after !== before, `DPS must change after replacing ammo: ${before} → ${after}`)
  console.log(`Chinese EFT and ammo swap passed: DPS ${before} → ${after}`)

  step = 'verify independent item-name language'
  await page.getByRole('button', { name: '返回', exact: true }).click()
  await page.getByRole('link', { name: '设置', exact: true }).click()
  await page.getByRole('button', { name: /物品名称/ }).click()
  const english = page.getByRole('radio', { name: 'English', exact: true })
  await english.click()
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 402)
  await page.goBack()
  await fitRow(fitName).getByText('Thrasher', { exact: true }).waitFor()
  await page.getByRole('link', { name: '粘贴导入' }).waitFor()

  step = 'verify reload and recalculation offline'
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  await page.reload()
  await fitRow(fitName).click()
  await page.getByRole('radio', { name: '属性', exact: true }).click()
  assert.equal(await readDps(), after, 'Offline engine must recalculate the saved fit')
  console.log('Offline home and fit recalculation passed')
  await context.setOffline(false)

  step = 'measure Rifter low-slot browser performance at 4× CPU throttling'
  const cdp = await context.newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  await page.getByRole('button', { name: '返回', exact: true }).click()
  await page.getByRole('button', { name: '新建', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Rifter', exact: true }).click()
  const add = page.locator('section').filter({ has: page.getByRole('heading', { name: '低槽', exact: true }) })
    .getByRole('button', { name: /空槽/ })
  const entering = performance.now()
  await add.click()
  await page.locator('.candidate').first().waitFor()
  const collapsed = page.locator('button.mh[aria-expanded="false"]').first()
  const label = await collapsed.locator('.tag').innerText()
  const group = page.locator('button.mh').filter({ has: page.getByText(label, { exact: true }) }).first()
  const listed = ms(entering)
  const expanding = performance.now()
  await group.click()
  const expanded = group.locator('..')
  await expanded.locator('.candidate').first().waitFor()
  await expanded.getByText('正在试装…', { exact: true }).waitFor({ state: 'hidden' })
  assert.equal(await page.getByText('无法检查装配资源', { exact: true }).count(), 0)
  console.log(`Rifter low slot at 4× CPU: list ${listed} ms, group preview ${ms(expanding)} ms`)

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
