import { _t, useUiLanguage } from '../i18n/t'
import { PageHeading } from './shared'

export default function About() {
  useUiLanguage()
  return (
    <main>
      <PageHeading back="/" historyBack title={_t('About')} />
      <div className="about-body">

      <p style={{ font: 'var(--type-name)', color: 'var(--color-text-secondary)' }}>
        {_t('pyfa-phone is an unofficial EVE Online fitting tool.')}
      </p>

      <section
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-2)',
          font: 'var(--type-name)',
        }}
      >
        <p>
          {_t('This application is not affiliated with, endorsed by, or associated with CCP hf.')}
        </p>
        <p>
          {_t('EVE Online, the EVE logo, and all associated logos and designs are the intellectual property of CCP hf.')}
        </p>
        <p>
          {_t('Based on pyfa under the GPLv3 license. Non-commercial fan project.')}
        </p>
      </section>

      <section
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-2)',
          font: 'var(--type-name)',
        }}
      >
        <div>
          <a
            href="https://github.com/FabricSoul/pyfa-phone"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--color-accent)' }}
          >
            {_t('pyfa-phone source on GitHub')}
          </a>
        </div>
        <div>
          <a
            href="https://github.com/pyfa-org/Pyfa"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--color-accent)' }}
          >
            {_t('pyfa original source on GitHub')}
          </a>
        </div>
      </section>
      </div>
    </main>
  )
}
