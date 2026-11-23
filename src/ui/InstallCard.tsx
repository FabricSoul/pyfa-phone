import { useEffect, useState } from 'react'
import { getInstallPrompt, onInstallPrompt, isStandalone, isIOS, isMobile, type BIP } from '../app/install'
import { _t } from '../i18n/t'
import { Icon } from './icons'

const DISMISSED = 'pyfa.installDismissed'

function isDismissed(): boolean {
  try {
    return Boolean(localStorage.getItem(DISMISSED))
  } catch {
    return false
  }
}

function setDismissed(): void {
  try {
    localStorage.setItem(DISMISSED, '1')
  } catch {
    // 隐私模式或本地存储受限时安全降级
  }
}

export function InstallCard() {
  const [bip, setBip] = useState<BIP | null>(getInstallPrompt)
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (isStandalone()) return
    if (isDismissed()) return
    if (!isMobile()) return
    setShow(true)
    return onInstallPrompt(setBip)
  }, [])

  if (!show) return null

  const dismiss = () => {
    setDismissed()
    setShow(false)
  }

  const install = async () => {
    if (!bip) return
    try {
      await bip.prompt()
      const { outcome } = await bip.userChoice
      if (outcome === 'accepted') {
        setShow(false)
      } else {
        dismiss()
      }
    } catch {
      dismiss()
    }
    setBip(null)
  }

  const ios = isIOS()

  return (
    <aside className="install-card" aria-label={_t('Add to Home Screen')}>
      <div className="install-card-content">
        <div className="install-card-header">
          <span className="install-card-title">{_t('Add to Home Screen')}</span>
          <button type="button" className="install-card-close" onClick={dismiss} aria-label={_t('Dismiss')}>
            <Icon name="x" size={16} />
          </button>
        </div>
        <p className="install-card-desc">
          {_t('Available offline, instant loading, and runs like a native app.')}
        </p>
        {bip ? (
          <div className="install-card-actions">
            <button type="button" className="fit-button primary" onClick={install}>
              {_t('Install now')}
            </button>
          </div>
        ) : (
          <ol className="install-card-steps">
            <li>
              <span className="install-card-step-num">1</span>
              {ios ? <ShareIcon /> : <MenuIcon />}
              <span>{ios ? _t('Tap the share button') : _t('Tap the browser menu')}</span>
            </li>
            <li>
              <span className="install-card-step-num">2</span>
              <PlusSquareIcon />
              <span>{_t('Select "Add to Home Screen"')}</span>
            </li>
          </ol>
        )}
      </div>
    </aside>
  )
}

function ShareIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="install-card-icon">
      <path d="M12 16V3" />
      <path d="m8 7 4-4 4 4" />
      <path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" />
    </svg>
  )
}

function MenuIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="install-card-icon">
      <circle cx="12" cy="5" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="12" cy="19" r="2" />
    </svg>
  )
}

function PlusSquareIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="install-card-icon">
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  )
}
