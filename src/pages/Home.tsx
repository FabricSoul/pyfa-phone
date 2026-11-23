import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { CalcResult } from '../engine/types'
import { _t, useUiLanguage } from '../i18n/t'
import { exampleFitDocs, type StoredFit } from '../store/fits'
import { ActionSheet, SheetAction } from '../ui/ActionSheet'
import { FitRow } from '../ui/FitRow'
import { ItemIcon } from '../ui/ItemIcon'
import { lname, renderUrl } from '../ui/format'
import { Icon } from '../ui/icons'
import { useFitServices } from './fitSession'
import { FitSection, warningText } from './shared'

interface Entry {
  record: StoredFit
  result?: CalcResult
}

export function Home() {
  const lang = useUiLanguage()
  const navigate = useNavigate()
  const { engine, store } = useFitServices()
  const [entries, setEntries] = useState<Entry[]>()
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const [examples, setExamples] = useState<Pick<CalcResult, 'ship' | 'dataVersion'>[]>()
  const [error, setError] = useState(false)

  useEffect(() => {
    let current = true
    void store.list().then(async (records) => {
      const rows = await Promise.all(records.map(async (record): Promise<Entry> => {
        try {
          return { record, result: await engine.calc(record.fit) }
        } catch {
          return { record }
        }
      }))
      if (current) setEntries(rows)
    }).catch(() => { if (current) setError(true) })
    return () => { current = false }
  }, [engine, store])

  useEffect(() => {
    if (!creating || examples || !entries) return
    let current = true
    void Promise.allSettled(exampleFitDocs.map(({ fit }) => {
      const existing = entries.find(({ result }) => result?.ship.typeId === fit.shipTypeId)?.result
      return existing ?? engine.calc(emptyFit(fit, ''))
    })).then((ships) => {
      if (current) setExamples(ships.flatMap((ship) => ship.status === 'fulfilled' ? [ship.value] : []))
    })
    return () => { current = false }
  }, [creating, engine, entries, examples])
  const needle = query.trim().toLowerCase()
  const groups = new Map<string, Entry[]>()
  for (const entry of entries ?? []) {
    const { result, record } = entry
    const ship = result?.ship.name ?? record.itemNames[record.fit.shipTypeId]
    if (![record.fit.name, ship?.en, ship?.zh].some((name) => name?.toLowerCase().includes(needle))) continue
    const group = result?.ship.group
    const key = group ? lname(group, lang) : _t('Other ships')
    groups.set(key, [...groups.get(key) ?? [], entry])
  }
  const recent = entries?.filter(({ record }) => record.openedAt !== null)
    .sort((a, b) => (b.record.openedAt ?? 0) - (a.record.openedAt ?? 0)).slice(0, 6) ?? []

  function create(ship: CalcResult['ship'], dataVersion: string) {
    const example = exampleFitDocs.find(({ fit }) => fit.shipTypeId === ship.typeId)
    if (!example) return
    const id = crypto.randomUUID()
    const fit = emptyFit({ ...example.fit, dataVersion }, lname(ship.name, lang))
    setCreating(false)
    void store.save({ id, fit, openedAt: null, itemNames: { [ship.typeId]: ship.name } })
      .then(() => navigate(`/fit/${id}`), () => setError(true))
  }

  return <main>
    <header className="home-heading">
      <h1>{_t('Fittings')}</h1>
      <Link className="fit-button" to="/settings">{_t('Settings')}</Link>
      <button type="button" className="fit-button primary" onClick={() => setCreating(true)} disabled={!entries}>
        <Icon name="plus" />{_t('New')}
      </button>
    </header>
    <div className="fit-search-row">
      <input type="search" className="fit-input" aria-label={_t('Search fits or ships')} placeholder={_t('Search fits or ships')}
        value={query} onChange={(event) => setQuery(event.target.value)} />
      <Link className="fit-button" to="/import">{_t('Paste to import')}</Link>
    </div>
    {error && <p role="alert" className="page-message">{_t('Could not load or save fits')}</p>}
    {!entries && !error && <p role="status" className="page-message">{_t('Loading fits…')}</p>}
    {recent.length > 0 && !needle && <FitSection title={_t('Recently opened')}>
      <div className="recent-fits">
        {recent.map(({ record, result }) => <Link key={record.id} className="recent-fit" to={`/fit/${record.id}`}>
          <ItemIcon className="ship" size={36} src={renderUrl(result?.ship.graphicId ?? null)} />
          <span><b>{record.fit.name}</b>{result && <small>{lname(result.ship.name, lang)}</small>}</span>
        </Link>)}
      </div>
    </FitSection>}
    {[...groups].map(([group, rows]) => <FitSection key={group} title={group} info={fmtCount(rows.length)}>
      <div className="list">
        {rows.map(({ record, result }) => {
          const ship = result?.ship.name ?? record.itemNames[record.fit.shipTypeId]
          return <FitRow key={record.id}
            name={record.fit.name} shipName={ship ? lname(ship, lang) : undefined}
            shipSrc={renderUrl(result?.ship.graphicId ?? null)}
            dps={result?.stats.firepower.dps} ehp={result?.stats.defense.ehp} velocity={result?.stats.navigation.maxVelocity}
            overflow={result?.warnings.map(warningText).join(' · ')}
            onClick={() => navigate(`/fit/${record.id}`)} />
        })}
      </div>
    </FitSection>)}
    {entries && !groups.size && <p className="page-message">{needle ? _t('No matching fits') : _t('No fits yet')}</p>}
    <ActionSheet open={creating} title={_t('New fit')} onClose={() => setCreating(false)}>
      <FitSection title={_t('New fit')}>
        {!examples && <p className="page-message" role="status">{_t('Loading ships…')}</p>}
        {examples?.length === 0 && <p className="page-message">{_t('No ships available')}</p>}
        {examples?.map(({ ship, dataVersion }) => <SheetAction key={ship.typeId} onClick={() => create(ship, dataVersion)}>
          {lname(ship.name, lang)}
        </SheetAction>)}
      </FitSection>
    </ActionSheet>
  </main>
}

const fmtCount = (count: number) => _t('{n} fits').replace('{n}', String(count))

function emptyFit(fit: StoredFit['fit'], name: string): StoredFit['fit'] {
  return {
    ...fit, name,
    modules: { high: [], mid: [], low: [], rig: [], subsystem: [] },
    cargo: [], drones: [], implants: [], boosters: [], notes: '',
  }
}
