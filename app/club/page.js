'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';
import { useT } from '../../lib/i18n';

const TAB_KEYS = ['equipes', 'licencies', 'coachs'];

/** Initiales du club : 2 lettres max (« AS Château-Thierry » → « AC »). */
function initials(name) {
  return (name || '')
    .split(/\s+/).filter(Boolean).slice(0, 2)
    .map((w) => w[0]).join('').toUpperCase() || '🏅';
}

/**
 * Libellé d'un compte : nom complet, sinon la partie avant l'@ de l'email.
 * Renvoie '' quand la ligne app_users n'a pas pu être lue (RLS) : l'appelant
 * affiche alors un libellé neutre plutôt qu'un vide ou un « undefined ».
 */
function accountLabel(u) {
  const full = (u?.full_name || '').trim();
  if (full) return full;
  const email = (u?.email || '').trim();
  return email ? email.split('@')[0] : '';
}

export default function Club() {
  const router = useRouter();
  const { t, lang } = useT();
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState('equipes');
  const [club, setClub] = useState(null);
  const [sports, setSports] = useState([]);
  const [teams, setTeams] = useState([]);
  const [teamId, setTeamId] = useState('');
  const [players, setPlayers] = useState([]);
  const [memberCount, setMemberCount] = useState(0);
  const [coachCount, setCoachCount] = useState(0);
  const [heads, setHeads] = useState({});     // {teamId: {members, coaches[]}} — en-têtes de cartes
  const [open, setOpen] = useState({});       // {teamId: true} — cartes dépliées
  const [details, setDetails] = useState({}); // {teamId: {loading, athletes[]}} — chargé au dépliage
  const [copied, setCopied] = useState(false);
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
  const [teamCoachEmail, setTeamCoachEmail] = useState({}); // {teamId: email}, saisie dans les cartes

  const flash = (msg) => { setOk(msg); setErr(''); setTimeout(() => setOk(''), 3500); };

  /** Licenciés = count sur players ; coachs = distinct coach_user_id sur coach_teams. */
  const loadStats = useCallback(async (clubId, teamRows) => {
    const { count } = await supabase.from('players').select('id', { count: 'exact', head: true }).eq('club_id', clubId);
    setMemberCount(count || 0);
    const ids = (teamRows || []).map((tm) => tm.id);
    if (ids.length === 0) { setCoachCount(0); return; }
    const { data } = await supabase.from('coach_teams').select('coach_user_id').in('team_id', ids);
    setCoachCount(new Set((data || []).map((r) => r.coach_user_id)).size);
  }, []);

  /**
   * En-têtes des cartes équipe : effectif + coachs, pour TOUTES les équipes
   * (deux requêtes groupées, pas une par équipe), afin que l'en-tête soit
   * complet même carte repliée.
   */
  const loadHeads = useCallback(async (teamRows) => {
    const ids = (teamRows || []).map((tm) => tm.id);
    if (ids.length === 0) { setHeads({}); return; }
    const { data: pls } = await supabase.from('players').select('id, team_id').in('team_id', ids);
    const { data: cts } = await supabase.from('coach_teams').select('team_id, coach_user_id').in('team_id', ids);
    const uids = [...new Set((cts || []).map((r) => r.coach_user_id))];
    const names = {};
    if (uids.length) {
      const { data } = await supabase.from('app_users').select('id, full_name, email').in('id', uids);
      for (const u of data || []) names[u.id] = accountLabel(u);
    }
    const map = {};
    for (const id of ids) map[id] = { members: 0, coaches: [] };
    for (const p of pls || []) if (map[p.team_id]) map[p.team_id].members += 1;
    for (const r of cts || []) if (map[r.team_id]) map[r.team_id].coaches.push(names[r.coach_user_id] || '');
    setHeads(map);
  }, []);

  /** Contenu déplié d'une équipe : athlètes + parent rattaché + présences. */
  const loadTeamDetail = useCallback(async (tid) => {
    setDetails((d) => ({ ...d, [tid]: { ...(d[tid] || {}), loading: true } }));

    const { data: pls } = await supabase.from('players')
      .select('id, first_name, last_name').eq('team_id', tid).order('first_name');
    const roster = pls || [];
    const pids = roster.map((p) => p.id);

    // Rattachements parents : lisibles par le dirigeant (can_manage_player).
    let links = [];
    if (pids.length) {
      const { data } = await supabase.from('player_parents').select('player_id, parent_user_id').in('player_id', pids);
      links = data || [];
    }

    // Séances publiées de l'équipe = dénominateur des présences.
    const { data: ss } = await supabase.from('sessions')
      .select('id').eq('team_id', tid).not('published_at', 'is', null);
    const sids = (ss || []).map((s) => s.id);

    const presents = {};
    if (sids.length && pids.length) {
      const { data } = await supabase.from('attendance')
        .select('player_id').in('session_id', sids).in('player_id', pids).eq('status', 'present');
      for (const a of data || []) presents[a.player_id] = (presents[a.player_id] || 0) + 1;
    }

    // Un seul aller-retour pour tous les noms de parents.
    const uids = [...new Set(links.map((l) => l.parent_user_id))];
    const names = {};
    if (uids.length) {
      const { data } = await supabase.from('app_users').select('id, full_name, email').in('id', uids);
      for (const u of data || []) names[u.id] = accountLabel(u);
    }

    const athletes = roster.map((p) => {
      const mine = links.filter((l) => l.player_id === p.id);
      return {
        id: p.id,
        name: `${p.first_name} ${p.last_name || ''}`.trim(),
        parents: mine.map((l) => names[l.parent_user_id] || ''),
        linked: mine.length > 0,
        presents: presents[p.id] || 0,
        total: sids.length,
      };
    });
    setDetails((d) => ({ ...d, [tid]: { loading: false, athletes } }));
  }, []);

  const loadTeams = useCallback(async (clubId, keep) => {
    const { data } = await supabase.from('teams').select('id, name, category, sport_id, sports(name_fr, name_en, icon)').eq('club_id', clubId).order('name');
    setTeams(data || []);
    setTeamId((cur) => {
      const next = keep || cur;
      if (next && (data || []).some((t) => t.id === next)) return next;
      return data && data[0] ? data[0].id : '';
    });
    await loadStats(clubId, data || []);
    await loadHeads(data || []);
  }, [loadStats, loadHeads]);

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
      const { data: sp } = await supabase.from('sports').select('id, name_fr, name_en, icon').order('name_fr');
      setSports(sp || []);
      if (sp && sp[0]) setTeamSport(sp[0].id);
      if (c) await loadTeams(c.id);
      setReady(true);
    })();
  }, [router, loadTeams]);

  useEffect(() => { loadPlayers(teamId); }, [teamId, loadPlayers]);

  /* Première équipe dépliée par défaut, tant que l'utilisateur n'a rien touché. */
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (touched || teams.length === 0) return;
    setOpen({ [teams[0].id]: true });
  }, [teams, touched]);

  /* Toute carte dépliée charge son contenu une seule fois. */
  useEffect(() => {
    for (const tid of Object.keys(open)) if (!details[tid]) loadTeamDetail(tid);
  }, [open, details, loadTeamDetail]);

  function toggleTeam(tid) {
    setTouched(true);
    setOpen((cur) => {
      const next = { ...cur };
      if (next[tid]) delete next[tid]; else next[tid] = true;
      return next;
    });
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(club.join_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch { /* clipboard indisponible */ }
  }

  async function logout() { await supabase.auth.signOut(); router.replace('/login'); }

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
      setPFirst(''); setPLast(''); flash(t('club.memberAdded'));
      await loadPlayers(teamId);
      await loadStats(club.id, teams);
      await loadHeads(teams);
      if (details[teamId]) await loadTeamDetail(teamId);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  /** Rattache un coach à l'équipe passée : onglet Coachs comme carte dépliable. */
  async function linkCoach(tid, email, clear) {
    setErr(''); setBusy(true);
    try {
      if (!tid) throw new Error(t('club.errTeamFirst'));
      if (!email.trim()) throw new Error(t('club.errCoachEmail'));
      const { error } = await supabase.rpc('admin_link_coach_by_email', { p_team: tid, p_email: email.trim() });
      if (error) throw error;
      clear(); flash(t('club.coachLinked'));
      await loadStats(club.id, teams);
      await loadHeads(teams);
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
      if (details[teamId]) await loadTeamDetail(teamId);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  if (!ready) return <div className="wrap"><p style={{ color: 'var(--muted)' }}>{t('common.loading')}</p></div>;

  if (!club) return (
    <div className="wrap">
      <div className="card"><p style={{ margin: 0, color: 'var(--muted)' }}>{t('club.notAdmin')}</p></div>
      <a href="#" onClick={(e) => { e.preventDefault(); router.push('/'); }}>{t('common.backLabel')}</a>
    </div>
  );

  /** Nom du sport dans la langue active, avec repli sur le français. */
  const sportName = (s) => (lang === 'en' ? s?.name_en || s?.name_fr : s?.name_fr) || '';
  const memberLabel = (n) => t(n === 1 ? 'coach.memberOne' : 'coach.memberMany', { n });
  /** Un compte rattaché dont app_users n'est pas lisible (RLS) reste nommé sobrement. */
  const nameOr = (n) => n || t('club.accountLinked');
  const currentTeam = teams.find((t) => t.id === teamId);
  const currentTeamName = currentTeam?.name || t('club.theTeam');
  const sportCount = new Set(teams.map((tm) => tm.sport_id).filter(Boolean)).size;
  const stats = [
    { n: teams.length, label: t('club.statTeams') },
    { n: memberCount, label: t('club.statMembers') },
    { n: coachCount, label: t('club.statCoaches') },
    { n: sportCount, label: t('club.statSports') },
  ];

  const teamSelector = (
    <div className="card">
      <div className="label" style={{ marginBottom: 6 }}>{t('club.teamConcerned')}</div>
      <select className="input" style={{ marginBottom: 0 }} value={teamId} onChange={(e) => setTeamId(e.target.value)}>
        {teams.map((tm) => <option key={tm.id} value={tm.id}>{tm.sports?.icon} {tm.name} · {sportName(tm.sports)}</option>)}
      </select>
    </div>
  );

  return (
    <div className="wrap">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <a href="#" onClick={(e) => { e.preventDefault(); router.push('/'); }} style={{ fontWeight: 700 }}>←</a>
        <div className="q" style={{ fontWeight: 700, fontSize: 18, flex: 1 }}>{t('club.title')}</div>
        <button type="button" onClick={logout}
          style={{ border: 'none', background: 'transparent', color: 'var(--brand-dark)', fontFamily: 'inherit',
            fontSize: 13, fontWeight: 700, cursor: 'pointer', padding: 0 }}>
          {t('common.logout')}
        </button>
      </div>

      {/* ===== Carte identité du club ===== */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div className="q" style={{ width: 54, height: 54, flex: '0 0 54px', borderRadius: 18, background: 'var(--brand)',
            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 19, letterSpacing: '.5px' }}>
            {initials(club.name)}
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="q" style={{ fontWeight: 700, fontSize: 19, letterSpacing: '-0.3px' }}>{club.name}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, marginTop: 2 }}>
              {t('club.season', { year: new Date().getFullYear() })}
            </div>
          </div>
        </div>

        {club.join_code && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14,
            background: 'var(--peach)', borderRadius: 14, padding: '10px 12px' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="label" style={{ color: '#A8837A' }}>{t('club.inviteCode')}</div>
              <div style={{ fontWeight: 800, fontSize: 17, letterSpacing: 2, color: 'var(--brand-dark)', marginTop: 2 }}>
                {club.join_code}
              </div>
            </div>
            <button type="button" onClick={copyCode}
              style={{ border: 'none', borderRadius: 11, padding: '9px 14px', fontSize: 13, fontWeight: 700,
                cursor: 'pointer', fontFamily: 'inherit', background: '#fff', color: 'var(--brand-dark)', whiteSpace: 'nowrap' }}>
              {copied ? t('club.copied') : t('club.copyCode')}
            </button>
          </div>
        )}
      </div>

      {/* ===== Bandeau de stats ===== */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
        {stats.map((s) => (
          <div key={s.label} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16,
            padding: '12px 4px', textAlign: 'center' }}>
            <div className="q" style={{ fontWeight: 800, fontSize: 20, lineHeight: 1.1, color: 'var(--brand-dark)' }}>{s.n}</div>
            <div style={{ fontSize: 10.5, color: 'var(--muted)', fontWeight: 700, marginTop: 3 }}>{s.label}</div>
          </div>
        ))}
      </div>

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
              {sports.map((s) => <option key={s.id} value={s.id}>{s.icon} {sportName(s)}</option>)}
            </select>
            <button className="btn" disabled={busy} onClick={addTeam}>{busy ? '…' : t('club.doCreateTeam')}</button>
          </div>

          <div className="label" style={{ margin: '0 0 8px 4px' }}>{t('club.clubTeams')}</div>
          {teams.length === 0 && (
            <div className="card"><p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>{t('club.noTeam')}</p></div>
          )}
          {teams.map((tm) => {
            const head = heads[tm.id] || { members: 0, coaches: [] };
            const isOpen = !!open[tm.id];
            const d = details[tm.id];
            const sub = [sportName(tm.sports), tm.category, memberLabel(head.members)].filter(Boolean).join(' · ');
            const coachLine = head.coaches.map(nameOr).join(', ');
            return (
              <div key={tm.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                {/* En-tête cliquable : déplie / replie */}
                <button type="button" onClick={() => toggleTeam(tm.id)} aria-expanded={isOpen}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: 14,
                    border: 'none', background: 'transparent', font: 'inherit', textAlign: 'left', cursor: 'pointer' }}>
                  <div style={{ width: 44, height: 44, flex: '0 0 44px', borderRadius: 15, background: 'var(--peach)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 21 }}>
                    {tm.sports?.icon || '⚽'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="q" style={{ fontWeight: 700, fontSize: 15 }}>{tm.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{sub}</div>
                    {coachLine && (
                      <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>{coachLine}</div>
                    )}
                  </div>
                  <span aria-hidden="true" style={{ color: 'var(--muted)', fontSize: 12, flex: '0 0 auto',
                    transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>▾</span>
                </button>

                {isOpen && (
                  <div style={{ borderTop: '1px solid var(--border)', padding: 14 }}>
                    {/* ---- Athlètes ---- */}
                    <div className="label" style={{ marginBottom: 2 }}>{t('club.athlete')}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--muted)', marginBottom: 4 }}>
                      {[t('club.parentAccount'), t('club.status'), t('club.attendance')].join(' · ')}
                    </div>
                    {(!d || d.loading) && (
                      <div style={{ fontSize: 13, color: 'var(--muted)' }}>{t('common.loading')}</div>
                    )}
                    {d && !d.loading && d.athletes.length === 0 && (
                      <div style={{ fontSize: 13, color: 'var(--muted)' }}>{t('club.noMembers')}</div>
                    )}
                    {d && !d.loading && d.athletes.map((a, i) => (
                      <div key={a.id} style={{ borderTop: i ? '1px solid var(--border)' : 'none', padding: '9px 0 8px' }}>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{a.name}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap',
                          fontSize: 11.5, color: 'var(--muted)', marginTop: 3 }}>
                          <span>{a.linked ? a.parents.map(nameOr).join(', ') : t('club.pending')}</span>
                          <span aria-hidden="true">·</span>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <i style={{ width: 6, height: 6, borderRadius: '50%', display: 'inline-block',
                              background: a.linked ? '#3FA06A' : '#D99A2B' }} />
                            {a.linked ? t('club.active') : t('club.toValidate')}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{a.total > 0 ? `${a.presents}/${a.total}` : '—'}</span>
                        </div>
                      </div>
                    ))}

                    {/* ---- Coachs ---- */}
                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 12 }}>
                      <div className="label" style={{ marginBottom: 6 }}>{t('club.coaches')}</div>
                      {head.coaches.length === 0
                        ? <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 9 }}>{t('club.noCoach')}</div>
                        : <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 9 }}>{coachLine}</div>}
                      <div style={{ display: 'flex', gap: 7 }}>
                        <input className="input" style={{ marginBottom: 0, flex: 1 }}
                          value={teamCoachEmail[tm.id] || ''}
                          onChange={(e) => setTeamCoachEmail((m) => ({ ...m, [tm.id]: e.target.value }))}
                          placeholder={t('club.coachEmailPh')} />
                        <button className="btn ghost" style={{ width: 'auto', padding: '0 14px', whiteSpace: 'nowrap' }}
                          disabled={busy}
                          onClick={() => linkCoach(tm.id, teamCoachEmail[tm.id] || '',
                            () => setTeamCoachEmail((m) => ({ ...m, [tm.id]: '' })))}>
                          {t('club.addCoach')}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

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
                <button className="btn" disabled={busy}
                  onClick={() => linkCoach(teamId, coachEmail, () => setCoachEmail(''))}>{t('club.linkCoachBtn')}</button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
