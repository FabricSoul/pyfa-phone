import { afterEach, describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { _t, getUiLanguage, setUiLanguage, translate, useUiLanguage } from './t'

afterEach(async () => { await setUiLanguage('en_US') })

describe('_t', () => {
  it('zh_CN 下返回 pyfa 的译文（来自 compendium）', async () => {
    await setUiLanguage('zh_CN')
    expect(getUiLanguage()).toBe('zh_CN')
    expect(_t('Firepower')).toBe('火力')
  })

  it('未翻译的 msgid 原样返回', async () => {
    await setUiLanguage('zh_CN')
    expect(_t('Zzz not translated anywhere')).toBe('Zzz not translated anywhere')
  })

  it('复数：zh_CN 只有一种形式，en_US 按 n 选择', async () => {
    await setUiLanguage('zh_CN')
    expect(_t('%d attribute.', '%d attributes.', 5)).toBe('共%d个属性。')
    await setUiLanguage('en_US')
    expect(_t('%d attribute.', '%d attributes.', 1)).toBe('%d attribute.')
    expect(_t('%d attribute.', '%d attributes.', 2)).toBe('%d attributes.')
  })

  it('上下文：按 msgctxt 查，不会误用无上下文的译文', async () => {
    await setUiLanguage('zh_CN')
    expect(_t('Firepower', { context: 'nonexistent context' })).toBe('Firepower')
    const catalog = { 'menu\u0004Open': '打开', Open: '开启' }
    expect(translate(catalog, 'zh_CN', 'Open', { context: 'menu' })).toBe('打开')
    expect(translate(catalog, 'zh_CN', 'Open')).toBe('开启')
  })

  it('en_US 下返回原文', async () => {
    await setUiLanguage('en_US')
    expect(_t('Firepower')).toBe('Firepower')
  })

  it('切换语言触发 useUiLanguage 重渲染', async () => {
    const { result } = renderHook(() => { useUiLanguage(); return _t('Firepower') })
    expect(result.current).toBe('Firepower')
    await act(async () => { await setUiLanguage('zh_CN') })
    expect(result.current).toBe('火力')
  })
})
