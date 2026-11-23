import { SkeletonList } from '../ui/Skeleton'
import { Reveal, TabPanel } from '../ui/motion'
import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import type { ItemDetails, SkillNode } from '../engine/types'
import { _t } from '../i18n/t'
import { iconUrl, lname, fmt, fmtAttribute, useNameLanguage } from '../ui/format'
import { ItemIcon } from '../ui/ItemIcon'
import { OmegaMark } from '../ui/ModuleRow'
import { MetaTag } from '../ui/MetaGroupList'
import { Segmented } from '../ui/Segmented'
import { parsePosition, useFitServices } from './fitSession'
import { EmptyMessage, FitSection, PageHeading } from './shared'

type View = 'attributes' | 'traits' | 'description' | 'skills'

function SkillTree({ nodes, fitId, language }: { nodes: SkillNode[]; fitId: string; language: ReturnType<typeof useNameLanguage> }) {
  return <ul className="list skill-tree">
    {nodes.map((skill) => <li key={skill.typeId}>
      <Link className="fit-data-row" to={`/item/${skill.typeId}${fitId ? `?fit=${encodeURIComponent(fitId)}` : ''}`}>
        <span>{lname(skill.name, language)}</span>
        <span className={`num ${skill.currentLevel < skill.requiredLevel ? 'warn' : ''}`}>
          {fmt(skill.currentLevel)}/{fmt(skill.requiredLevel)}
        </span>
      </Link>
      {skill.requires.length > 0 && <div className="skill-children" style={{ paddingLeft: 16 }}><SkillTree nodes={skill.requires} fitId={fitId} language={language} /></div>}
    </li>)}
  </ul>
}

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
      subtitle={item && <>{item.group && lname(item.group, language)} {item.meta && <MetaTag meta={item.meta} />} {item.omega && <OmegaMark />}</>} />
    {error && <p className="page-message" role="alert">{_t('Could not load item information')}</p>}
    {item === undefined && !error && <SkeletonList rows={5} label={_t('Loading item…')} />}
    {item === null && <EmptyMessage>{_t('Item information unavailable')}</EmptyMessage>}
    {item && <Reveal>
      <Segmented value={view} onChange={setView} options={[
        { value: 'attributes', label: _t('Attributes') },
        ...item.traits?.length ? [{ value: 'traits' as const, label: _t('Traits') }] : [],
        { value: 'description', label: _t('Description') },
        { value: 'skills', label: _t('Requirements') },
      ]} />
      <TabPanel value={view} order={['attributes', 'traits', 'description', 'skills']}>
      {view === 'attributes' && <FitSection title={_t('Attributes')}
        info={item.attributes.some((attribute) => attribute.current !== undefined) && _t('Base → fitted')}>
        {item.attributes.length ? <dl className="list">
          {item.attributes.map((attribute) => <div className="fit-data-row" key={attribute.id}>
            <dt>{lname(attribute.name, language)}</dt>
            <dd className="num">
              {attribute.current === undefined ? fmtAttribute(attribute.base, attribute.unit) : <>
                <span className="fit-caption">{fmtAttribute(attribute.base, attribute.unit)} → </span>{fmtAttribute(attribute.current, attribute.unit)}
              </>} {attribute.unit}
            </dd>
          </div>)}
        </dl> : <EmptyMessage>{_t('No attributes available')}</EmptyMessage>}
      </FitSection>}
      {view === 'traits' && item.traits && <FitSection title={_t('Ship traits')}>
        {item.traits.map((trait, index) => <div key={index} role="group" aria-label={lname(trait.header, language)}>
          <h3 className="fit-filter-label">{lname(trait.header, language)}</h3>
          <ul className="list">
            {trait.bonuses.map((bonus, line) => <li key={line} className="fit-inset item-description">{lname(bonus, language)}</li>)}
          </ul>
        </div>)}
      </FitSection>}
      {view === 'description' && <FitSection title={_t('Description')}>
        {item.description ? <p className="fit-inset item-description">{lname(item.description, language)}</p>
          : <EmptyMessage>{_t('No description available')}</EmptyMessage>}
      </FitSection>}
      {view === 'skills' && <FitSection title={_t('Skill requirements')}>
        {(item.skillTree ?? item.skills.map((skill) => ({ ...skill, requires: [] }))).length
          ? <SkillTree nodes={item.skillTree ?? item.skills.map((skill) => ({ ...skill, requires: [] }))} fitId={fitId} language={language} />
          : <EmptyMessage>{_t('No skill requirements')}</EmptyMessage>}
      </FitSection>}
      </TabPanel>
    </Reveal>}
  </main>
}
