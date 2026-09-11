'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';
import { useT, LangToggle } from '../../lib/i18n';

/**
 * Profils proposés à l'inscription. La clé est mémorisée telle quelle dans
 * localStorage pour aiguiller l'onboarding (partie 2). Correspondance visée
 * avec la base (enum yps.role = admin|coach|parent|athlete) :
 *   parent / athlete / coach → join_club(p_code, p_role) ;
 *   fondateur                → create_club() , qui crée le club et rend admin ;
 *   dirigeant                → admin d'un club existant, sans RPC dédiée à ce jour.
 */
const SIGNUP_ROLES = ['parent', 'athlete', 'coach', 'dirigeant', 'fondateur'];

/** Clé de reprise du profil choisi, lue par l'étape suivante. */
const ROLE_STORAGE_KEY = 'yps_signup_role';

export default function LoginPage() {
  const router = useRouter();
  const { t, lang } = useT();
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState(null);
  const [consent, setConsent] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr(''); setMsg('');
    if (mode === 'signup') {
      // Garde-fous côté front : le profil aiguille la suite, et le consentement
      // est obligatoire pour un compte parent (données d'un mineur).
      if (!role) { setErr(t('signup.errRole')); return; }
      if (role === 'parent' && !consent) { setErr(t('signup.errConsent')); return; }
    }
    setBusy(true);
    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        rememberRole(role);
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

  /* Le stockage local peut lever (navigation privée) : l'inscription ne doit pas
     échouer pour autant, le profil sera simplement redemandé à l'onboarding. */
  function rememberRole(r) {
    try { window.localStorage.setItem(ROLE_STORAGE_KEY, r); } catch { /* sans effet */ }
  }

  function switchMode(next) {
    setMode(next); setErr(''); setMsg('');
  }

  return (
    <div className="wrap" style={{ paddingTop: mode === 'signup' ? 20 : 28 }}>
      {mode === 'signup' ? (
        /* En-tête d'inscription : marque à gauche, sélecteur de langue à droite. */
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div className="brand">
            <div className="logo">Y</div>
            <div className="q" style={{ fontWeight: 700, fontSize: 17 }}>
              You<span style={{ color: 'var(--brand)' }}>Play</span>Sport
            </div>
          </div>
          <LangToggle />
        </div>
      ) : (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
          <LangToggle />
        </div>
      )}

      {/* Bloc marque centré : pastille terracotta, nom, promesse produit. */}
      {mode === 'login' && (
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
      )}

      {mode === 'signup' && (
        <h1 className="q" style={{ fontSize: 24, letterSpacing: '-0.5px', margin: '0 0 16px' }}>
          {t('signup.title')}
        </h1>
      )}

      <form onSubmit={submit}>
        {mode === 'signup' && (
          <>
            <div className="label" style={{ marginBottom: 9 }}>{t('signup.joinAs')}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginBottom: 18 }}>
              {SIGNUP_ROLES.map((r) => {
                const on = role === r;
                return (
                  <button key={r} type="button" onClick={() => { setRole(r); setErr(''); }}
                    aria-pressed={on}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left',
                      background: on ? 'var(--peach)' : '#fff',
                      border: `1.5px solid ${on ? 'var(--brand)' : 'var(--border)'}`,
                      borderRadius: 16, padding: '13px 14px', cursor: 'pointer', fontFamily: 'inherit',
                      boxShadow: on ? '0 6px 16px rgba(192, 91, 68, .14)' : 'none' }}>
                    <div style={{ flex: 1 }}>
                      <div className="q" style={{ fontWeight: 700, fontSize: 15,
                        color: on ? 'var(--brand-dark)' : 'var(--ink)' }}>
                        {t(`signup.role.${r}.title`)}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.4, marginTop: 2 }}>
                        {t(`signup.role.${r}.desc`)}
                      </div>
                    </div>
                    <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 800, letterSpacing: '.4px',
                      textTransform: 'uppercase', borderRadius: 999, padding: '4px 9px',
                      background: on ? '#fff' : '#F1E9E1', color: on ? 'var(--brand-dark)' : '#8A7E72' }}>
                      {t(`signup.role.${r}.badge`)}
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}

        <div className="card" style={{ padding: 20 }}>
          {mode === 'signup' && (
            <div className="label" style={{ marginBottom: 12 }}>{t('signup.account')}</div>
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

          {/* Consentement RGPD : uniquement pour un compte parent, qui porte les
              données d'un mineur. Obligatoire pour valider le formulaire. */}
          {mode === 'signup' && role === 'parent' && (
            <label style={{ display: 'flex', gap: 9, alignItems: 'flex-start', fontSize: 12,
              color: '#7A5A18', background: '#FFF6E9', border: '1px solid #F6E4C4',
              borderRadius: 12, padding: 12, marginBottom: 16, lineHeight: 1.45 }}>
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)}
                style={{ marginTop: 2 }} />
              <span>{t('signup.consent')}</span>
            </label>
          )}

          <button className="btn" disabled={busy} type="submit">
            {busy ? '…' : mode === 'login' ? t('login.signIn') : t('signup.submit')}
          </button>
          {mode === 'login' && (
            <div style={{ textAlign: 'center', marginTop: 14 }}>
              <a href="#" style={{ fontSize: 13, fontWeight: 600, color: 'var(--brand)' }}
                onClick={(e) => { e.preventDefault(); router.push('/mot-de-passe-oublie'); }}>
                {t('login.forgot')}
              </a>
            </div>
          )}
        </div>
      </form>

      <p style={{ textAlign: 'center', fontSize: 14 }}>
        {mode === 'login' ? (
          <>{t('login.noAccount')}{' '}
            <a href="#" onClick={(e) => { e.preventDefault(); switchMode('signup'); }}>{t('login.createLink')}</a>
          </>
        ) : (
          <>{t('login.haveAccount')}{' '}
            <a href="#" onClick={(e) => { e.preventDefault(); switchMode('login'); }}>{t('login.signIn')}</a>
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
