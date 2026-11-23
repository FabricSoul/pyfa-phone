import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import type { ItemGroup, ItemRow } from '../engine/types'
import { _t } from '../i18n/t'
import { lname, useNameLanguage } from '../ui/format'
import { MetaGroupList } from '../ui/MetaGroupList'
import { parsePosition, useFitServices, useFitSession, withModules } from './fitSession'
import { EmptyMessage, PageHeading } from './shared'

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

  useEffect(() => {
    let current = true
    if (typeId !== undefined) {
      void engine.variationsOf(typeId).then((groups) => {
        if (current) setListing({ typeId, groups })
      }, () => { if (current) setError(true) })
    }
    return () => { current = false }
  }, [engine, typeId])

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
  return <main>
    <PageHeading back={path} title={_t('Replace with a variation')}
      subtitle={row?.kind === 'module' && <>{lname(row.name, language)} · ×{positions.length}</>} />
    {!module && <EmptyMessage>{_t('Module not found')}</EmptyMessage>}
    {error && <p role="alert" className="page-message">{_t('Could not load or replace variations')}</p>}
    {module && !groups && !error && <p role="status" className="page-message">{_t('Loading variations…')}</p>}
    {groups?.length === 0 && <EmptyMessage>{_t('No variations')}</EmptyMessage>}
    {groups && groups.length > 0 && <fieldset disabled={working || !result}><MetaGroupList key={typeId}
      groups={groups} currentTypeId={typeId} onPick={(item) => void pick(item)} /></fieldset>}
  </main>
}
