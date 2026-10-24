'use client';

import { useT } from '../lib/i18n';

export default function Error({ reset }) {
  const { t } = useT();
  return (
    <div className="wrap" style={{ textAlign: 'center', paddingTop: 72 }}>
      <div style={{ fontSize: 44, marginBottom: 14 }}>🙈</div>
      <h1 className="q" style={{ fontSize: 22, margin: '0 0 10px' }}>{t('err.title')}</h1>
      <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.6, margin: '0 0 22px' }}>{t('err.body')}</p>
      <button type="button" className="btn" onClick={() => reset()}>{t('err.retry')}</button>
    </div>
  );
}
