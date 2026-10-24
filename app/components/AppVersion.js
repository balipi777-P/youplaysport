'use client';

import { useT } from '../../lib/i18n';

/** Version de l'application (SHA du déploiement) : utile au support. */
export default function AppVersion() {
  const { t } = useT();
  return (
    <div style={{ textAlign: 'center', fontSize: 11.5, color: 'var(--muted)', margin: '14px 0' }}>
      {t('app.version', { v: process.env.NEXT_PUBLIC_APP_VERSION || 'dev' })}
    </div>
  );
}
