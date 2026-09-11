'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';
import { useT, LangToggle } from '../../lib/i18n';

/** Indicateur « 1 2 3 » partagé par les deux écrans du parcours. */
function Steps({ current }) {
  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
      {[1, 2, 3].map((n) => {
        const active = n === current;
        return (
          <div key={n} style={{
            width: 24, height: 24, borderRadius: 999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 800,
            background: active ? 'var(--brand)' : 'var(--peach)',
            color: active ? '#fff' : 'var(--brand-dark)',
          }}>{n}</div>
        );
      })}
    </div>
  );
}

export default function Reinitialiser() {
  const router = useRouter();
  const { t } = useT();
  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [pwd, setPwd] = useState('');
  const [pwd2, setPwd2] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState(false);

  useEffect(() => {
    (async () => {
      // Le lien de récupération ouvre une session temporaire (detectSessionInUrl).
      const { data } = await supabase.auth.getSession();
      setHasSession(!!data.session);
      setReady(true);
    })();
  }, []);

  async function submit(e) {
    e.preventDefault();
    setErr('');
    if (pwd !== pwd2) { setErr(t('pwd.mismatch')); return; }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pwd });
      if (error) throw error;
      setOk(true);
    } catch (e) {
      setErr(e.message || 'Erreur');
    } finally { setBusy(false); }
  }

  if (!ready) return <div className="wrap"><p style={{ color: 'var(--muted)' }}>…</p></div>;

  return (
    <div className="wrap">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div className="brand">
          <div className="logo">Y</div>
          <div className="q" style={{ fontWeight: 700, fontSize: 18 }}>
            You<span style={{ color: 'var(--brand)' }}>Play</span>Sport
          </div>
        </div>
        <LangToggle />
      </div>

      <Steps current={3} />
      <div className="label" style={{ marginBottom: 4 }}>{t('pwd.step', { n: 3 })}</div>
      <h1 className="q" style={{ fontSize: 24, letterSpacing: '-0.5px', margin: '0 0 6px' }}>{t('pwd.new.title')}</h1>
      {!ok && hasSession && (
        <p style={{ color: 'var(--muted)', marginTop: 0, marginBottom: 20, lineHeight: 1.5 }}>{t('pwd.new.sub')}</p>
      )}

      {ok ? (
        <div className="card" style={{ marginTop: 14 }}>
          <div className="pill" style={{ background: '#E6F4EA', color: '#1E7B34' }}>✓</div>
          <p style={{ fontSize: 14, lineHeight: 1.5, color: '#3D3A33' }}>{t('pwd.ok')}</p>
          <button className="btn" onClick={() => router.push('/login')}>{t('login.signIn')}</button>
        </div>
      ) : !hasSession ? (
        <div className="card" style={{ marginTop: 14 }}>
          <div className="error">{t('pwd.noSession')}</div>
          <button className="btn" onClick={() => router.push('/mot-de-passe-oublie')}>{t('pwd.askNew')}</button>
        </div>
      ) : (
        <form onSubmit={submit} className="card">
          {err && <div className="error">{err}</div>}
          <div className="label" style={{ marginBottom: 6 }}>{t('pwd.new')}</div>
          <input className="input" type="password" required minLength={6} value={pwd}
            onChange={(e) => setPwd(e.target.value)} placeholder="••••••••" />
          <div className="label" style={{ marginBottom: 6 }}>{t('pwd.confirm')}</div>
          <input className="input" type="password" required minLength={6} value={pwd2}
            onChange={(e) => setPwd2(e.target.value)} placeholder="••••••••"
            style={{ marginBottom: 16 }} />
          <button className="btn" disabled={busy} type="submit">{busy ? t('pwd.saving') : t('pwd.save')}</button>
        </form>
      )}
    </div>
  );
}
