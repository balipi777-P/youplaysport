'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useT, LangToggle } from '../../lib/i18n';
import { fetchMySpaces, listSpaces, validStoredSpace, enterSpace, clearSpaceStorage } from '../../lib/spaces';

const POLL_MS = 20000;
const ICON = { coach: '📋', parent: '👨‍👩‍👧', athlete: '🏅' };

/**
 * « En attente de rattachement » : le compte a rejoint un club avec son code mais le
 * dirigeant ne l'a pas encore rattaché (équipe / enfant / fiche). Redirige vers l'espace
 * dès que my_spaces() en renvoie un.
 */
export default function WaitingAttach({ role, clubName }) {
  const { t } = useT();
  const [busy, setBusy] = useState(false);
  const [still, setStill] = useState(false);

  const check = useCallback(async (manual) => {
    if (manual) { setBusy(true); setStill(false); }
    const d = await fetchMySpaces();
    const spaces = listSpaces(d);
    if (spaces.length > 0) {
      window.location.replace(enterSpace(validStoredSpace(d) || spaces[0], d));
      return;
    }
    if (manual) { setBusy(false); setStill(true); }
  }, []);

  useEffect(() => {
    const id = setInterval(() => check(false), POLL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') check(false); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVisible); };
  }, [check]);

  async function logout() {
    await supabase.auth.signOut();
    clearSpaceStorage();
    window.location.replace('/login');
  }

  const kind = ICON[role] ? role : 'coach';
  const club = clubName || t('wait.yourClub');
  return (
    <div className="wrap" style={{ textAlign: 'center', paddingTop: 40 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}><LangToggle /></div>
      <div style={{ fontSize: 44, marginBottom: 12 }} aria-hidden="true">{ICON[kind]}</div>
      <h1 className="q" style={{ fontSize: 22, margin: '0 0 10px' }}>{t('wait.title')}</h1>
      <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.6, margin: '0 0 22px' }}>
        {t(`wait.body.${kind}`, { club })}
      </p>
      {still && <div className="card" style={{ fontSize: 13, margin: '0 0 14px' }}>{t('wait.still')}</div>}
      <button type="button" className="btn" disabled={busy} onClick={() => check(true)}>
        {busy ? '…' : t('wait.refresh')}
      </button>
      <p style={{ marginTop: 16, fontSize: 13 }}>
        <a href="#" onClick={(e) => { e.preventDefault(); logout(); }}>{t('wait.logout')}</a>
      </p>
    </div>
  );
}
