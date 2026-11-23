import { useState } from 'react'
import type { ExtraCollection, ExtraItemDetails } from '../engine/types'
import { iconUrl, renderUrl } from './format'
import { ItemIcon } from './ItemIcon'

// Local pyfa icons for a cargo container, drones, an implant and a booster.
const collectionIcons: Record<ExtraCollection, number> = {
  cargo: 16, drones: 1084, fighters: 1084, implants: 2053, boosters: 3211,
}

export function ExtraItemIcon({ collection, details }: { collection: ExtraCollection; details?: ExtraItemDetails }) {
  const [failed, setFailed] = useState(() => new Set<string>())
  const sources = [iconUrl(details?.iconId ?? null), renderUrl(details?.graphicId ?? null), iconUrl(collectionIcons[collection])]
  const src = sources.find((url) => url && !failed.has(url))
  return <span className="extra-icon" onErrorCapture={() => { if (src) setFailed((before) => new Set(before).add(src)) }}>
    <ItemIcon src={src} />
  </span>
}
