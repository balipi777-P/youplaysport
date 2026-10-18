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
  const [agree, setAgree] = useState(false);
  const [bye, setBye] = useState(false);

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
      a.href = url; a.download = 'mes-donnees-youplaysport.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMsg(t('mydata.exported'));
    } catch (e) {
      console.error('export_my_data', e);
      setErr(t('mydata.errExport'));
    } finally { setBusy(''); }
  }

  async function deleteAccount() {
    if (!agree) return;
    setBusy('delete'); setErr('');
    try {
      const { error } = await supabase.schema('yps').rpc('delete_my_account');
      if (error) throw error;
      try { await supabase.auth.signOut(); } catch { /* le compte n'existe plus : la session locale suffit à tomber */ }
      clearSpaceStorage();
      setBye(true);
    } catch (e) {
      console.error('delete_my_account', e);
      setErr(`${(e && e.message) || ''}`.includes('not_authorized') ? t('mydata.errAuth') : t('mydata.errDelete'));
    } finally { setBusy(''); }
  }

  if (bye) {
    return (
      <div className="wrap" style={{ textAlign: 'center', paddingTop: 72 }}>
        <div style={{ fontSize: 44, marginBottom: 14 }}>👋</div>
        <h1 className="q" style={{ fontSize: 24, margin: '0 0 10px' }}>{t('mydata.byeTitle')}</h1>
        <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.6, margin: '0 0 22px' }}>{t('mydata.byeBody')}</p>
        <button type="button" className="btn" onClick={() => router.replace('/bienvenue')}>{t('mydata.byeCta')}</button>
      </div>
    );
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
            <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13.5, lineHeight: 1.5,
              marginBottom: 14, cursor: 'pointer' }}>
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)}
                style={{ width: 20, height: 20, flex: '0 0 20px', marginTop: 1 }} />
              <span>{t('mydata.agree')}</span>
            </label>
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" className="btn ghost" style={{ flex: 1 }} disabled={busy !== ''}
                onClick={() => { setConfirming(false); setAgree(false); setErr(''); }}>{t('common.cancel')}</button>
              <button type="button" className="btn" disabled={!agree || busy !== ''} onClick={deleteAccount}
                style={{ flex: 1, background: DANGER, opacity: agree ? 1 : 0.5 }}>
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
