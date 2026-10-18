'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';
import { useT } from '../../lib/i18n';
import { fetchMyName, saveMyName, takePendingName, NAME_EVENT } from '../../lib/userName';

/* Pages sans compte connecté (ou qui aiguillent elles-mêmes). */
const HIDDEN = ['/login', '/bienvenue', '/mot-de-passe-oublie', '/reinitialiser', '/onboarding',
  '/cgu', '/confidentialite', '/choisir-espace', '/suppression-compte'];

/**
 * Encart « Comment t'appelles-tu ? », affiché une fois quand le compte n'a pas de
 * full_name. Si un nom a été saisi à l'inscription mais pas encore enregistré
 * (email à confirmer), il est enregistré tel quel sans rien demander.
 */
export default function NamePrompt() {
  const { t } = useT();
  const pathname = usePathname();
  const [need, setNeed] = useState(false);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [later, setLater] = useState(false);

  useEffect(() => {
    let alive = true;
    async function check() {
      const { data: s } = await supabase.auth.getSession();
      if (!s.session) { if (alive) setNeed(false); return; }
      const r = await fetchMyName();
      if (!alive || !r.uid) return;
      if (r.name) { setNeed(false); return; }
      const pending = takePendingName(s.session.user?.email);
      if (pending) {
        try { await saveMyName(pending); if (alive) setNeed(false); return; } catch { /* on redemande */ }
      }
      if (alive) setNeed(true);
    }
    check().catch(() => {});
    const { data: sub } = supabase.auth.onAuthStateChange(() => { check().catch(() => {}); });
    window.addEventListener(NAME_EVENT, check);
    return () => { alive = false; sub?.subscription?.unsubscribe(); window.removeEventListener(NAME_EVENT, check); };
  }, [pathname]);

  if (!need || later || HIDDEN.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return null;

  async function submit(e) {
    e.preventDefault();
    if (!value.trim()) { setErr(t('name.errEmpty')); return; }
    setBusy(true); setErr('');
    try { await saveMyName(value); setNeed(false); }
    catch { setErr(t('name.errSave')); }
    finally { setBusy(false); }
  }

  return (
    <div style={{ background: 'var(--peach)', borderBottom: '1px solid #EBD3C9' }}>
      <form onSubmit={submit} style={{ maxWidth: 460, margin: '0 auto', padding: '12px 16px' }}>
        <div className="q" style={{ fontWeight: 800, fontSize: 15, color: '#5F2A1C' }}>{t('name.title')}</div>
        <div style={{ fontSize: 12.5, color: '#7A4030', lineHeight: 1.5, margin: '3px 0 9px' }}>{t('name.hint')}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="input" style={{ marginBottom: 0, flex: 1, minWidth: 0 }} value={value} maxLength={80}
            autoComplete="name" onChange={(e) => setValue(e.target.value)} placeholder={t('name.ph')}
            aria-label={t('name.title')} />
          <button type="submit" className="btn" style={{ width: 'auto', marginBottom: 0, padding: '0 18px' }} disabled={busy}>
            {busy ? '…' : t('common.save')}
          </button>
        </div>
        {err && <div style={{ fontSize: 12.5, color: '#C0392B', marginTop: 6 }}>{err}</div>}
        <button type="button" onClick={() => setLater(true)}
          style={{ border: 'none', background: 'transparent', color: '#7A4030', fontFamily: 'inherit',
            fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: '8px 0 0' }}>{t('name.later')}</button>
      </form>
    </div>
  );
}
