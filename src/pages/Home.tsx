import { useEffect, useLayoutEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import type { CalcResult } from '../engine/types'
import { priceTotal, totalPriceItems, usePriceQuotes } from '../price/fitPrices'
import { useSettings } from '../settings/settings'
import { _t } from '../i18n/t'
import { calcCacheFor } from '../store/calcCache'
import type { StoredFit } from '../store/fits'
import { FitRow } from '../ui/FitRow'
import { Appear } from '../ui/motion'
import { ResumeCard } from '../ui/ResumeCard'
import { SkeletonList } from '../ui/Skeleton'
import { InstallCard } from '../ui/InstallCard'
import { lname, renderUrl, useNameLanguage } from '../ui/format'
import { Icon } from '../ui/icons'
import { useFitServices } from './fitSession'
import { ShipBrowser } from './ShipBrowser'
import { FitSection, warningText } from './shared'

interface Entry {
  record: StoredFit
  result?: CalcResult
  /** The engine has not answered for this fit yet. */
  pending: boolean
}

export function Home() {
  const [params] = useSearchParams()
  return params.has('new') ? <ShipBrowser /> : <FitLibrary />
}

let libraryScroll = 0

function FitLibrary() {
  const lang = useNameLanguage()
  const { considerReload, priceIncluded } = useSettings()
  const navigate = useNavigate()
  const { engine, store } = useFitServices()
  const cache = calcCacheFor(engine)
  const [entries, setEntries] = useState<Entry[] | undefined>(() => cache.records?.map((record) => {
    const result = cache.get(record, considerReload)
    return { record, result, pending: !result }
  }))
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    let current = true
    void store.list().then(async (records) => {
      cache.records = records
      // Cached numbers show at once; the list does not need the engine, so the rest wait as pending rows.
      if (current) setEntries(records.map((record) => {
        const result = cache.get(record, considerReload)
        return { record, result, pending: !result }
      }))
      await Promise.all(records.filter((record) => !cache.get(record, considerReload)).map(async (record) => {
        let result: CalcResult | undefined
        try { result = await cache.run(record, considerReload, () => engine.calc(record.fit, { includeReload: considerReload })) } catch { /* the row stays without numbers */ }
        if (current) setEntries((rows) => rows?.map((row) => row.record.id === record.id ? { record, result, pending: false } : row))
      }))
    }).catch(() => { if (current) setError(true) })
    return () => { current = false }
  }, [cache, considerReload, engine, store])

  // Coming back keeps the scroll position of the library.
  useLayoutEffect(() => {
    if (entries && libraryScroll > 0) window.scrollTo(0, libraryScroll)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries === undefined])
  useEffect(() => () => { libraryScroll = window.scrollY }, [])

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
  const last = needle ? undefined : entries?.filter(({ record }) => record.openedAt !== null)
    .sort((a, b) => (b.record.openedAt ?? 0) - (a.record.openedAt ?? 0))[0]
  let appearing = 0

  return <main>
    <header className="home-heading">
      <h1>{_t('Fittings')}</h1>
      <button type="button" className="ib" aria-label={_t('Search fits or ships')} aria-expanded={searching}
        onClick={() => { setSearching(!searching); if (searching) setQuery('') }}><Icon name="search" size={22} /></button>
      <Link className="ib" to="/settings" aria-label={_t('Settings')}><Icon name="settings" size={22} /></Link>
    </header>
    {searching && <div className="fit-search-row">
      <input type="search" className="fit-input" autoFocus aria-label={_t('Search fits or ships')} placeholder={_t('Search fits or ships')}
        value={query} onChange={(event) => setQuery(event.target.value)} />
    </div>}
    <nav className="qa-row" aria-label={_t('Quick actions')}>
      <Link className="qa primary" to="/?new"><Icon name="plus" size={22} />{_t('New fit')}</Link>
      <Link className="qa" to="/import"><Icon name="clipboard" size={22} />{_t('Paste to import')}</Link>
      <Link className="qa" to="/?new"><Icon name="ship" size={22} />{_t('Browse ships')}</Link>
    </nav>
    <InstallCard />
    {error && <p role="alert" className="page-message">{_t('Could not load or save fits')}</p>}
    {!entries && !error && <SkeletonList rows={4} label={_t('Loading fits…')} />}
    {last && <ResumeCard id={last.record.id} name={last.record.fit.name} openedAt={last.record.openedAt ?? 0} result={last.result} />}
    {[...groups].map(([group, rows]) => <FitSection key={group} title={group} info={fmtCount(rows.length)}>
      <div className="list">
        {rows.map(({ record, result, pending }) => {
          const ship = result?.ship.name ?? record.itemNames[record.fit.shipTypeId]
          return <Appear key={record.id} index={appearing++}><FitRow
            name={record.fit.name} shipName={ship ? lname(ship, lang) : undefined}
            shipSrc={renderUrl(result?.ship.graphicId ?? null)} pending={pending}
            dps={result?.stats.firepower.dps} ehp={result?.stats.defense.ehp} velocity={result?.stats.navigation.maxVelocity}
            cpu={result?.resources.cpu} grid={result?.resources.powergrid}
            showPrice price={result ? priceTotal(totalPriceItems(result.priceItems, priceIncluded), quotes) : null}
            overflow={result?.warnings.map(warningText).join(' · ')}
            onClick={() => navigate(`/fit/${record.id}`)} /></Appear>
        })}
      </div>
    </FitSection>)}
    {entries && !groups.size && (needle ? <p className="page-message">{_t('No matching fits')}</p>
      : <section className="empty-state" data-testid="empty-library">
        <p>{_t('No fits yet. Start from a ship, or paste a fit to import.')}</p>
        <div className="empty-actions">
          <Link className="fit-button primary" to="/?new">{_t('New fit')}</Link>
          <Link className="fit-button" to="/import">{_t('Paste to import')}</Link>
        </div>
      </section>)}
    <footer className="hint"><Link to="/about">{_t('About')}</Link></footer>
  </main>
}

const fmtCount = (count: number) => _t('{n} fits').replace('{n}', String(count))
