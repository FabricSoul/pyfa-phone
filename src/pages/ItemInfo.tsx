import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import type { ItemDetails } from '../engine/types'
import { _t } from '../i18n/t'
import { iconUrl, lname, fmt, useNameLanguage } from '../ui/format'
import { ItemIcon } from '../ui/ItemIcon'
import { MetaTag } from '../ui/MetaGroupList'
import { Segmented } from '../ui/Segmented'
import { parsePosition, useFitServices } from './fitSession'
import { EmptyMessage, FitSection, PageHeading } from './shared'

type View = 'attributes' | 'description' | 'skills'

export function ItemInfo() {
  const { typeId: param } = useParams()
  const [params] = useSearchParams()
  const fitId = params.get('fit') ?? ''
  const position = params.get('pos') ?? ''
  const typeId = Number(param)
  return <Details key={`${param}-${fitId}-${position}`} typeId={typeId} fitId={fitId} position={position} />
}

function Details({ typeId, fitId, position }: { typeId: number; fitId: string; position: string }) {
  const language = useNameLanguage()
  const { engine, store } = useFitServices()
  const [view, setView] = useState<View>('attributes')
  const [item, setItem] = useState<ItemDetails | null>()
  const [error, setError] = useState(false)
  const back = fitId ? `/fit/${encodeURIComponent(fitId)}` : '/'

  useEffect(() => {
    let current = true
    if (Number.isSafeInteger(typeId) && typeId > 0 && engine.itemInfo) {
      void (async () => {
        const fit = fitId ? (await store.get(fitId))?.fit : undefined
        const item = await engine.itemInfo?.(typeId, fit, parsePosition(position))
        if (current) setItem(item ?? null)
      })().catch(() => { if (current) setError(true) })
    } else {
      setItem(null)
    }
    return () => { current = false }
  }, [engine, fitId, position, store, typeId])

  return <main>
    <PageHeading back={back} title={item ? lname(item.name, language) : _t('Item information')}
      image={item && <ItemIcon src={iconUrl(item.iconId)} />}
      subtitle={item && <>{item.group && lname(item.group, language)} {item.meta && <MetaTag meta={item.meta} />}</>} />
    {error && <p className="page-message" role="alert">{_t('Could not load item information')}</p>}
    {item === undefined && !error && <p role="status" className="page-message">{_t('Loading item…')}</p>}
    {item === null && <EmptyMessage>{_t('Item information unavailable')}</EmptyMessage>}
    {item && <>
      <Segmented value={view} onChange={setView} options={[
        { value: 'attributes', label: _t('Attributes') },
        { value: 'description', label: _t('Description') },
        { value: 'skills', label: _t('Requirements') },
      ]} />
      {view === 'attributes' && <FitSection title={_t('Attributes')}
        info={item.attributes.some((attribute) => attribute.current !== undefined) && _t('Base → fitted')}>
        {item.attributes.length ? <dl className="list">
          {item.attributes.map((attribute) => <div className="fit-data-row" key={attribute.id}>
            <dt>{lname(attribute.name, language)}</dt>
            <dd className="num">
              {attribute.current === undefined ? fmt(attribute.base, 3) : <>
                <span className="fit-caption">{fmt(attribute.base, 3)} → </span>{fmt(attribute.current, 3)}
              </>} {attribute.unit}
            </dd>
          </div>)}
        </dl> : <EmptyMessage>{_t('No attributes available')}</EmptyMessage>}
      </FitSection>}
      {view === 'description' && <FitSection title={_t('Description')}>
        {item.description ? <p className="fit-inset item-description">{lname(item.description, language)}</p>
          : <EmptyMessage>{_t('No description available')}</EmptyMessage>}
      </FitSection>}
      {view === 'skills' && <FitSection title={_t('Skill requirements')}>
        {item.skills.length ? <ul className="list">
          {item.skills.map((skill) => <li key={skill.typeId} className="fit-data-row">
            <span>{lname(skill.name, language)}</span>
            <span className={`num ${skill.currentLevel < skill.requiredLevel ? 'warn' : ''}`}>
              {fmt(skill.currentLevel)}/{fmt(skill.requiredLevel)}
            </span>
          </li>)}
        </ul> : <EmptyMessage>{_t('No skill requirements')}</EmptyMessage>}
      </FitSection>}
    </>}
  </main>
}
