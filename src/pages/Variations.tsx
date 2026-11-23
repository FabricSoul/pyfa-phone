import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import type { ItemGroup, ItemRow } from '../engine/types'
import { _t } from '../i18n/t'
import { fmt, iconUrl, lname, useNameLanguage } from '../ui/format'
import { ItemIcon } from '../ui/ItemIcon'
import { MetaGroupList } from '../ui/MetaGroupList'
import { parsePosition, useFitServices, useFitSession, withModules } from './fitSession'
import { EmptyMessage, PageHeading } from './shared'

const signed = (n: number, digits: number) => `${n < 0 ? '−' : n > 0 ? '+' : ''}${fmt(Math.abs(n), digits)}`

function compareLine({ compare }: ItemRow) {
  if (!compare) return ''
  const damage = compare.damage === null ? undefined : Math.abs(compare.damage) < 0.0005
    ? `${_t('Damage')} ±0` : `${_t('Damage')} ${signed(compare.damage * 100, 1)}%`
  const cpu = `${_t('CPU')} ${compare.cpu === 0 ? '0' : signed(compare.cpu, 2)}`
  return [damage, cpu, `${_t('CPU left')} ${fmt(compare.cpuLeft, 2)}`].filter(Boolean).join(' · ')
}

export function Variations() {
  const language = useNameLanguage()
  const navigate = useNavigate()
  const params = useParams()
  const [query] = useSearchParams()
  const { engine } = useFitServices()
  const { fit, record, result, edit } = useFitSession()
  const pos = parsePosition(params.pos)
  const module = pos && fit.modules[pos.slot][pos.index]
  const typeId = module?.typeId
  const [listing, setListing] = useState<{ typeId: number; groups: ItemGroup[] }>()
  const [error, setError] = useState(false)
  const [working, setWorking] = useState(false)
  const path = `/fit/${record.id}`
  const row = pos && result?.slots[pos.slot].find((row) => row.kind === 'module' && row.positions.includes(pos.index))
  const positions = pos ? query.has('single') || row?.kind !== 'module' ? [pos.index] : row.positions : []

  const ready = Boolean(result)
  const replaced = positions.length
  const posSlot = pos?.slot
  const posIndex = pos?.index
  useEffect(() => {
    let current = true
    if (typeId !== undefined && ready && posSlot !== undefined && posIndex !== undefined) {
      void engine.variationsOf(typeId, fit, { slot: posSlot, index: posIndex }, replaced).then((groups) => {
        if (current) setListing({ typeId, groups })
      }, () => { if (current) setError(true) })
    }
    return () => { current = false }
  }, [engine, fit, ready, replaced, posIndex, posSlot, typeId])

  async function pick(item: ItemRow) {
    if (!pos || !module || working) return
    if (item.typeId === module.typeId) { navigate(path); return }
    setWorking(true)
    setError(false)
    const update = (compatible: boolean) => withModules(fit, pos.slot, positions, (mod) => mod && {
      typeId: item.typeId,
      state: !item.supportedStates || item.supportedStates.includes(mod.state) ? mod.state : 'online',
      chargeTypeId: compatible ? mod.chargeTypeId : null,
    })
    try {
      const chargeTypeId = module.chargeTypeId
      const compatible = chargeTypeId !== null && (await engine.chargesFor(update(true), pos))
        .some((group) => group.items.some((charge) => charge.typeId === chargeTypeId))
      edit(() => update(compatible), { [item.typeId]: item.name })
      navigate(path)
    } catch {
      setError(true)
      setWorking(false)
    }
  }

  const groups = listing && listing.typeId === typeId ? listing.groups : undefined
  const cpuLeft = result && result.resources.cpu.total - result.resources.cpu.used
  return <main>
    <PageHeading back={path} title={_t('Replace with a variation')}
      subtitle={row?.kind === 'module' && <>
        {_t('Current')}: {lname(row.name, language)} ×{positions.length}
        {cpuLeft !== undefined && <> · {_t('CPU left')} {fmt(cpuLeft, 2)}</>}
      </>} />
    {!module && <EmptyMessage>{_t('Module not found')}</EmptyMessage>}
    {error && <p role="alert" className="page-message">{_t('Could not load or replace variations')}</p>}
    {module && !groups && !error && <p role="status" className="page-message">{_t('Loading variations…')}</p>}
    {row?.kind === 'module' && <section aria-label={_t('Current module')}>
      <div className="ar on current-module">
        <ItemIcon src={iconUrl(row.iconId)} />
        <div className="mn">
          <span>{lname(row.name, language)} <span className="tag">{_t('Current')}</span></span>
          <small className="num">{row.keyLine && `${row.keyLine} · `}{_t('CPU')} {fmt(row.cpu, 2)}</small>
        </div>
      </div>
    </section>}
    {groups && groups.length > 0 && groups.some((group) => group.items[0]?.compare) && <p className="hint">
      {_t('Compared with the current base damage multiplier and CPU. Replacing changes {n} modules.')
        .replace('{n}', String(positions.length))}
    </p>}
    {groups?.length === 0 && <EmptyMessage>{_t('No variations')}</EmptyMessage>}
    {groups && groups.length > 0 && <fieldset disabled={working || !result}><MetaGroupList key={typeId}
      groups={groups} onPick={(item) => void pick(item)}
      renderItem={(item) => <button type="button" className="ar" onClick={() => void pick(item)}>
        <ItemIcon src={iconUrl(item.iconId)} />
        <div className="mn">
          <span>{lname(item.name, language)}</span>
          <small className={`num${item.compare && item.compare.cpuLeft < 0 ? ' warn' : ''}`}>{compareLine(item) || item.keyLine}</small>
        </div>
      </button>} /></fieldset>}
  </main>
}
