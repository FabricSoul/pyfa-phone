import '../ui.css'
import { _t } from '../../i18n/t'
import type { CharacterId } from '../../settings/settings'

const OPTIONS: CharacterId[] = ['all5', 'all0']

/** Static msgids so `pnpm i18n` can extract them. */
const labelFor = (id: CharacterId): string => (id === 'all5' ? _t('All V') : _t('All 0'))
const hintFor = (id: CharacterId): string => (id === 'all5'
  ? _t('All skills level 5 · Security status 5.0')
  : _t('All skills level 0 · only items without skill requirements'))

/** Bottom-sheet body: the two built-in pyfa characters. */
export function CharacterPicker({ value, onPick }: { value: CharacterId; onPick: (id: CharacterId) => void }) {
  return (
    <div>
      <div className="row" style={{ paddingTop: 0 }}>
        <div className="mn">
          <span>{_t('Character')}</span>
          <small>{_t('Decides skill levels · two built-in characters in the first version')}</small>
        </div>
      </div>
      <div className="list">
        {OPTIONS.map((id) => {
          const current = id === value
          return (
            <button key={id} type="button" className={`ar${current ? ' on' : ''}`} aria-pressed={current}
              onClick={() => onPick(id)}>
              <div className="mn">
                <span>{labelFor(id)}</span>
                <small>{hintFor(id)}</small>
              </div>
              {current && (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"
                  strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-accent)', flex: 'none' }} aria-hidden="true">
                  <path d="m5 13 4 4L19 7" />
                </svg>
              )}
            </button>
          )
        })}
      </div>
      <div className="hint">{_t('Custom characters and EVE login come later.')}</div>
    </div>
  )
}
