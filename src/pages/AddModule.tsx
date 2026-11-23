import '../ui/extras.css'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  SlotKindSchema, type ItemGroup, type ItemRow, type MarketTreeNode, type MetaGroup, type SlotItemsOptions, type SlotKind, type SlotMarketTree,
} from '../engine/types'
import { _t } from '../i18n/t'
import { ActionSheet, SheetAction } from '../ui/ActionSheet'
import { fmt, iconUrl, lname, useNameLanguage } from '../ui/format'
import { Icon } from '../ui/icons'
import { ItemIcon } from '../ui/ItemIcon'
import { MetaGroupList } from '../ui/MetaGroupList'
import { useToast } from '../ui/Toast'
import { useFitServices, useFitSession, withModules } from './fitSession'
import { useSticky } from '../app/sticky'
import { addExtra } from './ExtraItemPicker'
import { EmptyMessage, NotFound, PageHeading } from './shared'

const RECENT_KEY = 'pyfa.recentModuleIds'
interface RecentModule { typeId: number; slot: SlotKind }

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
    const recent = readRecent().filter((entry) => entry.typeId !== item.typeId)
    const sameSlot = recent.filter((entry) => entry.slot === slot).slice(0, 5)
    localStorage.setItem(RECENT_KEY, JSON.stringify([
      { typeId: item.typeId, slot }, ...sameSlot, ...recent.filter((entry) => entry.slot !== slot),
    ]))
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
  return parsed.success ? <ModulePicker key={parsed.data} slot={parsed.data} /> : <NotFound title={_t('Slot not found')} />
}

function searchPlaceholder(slot: SlotKind, count: number) {
  const n = fmt(count)
  switch (slot) {
    case 'high': return _t('Search all {n} high slot modules').replace('{n}', n)
    case 'mid': return _t('Search all {n} mid slot modules').replace('{n}', n)
    case 'low': return _t('Search all {n} low slot modules').replace('{n}', n)
    case 'rig': return _t('Search all {n} rigs').replace('{n}', n)
    case 'subsystem': return _t('Search all {n} subsystems').replace('{n}', n)
  }
}

interface MarketSelection { branch: number[]; meta?: MetaGroup }

function ModulePicker({ slot }: { slot: SlotKind }) {
  const language = useNameLanguage()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { engine } = useFitServices()
  const { record, fit, result, edit } = useFitSession()
  const [query, setQuery] = useSticky(`pyfa.addModule.query.${slot}`, '')
  const [selection, setSelection] = useSticky<MarketSelection>(`pyfa.addModule.market.${slot}`, { branch: [] })
  const [tree, setTree] = useState<SlotMarketTree>()
  const [marketError, setMarketError] = useState(false)
  const [recentIds] = useState(() => [...new Set(readRecent().filter((item) => item.slot === slot)
    .map((item) => item.typeId))].slice(0, 6))
  const [recentItems, setRecentItems] = useState<ItemRow[]>([])
  const path = `/fit/${record.id}`
  const search = query.trim()
  const focusParam = Number(params.get('market'))
  const focusId = Number.isSafeInteger(focusParam) && focusParam > 0 ? focusParam : undefined

  useEffect(() => {
    let live = true
    const timer = setTimeout(() => {
      void engine.marketTreeForSlot?.(slot).then((value) => {
        if (live) setTree(value)
      }, () => { if (live) setMarketError(true) })
    }, 0)
    return () => { live = false; clearTimeout(timer) }
  }, [engine, slot])

  useEffect(() => {
    if (!recentIds.length) return
    let live = true
    const timer = setTimeout(() => {
      void engine.itemsForSlot(fit, slot, undefined, { typeIds: recentIds, preview: false }).then((groups) => {
        if (!live) return
        const items = new Map(groups.flatMap((group) => group.items.map((item) => [item.typeId, item])))
        setRecentItems(recentIds.flatMap((id) => items.get(id) ?? []))
      }, () => { if (live) setRecentItems([]) })
    }, 0)
    return () => { live = false; clearTimeout(timer) }
  }, [engine, fit, recentIds, slot])

  // Arriving from "View in market": open the module's branch once the tree is known and clear any search.
  const [jumped, setJumped] = useState<number>()
  useEffect(() => {
    if (focusId === undefined || !tree || jumped === focusId) return
    let live = true
    void engine.itemsForSlot(fit, slot, undefined, { typeIds: [focusId], preview: false }).then((groups) => {
      const item = groups.flatMap((group) => group.items)[0]
      if (!live) return
      setJumped(focusId)
      if (!item?.marketGroup) return
      const ids = [...item.marketGroup.ancestors ?? [], item.marketGroup].map(({ id }) => id)
      const root = ids.indexOf(tree.rootId)
      if (root < 0) return
      setQuery('')
      setSelection({ branch: ids.slice(root + 1, root + 3), meta: item.meta })
    }, () => { if (live) setJumped(focusId) })
    return () => { live = false }
  }, [engine, fit, focusId, jumped, setQuery, setSelection, slot, tree])

  const selectedIndex = params.has('index') ? Number(params.get('index')) : undefined
  const total = result?.resources.slots[slot].total ?? 0
  const empty = Array.from({ length: total }, (_, index) => index).filter((index) => !fit.modules[slot][index])
  const index = selectedIndex === undefined ? empty[0] : empty.find((index) => index === selectedIndex)
  const cpu = result && result.resources.cpu.total - result.resources.cpu.used
  const grid = result && result.resources.powergrid.total - result.resources.powergrid.used
  const ship = result?.ship.name

  function pick(item: ItemRow) {
    if (index === undefined || item.fitRestriction) return
    edit((fit) => withModules(fit, slot, [index], () => ({
      typeId: item.typeId, state: item.initialState ?? 'online', chargeTypeId: null,
    })), { [item.typeId]: item.name })
    remember(item, slot)
    if (tree && item.marketGroup) {
      const ids = [...item.marketGroup.ancestors ?? [], item.marketGroup].map(({ id }) => id)
      const root = ids.indexOf(tree.rootId)
      if (root >= 0) setSelection({ branch: ids.slice(root + 1, root + 3), meta: item.meta })
    }
    navigate(path)
  }

  function renderNode(node: MarketTreeNode, parents: number[]) {
    const depth = parents.length
    const branch = [...parents, node.id]
    const expanded = selection.branch[depth] === node.id
    const defaultMeta = selection.branch.length === branch.length ? selection.meta : undefined
    const showChildren = depth === 0 && node.children.length > 0
    return <div key={node.id} className={depth === 0 ? 'market-category' : 'market-branch'}>
      <button className="mh market-node" type="button" aria-expanded={expanded}
        onClick={() => setSelection({ branch: expanded ? parents : branch })}>
        <span className="cv"><Icon name="chevron-down" size={16} /></span>
        <ItemIcon src={iconUrl(node.displayIconId ?? node.iconId)} />
        <span>{lname(node.name, language)}</span>
        <em className="num">{fmt(node.count)}</em>
      </button>
      {expanded && <>
        {showChildren && node.children.map((child) => renderNode(child, branch))}
        {(!showChildren || node.directCount > 0) && <CandidateList slot={slot} groupId={node.id} exactGroup={showChildren}
          disabled={index === undefined} expanded={defaultMeta ? [defaultMeta] : []} onPick={pick} focusId={focusId}
          onToggle={(meta) => setSelection({ branch, meta: defaultMeta === meta ? undefined : meta })} />}
      </>}
    </div>
  }

  return <main>
    <PageHeading back={path} title={addTitle(slot)} subtitle={ship && <>
      {lname(ship, language)} · {_t('CPU')} {available(cpu)} · {_t('Powergrid')} {available(grid)}
    </>} />
    <div className="fit-search-row market-search">
      <input className="fit-input" type="search" aria-label={_t('Search modules')}
        placeholder={tree ? searchPlaceholder(slot, tree.total) : _t('Search modules')}
        value={query} onChange={(event) => setQuery(event.target.value)} />
    </div>
    {marketError && <p role="alert" className="page-message">{_t('Could not load modules')}</p>}
    {!tree && !marketError && engine.marketTreeForSlot && <p role="status" className="page-message">{_t('Loading modules…')}</p>}
    {result && index === undefined && <p role="status" className="page-message">{_t('No empty slot')}</p>}
    {!search && recentItems.length > 0 && <section aria-label={_t('Recent modules')}>
      <h2 className="fit-filter-label">{_t('Recent modules')}</h2>
      <div className="fit-chips market-recent">
        {recentItems.map((item) => <button key={item.typeId} type="button" className="fit-chip"
          disabled={index === undefined || item.fitRestriction !== undefined} onClick={() => pick(item)}>
          <ItemIcon src={iconUrl(item.iconId)} />
          <span>{lname(item.name, language)}{item.fitRestriction && <small>{restrictionLabel(item.fitRestriction)}</small>}</span>
        </button>)}
      </div>
    </section>}
    {search && (tree || !engine.marketTreeForSlot || marketError)
      ? <CandidateList key={search} slot={slot} search={search} groupId={tree?.rootId} disabled={index === undefined} onPick={pick} />
      : !search && tree && <section aria-label={_t('Browse by market category')}>
        <h2 className="fit-filter-label">{_t('Browse by market category')}</h2>
        {tree.total ? <div className="list market-tree">{tree.groups.map((node) => renderNode(node, []))}</div>
          : <EmptyMessage>{_t('No matching modules')}</EmptyMessage>}
      </section>}
  </main>
}

function CandidateList({ slot, search = '', groupId, exactGroup = false, disabled, expanded, onToggle, onPick, focusId }: {
  slot: SlotKind
  search?: string
  groupId?: number
  exactGroup?: boolean
  disabled: boolean
  expanded?: MetaGroup[]
  onToggle?: (meta: MetaGroup) => void
  onPick: (item: ItemRow) => void
  focusId?: number
}) {
  const { engine } = useFitServices()
  const { fit } = useFitSession()
  const [groups, setGroups] = useState<ItemGroup[]>()
  const [error, setError] = useState(false)
  const [previews, setPreviews] = useState<Partial<Record<MetaGroup, ItemGroup>>>({})
  const filter: SlotItemsOptions = exactGroup ? { marketGroupId: groupId, exactMarketGroup: true } : { marketGroupId: groupId }

  useEffect(() => {
    let live = true
    const timer = setTimeout(() => {
      void engine.itemsForSlot(fit, slot, search || undefined, {
        marketGroupId: groupId, ...(exactGroup ? { exactMarketGroup: true } : {}), preview: false,
      }).then((value) => {
        if (live) {
          setGroups(value.filter((group) => group.items.length > 0))
          setPreviews({})
          setError(false)
        }
      }, () => { if (live) setError(true) })
    }, search ? 120 : 0)
    return () => { live = false; clearTimeout(timer) }
  }, [engine, exactGroup, fit, groupId, search, slot])

  if (error) return <p role="alert" className="page-message">{_t('Could not load modules')}</p>
  if (!groups) return <p role="status" className="page-message">{_t('Loading modules…')}</p>
  if (!groups.length) return <EmptyMessage>{_t('No matching modules')}</EmptyMessage>
  return <MetaGroupList groups={groups.map((group) => previews[group.meta] ?? group)}
    expanded={expanded} onToggleExpanded={onToggle}
    renderGroup={(group) => <CandidateRows group={group} slot={slot} search={search} filter={filter}
      disabled={disabled} checked={Boolean(previews[group.meta])} focusId={focusId}
      onChecked={(preview) => setPreviews((before) => ({ ...before, [group.meta]: preview }))} onPick={onPick} />} />
}

function CandidateRows({ group, slot, search, filter, disabled, checked, onChecked, onPick, focusId }: {
  group: ItemGroup
  slot: SlotKind
  search: string
  filter: SlotItemsOptions
  disabled: boolean
  checked: boolean
  onChecked: (preview: ItemGroup) => void
  onPick: (item: ItemRow) => void
  focusId?: number
}) {
  const lang = useNameLanguage()
  const { marketGroupId, exactMarketGroup } = filter
  const { engine } = useFitServices()
  const { fit, edit } = useFitSession()
  const toast = useToast()
  const onCheckedRef = useRef(onChecked)
  onCheckedRef.current = onChecked
  const [error, setError] = useState(false)
  const [actionItem, setActionItem] = useState<ItemRow>()
  const actionName = actionItem && lname(actionItem.name, lang)

  useEffect(() => {
    if (disabled || checked) return
    let current = true
    const timer = setTimeout(() => {
      void engine.itemsForSlot(fit, slot, search || undefined, { marketGroupId, ...(exactMarketGroup ? { exactMarketGroup } : {}), meta: group.meta, preview: true })
        .then((groups) => {
          if (current) onCheckedRef.current(groups.find((entry) => entry.meta === group.meta) ?? group)
        }, () => { if (current) setError(true) })
    }, 0)
    return () => { current = false; clearTimeout(timer) }
  }, [checked, disabled, engine, exactMarketGroup, fit, group, marketGroupId, search, slot])

  return <>
    {!disabled && !checked && !error && <p className="fit-caption fit-preview" role="status">{_t('Checking fit…')}</p>}
    {error && <p className="fit-caption fit-preview warn" role="status">{_t('Could not check fitting resources')}</p>}
    {group.items.map((item) => {
      const warnings = fittingWarnings(item)
      const restriction = item.fitRestriction
      const focused = item.typeId === focusId
      return <div key={item.typeId} className="market-candidate-actions">
        <button type="button" className={`${restriction ? 'ar candidate-restricted' : 'ar candidate'}${focused ? ' on' : ''}`}
          aria-current={focused || undefined} ref={focused ? (node) => node?.scrollIntoView?.({ block: 'center' }) : undefined}
          disabled={disabled || restriction !== undefined} onClick={() => onPick(item)}>
          <ItemIcon src={iconUrl(item.iconId)} />
          <span className="mn">
            <span>{lname(item.name, lang)}</span>
            {item.keyLine && <small className="num">{item.keyLine}</small>}
            {item.fitting && <small className="num">{_t('CPU')} {fmt(item.fitting.cpu)} · {_t('Powergrid')} {fmt(item.fitting.powergrid)}</small>}
            {restriction && <small>{restrictionLabel(restriction)}</small>}
            {warnings && <small className="warn">{warnings}</small>}
          </span>
        </button>
        <button type="button" className="fit-button" aria-haspopup="dialog"
          aria-label={_t('Actions for {item}').replace('{item}', lname(item.name, lang))} onClick={() => setActionItem(item)}>
          <Icon name="more" size={20} />
        </button>
      </div>
    })}
    {actionItem && actionName && <ActionSheet open title={actionName} onClose={() => setActionItem(undefined)}>
      <div className="fit-section-title" aria-hidden="true"><h3>{actionName}</h3></div>
      <SheetAction icon="plus" onClick={() => {
        edit((current) => addExtra(current, 'cargo', actionItem.typeId), { [actionItem.typeId]: actionItem.name })
        toast.show({ message: _t('{item} added to cargo').replace('{item}', actionName) })
        setActionItem(undefined)
      }}>{_t('Add to cargo')}</SheetAction>
    </ActionSheet>}
  </>
}

function restrictionLabel(restriction: NonNullable<ItemRow['fitRestriction']>) {
  switch (restriction) {
    case 'typeLimit': return _t('Maximum of this module fitted')
    case 'groupLimit': return _t('Maximum for this module group fitted')
    case 'hull': return _t('Incompatible with this ship')
    case 'rigSize': return _t('Wrong rig size')
    case 'subsystemSlot': return _t('Subsystem slot already occupied')
    case 'capitalSize': return _t('Requires a capital ship')
    case 'slotLimit': return _t('No empty slot')
    case 'hardpointLimit': return _t('No free hardpoint')
  }
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
