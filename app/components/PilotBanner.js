'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useT } from '../../lib/i18n';

/* Fermeture mémorisée pour la session (variable du module, rien dans localStorage). */
let compactDismissed = false;

/** Bandeau d'information « version pilote gratuite » (inscription et accueil). `compact` : une ligne, fermable. */
export default function PilotBanner({ style, compact = false }) {
  const router = useRouter();
  const { t } = useT();
  const [hidden, setHidden] = useState(compactDismissed);
  const go = (path) => (e) => { e.preventDefault(); router.push(path); };
  if (compact) {
    if (hidden) return null;
    return (
      <div role="note" style={{ background: 'var(--peach)', borderRadius: 14, padding: '0 4px 0 12px', fontSize: 12,
        color: '#3D3A33', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, ...style }}>
        <span aria-hidden="true" style={{ flex: '0 0 18px', width: 18, height: 18, borderRadius: 999, border: '1.5px solid #3D3A33',
          fontSize: 11, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>i</span>
        <a href="/confidentialite" onClick={go('/confidentialite')}
          style={{ flex: 1, minWidth: 0, color: 'inherit', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {t('pilot.title')}
        </a>
        <button type="button" aria-label={t('pilot.close')} onClick={() => { compactDismissed = true; setHidden(true); }}
          style={{ flex: '0 0 44px', width: 44, height: 44, border: 'none', background: 'transparent', cursor: 'pointer',
            fontSize: 20, lineHeight: 1, color: '#3D3A33', fontFamily: 'inherit' }}>×</button>
      </div>
    );
  }
  return (
    <div role="note" style={{ background: 'var(--peach)', borderRadius: 14, padding: '10px 13px', fontSize: 12.5,
      lineHeight: 1.55, color: '#3D3A33', marginBottom: 14, ...style }}>
      <strong>{t('pilot.title')}</strong> {t('pilot.body')}{' '}
      <a href="/confidentialite" onClick={go('/confidentialite')}>{t('pilot.privacy')}</a>
      {' · '}
      <a href="/cgu" onClick={go('/cgu')}>{t('pilot.terms')}</a>
    </div>
  );
}
