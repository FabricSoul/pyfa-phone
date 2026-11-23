import './ui.css'
import { useState } from 'react'

/** Item / ship image; falls back to the empty tile (--color-fill) when the file is missing. */
export function ItemIcon({ src, className = 'ic', size = 32 }: { src?: string; className?: string; size?: number }) {
  const [failedSrc, setFailedSrc] = useState<string>()
  if (!src || failedSrc === src) return <span className={className} style={{ width: size, height: size }} aria-hidden="true" />
  return <img className={className} src={src} alt="" width={size} height={size} onError={() => setFailedSrc(src)} />
}
