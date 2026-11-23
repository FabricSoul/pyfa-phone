import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  META_GROUPS, SlotKindSchema, type FitDoc, type ItemGroup, type ItemRow, type MarketGroup, type MetaGroup, type SlotKind,
} from '../engine/types'
import { _t, useUiLanguage } from '../i18n/t'
import { fmt, iconUrl, lname } from '../ui/format'
import { Icon } from '../ui/icons'
import { ItemIcon } from '../ui/ItemIcon'
import { MetaGroupList, metaLabel } from '../ui/MetaGroupList'
import { useFitServices, useFitSession, withModules } from './fitSession'
import { EmptyMessage, PageHeading } from './shared'

const RECENT_KEY = 'pyfa.recentModuleIds'
interface RecentModule { typeId: number; marketGroupId?: number; slot: SlotKind }

function readRecent(): RecentModule[] {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')
    if (!Array.isArray(data)) return []
    return data.filter((item): item is RecentModule =>
      item != null && Number.isSafeInteger(item.typeId) && SlotKindSchema.safeParse(item.slot).success)
  } catch {
    return []
  }
}

function remember(item: ItemRow, slot: SlotKind) {
  try {
    const next = { typeId: item.typeId, marketGroupId: item.marketGroup?.id, slot }
    localStorage.setItem(RECENT_KEY, JSON.stringify([next, ...readRecent().filter(({ typeId }) => typeId !== item.typeId)].slice(0, 24)))
  } catch {
    // The fit itself is saved independently in IndexedDB.
  }
}

function addTitle(slot: SlotKind) {
  switch (slot) {
    case 'high': return _t('Add high slot module')
    case 'mid': return _t('Add mid slot module')
    case 'low': return _t('Add low slot module')
    case 'rig': return _t('Add rig')
    case 'subsystem': return _t('Add subsystem')
  }
}

export function AddModule() {
  const { slot } = useParams()
  const parsed = SlotKindSchema.safeParse(slot)
  return parsed.success ? <ModulePicker key={parsed.data} slot={parsed.data} /> : <p className="page-message">{_t('Slot not found')}</p>
}

interface Listing {
  fit: FitDoc
  query: string
  groupId?: number
  groups: ItemGroup[]
}

function ModulePicker({ slot }: { slot: SlotKind }) {
  const language = useUiLanguage()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { engine } = useFitServices()
  const { record, fit, result, edit } = useFitSession()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<number>()
  const [meta, setMeta] = useState<MetaGroup>()
  const [browse, setBrowse] = useState(false)
  const [branch, setBranch] = useState<number[]>([])
  const [listing, setListing] = useState<Listing>()
  const [marketGroups, setMarketGroups] = useState<MarketGroup[]>()
  const [marketError, setMarketError] = useState(false)
  const [error, setError] = useState(false)
  const [recents] = useState(readRecent)
  const path = `/fit/${record.id}`
  const search = query.trim()

  useEffect(() => {
    let current = true
    if (!engine.marketGroupsForSlot) return
    void engine.marketGroupsForSlot(fit, slot).then((groups) => {
      if (current) { setMarketGroups(groups); setMarketError(false) }
    }, () => { if (current) setMarketError(true) })
    return () => { current = false }
  }, [engine, fit, slot])

  const families = useMemo(() => (marketGroups ?? []).slice().sort((a, b) =>
    lname(a.name, language).localeCompare(lname(b.name, language), language === 'zh_CN' ? 'zh-CN' : 'en')),
  [marketGroups, language])
  const recent = recents.find((item) => item.slot === slot && families.some((group) => group.id === item.marketGroupId))
  const family = selected ?? recent?.marketGroupId ?? families[0]?.id
  const groupId = search ? undefined : family
  const request = search !== '' || groupId !== undefined

  useEffect(() => {
    if (!request || browse) return
    let current = true
    const timer = setTimeout(() => {
      void engine.itemsForSlot(fit, slot, search || undefined, { marketGroupId: groupId, preview: false }).then((groups) => {
        if (!current) return
        setListing({ fit, query: search, groupId, groups: groups.filter((group) => group.items.length > 0) })
        setError(false)
      }, () => { if (current) setError(true) })
    }, search ? 120 : 0)
    return () => { current = false; clearTimeout(timer) }
  }, [browse, engine, fit, groupId, request, search, slot])

  const loaded = listing?.fit === fit && listing.query === search && listing.groupId === groupId
  const groups = loaded ? listing.groups : []
  const items = groups.flatMap((group) => group.items)
  const visible = meta ? groups.filter((group) => group.meta === meta) : groups
  const installed = fit.modules[slot].flatMap((module) => module ? [module.typeId] : [])
  const recentIds = recents.filter((item) => item.slot === slot).map((item) => item.typeId)
  const recentItems = [...new Set([...recentIds, ...installed])].flatMap((id) => items.find((item) => item.typeId === id) ?? []).slice(0, 3)
  const selectedIndex = params.has('index') ? Number(params.get('index')) : undefined
  const total = result?.resources.slots[slot].total ?? 0
  const empty = Array.from({ length: total }, (_, index) => index).filter((index) => !fit.modules[slot][index])
  const index = selectedIndex === undefined ? empty[0] : empty.find((index) => index === selectedIndex)
  const cpu = result && result.resources.cpu.total - result.resources.cpu.used
  const powergrid = result && result.resources.powergrid.total - result.resources.powergrid.used
  const ship = result?.ship.name
  const focus = families.find((group) => group.id === family)
  const marketNodes = marketChildren(families, branch)

  const marketLabel = (group: MarketGroup) => {
    const parent = group.ancestors?.at(-1)
    const name = lname(group.name, language)
    const generic = /^(Small|Medium|Large|Extra Large|Capital)$/.test(group.name.en)
    const duplicate = families.some((other) => other.id !== group.id && lname(other.name, language) === name)
    return parent && (generic || duplicate) ? `${lname(parent.name, language)} · ${name}` : name
  }

  function pick(item: ItemRow) {
    if (index === undefined) return
    edit((fit) => withModules(fit, slot, [index], () => ({
      typeId: item.typeId, state: 'online', chargeTypeId: null,
    })), { [item.typeId]: item.name })
    remember(item.marketGroup || !focus ? item : { ...item, marketGroup: focus }, slot)
    navigate(path)
  }

  function changeFamily(group: MarketGroup) {
    setSelected(group.id)
    setError(false)
    setMeta(undefined)
    setBrowse(false)
    setBranch([])
  }

  return <main>
    <PageHeading back={path} title={addTitle(slot)} subtitle={ship && <>
      {lname(ship, language)} · {_t('CPU')} {available(cpu)} · {_t('Powergrid')} {available(powergrid)}
    </>} />
    <div className="fit-search-row">
      <input className="fit-input" type="search" aria-label={_t('Search modules')} placeholder={_t('Search modules')}
        value={query} onChange={(event) => { setQuery(event.target.value); setMeta(undefined); setBrowse(false) }} />
    </div>
    {(request ? error : marketError) && <p role="alert" className="page-message">{_t('Could not load modules')}</p>}
    {!browse && !loaded && (request && !error || !marketGroups && !marketError && engine.marketGroupsForSlot) &&
      <p role="status" className="page-message">{_t('Loading modules…')}</p>}
    {!search && marketGroups?.length === 0 && <EmptyMessage>{_t('No matching modules')}</EmptyMessage>}
    {result && index === undefined && <p role="status" className="page-message">{_t('No empty slot')}</p>}
    {!search && !browse && recentItems.length > 0 && <>
      <h2 className="fit-filter-label">{_t('Recent modules')}</h2>
      <div className="fit-chips">
        {recentItems.map((item) => <button key={item.typeId} type="button" className="fit-chip" disabled={index === undefined} onClick={() => pick(item)}>
          {lname(item.name, language)}
        </button>)}
      </div>
    </>}
    {!search && families.length > 0 && !browse && <div className="fit-chips" aria-label={_t('Module groups')}>
      {families.map((group) => <button key={group.id} type="button" className="fit-chip" aria-pressed={group.id === family}
        onClick={() => changeFamily(group)}>{marketLabel(group)}</button>)}
    </div>}
    {browse ? <div className="list">
      {branch.length > 0 && <button type="button" className="ar" onClick={() => setBranch(branch.slice(0, -1))}>
        <Icon name="chevron-left" /> {_t('Up one market group')}
      </button>}
      {marketNodes.map(({ group, leaf }) => <button key={group.id} type="button" className="ar"
        onClick={() => leaf ? changeFamily(leaf) : setBranch([...branch, group.id])}>
        <span className="mn">{lname(group.name, language)}</span>
        {!leaf && <Icon name="chevron-down" />}
      </button>)}
    </div> : <>
      {loaded && items.length > 0 && <div className="fit-filter-bar">
        <h2>{focus && !search ? marketLabel(focus) : _t('Compatible modules')}</h2>
        <select className="fit-input" aria-label={_t('Technology level')} value={meta ?? ''}
          onChange={(event) => setMeta(event.target.value ? event.target.value as MetaGroup : undefined)}>
          <option value="">{_t('All technology levels')}</option>
          {META_GROUPS.filter((code) => groups.some((group) => group.meta === code)).map((code) =>
            <option key={code} value={code}>{metaLabel(code)}</option>)}
        </select>
      </div>}
      {loaded && !visible.length && <EmptyMessage>{_t('No matching modules')}</EmptyMessage>}
      {visible.length > 0 && <MetaGroupList key={JSON.stringify([search, groupId, meta])} groups={visible}
        renderGroup={(group) => <CandidateRows group={group} slot={slot} search={search} groupId={groupId}
          disabled={index === undefined} onPick={pick} />} />}
    </>}
    {!search && families.length > 0 && <button type="button" className="market-link" onClick={() => { setBrowse(!browse); setBranch([]) }}>
      {browse ? _t('Return to modules') : _t('Browse all market groups')} <Icon name="chevron-down" />
    </button>}
  </main>
}

function CandidateRows({ group, slot, search, groupId, disabled, onPick }: {
  group: ItemGroup
  slot: SlotKind
  search: string
  groupId?: number
  disabled: boolean
  onPick: (item: ItemRow) => void
}) {
  const lang = useUiLanguage()
  const { engine } = useFitServices()
  const { fit } = useFitSession()
  const [previews, setPreviews] = useState<Map<number, ItemRow>>()
  const [error, setError] = useState(false)

  useEffect(() => {
    if (disabled) return
    let current = true
    void engine.itemsForSlot(fit, slot, search || undefined, { marketGroupId: groupId, meta: group.meta, preview: true })
      .then((groups) => {
        if (current) setPreviews(new Map(groups.flatMap((group) => group.items.map((row) => [row.typeId, row]))))
      }, () => { if (current) setError(true) })
    return () => { current = false }
  }, [disabled, engine, fit, group.meta, groupId, search, slot])

  return <>
    {!disabled && !previews && !error && <p className="fit-caption fit-preview" role="status">{_t('Checking fit…')}</p>}
    {error && <p className="fit-caption fit-preview warn" role="status">{_t('Could not check fitting resources')}</p>}
    {group.items.map((item) => {
      const preview = previews?.get(item.typeId)
      const warnings = fittingWarnings(preview)
      return <button key={item.typeId} type="button" className="ar candidate" disabled={disabled} onClick={() => onPick(item)}>
        <ItemIcon src={iconUrl(item.iconId)} />
        <span className="mn">
          <span>{lname(item.name, lang)}</span>
          {item.keyLine && <small className="num">{item.keyLine}</small>}
          {item.fitting && <small className="num">{_t('CPU')} {fmt(item.fitting.cpu)} · {_t('Powergrid')} {fmt(item.fitting.powergrid)}</small>}
          {warnings && <small className="warn">{warnings}</small>}
        </span>
      </button>
    })}
  </>
}

function available(amount?: number) {
  return amount == null ? '—' : _t('{n} remaining').replace('{n}', fmt(amount))
}

function fittingWarnings(item?: ItemRow) {
  const over = item?.resourceOverages?.flatMap(({ kind, overBy }) => {
    const label = kind === 'cpu' ? _t('CPU') : kind === 'powergrid' ? _t('Powergrid') : undefined
    return label ? [`${label} ${_t('Over')} ${fmt(overBy)}`] : []
  })
  if (!over?.length) return ''
  return _t('After fitting: {resources}').replace('{resources}', over.join(' · '))
}

function marketChildren(groups: MarketGroup[], branch: number[]) {
  const nodes = new Map<number, { group: MarketGroup; leaf?: MarketGroup }>()
  for (const leaf of groups) {
    const path = [...leaf.ancestors ?? [], leaf]
    if (!branch.every((id, index) => path[index]?.id === id)) continue
    const group = path[branch.length]
    if (group) nodes.set(group.id, { group, leaf: group.id === leaf.id ? leaf : undefined })
  }
  return [...nodes.values()]
}
