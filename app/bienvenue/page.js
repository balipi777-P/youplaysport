'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useT, LangToggle } from '../../lib/i18n';

/**
 * Chiffres annoncés dans le héros. Ils doivent rester vérifiables :
 *   SPORTS       = nombre de lignes de yps.sports (11 au 11/09/2026) ;
 *   LANGS        = langues réellement servies par lib/i18n.js (fr, en) ;
 *   TRIAL_DAYS   = durée d'essai posée par yps.create_club() (60 jours).
 * Ne pas les gonfler : la page publique est la première promesse faite au club.
 */
const SPORTS_COUNT = 11;
const LANGS_COUNT = 2;
const TRIAL_DAYS = 60;

const ROLES = ['parent', 'athlete', 'coach', 'club'];
const CHIPS = ['trial', 'nocard', 'fixed', 'eu'];

export default function Bienvenue() {
  const router = useRouter();
  const { t } = useT();

  useEffect(() => { document.title = `${t('land.tab')} · YouPlaySport`; }, [t]);

  return (
    <div className="pub">
      <style>{`
        .pub { max-width: 1100px; margin: 0 auto; padding: 20px 16px 48px; }
        .pub-hero { display: grid; grid-template-columns: 1fr; gap: 26px; align-items: center; }
        @media (min-width: 860px) { .pub-hero { grid-template-columns: 1.1fr 1fr; gap: 40px; } }
        .pub-roles { display: grid; grid-template-columns: repeat(auto-fit, minmax(225px, 1fr)); gap: 14px; }
      `}</style>

      {/* En-tête public : marque, langue, accès au compte. */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 30 }}>
        <div className="brand">
          <div className="logo">Y</div>
          <div className="q" style={{ fontWeight: 700, fontSize: 18 }}>
            You<span style={{ color: 'var(--brand)' }}>Play</span>Sport
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <LangToggle />
          <a href="#" onClick={(e) => { e.preventDefault(); router.push('/login'); }}
            style={{ fontSize: 13, fontWeight: 700 }}>{t('login.signIn')}</a>
        </div>
      </div>

      <div className="pub-hero">
        {/* Colonne de gauche : la promesse, puis les trois portes d'entrée. */}
        <div>
          <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '1px', textTransform: 'uppercase',
            color: 'var(--brand)', marginBottom: 12 }}>
            {t('land.eyebrow')}
          </div>
          <h1 className="q" style={{ fontSize: 34, lineHeight: 1.15, letterSpacing: '-0.8px', margin: '0 0 14px' }}>
            {t('land.h1')}
          </h1>
          <p style={{ fontSize: 15.5, color: '#5A554B', lineHeight: 1.6, margin: '0 0 22px' }}>
            {t('land.lead')}
          </p>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
            <button type="button" className="btn" style={{ width: 'auto', padding: '13px 20px', marginBottom: 0 }}
              onClick={() => router.push('/login')}>{t('land.cta.create')}</button>
            <button type="button" className="btn ghost" style={{ width: 'auto', padding: '13px 20px', marginBottom: 0 }}
              onClick={() => router.push('/login')}>{t('land.cta.join')}</button>
            <button type="button" className="btn ghost" style={{ width: 'auto', padding: '13px 20px', marginBottom: 0 }}
              onClick={() => router.push('/forfaits')}>{t('land.cta.plans')}</button>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {CHIPS.map((c) => (
              <span key={c} className="pill" style={{ fontSize: 12 }}>
                {c === 'trial' ? t('land.chip.trial', { n: TRIAL_DAYS }) : t(`land.chip.${c}`)}
              </span>
            ))}
          </div>
        </div>

        {/* Colonne de droite : emplacement de l'illustration, encore à produire. */}
        <div>
          <div aria-hidden="true" style={{
            borderRadius: 18, border: '1px solid var(--border)', minHeight: 260,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, textAlign: 'center',
            background: 'repeating-linear-gradient(45deg, #EFEBE4 0 10px, #E6E1D8 10px 20px)',
          }}>
            <span style={{ fontSize: 12.5, color: '#7A7466', fontWeight: 600, lineHeight: 1.5 }}>
              {t('land.illus')}
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', gap: 18, flexWrap: 'wrap', marginTop: 14,
            fontSize: 12, fontWeight: 800, letterSpacing: '.6px', textTransform: 'uppercase', color: 'var(--brand-dark)' }}>
            <span>{t('land.stat.sports', { n: SPORTS_COUNT })}</span>
            <span style={{ color: 'var(--muted)' }}>·</span>
            <span>{t('land.stat.langs', { n: LANGS_COUNT })}</span>
            <span style={{ color: 'var(--muted)' }}>·</span>
            <span>{t('land.stat.ranking')}</span>
          </div>
        </div>
      </div>

      {/* Ce que chacun trouve en ouvrant l'app. */}
      <div className="pub-roles" style={{ marginTop: 44 }}>
        {ROLES.map((r) => (
          <div key={r} className="card" style={{ marginBottom: 0 }}>
            <span className="pill" style={{ marginBottom: 12 }}>{t(`land.role.${r}.badge`)}</span>
            <div className="q" style={{ fontWeight: 800, fontSize: 16, lineHeight: 1.3, margin: '2px 0 6px' }}>
              {t(`land.role.${r}.t`)}
            </div>
            <div style={{ fontSize: 13, color: '#5A554B', lineHeight: 1.55 }}>{t(`land.role.${r}.d`)}</div>
          </div>
        ))}
      </div>

      {/* Pied de page : les pages publiques et les mentions légales. */}
      <div style={{ borderTop: '1px solid var(--border)', marginTop: 40, paddingTop: 18,
        display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center', fontSize: 13 }}>
        <a href="#" onClick={(e) => { e.preventDefault(); router.push('/premiers-pas'); }}>{t('land.footer.steps')}</a>
        <a href="#" onClick={(e) => { e.preventDefault(); router.push('/forfaits'); }}>{t('land.footer.plans')}</a>
        <a href="#" onClick={(e) => { e.preventDefault(); router.push('/confidentialite'); }}>{t('land.footer.privacy')}</a>
        <a href="#" onClick={(e) => { e.preventDefault(); router.push('/cgu'); }}>{t('land.footer.terms')}</a>
        <a href="#" onClick={(e) => { e.preventDefault(); router.push('/suppression-compte'); }}>{t('land.footer.delete')}</a>
      </div>
      <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 12, margin: '14px 0 0' }}>
        © {new Date().getFullYear()} YouPlaySport · {t('app.tagline')}
      </div>
    </div>
  );
}
