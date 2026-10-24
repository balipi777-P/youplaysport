'use client';

import { useRouter } from 'next/navigation';
import { useT } from '../../lib/i18n';

/** Bandeau d'information « version pilote gratuite » (inscription et accueil). */
export default function PilotBanner({ style }) {
  const router = useRouter();
  const { t } = useT();
  const go = (path) => (e) => { e.preventDefault(); router.push(path); };
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
