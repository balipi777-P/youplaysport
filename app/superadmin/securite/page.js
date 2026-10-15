'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabaseClient';
import { useT } from '../../../lib/i18n';

const C = {
  bg: '#FAF3ED', card: '#FFFFFF', line: '#EFEBE2', text: '#1C1A17',
  muted: '#8A8577', accent: '#C05B44', green: '#1E7B34', red: '#C0392B',
};

/** Enrôlement TOTP du superadmin (MFA obligatoire, AAL2). */
export default function Securite() {
  const { t } = useT();
  const router = useRouter();
  const [step, setStep] = useState('loading'); // loading | intro | scan | done | already
  const [factorId, setFactorId] = useState(null);
  const [qr, setQr] = useState('');
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase.auth.mfa.listFactors();
        if (error) throw error;
        setStep((data.totp || []).length ? 'already' : 'intro');
      } catch (e) {
        console.error('[MFA] listFactors', e);
        setErr(t('mfa.error'));
        setStep('intro');
      }
    })();
  }, [t]);

  async function start() {
    setBusy(true); setErr('');
    try {
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
      if (error) throw error;
      setFactorId(data.id);
      setQr(data.totp.qr_code);
      setSecret(data.totp.secret || '');
      setStep('scan');
    } catch (e) {
      console.error('[MFA] enroll', e);
      setErr(t('mfa.error'));
    } finally { setBusy(false); }
  }

  async function verify(e) {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      const { data: ch, error: ce } = await supabase.auth.mfa.challenge({ factorId });
      if (ce) throw ce;
      const { error: ve } = await supabase.auth.mfa.verify({ factorId, challengeId: ch.id, code: code.trim() });
      if (ve) throw ve;
      setStep('done');
    } catch (e2) {
      console.error('[MFA] verify enrôlement', e2);
      setErr(t('mfa.invalidCode'));
    } finally { setBusy(false); }
  }

  const btn = { width: '100%', marginTop: 14, padding: 12, border: 'none', borderRadius: 10, background: C.accent, color: '#fff', fontWeight: 800, fontSize: 14, cursor: 'pointer' };
  const p = { color: C.muted, margin: '0 0 12px', fontSize: 13, lineHeight: 1.5 };

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 400, background: C.card, border: `1px solid ${C.line}`, borderRadius: 16, padding: 22 }}>
        <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 6 }}>{t('mfa.enroll.title')}</div>

        {step === 'loading' && <p style={p}>{t('mfa.checking')}</p>}

        {step === 'intro' && (
          <>
            <p style={p}>{t('mfa.enroll.required')}</p>
            <button type="button" style={btn} disabled={busy} onClick={start}>{t('mfa.enroll.start')}</button>
          </>
        )}

        {step === 'scan' && (
          <form onSubmit={verify}>
            <p style={p}>{t('mfa.enroll.scan')}</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="QR code TOTP" width={200} height={200} style={{ display: 'block', margin: '0 auto 12px' }} />
            {secret && (
              <p style={{ ...p, fontSize: 12, wordBreak: 'break-all' }}>{t('mfa.enroll.secret')} <b>{secret}</b></p>
            )}
            <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric" autoComplete="one-time-code" placeholder={t('mfa.code')}
              style={{ width: '100%', boxSizing: 'border-box', padding: 12, fontSize: 20, letterSpacing: 6, textAlign: 'center', border: `1px solid ${C.line}`, borderRadius: 10 }} />
            <button type="submit" style={{ ...btn, opacity: busy || code.length !== 6 ? 0.6 : 1 }} disabled={busy || code.length !== 6}>
              {busy ? t('mfa.verifying') : t('mfa.verify')}
            </button>
          </form>
        )}

        {step === 'done' && (
          <>
            <p style={{ ...p, color: C.green, fontWeight: 700 }}>{t('mfa.enroll.success')}</p>
            <button type="button" style={btn} onClick={() => router.replace('/superadmin')}>{t('mfa.enroll.toConsole')}</button>
          </>
        )}

        {step === 'already' && (
          <>
            <p style={p}>{t('mfa.enroll.already')}</p>
            <button type="button" style={btn} onClick={() => router.replace('/superadmin')}>{t('mfa.enroll.toConsole')}</button>
          </>
        )}

        {err && <p style={{ color: C.red, fontSize: 13, margin: '10px 0 0' }}>{err}</p>}
      </div>
    </div>
  );
}
