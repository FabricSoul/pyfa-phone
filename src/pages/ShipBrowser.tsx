import { SkeletonList } from '../ui/Skeleton'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSticky } from '../app/sticky'
import type { CatalogShip, ShipCatalog } from '../engine/types'
import { _t } from '../i18n/t'
import { useSettings } from '../settings/settings'
import { Appear, TabPanel } from '../ui/motion'
import { lname, renderUrl, useNameLanguage } from '../ui/format'
import { Icon } from '../ui/icons'
import { ItemIcon } from '../ui/ItemIcon'
import { useFitServices } from './fitSession'
import { EmptyMessage, PageHeading } from './shared'

function raceName(race: number) {
  switch (race) {
    case 1: return _t('Caldari')
    case 2: return _t('Minmatar')
    case 4: return _t('Amarr')
    case 8: return _t('Gallente')
    case 16: return _t('Jove')
    case 32: return _t('Pirate')
    case 128: return _t('ORE')
    case 135: return _t('Triglavian')
    case 168: return _t('EDENCOM and Upwell')
    default: return _t('Other factions')
  }
}

export function ShipBrowser() {
  const lang = useNameLanguage()
  const navigate = useNavigate()
  const { engine, store } = useFitServices()
  const { defaultCharacter, defaultDamagePatternId } = useSettings()
  const [catalog, setCatalog] = useState<ShipCatalog>()
  const [catalogError, setCatalogError] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const [saving, setSaving] = useState(false)
  const [groupId, setGroupId] = useSticky<number | undefined>('pyfa.shipBrowser.groupId', undefined)
  const [race, setRace] = useState<number>()
  const [query, setQuery] = useSticky('pyfa.shipBrowser.query', '')
  const term = query.trim().toLowerCase()
  const compare = (a: string, b: string) => a.localeCompare(b, lang === 'zh' ? 'zh-CN' : 'en')

  useEffect(() => {
    let live = true
    if (!engine.shipCatalog) setCatalogError(true)
    else void engine.shipCatalog().then((data) => {
      if (live) setCatalog(data)
    }, () => { if (live) setCatalogError(true) })
    return () => { live = false }
  }, [engine])

  const groups = catalog?.groups ?? []
  const group = groups.find(({ id }) => id === groupId)
  const ships = group?.ships ?? groups.flatMap(({ ships }) => ships)
  const races = [...new Set(ships.map(({ raceId }) => raceId ?? 0))]
    .sort((a, b) => compare(raceName(a), raceName(b)))
  const visible = ships.filter(({ name, raceId }) =>
    (race === undefined || (raceId ?? 0) === race) &&
    (!term || name.en.toLowerCase().includes(term) || name.zh.toLowerCase().includes(term)))
    .sort((a, b) => compare(lname(a.name, lang), lname(b.name, lang)))
  const classes = groups.filter((group) => race === undefined || group.ships.some((ship) => (ship.raceId ?? 0) === race))
    .sort((a, b) => compare(lname(a.name, lang), lname(b.name, lang)))

  async function create(ship: CatalogShip) {
    if (!catalog || saving) return
    setSaving(true)
    setSaveError(false)
    const id = crypto.randomUUID()
    try {
      await store.save({
        id, openedAt: null, itemNames: { [ship.typeId]: ship.name },
        fit: {
          schema: 1, dataVersion: catalog.dataVersion, name: lname(ship.name, lang), shipTypeId: ship.typeId,
          modules: { high: [], mid: [], low: [], rig: [], subsystem: [] },
          cargo: [], drones: [], fighters: [], implants: [], boosters: [], notes: '',
          character: defaultCharacter, damagePatternId: defaultDamagePatternId, targetProfileId: null,
        },
      })
      setQuery('')
      setGroupId(undefined)
      navigate(`/fit/${id}`, { replace: true })
    } catch {
      setSaveError(true)
      setSaving(false)
    }
  }

  return <main>
    <PageHeading back="/" title={_t('New fit')} />
    <div className="fit-search-row">
      <input type="search" className="fit-input" aria-label={_t('Search ships')} placeholder={_t('Search ships')}
        value={query} onChange={(event) => setQuery(event.target.value)} />
    </div>
    {catalogError && <p className="page-message" role="alert">{_t('Could not load ships')}</p>}
    {!catalog && !catalogError && <SkeletonList rows={6} label={_t('Loading ships…')} />}
    {saveError && <p className="page-message" role="alert">{_t('Could not load or save fits')}</p>}
    <TabPanel value={group || term ? 'group' : 'classes'} order={['classes', 'group']} ready={Boolean(catalog)}>
    {catalog && <div className="fit-inset">
      <select className="fit-input" aria-label={_t('Ship faction')} value={race ?? ''}
        onChange={(event) => setRace(event.target.value === '' ? undefined : Number(event.target.value))}>
        <option value="">{_t('All factions')}</option>
        {races.map((id) => <option key={id} value={id}>{raceName(id)}</option>)}
      </select>
    </div>}
    {group && <div className="fit-inset">
      <button type="button" className="fit-button" onClick={() => setGroupId(undefined)}>
        <Icon name="chevron-left" />{_t('All ship groups')}
      </button>
    </div>}
    {group || term ? <>
      {group && <h2 className="fit-inset">{lname(group.name, lang)}</h2>}
      {visible.length ? <div className="list">
        {/* A group's ships rise in row by row (UX4 #5). */}
        {visible.map((ship, index) => <Appear key={ship.typeId} index={index}><button type="button" className="ar" disabled={saving}
          onClick={() => void create(ship)}>
          <ItemIcon src={renderUrl(ship.graphicId)} />
          <span className="mn">{lname(ship.name, lang)}</span>
        </button></Appear>)}
      </div> : catalog && <EmptyMessage>{_t('No ships available')}</EmptyMessage>}
    </> : classes.length > 0 ? <div className="list">
      {classes.map(({ id, name }) => <button type="button" className="ar" key={id} onClick={() => setGroupId(id)}>
        <span className="mn">{lname(name, lang)}</span>
        <Icon name="chevron-down" />
      </button>)}
    </div> : catalog && <EmptyMessage>{_t('No ships available')}</EmptyMessage>}
    </TabPanel>
  </main>
}
