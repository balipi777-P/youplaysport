'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';
import { useT } from '../../lib/i18n';

const TAB_KEYS = ['equipes', 'licencies', 'coachs'];

export default function Club() {
  const router = useRouter();
  const { t } = useT();
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState('equipes');
  const [club, setClub] = useState(null);
  const [sports, setSports] = useState([]);
  const [teams, setTeams] = useState([]);
  const [teamId, setTeamId] = useState('');
  const [players, setPlayers] = useState([]);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);

  // form fields
  const [teamName, setTeamName] = useState('');
  const [teamSport, setTeamSport] = useState('');
  const [coachEmail, setCoachEmail] = useState('');
  const [pFirst, setPFirst] = useState('');
  const [pLast, setPLast] = useState('');
  const [parentEmail, setParentEmail] = useState({}); // {playerId: email}

  const flash = (msg) => { setOk(msg); setErr(''); setTimeout(() => setOk(''), 3500); };

  const loadTeams = useCallback(async (clubId, keep) => {
    const { data } = await supabase.from('teams').select('id, name, category, sports(name_fr, icon)').eq('club_id', clubId).order('name');
    setTeams(data || []);
    setTeamId((cur) => {
      const next = keep || cur;
      if (next && (data || []).some((t) => t.id === next)) return next;
      return data && data[0] ? data[0].id : '';
    });
  }, []);

  const loadPlayers = useCallback(async (tid) => {
    if (!tid) { setPlayers([]); return; }
    const { data } = await supabase.from('players').select('id, first_name, last_name').eq('team_id', tid).order('first_name');
    setPlayers(data || []);
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) { router.replace('/login'); return; }
      const { data: mem } = await supabase.from('memberships').select('club_id, clubs(id, name, join_code)').eq('role', 'admin').limit(1);
      const c = mem && mem[0] ? mem[0].clubs : null;
      setClub(c);
      const { data: sp } = await supabase.from('sports').select('id, name_fr, icon').order('name_fr');
      setSports(sp || []);
      if (sp && sp[0]) setTeamSport(sp[0].id);
      if (c) await loadTeams(c.id);
      setReady(true);
    })();
  }, [router, loadTeams]);

  useEffect(() => { loadPlayers(teamId); }, [teamId, loadPlayers]);

  async function addTeam() {
    setErr(''); setBusy(true);
    try {
      if (!teamName.trim()) throw new Error(t('club.errTeamName'));
      const { data, error } = await supabase.from('teams').insert({ club_id: club.id, sport_id: teamSport, name: teamName.trim() }).select('id').single();
      if (error) throw error;
      setTeamName(''); flash(t('club.teamCreated'));
      await loadTeams(club.id, data.id);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  async function seedDemo() {
    setErr(''); setBusy(true);
    try {
      const { data, error } = await supabase.rpc('seed_club_demo');
      if (error) throw error;
      if (data?.status === 'already_seeded') flash(t('club.demoAlready'));
      else flash(t('club.demoCreated'));
      await loadTeams(club.id);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  async function addPlayer() {
    setErr(''); setBusy(true);
    try {
      if (!teamId) throw new Error(t('club.errTeamFirst'));
      if (!pFirst.trim()) throw new Error(t('club.errFirstName'));
      const { error } = await supabase.from('players').insert({ club_id: club.id, team_id: teamId, first_name: pFirst.trim(), last_name: pLast.trim() || null });
      if (error) throw error;
      setPFirst(''); setPLast(''); flash(t('club.memberAdded')); await loadPlayers(teamId);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  async function linkCoach() {
    setErr(''); setBusy(true);
    try {
      if (!teamId) throw new Error(t('club.errTeamFirst'));
      if (!coachEmail.trim()) throw new Error(t('club.errCoachEmail'));
      const { error } = await supabase.rpc('admin_link_coach_by_email', { p_team: teamId, p_email: coachEmail.trim() });
      if (error) throw error;
      setCoachEmail(''); flash(t('club.coachLinked'));
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  async function linkParent(playerId) {
    setErr(''); setBusy(true);
    try {
      const email = (parentEmail[playerId] || '').trim();
      if (!email) throw new Error(t('club.errParentEmail'));
      const { error } = await supabase.rpc('admin_link_parent_by_email', { p_player: playerId, p_email: email });
      if (error) throw error;
      setParentEmail((m) => ({ ...m, [playerId]: '' })); flash(t('club.parentLinked'));
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  if (!ready) return <div className="wrap"><p style={{ color: 'var(--muted)' }}>{t('common.loading')}</p></div>;

  if (!club) return (
    <div className="wrap">
      <div className="card"><p style={{ margin: 0, color: 'var(--muted)' }}>{t('club.notAdmin')}</p></div>
      <a href="#" onClick={(e) => { e.preventDefault(); router.push('/'); }}>{t('common.backLabel')}</a>
    </div>
  );

  const currentTeam = teams.find((t) => t.id === teamId);
  const currentTeamName = currentTeam?.name || t('club.theTeam');
  const teamSelector = (
    <div className="card">
      <div className="label" style={{ marginBottom: 6 }}>{t('club.teamConcerned')}</div>
      <select className="input" style={{ marginBottom: 0 }} value={teamId} onChange={(e) => setTeamId(e.target.value)}>
        {teams.map((tm) => <option key={tm.id} value={tm.id}>{tm.sports?.icon} {tm.name}</option>)}
      </select>
    </div>
  );

  return (
    <div className="wrap">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 2 }}>
        <a href="#" onClick={(e) => { e.preventDefault(); router.push('/'); }} style={{ fontWeight: 700 }}>←</a>
        <div className="q" style={{ fontWeight: 700, fontSize: 18 }}>{t('club.title')}</div>
      </div>
      <h1 className="q" style={{ fontSize: 22, margin: '2px 0 4px' }}>{club.name}</h1>
      {club.join_code && (
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14 }}>
          {t('club.inviteCode')} <b style={{ color: 'var(--brand-dark)', letterSpacing: 1 }}>{club.join_code}</b>
        </div>
      )}

      {/* Onglets */}
      <div style={{ display: 'flex', gap: 6, background: '#F1E9E1', borderRadius: 14, padding: 4, marginBottom: 16 }}>
        {TAB_KEYS.map((k) => {
          const on = tab === k;
          return (
            <button key={k} onClick={() => { setTab(k); setErr(''); }}
              style={{ flex: 1, border: 'none', borderRadius: 10, padding: '9px 0', fontSize: 13, fontWeight: 700,
                cursor: 'pointer', fontFamily: 'inherit',
                background: on ? '#fff' : 'transparent', color: on ? 'var(--brand-dark)' : '#8A7A6E',
                boxShadow: on ? '0 1px 3px rgba(0,0,0,.08)' : 'none' }}>
              {t(`club.tab.${k}`)}
            </button>
          );
        })}
      </div>

      {err && <div className="error">{err}</div>}
      {ok && <div className="pill" style={{ marginBottom: 12 }}>{ok}</div>}

      {/* ===== Onglet Équipes ===== */}
      {tab === 'equipes' && (
        <>
          <div className="card">
            <div className="label" style={{ marginBottom: 8 }}>{t('club.createTeam')}</div>
            <input className="input" value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder={t('club.teamNamePh')} />
            <select className="input" value={teamSport} onChange={(e) => setTeamSport(e.target.value)}>
              {sports.map((s) => <option key={s.id} value={s.id}>{s.icon} {s.name_fr}</option>)}
            </select>
            <button className="btn" disabled={busy} onClick={addTeam}>{busy ? '…' : t('club.doCreateTeam')}</button>
          </div>

          <div className="card">
            <div className="label" style={{ marginBottom: 8 }}>{t('club.clubTeams')}</div>
            {teams.length === 0 && <div style={{ fontSize: 13, color: 'var(--muted)' }}>{t('club.noTeam')}</div>}
            {teams.map((tm) => (
              <div key={tm.id} style={{ display: 'flex', alignItems: 'center', gap: 10, borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 10 }}>
                <span style={{ fontSize: 18 }}>{tm.sports?.icon || '⚽'}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{tm.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{tm.sports?.name_fr}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="card" style={{ background: 'var(--peach)', border: 'none' }}>
            <div className="q" style={{ fontWeight: 700, fontSize: 14, color: '#5F2A1C', marginBottom: 4 }}>{t('club.demoTitle')}</div>
            <div style={{ fontSize: 12, color: '#7A4030', marginBottom: 10, lineHeight: 1.5 }}>
              {t('club.demoDesc')}
            </div>
            <button className="btn ghost" disabled={busy} onClick={seedDemo}>{busy ? '…' : t('club.demoBtn')}</button>
          </div>
        </>
      )}

      {/* ===== Onglet Licenciés ===== */}
      {tab === 'licencies' && (
        <>
          {teams.length === 0 && <div className="card"><p style={{ margin: 0, color: 'var(--muted)' }}>{t('club.createTeamFirst')}</p></div>}
          {teams.length > 0 && (
            <>
              {teamSelector}
              <div className="card">
                <div className="label" style={{ marginBottom: 8 }}>{t('club.membersOf', { name: currentTeamName })}</div>
                {players.length === 0 && <div style={{ fontSize: 13, color: 'var(--muted)' }}>{t('club.noMembers')}</div>}
                {players.map((p) => (
                  <div key={p.id} style={{ borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 10 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{p.first_name} {p.last_name || ''}</div>
                    <div style={{ display: 'flex', gap: 7, marginTop: 6 }}>
                      <input className="input" style={{ marginBottom: 0, flex: 1 }} value={parentEmail[p.id] || ''}
                        onChange={(e) => setParentEmail((m) => ({ ...m, [p.id]: e.target.value }))}
                        placeholder={t('club.parentEmailPh')} />
                      <button className="btn ghost" style={{ width: 'auto', padding: '0 14px' }} disabled={busy} onClick={() => linkParent(p.id)}>{t('club.link')}</button>
                    </div>
                  </div>
                ))}
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 12 }}>
                  <div style={{ display: 'flex', gap: 7 }}>
                    <input className="input" style={{ marginBottom: 0, flex: 1 }} value={pFirst} onChange={(e) => setPFirst(e.target.value)} placeholder={t('club.firstNamePh')} />
                    <input className="input" style={{ marginBottom: 0, flex: 1 }} value={pLast} onChange={(e) => setPLast(e.target.value)} placeholder={t('club.lastNamePh')} />
                  </div>
                  <button className="btn" style={{ marginTop: 8 }} disabled={busy} onClick={addPlayer}>{t('club.addMember')}</button>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* ===== Onglet Coachs ===== */}
      {tab === 'coachs' && (
        <>
          {teams.length === 0 && <div className="card"><p style={{ margin: 0, color: 'var(--muted)' }}>{t('club.createTeamFirst')}</p></div>}
          {teams.length > 0 && (
            <>
              {teamSelector}
              <div className="card">
                <div className="label" style={{ marginBottom: 6 }}>{t('club.linkCoachTo', { name: currentTeamName })}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8, lineHeight: 1.5 }}>
                  {t('club.coachHint', { code: club.join_code })}
                </div>
                <input className="input" value={coachEmail} onChange={(e) => setCoachEmail(e.target.value)} placeholder={t('club.coachEmailPh')} />
                <button className="btn" disabled={busy} onClick={linkCoach}>{t('club.linkCoachBtn')}</button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
