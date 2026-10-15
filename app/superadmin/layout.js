'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';
import { useT } from '../../lib/i18n';

const C = {
  bg: '#FAF3ED', card: '#FFFFFF', line: '#EFEBE2', text: '#1C1A17',
  muted: '#8A8577', accent: '#C05B44', red: '#C0392B',
};

const ENROLL_PATH = '/superadmin/securite';

/**
 * Verrou MFA (TOTP, AAL2) du cockpit superadmin.
 * - aal2                         → accès
 * - facteur TOTP vérifié + aal1  → écran de challenge
 * - aucun facteur (nextLevel aal1) → redirection vers l'enrôlement
 * Le contrôle serveur sa_is_admin est conservé.
 */
export default function SuperadminLayout({ children }) {
  const { t } = useT();
  const router = useRouter();
  const pathname = usePathname();
  const onEnroll = pathname === ENROLL_PATH;
  const [state, setState] = useState('loading'); // loading | denied | challenge | ready
  const [factorId, setFactorId] = useState(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const check = useCallback(async () => {
    try {
      const { data: s } = await supabase.auth.getSession();
      if (!s.session) { router.replace('/login'); return; }
      const { data: isAdmin } = await supabase.rpc('sa_is_admin');
      if (!isAdmin) { setState('denied'); return; }

      const { data: aal, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (error) throw error;

      if (aal.currentLevel === 'aal2') { setState('ready'); return; }
      if (aal.nextLevel === 'aal2') {
        const { data: fl, error: fe } = await supabase.auth.mfa.listFactors();
        if (fe) throw fe;
        const f = (fl.totp || [])[0];
        if (!f) throw new Error('aal2 attendu mais aucun facteur TOTP vérifié');
        setFactorId(f.id);
        setState('challenge');
        return;
      }
      // Aucun facteur : l'écran d'enrôlement reste accessible, le reste est bloqué.
      if (onEnroll) { setState('ready'); return; }
      router.replace(ENROLL_PATH);
    } catch (e) {
      console.error('[MFA] layout superadmin', e);
      setErr(t('mfa.error'));
      setState('denied');
    }
  }, [router, onEnroll, t]);

  useEffect(() => { check(); }, [check]);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      const { data: ch, error: ce } = await supabase.auth.mfa.challenge({ factorId });
      if (ce) throw ce;
      const { error: ve } = await supabase.auth.mfa.verify({ factorId, challengeId: ch.id, code: code.trim() });
      if (ve) throw ve;
      setCode('');
      setState('loading');
      await check();
    } catch (e2) {
      console.error('[MFA] challenge superadmin', e2);
      setErr(t('mfa.invalidCode'));
    } finally { setBusy(false); }
  }

  const box = { background: C.card, border: `1px solid ${C.line}`, borderRadius: 16, padding: 22 };
  const shell = (inner) => (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 380 }}>{inner}</div>
    </div>
  );

  if (state === 'loading') return shell(<p style={{ color: C.muted, textAlign: 'center' }}>{t('mfa.checking')}</p>);

  if (state === 'denied') return shell(
    <div style={box}>
      <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 6 }}>{t('mfa.denied')}</div>
      <p style={{ color: C.muted, margin: 0, fontSize: 13, lineHeight: 1.5 }}>{err || t('mfa.deniedDesc')}</p>
      <a href="#" onClick={(e) => { e.preventDefault(); router.push('/'); }}
        style={{ color: C.accent, fontWeight: 700, fontSize: 13, display: 'inline-block', marginTop: 12 }}>{t('mfa.back')}</a>
    </div>
  );

  if (state === 'challenge') return shell(
    <form onSubmit={submit} style={box}>
      <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 6 }}>{t('mfa.challenge.title')}</div>
      <p style={{ color: C.muted, margin: '0 0 14px', fontSize: 13, lineHeight: 1.5 }}>{t('mfa.challenge.desc')}</p>
      <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
        inputMode="numeric" autoComplete="one-time-code" autoFocus placeholder={t('mfa.code')}
        style={{ width: '100%', boxSizing: 'border-box', padding: 12, fontSize: 20, letterSpacing: 6, textAlign: 'center', border: `1px solid ${C.line}`, borderRadius: 10 }} />
      {err && <p style={{ color: C.red, fontSize: 13, margin: '10px 0 0' }}>{err}</p>}
      <button type="submit" disabled={busy || code.length !== 6}
        style={{ width: '100%', marginTop: 14, padding: 12, border: 'none', borderRadius: 10, background: C.accent, color: '#fff', fontWeight: 800, fontSize: 14, cursor: 'pointer', opacity: busy || code.length !== 6 ? 0.6 : 1 }}>
        {busy ? t('mfa.verifying') : t('mfa.verify')}
      </button>
    </form>
  );

  return children;
}
