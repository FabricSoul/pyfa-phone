import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { stampSw } from './99_stamp_sw.mjs'

const DIST = path.resolve('dist')
const SW_PATH = path.join(DIST, 'sw.js')
const MANIFEST_PATH = path.join(DIST, 'data', 'manifest.json')

test('dist/sw.js precache list includes db file from manifest after build and stamp', () => {
  assert.ok(fs.existsSync(SW_PATH), 'dist/sw.js exists')
  assert.ok(fs.existsSync(MANIFEST_PATH), 'dist/data/manifest.json exists')

  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'))
  const swContent = fs.readFileSync(SW_PATH, 'utf8')

  assert.ok(manifest.db && manifest.db.file, 'manifest has db.file')
  assert.ok(
    swContent.includes(manifest.db.file),
    `dist/sw.js should include db file: ${manifest.db.file}`
  )
})

test('changing dataVersion in manifest and restamping changes cache name', () => {
  const originalManifestRaw = fs.readFileSync(MANIFEST_PATH, 'utf8')
  try {
    stampSw(DIST)
    const swOriginal = fs.readFileSync(SW_PATH, 'utf8')
    const matchOriginal = swOriginal.match(/CACHE_NAME\s*=\s*['"`]([^'"`]+)['"`]/)
    assert.ok(matchOriginal, 'CACHE_NAME found in original sw.js')
    const originalCacheName = matchOriginal[1]

    const manifestObj = JSON.parse(originalManifestRaw)
    manifestObj.dataVersion = 'modified-version-9999'
    fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifestObj, null, 2), 'utf8')

    stampSw(DIST)
    const swModified = fs.readFileSync(SW_PATH, 'utf8')
    const matchModified = swModified.match(/CACHE_NAME\s*=\s*['"`]([^'"`]+)['"`]/)
    assert.ok(matchModified, 'CACHE_NAME found in restamped sw.js')
    const modifiedCacheName = matchModified[1]

    assert.notEqual(originalCacheName, modifiedCacheName, 'Cache name must change when dataVersion changes')
    assert.ok(modifiedCacheName.includes('modified-version-9999'), 'New cache name includes new dataVersion')
  } finally {
    fs.writeFileSync(MANIFEST_PATH, originalManifestRaw, 'utf8')
    stampSw(DIST)
  }
})

test('price API domains are not in precache list', () => {
  const swContent = fs.readFileSync(SW_PATH, 'utf8')
  const precacheMatch = swContent.match(/PRECACHE_URLS\s*=\s*\[([\s\S]*?)\]/)
  const precacheBlock = precacheMatch ? precacheMatch[1] : swContent

  assert.ok(!precacheBlock.includes('fuzzwork.co.uk'), 'fuzzwork.co.uk must not be in precache list')
  assert.ok(!precacheBlock.includes('esi.evetech.net'), 'esi.evetech.net must not be in precache list')
})
