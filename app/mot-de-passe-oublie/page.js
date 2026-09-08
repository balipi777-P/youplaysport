'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';
import { useT, LangToggle } from '../../lib/i18n';

const C = {
  fr: {
    title: 'Mot de passe oublié',
    sub: 'Entrez votre e-mail : nous vous enverrons un lien pour choisir un nouveau mot de passe.',
    email: 'Email', send: 'Envoyer le lien', sending: 'Envoi…',
    sent: 'Si un compte existe pour cette adresse, un e-mail de réinitialisation vient d’être envoyé. Pensez à vérifier vos spams.',
    back: '← Se connecter',
  },
  en: {
    title: 'Forgot password',
    sub: 'Enter your email: we’ll send you a link to choose a new password.',
    email: 'Email', send: 'Send the link', sending: 'Sending…',
    sent: 'If an account exists for this address, a reset email has just been sent. Remember to check your spam folder.',
    back: '← Sign in',
  },
};

export default function MotDePasseOublie() {
  const router = useRouter();
  const { lang } = useT();
  const c = C[lang] || C.fr;
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e) {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const redirectTo = `${window.location.origin}/reinitialiser`;
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
      if (error) throw error;
      setSent(true);
    } catch (e) {
      setErr(e.message || 'Erreur');
    } finally { setBusy(false); }
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

      <h1 className="q" style={{ fontSize: 24, letterSpacing: '-0.5px', margin: '0 0 6px' }}>{c.title}</h1>
      <p style={{ color: 'var(--muted)', marginTop: 0, marginBottom: 20 }}>{c.sub}</p>

      {sent ? (
        <div className="card"><div className="pill" style={{ background: '#E6F4EA', color: '#1E7B34' }}>✓</div>
          <p style={{ fontSize: 14, lineHeight: 1.5, color: '#3D3A33' }}>{c.sent}</p>
        </div>
      ) : (
        <form onSubmit={submit} className="card">
          {err && <div className="error">{err}</div>}
          <div className="label" style={{ marginBottom: 6 }}>{c.email}</div>
          <input className="input" type="email" required value={email}
            onChange={(e) => setEmail(e.target.value)} placeholder="vous@email.com" />
          <button className="btn" disabled={busy} type="submit">{busy ? c.sending : c.send}</button>
        </form>
      )}

      <p style={{ textAlign: 'center', fontSize: 14 }}>
        <a href="#" onClick={(e) => { e.preventDefault(); router.push('/login'); }}>{c.back}</a>
      </p>
    </div>
  );
}
