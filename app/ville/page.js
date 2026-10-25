'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';
import { useT } from '../../lib/i18n';

/* Tableau de bord « mairie » : uniquement des chiffres agrégés, aucune donnée nominative. */
export default function Ville() {
  const router = useRouter();
  const { t } = useT();
  const [stats, setStats] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    (async () => {
      const { data: s } = await supabase.auth.getSession();
      if (!s.session) { router.replace('/login'); return; }
      const { data, error } = await supabase.schema('yps').rpc('city_overview');
      if (error) { setErr(t('city.denied')); return; }
      setStats(data);
    })();
  }, [router, t]);

  const items = stats ? [
    ['city.clubs', stats.clubs], ['city.licensees', stats.licensees],
    ['city.events', stats.events], ['city.sessions', stats.sessions],
  ] : [];

  return (
    <div className="wrap" style={{ paddingBottom: 40 }}>
      <h1 className="q" style={{ fontSize: 22, margin: '18px 0 4px' }}>{t('city.title')}</h1>
      <p style={{ color: 'var(--muted)', fontSize: 13, margin: '0 0 14px' }}>{t('city.sub')}</p>
      {err && <div className="card" style={{ color: '#C0392B' }}>{err}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {items.map(([k, v]) => (
          <div key={k} className="card" style={{ textAlign: 'center' }}>
            <div className="q" style={{ fontSize: 30, fontWeight: 800, color: 'var(--brand-dark)' }}>{v ?? 0}</div>
            <div style={{ fontSize: 12.5, color: 'var(--muted)', fontWeight: 700 }}>{t(k)}</div>
          </div>
        ))}
      </div>
      <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 14 }}>{t('city.privacy')}</p>
      <button type="button" className="btn" style={{ marginTop: 10 }}
        onClick={async () => { await supabase.auth.signOut(); router.replace('/login'); }}>{t('city.logout')}</button>
    </div>
  );
}
