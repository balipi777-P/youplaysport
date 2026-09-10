'use client';

import { useRouter } from 'next/navigation';
import { useT } from '../../lib/i18n';

export default function Profil() {
  const router = useRouter();
  const { t } = useT();

  return (
    <div className="wrap">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <a href="#" onClick={(e) => { e.preventDefault(); router.push('/'); }} style={{ fontWeight: 700 }}>←</a>
        <div className="q" style={{ fontWeight: 700, fontSize: 18 }}>{t('profile.title')}</div>
      </div>

      <div className="card">
        <span className="pill">{t('soon.badge')}</span>
        <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, margin: '12px 0 0' }}>
          {t('profile.soon')}
        </p>
      </div>

      <a href="#" onClick={(e) => { e.preventDefault(); router.push('/'); }} style={{ fontSize: 13, fontWeight: 700 }}>
        {t('common.backLabel')}
      </a>
    </div>
  );
}
