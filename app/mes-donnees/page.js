'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';
import { useT } from '../../lib/i18n';
import { clearSpaceStorage } from '../../lib/spaces';

const DANGER = '#C0392B';

export default function MesDonnees() {
  const router = useRouter();
  const { t } = useT();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [word, setWord] = useState('');

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) { router.replace('/login'); return; }
      setReady(true);
    })();
  }, [router]);

  async function exportData() {
    setBusy('export'); setErr(''); setMsg('');
    try {
      const { data, error } = await supabase.schema('yps').rpc('export_my_data');
      if (error) throw error;
      const blob = new Blob([JSON.stringify(data ?? {}, null, 2)], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `youplaysport-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMsg(t('mydata.exported'));
    } catch (e) {
      console.error('export_my_data', e);
      setErr(t('mydata.errExport'));
    } finally { setBusy(''); }
  }

  const typed = word.trim().toUpperCase() === t('mydata.typeWord');

  async function deleteAccount() {
    if (!typed) return;
    setBusy('delete'); setErr('');
    try {
      const { error } = await supabase.schema('yps').rpc('delete_my_account');
      if (error) throw error;
      try { await supabase.auth.signOut(); } catch { /* le compte n'existe plus : la session locale suffit à tomber */ }
      clearSpaceStorage();
      try { window.localStorage.removeItem('yps_pending_name'); } catch { /* sans stockage, rien à vider */ }
      router.replace('/bienvenue?deleted=1');
    } catch (e) {
      const m = `${(e && e.message) || ''}`;
      console.error('delete_my_account', m.split(':')[0]);
      if (m.includes('sole_admin_of_club')) {
        setErr(t('mydata.errSoleAdmin', { clubs: m.split('sole_admin_of_club:')[1]?.trim() || '' }));
      } else if (m.includes('platform_admin_cannot_self_delete')) setErr(t('mydata.errPlatform'));
      else if (m.includes('not authenticated') || m.includes('not_authorized')) setErr(t('mydata.errNotAuth'));
      else setErr(t('mydata.errDelete'));
    } finally { setBusy(''); }
  }

  if (!ready) return <div className="wrap"><p style={{ color: 'var(--muted)' }}>{t('common.loading')}</p></div>;

  return (
    <div className="wrap">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <a href="#" onClick={(e) => { e.preventDefault(); router.back(); }} style={{ fontWeight: 700 }} aria-label={t('common.back')}>←</a>
        <div className="q" style={{ fontWeight: 700, fontSize: 18 }}>{t('mydata.title')}</div>
      </div>

      <div className="card">
        <div className="q" style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>{t('mydata.exportT')}</div>
        <p style={{ fontSize: 13, color: '#5A554B', lineHeight: 1.55, margin: '0 0 14px' }}>{t('mydata.exportD')}</p>
        <button type="button" className="btn" disabled={busy !== ''} onClick={exportData}>
          {busy === 'export' ? '…' : t('mydata.exportCta')}
        </button>
        {msg && <div className="pill" style={{ marginTop: 12 }}>{msg}</div>}
      </div>

      <div className="card" style={{ border: `1.5px solid ${DANGER}` }}>
        <div className="q" style={{ fontWeight: 700, fontSize: 15, marginBottom: 6, color: DANGER }}>{t('mydata.dangerT')}</div>
        <p style={{ fontSize: 13, color: '#5A554B', lineHeight: 1.55, margin: '0 0 14px' }}>{t('mydata.dangerD')}</p>
        {!confirming ? (
          <button type="button" className="btn" onClick={() => { setConfirming(true); setErr(''); }}
            style={{ background: 'transparent', color: DANGER, border: `1.5px solid ${DANGER}` }}>
            {t('mydata.deleteCta')}
          </button>
        ) : (
          <div role="alertdialog" aria-label={t('mydata.confirmT')}>
            <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 10 }}>{t('mydata.confirmT')}</div>
            <label style={{ display: 'block', fontSize: 13.5, lineHeight: 1.5, marginBottom: 14 }}>
              <span style={{ display: 'block', marginBottom: 6 }}>{t('mydata.typeLabel')}</span>
              <input value={word} onChange={(e) => setWord(e.target.value)} autoCapitalize="characters"
                autoComplete="off" autoCorrect="off" spellCheck={false} aria-label={t('mydata.typeLabel')} />
            </label>
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" className="btn ghost" style={{ flex: 1 }} disabled={busy !== ''}
                onClick={() => { setConfirming(false); setWord(''); setErr(''); }}>{t('common.cancel')}</button>
              <button type="button" className="btn" disabled={!typed || busy !== ''} onClick={deleteAccount}
                style={{ flex: 1, background: DANGER, opacity: typed ? 1 : 0.5 }}>
                {busy === 'delete' ? '…' : t('mydata.deleteFinal')}
              </button>
            </div>
          </div>
        )}
        {err && <div className="error" style={{ marginTop: 12 }}>{err}</div>}
      </div>
    </div>
  );
}
