'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';
import { useT, LangToggle } from '../../lib/i18n';
import { fetchMySpaces, listSpaces, contextOptions, enterSpace, SPACE_HOME } from '../../lib/spaces';

const ICON = { admin: '🏛️', coach: '📋', parent: '👨‍👩‍👧', athlete: '⚡', superadmin: '🛡️' };

/** Aiguillage après connexion : un seul espace → direct, sinon écran de choix. */
export default function ChoisirEspace() {
  const router = useRouter();
  const { t } = useT();
  const [data, setData] = useState(null);
  const [state, setState] = useState('loading'); // loading | choose | error

  useEffect(() => {
    (async () => {
      const { data: s } = await supabase.auth.getSession();
      if (!s.session) { router.replace('/login'); return; }
      const d = await fetchMySpaces();
      if (!d) { setState('error'); return; }
      const mine = d.spaces || [];
      if (mine.length === 0 && !d.is_platform_admin) { router.replace('/onboarding'); return; }
      if (mine.length <= 1) {
        const only = mine[0] || 'superadmin';
        router.replace(only === 'superadmin' ? SPACE_HOME.superadmin : enterSpace(only, d));
        return;
      }
      setData(d);
      setState('choose');
    })();
  }, [router]);

  function pick(k) {
    if (k === 'superadmin') { router.push(SPACE_HOME.superadmin); return; }
    router.push(enterSpace(k, data));
  }

  const hint = (k) => {
    if (k === 'athlete') return data.athlete?.name || '';
    return contextOptions(k, data).map((o) => o.label).join(', ');
  };

  return (
    <div className="wrap">
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}><LangToggle /></div>
      {state === 'loading' && <p style={{ color: 'var(--muted)' }}>{t('common.loading')}</p>}
      {state === 'error' && (
        <div className="card">
          <p style={{ margin: 0 }}>{t('space.loadError')}</p>
          <button type="button" className="btn" style={{ marginTop: 12 }} onClick={() => router.replace('/')}>
            {t('common.back')}
          </button>
        </div>
      )}
      {state === 'choose' && (
        <>
          <h1 className="q" style={{ fontSize: 22, margin: '4px 0 14px' }}>{t('space.choose.title')}</h1>
          {listSpaces(data).filter((k) => k !== 'superadmin').map((k) => (
            <button key={k} type="button" className="card" onClick={() => pick(k)}
              style={{ width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', gap: 12, border: '1px solid var(--border)' }}>
              <span style={{ fontSize: 24 }}>{ICON[k]}</span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontWeight: 800, fontSize: 15 }}>{t(`space.${k}`)}</span>
                <span style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{hint(k)}</span>
              </span>
            </button>
          ))}
          {listSpaces(data).includes('superadmin') && (
            <a href="#" onClick={(e) => { e.preventDefault(); pick('superadmin'); }}
              style={{ display: 'inline-block', marginTop: 8, fontWeight: 700, fontSize: 13, color: 'var(--brand)' }}>
              {ICON.superadmin} {t('space.superadmin')} →
            </a>
          )}
        </>
      )}
    </div>
  );
}
