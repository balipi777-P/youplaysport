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
    <div className="wrap" style={{ paddingTop: 28 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
        <LangToggle />
      </div>

      {/* Bloc marque centré : pastille terracotta, nom, promesse produit. */}
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div className="logo" style={{ width: 64, height: 64, borderRadius: 22, margin: '0 auto 14px',
          fontSize: 30, boxShadow: '0 10px 24px rgba(192, 91, 68, .28)' }}>Y</div>
        <h1 className="q" style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.6px', margin: '0 0 6px' }}>
          You<span style={{ color: 'var(--brand)' }}>Play</span>Sport
        </h1>
        <p style={{ color: 'var(--muted)', fontSize: 14, lineHeight: 1.5, margin: '0 auto', maxWidth: 300 }}>
          {t('app.tagline')}
        </p>
      </div>

      <form onSubmit={submit} className="card" style={{ padding: 20 }}>
        {/* En connexion, le bloc marque tient lieu de titre ; en création de
            compte, on rappelle où l'on se trouve. */}
        {mode === 'signup' && (
          <div className="q" style={{ textAlign: 'center', fontWeight: 700, fontSize: 17, marginBottom: 16 }}>
            {t('login.createAccount')}
          </div>
        )}
        {err && <div className="error">{err}</div>}
        {msg && <div className="pill" style={{ marginBottom: 12 }}>{msg}</div>}
        <div className="label" style={{ marginBottom: 6 }}>{t('login.email')}</div>
        <input className="input" type="email" required value={email}
          onChange={(e) => setEmail(e.target.value)} placeholder="vous@email.com" />
        <div className="label" style={{ marginBottom: 6 }}>{t('login.password')}</div>
        <input className="input" type="password" required minLength={6} value={password}
          onChange={(e) => setPassword(e.target.value)} placeholder="••••••••"
          style={{ marginBottom: 16 }} />
        <button className="btn" disabled={busy} type="submit">
          {busy ? '…' : mode === 'login' ? t('login.signIn') : t('login.doCreate')}
        </button>
        {mode === 'login' && (
          <div style={{ textAlign: 'center', marginTop: 14 }}>
            <a href="#" style={{ fontSize: 13, fontWeight: 600, color: 'var(--brand)' }}
              onClick={(e) => { e.preventDefault(); router.push('/mot-de-passe-oublie'); }}>
              {t('login.forgot')}
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
