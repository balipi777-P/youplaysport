'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../lib/supabaseClient';
import { loadMyChildren, pickChild, setStoredChildId } from '../lib/children';
import { useT, LangToggle } from '../lib/i18n';
import BottomNav, { BOTTOM_NAV_HEIGHT } from './components/BottomNav';
import ParentJournal from './components/ParentJournal';
import AthleteToday from './components/AthleteToday';
import CoachGroups from './components/CoachGroups';

/** Date du jour au format ISO, pour comparer à sessions.date. */
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function Home() {
  const router = useRouter();
  const { t, lang } = useT();
  const [ready, setReady] = useState(false);
  const [memberships, setMemberships] = useState([]);
  const [children, setChildren] = useState([]);
  const [player, setPlayer] = useState(null);
  const [session, setSession] = useState(null);
  const [attendance, setAttendance] = useState(null);
  const [attendanceAt, setAttendanceAt] = useState(null);
  const [streak, setStreak] = useState(0);
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
  /* Propres à l'onglet Aujourd'hui de l'athlète : la séance du jour, toutes ses
     convocations à venir, son historique de pointage et les bornes de sa saison. */
  const [todaySession, setTodaySession] = useState(null);
  const [convocations, setConvocations] = useState([]);
  const [history, setHistory] = useState([]);
  const [season, setSeason] = useState(null);
  /* Tableau de bord staff : équipes encadrées, dernière séance publiée, identité. */
  const [staffTeams, setStaffTeams] = useState([]);
  const [staffSession, setStaffSession] = useState(null);
  /* Nom de l'utilisateur connecté : titre de l'espace staff et sous-titre du journal. */
  const [userName, setUserName] = useState('');

  const loadChildData = useCallback(async (p) => {
    setPlayer(p || null);
    if (!p) {
      setSession(null); setSkills([]); setAttendance(null); setAttendanceAt(null); setStreak(0);
      return;
    }
    const { data: sessions } = await supabase
      .from('sessions')
      .select('id, date, start_time, end_time, theme, session_axes(axis, comment), session_challenge(name, home_exercise, competence, tip), messages(type, body, created_at)')
      .eq('team_id', p.team_id).not('published_at', 'is', null)
      .order('date', { ascending: false }).limit(1);
    const s = sessions && sessions[0];
    setSession(s || null);
    if (s) {
      const { data: att } = await supabase.from('attendance').select('status, timestamped_at')
        .eq('session_id', s.id).eq('player_id', p.id).limit(1);
      setAttendance(att && att[0] ? att[0].status : null);
      setAttendanceAt(att && att[0] ? att[0].timestamped_at : null);
    } else { setAttendance(null); setAttendanceAt(null); }
    const { data: sk } = await supabase.from('skills').select('label, status, session_id, validated_at')
      .eq('player_id', p.id).eq('status', 'validee');
    setSkills(sk || []);

    /* Série de présences : on remonte l'historique pointé, de la séance la plus
       récente vers la plus ancienne, et on s'arrête au premier non-présent. */
    const { data: hist } = await supabase.from('attendance')
      .select('status, sessions(date, published_at)').eq('player_id', p.id);
    const past = (hist || []).filter((r) => r.sessions?.published_at)
      .sort((a, b) => (a.sessions.date < b.sessions.date ? 1 : -1));
    let run = 0;
    for (const r of past) { if (r.status === 'present') run += 1; else break; }
    setStreak(run);
    /* Même historique, remis dans l'ordre du calendrier : c'est la série de l'athlète. */
    setHistory([...past].reverse().map((r) => ({ status: r.status, date: r.sessions.date })));
  }, []);

  /* Prochaine échéance de l'équipe de la fiche affichée et convocation associée.
     Le journal du parent l'annonce aussi, d'où le chargement dans les deux vues ;
     le carnet complet (les 3 états) ne concerne, lui, que la vue athlète. */
  const loadUpcoming = useCallback(async (p, withNotebook) => {
    let ev = null;
    if (p.team_id) {
      const { data: evs } = await supabase
        .from('events').select('id, type, opponent, place, datetime, rsvp_deadline')
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
    if (!withNotebook) {
      setAllSkills([]); setTodaySession(null); setConvocations([]); setSeason(null);
      return;
    }
    const { data: sk } = await supabase.from('skills')
      .select('label, status, axis, validated_at').eq('player_id', p.id);
    setAllSkills(sk || []);

    /* Séance du jour. Elle est lisible avant publication — la RLS de sessions
       n'ouvre que sur l'équipe — car « ce soir » se joue avant le compte rendu. */
    let today = null;
    if (p.team_id) {
      const { data: ts } = await supabase.from('sessions')
        .select('id, date, start_time, end_time, theme, published_at')
        .eq('team_id', p.team_id).eq('date', todayISO()).limit(1);
      today = (ts && ts[0]) || null;
    }
    setTodaySession(today);

    /* Toutes les convocations à venir, et pas seulement la prochaine. */
    const { data: cs } = await supabase.from('event_convocations')
      .select('id, response, responded_at, events(id, type, opponent, place, datetime, rsvp_deadline)')
      .eq('player_id', p.id);
    setConvocations((cs || [])
      .filter((c) => c.events?.datetime && new Date(c.events.datetime) >= new Date())
      .sort((a, b) => new Date(a.events.datetime) - new Date(b.events.datetime)));

    /* Bornes de la saison de l'équipe : sans elles, rien n'affirme « cette saison ». */
    const { data: pd } = await supabase.from('players')
      .select('teams(season_id, seasons(start_date, end_date))').eq('id', p.id).maybeSingle();
    setSeason(pd?.teams?.seasons || null);
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

    /* Jours d'entraînement. teams ne porte aucun créneau : on les déduit des
       séances réellement tenues, et seulement quand un jour revient — une séance
       isolée ne fait pas un créneau hebdomadaire. On ne garde que les numéros de
       jour, les noms se traduisent au rendu. */
    if (ids.length) {
      const { data: all } = await supabase.from('sessions').select('team_id, date').in('team_id', ids);
      const per = {};
      for (const s of all || []) {
        const d = new Date(`${s.date}T12:00:00`);
        if (Number.isNaN(d.getTime())) continue;
        per[s.team_id] = per[s.team_id] || {};
        per[s.team_id][d.getDay()] = (per[s.team_id][d.getDay()] || 0) + 1;
      }
      for (const tm of list) {
        tm.weekdays = Object.entries(per[tm.id] || {})
          .filter(([, n]) => n >= 2).map(([d]) => Number(d))
          .sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
      }
    }
    setStaffTeams(list);

    /* Séance du jour, publiée ou non : le coach la prépare avant d'en publier
       le compte rendu. La RLS de sessions n'ouvre que sur ses équipes. */
    let se = null;
    if (ids.length) {
      const { data: ss } = await supabase.from('sessions')
        .select('id, team_id, date, start_time, end_time, theme, teams(name, category)')
        .in('team_id', ids).eq('date', todayISO()).order('start_time').limit(1);
      se = (ss && ss[0]) || null;
    }
    if (se) {
      const { count: marked } = await supabase.from('attendance')
        .select('id', { count: 'exact', head: true }).eq('session_id', se.id);
      const { count: presents } = await supabase.from('attendance')
        .select('id', { count: 'exact', head: true }).eq('session_id', se.id).eq('status', 'present');
      const team = list.find((tm) => tm.id === se.team_id);
      setStaffSession({
        ...se, marked: (marked || 0) > 0, presents: presents || 0,
        roster: team?.memberCount || marked || 0,
      });
    } else setStaffSession(null);
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
    /* Uniquement full_name : l'email ne doit jamais servir de titre. Vide ici,
       le rendu retombe sur un libellé i18n ou masque la mention. */
    const { data: au } = uid
      ? await supabase.from('app_users').select('full_name').eq('id', uid).maybeSingle()
      : { data: null };
    setUserName((au?.full_name || '').trim());
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

  /* Échéance à venir de la fiche affichée. Le carnet complet n'est chargé que si
     cette fiche est celle de l'utilisateur lui-même (vue athlète). */
  useEffect(() => {
    if (!player) {
      setNextEvent(null); setConvocation(null); setAllSkills([]);
      setTodaySession(null); setConvocations([]); setSeason(null);
      return;
    }
    loadUpcoming(player, myPlayerIds.includes(player.id));
  }, [player, myPlayerIds, loadUpcoming]);

  /* Réponse à une convocation. L'enum rsvp_response ne connaît que 'present' et
     'absent', et la RLS n'autorise cette mise à jour qu'au licencié lui-même. */
  async function respond(eventId, answer) {
    if (!player || !eventId || rsvpBusy) return;
    setRsvpBusy(true); setErr('');
    const { error } = await supabase.from('event_convocations')
      .update({ response: answer, responded_at: new Date().toISOString() })
      .eq('event_id', eventId).eq('player_id', player.id);
    if (error) setErr(error.message);
    else await loadUpcoming(player, true);
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

  /* L'utilisateur consulte sa propre fiche : accueil au « tu ». */
  const isAthlete = !!player && myPlayerIds.includes(player.id);

  /* Compétences validées pendant la séance affichée, et non tout le carnet. */
  const sessionSkills = session ? skills.filter((s) => s.session_id === session.id) : [];

  /* Clubs distincts parmi les enfants rattachés au compte. */
  const clubCount = new Set(children.map((c) => c.teams?.clubs?.name).filter(Boolean)).size;

  /* Onglets de la barre basse : ils suivent la vue réellement affichée, pas le rôle
     le plus élevé. Un compte multi-rôles (admin + parent) voit son journal, donc la
     nav parent ; l'accès staff reste les boutons de l'Espace Dirigeant plus bas. */
  const navRole = player ? (isAthlete ? 'athlete' : 'parent') : (staff ? 'coach' : 'parent');

  /* Date du jour : « MERCREDI 10 SEPTEMBRE 2026 » / « WEDNESDAY 10 SEPTEMBER 2026 ». */
  const todayLabel = new Date()
    .toLocaleDateString(lang === 'en' ? 'en-GB' : 'fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    .toUpperCase();

  /* Nom du sport dans la langue active. */
  const sportName = (sp) => (lang === 'en' ? sp?.name_en || sp?.name_fr : sp?.name_fr) || '';

  /* Libellés dépendants de la langue : calculés au rendu, pour qu'un changement
     de langue ne relance aucune requête. */
  const weekdayName = (d) => new Date(Date.UTC(2024, 0, 7 + d))
    .toLocaleDateString(lang === 'en' ? 'en-GB' : 'fr-FR', { weekday: 'long', timeZone: 'UTC' });
  const coachTeams = staffTeams.map((tm) => ({
    ...tm,
    sportName: sportName(tm.sports),
    days: (tm.weekdays || []).map(weekdayName).join(', '),
  }));

  /* Un coach qui n'encadre qu'un club n'a pas besoin de le lire à chaque ligne. */
  const manyClubs = new Set(staffTeams.map((tm) => tm.club_id)).size > 1;

  /* Séance pré-remplie : l'écran Séance sélectionne l'équipe passée en paramètre. */
  const openSession = (teamId, hash = '') =>
    router.push(`/seance${teamId ? `?team=${teamId}` : ''}${hash}`);

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

      {/* ---- Vue Parent : la journée sportive de l'enfant sélectionné ---- */}
      {player && !isAthlete && (
        <ParentJournal
          todayLabel={todayLabel}
          parentName={userName}
          kids={children}
          player={player}
          clubCount={clubCount}
          session={session}
          attendance={attendance}
          attendanceAt={attendanceAt}
          sessionSkills={sessionSkills}
          streak={streak}
          nextEvent={nextEvent}
          convocation={convocation}
          onSwitchChild={switchChild}
          onAlerts={() => router.push('/alertes')}
          onAdd={() => router.push('/ajouter')}
          onCarnet={() => router.push('/carnet')}
          onAgenda={() => router.push('/agenda')}
        />
      )}

      {/* ---- Vue Athlète : sa propre journée ---- */}
      {player && isAthlete && (
        <AthleteToday
          todayLabel={todayLabel}
          player={player}
          season={season}
          todaySession={todaySession}
          session={session}
          attendance={attendance}
          attendanceAt={attendanceAt}
          sessionSkills={sessionSkills}
          allSkills={allSkills}
          convocations={convocations}
          history={history}
          rsvpBusy={rsvpBusy}
          onRespond={respond}
        />
      )}

      {/* ---- Vue Coach / Dirigeant : ses groupes ---- */}
      {staff && (
        <>
          {player && <div style={{ borderTop: '1px solid var(--border)', margin: '20px 0 4px' }} />}
          <CoachGroups
            todayLabel={todayLabel}
            coachName={userName}
            todaySession={staffSession}
            teams={coachTeams}
            showClub={manyClubs}
            joinCode={staff.role === 'admin' ? staff.clubs?.join_code || null : null}
            onOpenSession={openSession}
            onNewSession={() => openSession('')}
            onNewEvent={() => router.push('/evenements')}
            onPresence={() => openSession(staffSession?.team_id || coachTeams[0]?.id || '', '#presences')}
            onSkills={() => openSession(staffSession?.team_id || coachTeams[0]?.id || '', '#competences')}
            onManageClub={staff.role === 'admin' ? () => router.push('/club') : null}
          />
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
