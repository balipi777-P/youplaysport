'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';
import { useT } from '../../lib/i18n';
import { clearSpaceStorage } from '../../lib/spaces';
import { loadMyChildren } from '../../lib/children';
import BottomNav, { BOTTOM_NAV_HEIGHT } from '../components/BottomNav';
import Fold from '../components/Fold';
import { loadContactClubs } from '../../lib/clubContact';
import { useClubUnread } from '../../lib/clubUnread';

const DANGER = '#C0392B';

export default function MesDonnees() {
  const router = useRouter();
  const { t, lang } = useT();
  const [me, setMe] = useState(null);     // { name, email, roles[], clubs[], kids[], teams[] }
  const [ready, setReady] = useState(false);
  const [canWrite, setCanWrite] = useState(false);
  const unread = useClubUnread();
  useEffect(() => { loadContactClubs().then((l) => setCanWrite(l.length > 0)).catch(() => setCanWrite(false)); }, []);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [word, setWord] = useState('');

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) { router.replace('/login'); return; }
      const uid = data.session.user.id;
      const [{ data: au }, { data: mem }, { data: ct }, kids] = await Promise.all([
        supabase.from('app_users').select('full_name').eq('id', uid).maybeSingle(),
        supabase.from('memberships').select('role, club_id, clubs(name)'),
        supabase.from('coach_teams').select('teams(id, name, category, clubs(name))').eq('coach_user_id', uid),
        loadMyChildren().catch(() => []),
      ]);
      const roles = [...new Set((mem || []).map((m) => m.role))];
      const clubs = [...new Set((mem || []).map((m) => m.clubs?.name).filter(Boolean))];
      const teams = (ct || []).map((r) => r.teams).filter(Boolean);
      const own = kids.filter((k) => k.user_id === uid);
      setMe({
        name: au?.full_name || '', email: data.session.user.email || '',
        roles: roles.length ? roles : (kids.length ? ['parent'] : []), clubs, teams,
        kids: kids.filter((k) => k.user_id !== uid), isAthlete: own.length > 0,
      });
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
        const names = m.split('sole_admin_of_club:')[1]?.trim() || '';
        setErr(t(names.includes(',') ? 'mydata.errSoleAdminMany' : 'mydata.errSoleAdmin', { clubs: names }));
      } else if (m.includes('platform_admin_cannot_self_delete')) setErr(t('mydata.errPlatform'));
      else if (m.includes('not authenticated') || m.includes('not_authorized')) setErr(t('mydata.errNotAuth'));
      else setErr(t('mydata.errDelete'));
    } finally { setBusy(''); }
  }

  if (!ready) return <div className="wrap"><p style={{ color: 'var(--muted)' }}>{t('common.loading')}</p></div>;

  const roles = me?.roles || [];
  const roleLabel = [...roles, ...(me?.isAthlete && !roles.includes('athlete') ? ['athlete'] : [])]
    .map((r) => t(`role.${r}`)).join(', ');
  const navRole = roles.includes('admin') ? 'admin' : roles.includes('coach') ? 'coach'
    : me?.isAthlete ? 'athlete' : 'parent';
  const dangerKey = roles.includes('admin') ? 'mydata.dangerD' : 'mydata.dangerMember';
  const erased = [
    t('mydata.erase.account'),
    ...(roles.includes('parent') ? [t('mydata.erase.kids')] : []),
    ...(roles.includes('coach') ? [t('mydata.erase.coach')] : []),
    ...(roles.includes('admin') ? [t('mydata.erase.admin')] : []),
  ];

  /* Deuxième temps : l'écran qui dit ce qui sera effacé, puis le mot à taper. */
  if (confirming) return (
    <div className="wrap">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <a href="#" aria-label={t('common.back')} style={{ fontWeight: 700 }}
          onClick={(e) => { e.preventDefault(); setConfirming(false); setWord(''); setErr(''); }}>←</a>
        <div className="q" style={{ fontWeight: 700, fontSize: 18, color: DANGER }}>{t('mydata.confirmT')}</div>
      </div>
      <div className="card" style={{ border: `1.5px solid ${DANGER}` }} role="alertdialog" aria-label={t('mydata.confirmT')}>
        <p style={{ fontSize: 13.5, lineHeight: 1.55, margin: '0 0 8px', fontWeight: 700 }}>{t('mydata.willErase')}</p>
        <ul style={{ fontSize: 13.5, lineHeight: 1.6, margin: '0 0 12px', paddingLeft: 20 }}>
          {erased.map((x) => <li key={x}>{x}</li>)}
        </ul>
        <p style={{ fontSize: 13, color: '#5A554B', lineHeight: 1.55, margin: '0 0 14px' }}>{t(dangerKey)}</p>
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
        {err && <div className="error" role="alert" style={{ marginTop: 12 }}>{err}</div>}
      </div>
    </div>
  );

  return (
    <div className="wrap" style={{ paddingBottom: BOTTOM_NAV_HEIGHT + 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <a href="#" onClick={(e) => { e.preventDefault(); router.back(); }} style={{ fontWeight: 700 }} aria-label={t('common.back')}>←</a>
        <div className="q" style={{ fontWeight: 700, fontSize: 18 }}>{t('mydata.title')}</div>
      </div>

      <Fold title={t('mydata.identity')} defaultOpen>
        {[[t('mydata.name'), me?.name || '—'], [t('mydata.email'), me?.email || '—'],
          [t('mydata.role'), roleLabel || '—'], [t('mydata.club'), (me?.clubs || []).join(', ') || '—']].map(([k, v]) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '6px 0', fontSize: 14 }}>
            <span style={{ color: 'var(--muted)' }}>{k}</span>
            <span style={{ fontWeight: 700, textAlign: 'right', overflowWrap: 'anywhere' }}>{v}</span>
          </div>
        ))}
      </Fold>

      {me?.kids.length > 0 && (
        <Fold title={t('mydata.kids')} defaultOpen>
          {me.kids.map((k) => (
            <div key={k.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
              <div style={{ flex: 1, minWidth: 0, fontSize: 14 }}>
                <b>{[k.first_name, k.last_name].filter(Boolean).join(' ')}</b>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                  {[k.teams?.clubs?.name, k.teams?.name].filter(Boolean).join(' · ')}
                </div>
              </div>
            </div>
          ))}
        </Fold>
      )}

      {me?.teams.length > 0 && (
        <div className="card">
          <div className="q" style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>{t('mydata.teams')}</div>
          {me.teams.map((tm) => (
            <div key={tm.id} style={{ padding: '4px 0', fontSize: 14 }}>
              <b>{tm.name}</b>
              <span style={{ color: 'var(--muted)', fontSize: 12 }}> {[tm.category, tm.clubs?.name].filter(Boolean).join(' · ')}</span>
            </div>
          ))}
        </div>
      )}

      {canWrite && (
        <button type="button" className="card" onClick={() => router.push('/messages')}
          style={{ width: '100%', minHeight: 44, display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
            font: 'inherit', color: 'inherit', cursor: 'pointer' }}>
          <span className="q" style={{ flex: 1, fontWeight: 700, fontSize: 15 }}>{t('msgs.link')}</span>
          {unread.count > 0 && <span style={{ minWidth: 18, height: 18, borderRadius: 999, background: 'var(--brand)', color: '#fff',
            fontSize: 11, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px' }}>{unread.count > 9 ? '9+' : unread.count}</span>}
          <span aria-hidden="true" style={{ color: 'var(--muted)' }}>›</span>
        </button>
      )}

      {me?.roles.includes('admin') && (
        <div className="card">
          <div className="q" style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>{t('mydata.exportT')}</div>
          <p style={{ fontSize: 13, color: '#5A554B', lineHeight: 1.55, margin: '0 0 14px' }}>{t('mydata.exportD')}</p>
          <button type="button" className="btn" disabled={busy !== ''} onClick={exportData}>
            {busy === 'export' ? '…' : t('mydata.exportCta')}
          </button>
          {msg && <div className="pill" style={{ marginTop: 12 }}>{msg}</div>}
        </div>
      )}

      <button type="button" className="btn ghost" onClick={async () => { await supabase.auth.signOut(); router.replace('/login'); }}
        style={{ minHeight: 44, marginBottom: 16 }}>
        {t('common.logout')}
      </button>

      <Fold title={t('mydata.dangerT')} danger={DANGER}>
        <p style={{ fontSize: 13, color: '#5A554B', lineHeight: 1.55, margin: '0 0 14px' }}>{t(dangerKey)}</p>
        <button type="button" className="btn" onClick={() => { setConfirming(true); setErr(''); setWord(''); }}
          style={{ background: 'transparent', color: DANGER, border: `1.5px solid ${DANGER}` }}>
          {t('mydata.deleteCta')}
        </button>
        {err && <div className="error" role="alert" style={{ marginTop: 12 }}>{err}</div>}
      </Fold>
      <BottomNav role={navRole} />
    </div>
  );
}
