'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';
import { useT, LangToggle } from '../../lib/i18n';

export default function LoginPage() {
  const router = useRouter();
  const { t, lang } = useT();
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr(''); setMsg(''); setBusy(true);
    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        const { data } = await supabase.auth.getSession();
        if (data.session) router.push('/');
        else setMsg(t('login.confirmEmail'));
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push('/');
      }
    } catch (e) {
      setErr(e.message || t('common.error'));
    } finally {
      setBusy(false);
    }
  }

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

      <h1 className="q" style={{ fontSize: 26, letterSpacing: '-0.5px', margin: '0 0 6px' }}>
        {mode === 'login' ? t('login.welcomeBack') : t('login.createAccount')}
      </h1>
      <p style={{ color: 'var(--muted)', marginTop: 0, marginBottom: 20 }}>
        {t('app.tagline')}
      </p>

      <form onSubmit={submit} className="card">
        {err && <div className="error">{err}</div>}
        {msg && <div className="pill" style={{ marginBottom: 12 }}>{msg}</div>}
        <div className="label" style={{ marginBottom: 6 }}>{t('login.email')}</div>
        <input className="input" type="email" required value={email}
          onChange={(e) => setEmail(e.target.value)} placeholder="vous@email.com" />
        <div className="label" style={{ marginBottom: 6 }}>{t('login.password')}</div>
        <input className="input" type="password" required minLength={6} value={password}
          onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
        <button className="btn" disabled={busy} type="submit">
          {busy ? '…' : mode === 'login' ? t('login.signIn') : t('login.doCreate')}
        </button>
        {mode === 'login' && (
          <div style={{ textAlign: 'center', marginTop: 10 }}>
            <a href="#" style={{ fontSize: 13 }} onClick={(e) => { e.preventDefault(); router.push('/mot-de-passe-oublie'); }}>
              {lang === 'en' ? 'Forgot password?' : 'Mot de passe oublié ?'}
            </a>
          </div>
        )}
      </form>

      <p style={{ textAlign: 'center', fontSize: 14 }}>
        {mode === 'login' ? (
          <>{t('login.noAccount')}{' '}
            <a href="#" onClick={(e) => { e.preventDefault(); setMode('signup'); setErr(''); }}>{t('login.createLink')}</a>
          </>
        ) : (
          <>{t('login.haveAccount')}{' '}
            <a href="#" onClick={(e) => { e.preventDefault(); setMode('login'); setErr(''); }}>{t('login.signIn')}</a>
          </>
        )}
      </p>
      <p style={{ textAlign: 'center', fontSize: 13, marginTop: 4 }}>
        <a href="#" onClick={(e) => { e.preventDefault(); router.push('/bienvenue'); }} style={{ color: 'var(--muted)' }}>
          {lang === 'en' ? 'Discover YouPlaySport' : 'Découvrir YouPlaySport'}
        </a>
      </p>
    </div>
  );
}
