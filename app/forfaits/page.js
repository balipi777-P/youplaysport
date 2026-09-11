'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useT, LangToggle } from '../../lib/i18n';

/**
 * Forfaits proposés. Les prix et les plafonds reprennent la table yps.plans
 * (petit 29/60, club 49/150, club_plus 89/400, grand 149/2000) : c'est elle qui
 * fait foi, la page ne doit rien annoncer d'autre. `beyond` marque le forfait
 * sans plafond affiché, positionné au-delà du palier précédent.
 */
const PLANS = [
  { key: 'petit', name: 'Petit club', price: 29, limit: 60 },
  { key: 'club', name: 'Club', price: 49, limit: 150 },
  { key: 'club_plus', name: 'Club +', price: 89, limit: 400 },
  { key: 'grand', name: 'Grand Club', price: 149, limit: 400, beyond: true },
];

/** Durée d'essai réellement appliquée par yps.create_club() (60 jours). */
const TRIAL_DAYS = 60;

const FEATURES = ['f1', 'f2', 'f3', 'f4', 'f5'];

export default function Forfaits() {
  const router = useRouter();
  const { t } = useT();

  useEffect(() => { document.title = `${t('plans.tab')} · YouPlaySport`; }, [t]);

  return (
    <div className="pub">
      <style>{`
        .pub { max-width: 1100px; margin: 0 auto; padding: 20px 16px 48px; }
        .pub-plans { display: grid; grid-template-columns: repeat(auto-fit, minmax(215px, 1fr)); gap: 14px; }
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

      <h1 className="q" style={{ fontSize: 28, lineHeight: 1.2, letterSpacing: '-0.6px', margin: '0 0 8px' }}>
        {t('plans.title')}
      </h1>
      <p style={{ fontSize: 15, color: 'var(--muted)', lineHeight: 1.55, margin: '0 0 26px' }}>
        {t('plans.sub', { n: TRIAL_DAYS })}
      </p>

      <div className="pub-plans">
        {PLANS.map((p) => (
          <div key={p.key} className="card" style={{ marginBottom: 0, display: 'flex', flexDirection: 'column' }}>
            <div className="q" style={{ fontWeight: 800, fontSize: 17 }}>{p.name}</div>
            <div style={{ margin: '10px 0 2px' }}>
              <span className="q" style={{ fontSize: 38, fontWeight: 800, color: 'var(--brand-dark)', letterSpacing: '-1px' }}>
                {p.price} €
              </span>
            </div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.8px', textTransform: 'uppercase', color: 'var(--muted)' }}>
              {t('plans.perMonth')}
            </div>
            <div style={{ fontSize: 13, color: '#5A554B', lineHeight: 1.5, margin: '12px 0 16px', flex: 1 }}>
              {t(p.beyond ? 'plans.beyond' : 'plans.upTo', { n: p.limit })} · {t(`plans.${p.key}.sports`)}
            </div>
            <button type="button" className="btn ghost" style={{ marginBottom: 0 }}
              onClick={() => router.push('/login')}>
              {t('plans.cta')}
            </button>
          </div>
        ))}
      </div>

      {/* Ce qui est inclus quel que soit le forfait. */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 22 }}>
        {FEATURES.map((f) => (
          <span key={f} style={{
            background: '#EDF4E8', color: '#3E5A3E', border: '1px solid #DCE8D4',
            borderRadius: 999, padding: '7px 13px', fontSize: 12.5, fontWeight: 700,
          }}>
            ✓ {t(`plans.${f}`)}
          </span>
        ))}
      </div>
    </div>
  );
}
