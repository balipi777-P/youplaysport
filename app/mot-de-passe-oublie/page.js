'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';
import { useT, LangToggle } from '../../lib/i18n';

/**
 * Durée de validité annoncée du lien de réinitialisation. Doit rester alignée
 * sur Supabase → Auth → Providers → Email → « Email OTP Expiration »
 * (valeur en secondes) : n'annoncer ici que ce qui est réellement configuré.
 */
const LINK_MINUTES = 30;

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

export default function MotDePasseOublie() {
  const router = useRouter();
  const { t } = useT();
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

  /* Une fois le lien parti, l'utilisateur est à l'étape 2 : il attend son email. */
  const step = sent ? 2 : 1;

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

      <Steps current={step} />
      <div className="label" style={{ marginBottom: 4 }}>{t('pwd.step', { n: step })}</div>
      <h1 className="q" style={{ fontSize: 24, letterSpacing: '-0.5px', margin: '0 0 6px' }}>
        {sent ? t('pwd.sent.title') : t('pwd.ask.title')}
      </h1>
      {!sent && (
        <p style={{ color: 'var(--muted)', marginTop: 0, marginBottom: 20, lineHeight: 1.5 }}>
          {t('pwd.ask.sub', { minutes: LINK_MINUTES })}
        </p>
      )}

      {sent ? (
        <div className="card" style={{ marginTop: 14 }}>
          <div className="pill" style={{ background: '#E6F4EA', color: '#1E7B34' }}>✓</div>
          <p style={{ fontSize: 14, lineHeight: 1.5, color: '#3D3A33' }}>{t('pwd.sent')}</p>
        </div>
      ) : (
        <form onSubmit={submit} className="card">
          {err && <div className="error">{err}</div>}
          <div className="label" style={{ marginBottom: 6 }}>{t('pwd.email')}</div>
          <input className="input" type="email" required value={email}
            onChange={(e) => setEmail(e.target.value)} placeholder="vous@email.com"
            style={{ marginBottom: 16 }} />
          <button className="btn" disabled={busy} type="submit">{busy ? t('pwd.sending') : t('pwd.send')}</button>
        </form>
      )}

      <button className="btn ghost" onClick={() => router.push('/login')}>{t('pwd.backToLogin')}</button>

      {/* Promesse « un email = un compte » : rassure avant de quitter l'app pour sa boîte mail. */}
      <p style={{ color: 'var(--muted)', fontSize: 12, lineHeight: 1.5, marginTop: 18, textAlign: 'center' }}>
        {t('pwd.oneAccount')}
      </p>
    </div>
  );
}
