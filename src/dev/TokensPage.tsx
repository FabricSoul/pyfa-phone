import { useEffect, useState } from 'react'

type Token = { name: string; use: string }
type Group = { name: string; tokens: Token[] }

// 每个 token 的用途；守卫测试保证这里和 src/styles/tokens.css 一一对应。
export const TOKEN_GROUPS: Group[] = [
  { name: 'Surface', tokens: [
    { name: '--color-bg', use: '页面底色' }, { name: '--color-surface', use: '列表行、面板' },
    { name: '--color-fill', use: '控件底、空槽、条底' }, { name: '--color-separator', use: '1px 分隔线' },
    { name: '--color-glass', use: '浮层玻璃底' } ] },
  { name: 'Text', tokens: [ { name: '--color-text', use: '主文字' }, { name: '--color-text-secondary', use: '次要文字' } ] },
  { name: 'Accent & semantic', tokens: [
    { name: '--color-accent', use: '资源条已用格、激活、选中' }, { name: '--color-warn', use: '超限、装不上、电容耗尽' },
    { name: '--color-good', use: '技能满足' } ] },
  { name: 'Damage type', tokens: [
    { name: '--dmg-em', use: '电磁' }, { name: '--dmg-th', use: '热能' }, { name: '--dmg-ki', use: '动能' }, { name: '--dmg-ex', use: '爆炸' } ] },
  { name: 'Meta level', tokens: [
    { name: '--meta-t2', use: '二级' }, { name: '--meta-t1', use: '一级' }, { name: '--meta-faction', use: '势力' },
    { name: '--meta-storyline', use: '故事线' }, { name: '--meta-deadspace', use: '死亡空间' }, { name: '--meta-officer', use: '官员' } ] },
  { name: 'Chart', tokens: [ { name: '--chart-1', use: '当前弹药' }, { name: '--chart-2', use: '对比 1' }, { name: '--chart-3', use: '对比 2' } ] },
  { name: 'Type', tokens: [
    { name: '--font-body', use: '正文字体' }, { name: '--font-num', use: '数字字体（tabular-nums）' },
    { name: '--type-page', use: '首页大标题' }, { name: '--type-title', use: '导航标题' }, { name: '--type-name', use: '模块名' },
    { name: '--type-label', use: '分组标题' }, { name: '--type-caption', use: '参数行' }, { name: '--type-stat', use: '属性大数字' } ] },
  { name: 'Space', tokens: [1, 2, 3, 4, 5, 6].map(i => ({ name: `--space-${i}`, use: ['图标与文字', '胶囊间距', '行内元素', '页面边距', '分区', '大分区'][i - 1]! })) },
  { name: 'Radius', tokens: [ { name: '--radius-s', use: '按钮、标签' }, { name: '--radius-m', use: '卡片、搜索框' } ] },
  { name: 'Size', tokens: [
    { name: '--control', use: '控件高度' }, { name: '--row', use: '模块行最小高度' }, { name: '--icon', use: '物品图标' },
    { name: '--list-inset', use: '通栏列表内缩' } ] },
  { name: 'Motion', tokens: [ { name: '--dur-fast', use: '逐格、折叠' }, { name: '--dur', use: '面板进出' }, { name: '--ease', use: '缓动曲线' } ] },
]

export default function TokensPage() {
  const [values, setValues] = useState<Record<string, string>>({})
  useEffect(() => {
    const cs = getComputedStyle(document.documentElement)
    setValues(Object.fromEntries(TOKEN_GROUPS.flatMap(g => g.tokens.map(t => [t.name, cs.getPropertyValue(t.name).trim()]))))
  }, [])
  return (
    <main className="p-4 text-[var(--color-text)]">
      <h1 style={{ font: 'var(--type-page)' }}>Tokens</h1>
      {TOKEN_GROUPS.map(g => (
        <section key={g.name} className="mt-4">
          <h2 style={{ font: 'var(--type-label)' }}>{g.name}</h2>
          {g.tokens.map(t => (
            <div key={t.name} className="flex items-center gap-3 py-1 border-b border-[var(--color-separator)]">
              <span className="w-5 h-5 rounded" style={{ background: g.name.match(/Surface|Text|Accent|Damage|Meta|Chart/) ? `var(${t.name})` : 'transparent' }} />
              <code className="text-xs w-44">{t.name}</code>
              <span className="text-xs text-[var(--color-text-secondary)] flex-1">{t.use}</span>
              <code className="text-xs">{values[t.name]}</code>
            </div>
          ))}
        </section>
      ))}
    </main>
  )
}
