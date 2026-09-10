'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../lib/supabaseClient';
import { loadMyChildren, pickChild, setStoredChildId } from '../lib/children';
import { useT, LangToggle } from '../lib/i18n';
import BottomNav, { BOTTOM_NAV_HEIGHT } from './components/BottomNav';

const AXIS_EMOJI = {
  physique: '💪', motricite: '🤸', technique: '🎯',
  tactique: '♟️', mental: '🧠', etat_esprit: '🤝', hygiene: '🌙',
};

/* Carnet de l'athlète : les 3 états de skill_status, du plus acquis au moins acquis,
   avec le remplissage de barre et la clé i18n de chacun. */
const SKILL_STATES = [
  { status: 'validee', key: 'skill.validee', pct: 100, fill: 'var(--brand)' },
  { status: 'en_progres', key: 'skill.enProgres', pct: 60, fill: '#D97A5C' },
  { status: 'a_travailler', key: 'skill.aTravailler', pct: 20, fill: '#E3B49F' },
];

export default function Home() {
  const router = useRouter();
  const { t, lang } = useT();
  const [ready, setReady] = useState(false);
  const [memberships, setMemberships] = useState([]);
  const [children, setChildren] = useState([]);
  const [player, setPlayer] = useState(null);
  const [session, setSession] = useState(null);
  const [attendance, setAttendance] = useState(null);
  const [skills, setSkills] = useState([]);
  const [isSA, setIsSA] = useState(false);
  const [err, setErr] = useState('');
  /* Vue athlète : fiches dont l'utilisateur est lui-même le licencié, et les données
     propres à cette vue (prochaine convocation, carnet complet). */
  const [myPlayerIds, setMyPlayerIds] = useState([]);
  const [nextEvent, setNextEvent] = useState(null);
  const [convocation, setConvocation] = useState(null);
  const [allSkills, setAllSkills] = useState([]);
  const [rsvpBusy, setRsvpBusy] = useState(false);
  /* Tableau de bord staff : équipes encadrées, dernière séance publiée, identité. */
  const [staffTeams, setStaffTeams] = useState([]);
  const [staffSession, setStaffSession] = useState(null);
  const [staffName, setStaffName] = useState('');

  const loadChildData = useCallback(async (p) => {
    setPlayer(p || null);
    if (!p) { setSession(null); setSkills([]); setAttendance(null); return; }
    const { data: sessions } = await supabase
      .from('sessions')
      .select('id, date, theme, session_axes(axis, comment), session_challenge(name, home_exercise, competence, tip), messages(type, body)')
      .eq('team_id', p.team_id).not('published_at', 'is', null)
      .order('date', { ascending: false }).limit(1);
    const s = sessions && sessions[0];
    setSession(s || null);
    if (s) {
      const { data: att } = await supabase.from('attendance').select('status')
        .eq('session_id', s.id).eq('player_id', p.id).limit(1);
      setAttendance(att && att[0] ? att[0].status : null);
    } else setAttendance(null);
    const { data: sk } = await supabase.from('skills').select('label, status')
      .eq('player_id', p.id).eq('status', 'validee');
    setSkills(sk || []);
  }, []);

  /* Données de la vue athlète : la prochaine échéance de son équipe, sa convocation
     pour celle-ci, et l'intégralité de son carnet (les 3 états, pas seulement les acquis). */
  const loadAthleteData = useCallback(async (p) => {
    let ev = null;
    if (p.team_id) {
      const { data: evs } = await supabase
        .from('events').select('id, type, opponent, place, datetime')
        .eq('team_id', p.team_id)
        .gte('datetime', new Date().toISOString())
        .order('datetime').limit(1);
      ev = (evs && evs[0]) || null;
    }
    setNextEvent(ev);
    if (ev) {
      const { data: conv } = await supabase
        .from('event_convocations').select('id, response, responded_at')
        .eq('event_id', ev.id).eq('player_id', p.id).maybeSingle();
      setConvocation(conv || null);
    } else setConvocation(null);
    const { data: sk } = await supabase.from('skills').select('label, status, axis').eq('player_id', p.id);
    setAllSkills(sk || []);
  }, []);

  /* Tableau de bord staff. Les équipes viennent de deux sources selon le rôle —
     coach_teams pour un coach, toutes les équipes du club pour un dirigeant —
     fusionnées par id : un compte qui cumule les deux ne voit pas de doublon. */
  const loadStaffData = useCallback(async (mem, uid) => {
    const TEAM_COLS = 'id, name, category, club_id, sport_id, clubs(name), sports(name_fr, name_en, icon)';
    const byId = new Map();
    if (mem.some((m) => m.role === 'coach')) {
      const { data } = await supabase.from('coach_teams')
        .select(`teams(${TEAM_COLS})`).eq('coach_user_id', uid);
      for (const r of data || []) if (r.teams) byId.set(r.teams.id, { ...r.teams });
    }
    const adminClubs = mem.filter((m) => m.role === 'admin').map((m) => m.club_id);
    if (adminClubs.length) {
      const { data } = await supabase.from('teams').select(TEAM_COLS).in('club_id', adminClubs);
      for (const tm of data || []) byId.set(tm.id, { ...tm });
    }
    const list = [...byId.values()];
    const ids = list.map((tm) => tm.id);

    /* Effectifs en une seule requête groupée plutôt qu'un count par équipe. */
    if (ids.length) {
      const { data: pls } = await supabase.from('players').select('id, team_id').in('team_id', ids);
      const per = {};
      for (const p of pls || []) per[p.team_id] = (per[p.team_id] || 0) + 1;
      for (const tm of list) tm.memberCount = per[tm.id] || 0;
    }
    list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    setStaffTeams(list);

    /* Séance du jour : la plus récente publiée parmi les équipes encadrées. */
    let se = null;
    if (ids.length) {
      const { data: ss } = await supabase.from('sessions')
        .select('id, team_id, date, theme, teams(name), published_at')
        .in('team_id', ids).not('published_at', 'is', null)
        .order('date', { ascending: false }).limit(1);
      se = (ss && ss[0]) || null;
    }
    if (se) {
      const { count: total } = await supabase.from('attendance')
        .select('id', { count: 'exact', head: true }).eq('session_id', se.id);
      const { count: presents } = await supabase.from('attendance')
        .select('id', { count: 'exact', head: true }).eq('session_id', se.id).eq('status', 'present');
      setStaffSession({ ...se, presents: presents || 0, total: total || 0 });
    } else setStaffSession(null);

    /* Uniquement full_name : l'email ne doit jamais servir de titre. Vide ici,
       le rendu retombe sur un libellé i18n. */
    const { data: au } = await supabase.from('app_users').select('full_name').eq('id', uid).maybeSingle();
    setStaffName((au?.full_name || '').trim());
  }, []);

  const load = useCallback(async () => {
    setErr('');
    const { data: uinfo } = await supabase.auth.getUser();
    const uid = uinfo?.user?.id;
    /* Une fiche dont user_id vaut l'utilisateur connecté, c'est un athlète autonome
       (et non un enfant suivi par un parent) : c'est ce qui bascule l'accueil en « tu ». */
    const { data: own } = uid
      ? await supabase.from('players').select('id').eq('user_id', uid)
      : { data: [] };
    setMyPlayerIds((own || []).map((r) => r.id));
    const { data: mem } = await supabase
      .from('memberships').select('role, club_id, clubs(name, join_code)');
    setMemberships(mem || []);
    if (uid && (mem || []).some((m) => m.role === 'admin' || m.role === 'coach')) {
      await loadStaffData(mem || [], uid);
    }
    const kids = await loadMyChildren();
    setChildren(kids);
    const chosen = pickChild(kids);
    await loadChildData(chosen);
    const { data: sa } = await supabase.rpc('sa_is_admin');
    setIsSA(!!sa);
    return { mem: mem || [], hasChild: !!chosen };
  }, [loadChildData, loadStaffData]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) { router.replace('/login'); return; }
      const res = await load();
      if (res.mem.length === 0 && !res.hasChild) { router.replace('/onboarding'); return; }
      setReady(true);
    })();
  }, [router, load]);

  /* La fiche affichée est-elle celle de l'utilisateur lui-même ? On (re)charge alors
     ses données d'athlète ; sinon on les vide pour que la vue Parent reste intacte. */
  useEffect(() => {
    if (!player || !myPlayerIds.includes(player.id)) {
      setNextEvent(null); setConvocation(null); setAllSkills([]);
      return;
    }
    loadAthleteData(player);
  }, [player, myPlayerIds, loadAthleteData]);

  /* Réponse à la convocation. L'enum rsvp_response ne connaît que 'present' et 'absent'. */
  async function respond(answer) {
    if (!player || !nextEvent || rsvpBusy) return;
    setRsvpBusy(true); setErr('');
    const { error } = await supabase.from('event_convocations')
      .update({ response: answer, responded_at: new Date().toISOString() })
      .eq('event_id', nextEvent.id).eq('player_id', player.id);
    if (error) setErr(error.message);
    else await loadAthleteData(player);
    setRsvpBusy(false);
  }

  function switchChild(id) {
    setStoredChildId(id);
    const c = children.find((x) => x.id === id);
    loadChildData(c);
  }

  async function logout() { await supabase.auth.signOut(); router.replace('/login'); }

  if (!ready) return <div className="wrap"><p style={{ color: 'var(--muted)' }}>{t('common.loading')}</p></div>;

  const staff = memberships.find((m) => m.role === 'admin' || m.role === 'coach');
  const mot = session?.messages?.find((m) => m.type === 'mot_coach');
  const objectif = session?.messages?.find((m) => m.type === 'objectif');
  const defi = session?.session_challenge;
  const axisLabel = (a) => `${AXIS_EMOJI[a] || ''} ${t(`axis.${a}`)}`.trim();

  /* L'utilisateur consulte sa propre fiche : accueil au « tu ». */
  const isAthlete = !!player && myPlayerIds.includes(player.id);

  /* Onglets de la barre basse : ils suivent la vue réellement affichée, pas le rôle
     le plus élevé. Un compte multi-rôles (admin + parent) voit son journal, donc la
     nav parent ; l'accès staff reste les boutons de l'Espace Dirigeant plus bas. */
  const navRole = player ? (isAthlete ? 'athlete' : 'parent') : (staff ? 'coach' : 'parent');

  /* Convocation : « Ce soir » si l'échéance tombe aujourd'hui, sinon « À venir ». */
  const evDate = nextEvent?.datetime ? new Date(nextEvent.datetime) : null;
  const evIsToday = !!evDate && evDate.toDateString() === new Date().toDateString();
  const evTime = evDate
    ? evDate.toLocaleTimeString(lang === 'en' ? 'en-GB' : 'fr-FR', { hour: '2-digit', minute: '2-digit' })
    : '';

  /* Date du jour : « MERCREDI 10 SEPTEMBRE 2026 » / « WEDNESDAY 10 SEPTEMBER 2026 ». */
  const todayLabel = new Date()
    .toLocaleDateString(lang === 'en' ? 'en-GB' : 'fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    .toUpperCase();

  /* Initiales d'un enfant, pour la pastille du sélecteur. */
  const childInitials = (c) => `${(c.first_name || '')[0] || ''}${(c.last_name || '')[0] || ''}`.toUpperCase();

  /* Nom du sport dans la langue active. */
  const sportName = (sp) => (lang === 'en' ? sp?.name_en || sp?.name_fr : sp?.name_fr) || '';

  /* Sous-ligne d'une pastille : « {icône} {club} · {sport} », sans les infos absentes. */
  const childSub = (c) => {
    const sp = c.teams?.sports;
    const text = [c.teams?.clubs?.name, sportName(sp)].filter(Boolean).join(' · ');
    if (!text) return '';
    return sp?.icon ? `${sp.icon} ${text}` : text;
  };

  /* « n licenciés », avec le singulier. */
  const memberLabel = (n) => t(n === 1 ? 'coach.memberOne' : 'coach.memberMany', { n });

  return (
    <div className="wrap" style={{ paddingBottom: BOTTOM_NAV_HEIGHT + 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <div className="brand">
          <div className="logo">Y</div>
          <div className="q" style={{ fontWeight: 700, fontSize: 17 }}>
            You<span style={{ color: 'var(--brand)' }}>Play</span>Sport
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <LangToggle />
          <a href="#" onClick={(e) => { e.preventDefault(); logout(); }} style={{ fontSize: 13, fontWeight: 700 }}>{t('common.logout')}</a>
        </div>
      </div>

      {err && <div className="error">{err}</div>}

      {/* ---- Vue Parent : le journal ---- */}
      {player && (
        <>
          <div style={{ marginBottom: 3, color: 'var(--muted)', fontSize: 10.5, fontWeight: 800, letterSpacing: '.9px' }}>
            {todayLabel}
          </div>
          <h1 className="q" style={{ fontSize: 24, letterSpacing: '-0.4px', margin: '0 0 12px' }}>
            {isAthlete ? t('athlete.hello', { name: player.first_name }) : t('home.todayTitle')}
          </h1>

          {/* Convocation à venir + réponse (athlète uniquement) */}
          {isAthlete && nextEvent && convocation && (
            <div className="card" style={{ border: '2px solid var(--brand)' }}>
              <span className="pill">{evIsToday ? t('athlete.tonight') : t('athlete.upcoming')}</span>
              <div className="q" style={{ fontSize: 17, fontWeight: 700, margin: '10px 0 2px' }}>
                {t(`event.${nextEvent.type}`)}{nextEvent.opponent ? ` · ${nextEvent.opponent}` : ''}
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.5 }}>
                {[evDate && `${fmt(nextEvent.datetime, lang)}${evTime ? ` · ${evTime}` : ''}`, nextEvent.place && `📍 ${nextEvent.place}`]
                  .filter(Boolean).join('  ')}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                {[['present', 'rsvp.yes'], ['absent', 'rsvp.no']].map(([answer, key]) => {
                  const on = convocation.response === answer;
                  return (
                    <button key={answer} type="button" disabled={rsvpBusy} onClick={() => respond(answer)}
                      className={on ? 'btn' : 'btn ghost'} style={{ marginBottom: 0, flex: 1, opacity: rsvpBusy ? .6 : 1 }}>
                      {t(key)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Sélecteur d'enfant (visible dès un enfant, hors vue athlète) */}
          {!isAthlete && children.length > 0 && (
            <>
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: children.length > 1 ? 8 : 14 }}>
                {children.map((c) => {
                  const on = c.id === player.id;
                  const sub = childSub(c);
                  return (
                    <button key={c.id} type="button" onClick={() => switchChild(c.id)}
                      style={{ border: 'none', borderRadius: 18, padding: '9px 14px 9px 9px', textAlign: 'left',
                        cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 9,
                        background: on ? 'var(--brand)' : '#F1E9E1', color: on ? '#fff' : '#57534A' }}>
                      <span className="q" style={{ width: 30, height: 30, flex: '0 0 30px', borderRadius: 10,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800,
                        background: on ? 'rgba(255,255,255,.24)' : '#fff', color: on ? '#fff' : 'var(--brand-dark)' }}>
                        {childInitials(c)}
                      </span>
                      <span>
                        <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700 }}>{c.first_name}</span>
                        {sub && <span style={{ display: 'block', fontSize: 10.5, fontWeight: 600, opacity: .8, marginTop: 1 }}>{sub}</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
              {children.length > 1 && (
                <div style={{ fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.5, marginBottom: 14 }}>
                  {t('home.oneAccount')}
                </div>
              )}
            </>
          )}

          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <button className="btn ghost" style={{ marginBottom: 0 }} onClick={() => router.push('/carnet')}>{t('home.carnet')}</button>
            <button className="btn ghost" style={{ marginBottom: 0 }} onClick={() => router.push('/agenda')}>{t('home.agenda')}</button>
            <button className="btn ghost" style={{ marginBottom: 0 }} onClick={() => router.push('/calendrier')}>{t('home.calendar')}</button>
          </div>
          {!session && <div className="card"><p style={{ margin: 0, color: 'var(--muted)' }}>{t('home.noSession')}</p></div>}
          {session && (
            <>
              {isAthlete && (
                <div className="label" style={{ marginBottom: 8 }}>{t('athlete.lastSession')}</div>
              )}
              <div className="card" style={{ background: 'var(--brand)', color: '#fff', border: 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span className="q" style={{ fontWeight: 700, fontSize: 16 }}>⚽ {player.teams?.name}</span>
                  <span style={{ fontSize: 12, opacity: .9 }}>{fmt(session.date, lang)}</span>
                </div>
                <div style={{ fontSize: 13, opacity: .95 }}>{t('home.theme')} : {session.theme}{attendance === 'present' && ` · ${t('home.present')}`}{attendance === 'late' && ` · ${t('home.late')}`}{attendance === 'absent' && ` · ${t('home.absent')}`}</div>
              </div>
              <div className="card">
                <div className="label" style={{ marginBottom: 12 }}>{t('home.program')}</div>
                {(session.session_axes || []).map((a, i) => (
                  <div key={i} style={{ display: 'flex', gap: 11, marginBottom: 11 }}>
                    <div style={{ fontSize: 15 }}>{AXIS_EMOJI[a.axis] || ''}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{t(`axis.${a.axis}`)}</div>
                      <div style={{ fontSize: 12, color: '#57534A', lineHeight: 1.4 }}>{a.comment}</div>
                    </div>
                  </div>
                ))}
              </div>
              {/* Vue parent seulement : chez l'athlète, « Ton carnet » plus bas dit déjà tout. */}
              {!isAthlete && skills.length > 0 && (
                <div className="card" style={{ background: 'var(--peach)', border: 'none' }}>
                  <div className="label" style={{ color: 'var(--brand-dark)' }}>{t('home.skillValidated')}</div>
                  <div className="q" style={{ fontSize: 15, fontWeight: 700, color: '#5F2A1C', marginTop: 4 }}>{skills.map((s) => s.label).join(', ')} ✓</div>
                </div>
              )}
              {defi && (
                <div className="card" style={{ background: 'var(--ink)', color: '#fff', border: 'none' }}>
                  <div className="q" style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{t('home.weekChallenge')}</div>
                  <div className="q" style={{ fontSize: 15, fontWeight: 700, color: '#F0B8A8', marginBottom: 8 }}>🎯 {defi.name}</div>
                  <div style={{ fontSize: 13, color: '#E5E2DB', lineHeight: 1.5 }}>{defi.home_exercise} 💡 {defi.tip}</div>
                </div>
              )}
              {(mot || objectif) && (
                <div className="card">
                  {mot && <div style={{ fontSize: 13, lineHeight: 1.5, color: '#3D3A33' }}>« {mot.body} »</div>}
                  {objectif && <div className="pill" style={{ marginTop: 10 }}>🎯 {objectif.body}</div>}
                </div>
              )}
            </>
          )}

          {/* Carnet complet de l'athlète : les 3 états, avec barre de progression */}
          {isAthlete && (
            <>
              <div className="label" style={{ margin: '18px 0 8px' }}>{t('athlete.notebook')}</div>
              <div className="card">
                {allSkills.length === 0 && (
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>{t('athlete.noSkills')}</p>
                )}
                {SKILL_STATES.map(({ status, key, pct, fill }) => {
                  const group = allSkills.filter((s) => s.status === status);
                  if (group.length === 0) return null;
                  return (
                    <div key={status} style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.6px', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 7 }}>
                        {t(key)}
                      </div>
                      {group.map((s, i) => (
                        <div key={i} style={{ marginBottom: 9 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#3D3A33', marginBottom: 4 }}>
                            {AXIS_EMOJI[s.axis] ? `${AXIS_EMOJI[s.axis]} ` : ''}{s.label}
                          </div>
                          <div style={{ height: 7, borderRadius: 4, background: '#F1E9E1', overflow: 'hidden' }}>
                            <div style={{ width: `${pct}%`, height: '100%', borderRadius: 4, background: fill }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}

      {/* ---- Vue Staff (coach / dirigeant) : tableau de bord ---- */}
      {staff && (
        <>
          {player && <div style={{ borderTop: '1px solid var(--border)', margin: '20px 0 4px' }} />}

          {/* 1. Identité */}
          <div style={{ marginBottom: 4, color: 'var(--muted)', fontSize: 13, fontWeight: 600 }}>
            {t('home.space')} {t(`role.${staff.role}`)}
            {staff.clubs?.name ? ` · ${staff.clubs.name}` : ''}
          </div>
          <h1 className="q" style={{ fontSize: 22, letterSpacing: '-0.4px', margin: '0 0 16px', wordBreak: 'break-word' }}>
            {staffName || t('coach.fallbackName')}
          </h1>

          {/* 2. Séance du jour */}
          <div className="label" style={{ marginBottom: 8 }}>{t('coach.sessionOfDay')}</div>
          {staffSession ? (
            <div className="card" style={{ background: '#E9F1EA', border: 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
                <span className="q" style={{ fontWeight: 700, fontSize: 16, color: '#2E5A43' }}>
                  {staffSession.teams?.name}
                </span>
                <span style={{ fontSize: 12, color: '#4F7A63', whiteSpace: 'nowrap' }}>{fmt(staffSession.date, lang)}</span>
              </div>
              {staffSession.theme && (
                <div style={{ fontSize: 13, color: '#3E6B54', lineHeight: 1.5 }}>{t('home.theme')} : {staffSession.theme}</div>
              )}
              <div style={{ display: 'inline-block', marginTop: 10, padding: '5px 11px', borderRadius: 999,
                background: '#fff', color: '#2E5A43', fontSize: 12, fontWeight: 700 }}>
                ✓ {t('coach.presentOf', { n: staffSession.presents, total: staffSession.total })}
              </div>
              <button className="btn" style={{ marginTop: 12, marginBottom: 0 }} onClick={() => router.push('/seance')}>
                {t('coach.openSession')}
              </button>
            </div>
          ) : (
            <div className="card">
              <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>{t('coach.noSessionYet')}</p>
              <button className="btn" style={{ marginBottom: 0 }} onClick={() => router.push('/seance')}>{t('home.createSession')}</button>
            </div>
          )}

          {/* Code d'invitation du club (dirigeant) */}
          {staff.role === 'admin' && staff.clubs?.join_code && (
            <div className="card" style={{ background: 'var(--peach)', border: 'none' }}>
              <div className="label" style={{ color: 'var(--brand-dark)' }}>{t('home.inviteCode')}</div>
              <div className="q" style={{ fontSize: 26, fontWeight: 800, letterSpacing: 3, color: '#5F2A1C', marginTop: 4 }}>
                {staff.clubs.join_code}
              </div>
              <div style={{ fontSize: 12, color: '#7A4030', marginTop: 6 }}>
                {t('home.inviteHint')}
              </div>
            </div>
          )}

          {/* 3. Mes groupes */}
          <div className="label" style={{ margin: '18px 0 8px' }}>{t('coach.myGroups')}</div>
          {staffTeams.length === 0 ? (
            <div className="card"><p style={{ margin: 0, color: 'var(--muted)', fontSize: 13 }}>{t('club.noTeam')}</p></div>
          ) : (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {staffTeams.map((tm, i) => (
                <button key={tm.id} type="button"
                  onClick={() => router.push(staff.role === 'admin' ? '/club' : '/seance')}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 11, padding: '12px 14px',
                    background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                    borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}>
                  <span style={{ width: 34, height: 34, flex: '0 0 34px', borderRadius: 11, background: 'var(--peach)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>
                    {tm.sports?.icon || '🏅'}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontWeight: 700, fontSize: 13.5, color: 'var(--ink)' }}>{tm.name}</span>
                    <span style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)', marginTop: 1 }}>
                      {[tm.clubs?.name, tm.category, sportName(tm.sports)].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--brand-dark)', whiteSpace: 'nowrap' }}>
                    {memberLabel(tm.memberCount || 0)}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* 4. Accès rapide */}
          <div className="label" style={{ margin: '18px 0 8px' }}>{t('coach.quickAccess')}</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <button className="btn" style={{ marginBottom: 0 }} onClick={() => router.push('/seance')}>{t('coach.newSession')}</button>
            <button className="btn ghost" style={{ marginBottom: 0 }} onClick={() => router.push('/evenements')}>{t('coach.newEvent')}</button>
          </div>
          {staff.role === 'admin' && (
            <button className="btn ghost" style={{ marginBottom: 10 }} onClick={() => router.push('/club')}>{t('home.manageClub')}</button>
          )}
        </>
      )}

      {isSA && (
        <div style={{ marginTop: 22 }}>
          <button className="btn" style={{ background: '#1F1C17' }} onClick={() => router.push('/superadmin')}>{t('home.superadmin')}</button>
        </div>
      )}

      {/* ---- Vue Parent/Athlète rattaché à un club mais sans enfant/fiche encore ---- */}
      {!player && !staff && (
        <div className="card">
          <h1 className="q" style={{ fontSize: 20, margin: '0 0 6px' }}>{t('home.welcome')}</h1>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 0 }}>
            {t('home.welcomeHint')}
          </p>
        </div>
      )}

      <BottomNav role={navRole} />
    </div>
  );
}

function fmt(d, lang) {
  try { return new Date(d).toLocaleDateString(lang === 'en' ? 'en-GB' : 'fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }); }
  catch { return d; }
}
