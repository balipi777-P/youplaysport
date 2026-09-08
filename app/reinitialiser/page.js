'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';
import { useT, LangToggle } from '../../lib/i18n';

const C = {
  fr: {
    title: 'Nouveau mot de passe',
    sub: 'Choisissez un nouveau mot de passe pour votre compte.',
    pwd: 'Nouveau mot de passe', pwd2: 'Confirmer le mot de passe',
    save: 'Enregistrer', saving: 'Enregistrement…',
    ok: 'Mot de passe mis à jour ✓ Vous pouvez maintenant vous connecter.',
    mismatch: 'Les deux mots de passe ne correspondent pas.',
    noSession: 'Ce lien de réinitialisation est invalide ou a expiré. Demandez-en un nouveau.',
    askNew: 'Demander un nouveau lien', signIn: 'Se connecter',
  },
  en: {
    title: 'New password',
    sub: 'Choose a new password for your account.',
    pwd: 'New password', pwd2: 'Confirm password',
    save: 'Save', saving: 'Saving…',
    ok: 'Password updated ✓ You can now sign in.',
    mismatch: 'The two passwords do not match.',
    noSession: 'This reset link is invalid or has expired. Request a new one.',
    askNew: 'Request a new link', signIn: 'Sign in',
  },
};

export default function Reinitialiser() {
  const router = useRouter();
  const { lang } = useT();
  const c = C[lang] || C.fr;
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
    if (pwd !== pwd2) { setErr(c.mismatch); return; }
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

      <h1 className="q" style={{ fontSize: 24, letterSpacing: '-0.5px', margin: '0 0 6px' }}>{c.title}</h1>
      <p style={{ color: 'var(--muted)', marginTop: 0, marginBottom: 20 }}>{c.sub}</p>

      {ok ? (
        <div className="card">
          <p style={{ fontSize: 14, lineHeight: 1.5, color: '#3D3A33', marginTop: 0 }}>{c.ok}</p>
          <button className="btn" onClick={() => router.push('/login')}>{c.signIn}</button>
        </div>
      ) : !hasSession ? (
        <div className="card">
          <div className="error">{c.noSession}</div>
          <button className="btn" onClick={() => router.push('/mot-de-passe-oublie')}>{c.askNew}</button>
        </div>
      ) : (
        <form onSubmit={submit} className="card">
          {err && <div className="error">{err}</div>}
          <div className="label" style={{ marginBottom: 6 }}>{c.pwd}</div>
          <input className="input" type="password" required minLength={6} value={pwd}
            onChange={(e) => setPwd(e.target.value)} placeholder="••••••••" />
          <div className="label" style={{ marginBottom: 6 }}>{c.pwd2}</div>
          <input className="input" type="password" required minLength={6} value={pwd2}
            onChange={(e) => setPwd2(e.target.value)} placeholder="••••••••" />
          <button className="btn" disabled={busy} type="submit">{busy ? c.saving : c.save}</button>
        </form>
      )}
    </div>
  );
}
