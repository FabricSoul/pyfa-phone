import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import type { CalcResult } from '../engine/types'
import { priceTotal, totalPriceItems, usePriceQuotes } from '../price/fitPrices'
import { useSettings } from '../settings/settings'
import { _t } from '../i18n/t'
import type { StoredFit } from '../store/fits'
import { FitRow } from '../ui/FitRow'
import { ItemIcon } from '../ui/ItemIcon'
import { InstallCard } from '../ui/InstallCard'
import { lname, renderUrl, useNameLanguage } from '../ui/format'
import { Icon } from '../ui/icons'
import { useFitServices } from './fitSession'
import { ShipBrowser } from './ShipBrowser'
import { FitSection, warningText } from './shared'

interface Entry {
  record: StoredFit
  result?: CalcResult
}

export function Home() {
  const [params] = useSearchParams()
  return params.has('new') ? <ShipBrowser /> : <FitLibrary />
}

function FitLibrary() {
  const lang = useNameLanguage()
  const { considerReload, priceIncluded } = useSettings()
  const navigate = useNavigate()
  const { engine, store } = useFitServices()
  const [entries, setEntries] = useState<Entry[]>()
  const [query, setQuery] = useState('')
  const [error, setError] = useState(false)

  useEffect(() => {
    let current = true
    void store.list().then(async (records) => {
      // The list does not need the engine: show it now, fill in the numbers as the engine answers.
      if (current) setEntries(records.map((record) => ({ record })))
      const rows = await Promise.all(records.map(async (record): Promise<Entry> => {
        try {
          return { record, result: await engine.calc(record.fit, { includeReload: considerReload }) }
        } catch {
          return { record }
        }
      }))
      if (current) setEntries(rows)
    }).catch(() => { if (current) setError(true) })
    return () => { current = false }
  }, [considerReload, engine, store])

  const quotes = usePriceQuotes((entries ?? []).flatMap(({ result }) =>
    result ? totalPriceItems(result.priceItems, priceIncluded) : []))
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

  return <main>
    <header className="home-heading">
      <h1>{_t('Fittings')}</h1>
      <Link className="fit-button" to="/settings">{_t('Settings')}</Link>
      <button type="button" className="fit-button primary" onClick={() => navigate('/?new')}>
        <Icon name="plus" />{_t('New')}
      </button>
    </header>
    <div className="fit-search-row">
      <input type="search" className="fit-input" aria-label={_t('Search fits or ships')} placeholder={_t('Search fits or ships')}
        value={query} onChange={(event) => setQuery(event.target.value)} />
      <Link className="fit-button" to="/import">{_t('Paste to import')}</Link>
    </div>
    <InstallCard />
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
            showPrice price={result ? priceTotal(totalPriceItems(result.priceItems, priceIncluded), quotes) : null}
            overflow={result?.warnings.map(warningText).join(' · ')}
            onClick={() => navigate(`/fit/${record.id}`)} />
        })}
      </div>
    </FitSection>)}
    {entries && !groups.size && <p className="page-message">{needle ? _t('No matching fits') : _t('No fits yet')}</p>}
    <footer className="hint"><Link to="/about">{_t('About')}</Link></footer>
  </main>
}

const fmtCount = (count: number) => _t('{n} fits').replace('{n}', String(count))
