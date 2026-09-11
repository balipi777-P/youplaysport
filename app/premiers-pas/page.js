'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useT, LangToggle } from '../../lib/i18n';

const ROLES = ['parent', 'athlete', 'coach', 'admin'];
const STEPS = [1, 2, 3];

export default function PremiersPas() {
  const router = useRouter();
  const { t } = useT();

  useEffect(() => { document.title = `${t('steps.tab')} · YouPlaySport`; }, [t]);

  return (
    <div className="pub">
      <style>{`
        .pub { max-width: 1100px; margin: 0 auto; padding: 20px 16px 48px; }
        .pub-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 14px; }
      `}</style>

      {/* En-tête public : marque + langue. */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <a href="#" onClick={(e) => { e.preventDefault(); router.push('/bienvenue'); }}
          className="brand" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className="logo">Y</div>
          <div className="q" style={{ fontWeight: 700, fontSize: 18 }}>
            You<span style={{ color: 'var(--brand)' }}>Play</span>Sport
          </div>
        </a>
        <LangToggle />
      </div>

      <h1 className="q" style={{ fontSize: 28, letterSpacing: '-0.6px', margin: '0 0 6px' }}>{t('steps.title')}</h1>
      <p style={{ fontSize: 15, color: 'var(--muted)', margin: '0 0 24px' }}>{t('steps.sub')}</p>

      <div className="pub-grid">
        {ROLES.map((r) => (
          <div key={r} className="card" style={{ marginBottom: 0 }}>
            <span className="pill" style={{ marginBottom: 14 }}>{t(`steps.${r}.role`)}</span>
            {STEPS.map((n) => (
              <div key={n} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 12 }}>
                <div style={{ width: 22, height: 22, borderRadius: 999, background: 'var(--brand)', color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  fontSize: 11, fontWeight: 800 }}>{n}</div>
                <div style={{ fontSize: 13, color: '#5A554B', lineHeight: 1.5 }}>{t(`steps.${r}.${n}`)}</div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
