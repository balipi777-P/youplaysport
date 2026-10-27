'use client';

import PilotBanner from './components/PilotBanner';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../lib/supabaseClient';
import { loadMyChildren, pickChild, setStoredChildId } from '../lib/children';
import { getStored, KEY_CLUB, fetchMySpaces, validStoredSpace } from '../lib/spaces';
import { useT, LangToggle } from '../lib/i18n';
import BottomNav, { BOTTOM_NAV_HEIGHT } from './components/BottomNav';
import ClubAvatar from './components/ClubAvatar';
import { NAME_EVENT, fetchMyName } from '../lib/userName';
import ParentJournal from './components/ParentJournal';
import { withNotes } from '../lib/eventNotes';
import AthleteToday from './components/AthleteToday';
import CoachGroups from './components/CoachGroups';
import PendingLinks from './components/PendingLinks';
import Icon from './components/Icon';
import { useClubUnread } from '../lib/clubUnread';

/** Date du jour au format ISO, pour comparer à sessions.date. */
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function Home() {
  const router = useRouter();
  const { t, lang } = useT();
  const clubUnread = useClubUnread();
  const [ready, setReady] = useState(false);
  const [memberships, setMemberships] = useState([]);
  const [children, setChildren] = useState([]);
  const [player, setPlayer] = useState(null);
  const [session, setSession] = useState(null);
  const [attendance, setAttendance] = useState(null);
  const [attendanceAt, setAttendanceAt] = useState(null);
  const [streak, setStreak] = useState(0);
  const [skills, setSkills] = useState([]);
  const [spacesData, setSpacesData] = useState(null);
  const [space, setSpace] = useState(''); // espace courant ('' = inconnu : ancien comportement)
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
  const [staffEvents, setStaffEvents] = useState([]);
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
      .select('id, date, start_time, end_time, theme, published_at, created_at, session_axes(axis, comment), session_challenge(name, home_exercise, competence, tip), messages(type, body, created_at)')
      .eq('team_id', p.team_id).not('published_at', 'is', null)
      .order('published_at', { ascending: false }).order('created_at', { ascending: false }).limit(20);
    const byRecent = (a, b) => (Date.parse(b.published_at) || 0) - (Date.parse(a.published_at) || 0)
      || (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0);
    const s = (sessions || []).slice().sort(byRecent)[0];
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
      const { data: evs } = await withNotes((wn) => supabase
        .from('events').select(`id, type, opponent, place, datetime, rsvp_deadline${wn ? ', notes' : ''}`)
        .eq('team_id', p.team_id)
        .gte('datetime', new Date().toISOString())
        .order('datetime').limit(1));
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
    const { data: cs } = await withNotes((wn) => supabase.from('event_convocations')
      .select(`id, response, responded_at, events(id, type, opponent, place, datetime, rsvp_deadline${wn ? ', notes' : ''})`)
      .eq('player_id', p.id));
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
    const TEAM_COLS = 'id, name, category, club_id, sport_id, clubs(name, logo_url, accent_color), sports(name_fr, name_en, icon)';
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

    /* Prochain événement (ou en cours : commencé depuis moins de 3 h) de chaque
       groupe. La RLS d'events limite déjà aux équipes que le staff peut lire. */
    if (ids.length) {
      const { data: evs } = await supabase.from('events')
        .select('id, team_id, type, opponent, place, datetime')
        .in('team_id', ids)
        .gte('datetime', new Date(Date.now() - 3 * 3600 * 1000).toISOString())
        .order('datetime').limit(200);
      const seen = new Set();
      setStaffEvents((evs || []).filter((e) => !seen.has(e.team_id) && seen.add(e.team_id))
        .map((e) => ({ ...e, teamName: list.find((tm) => tm.id === e.team_id)?.name || '' })));
    } else setStaffEvents([]);

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
      .from('memberships').select('role, club_id, clubs(name, join_code, logo_url, accent_color)');
    setMemberships(mem || []);
    if (uid && (mem || []).some((m) => m.role === 'admin' || m.role === 'coach')) {
      await loadStaffData(mem || [], uid);
    }
    /* Espace courant (my_spaces). Sans lui, on retombe sur l'ancien comportement. */
    const sd = await fetchMySpaces();
    setSpacesData(sd);
    const sp = sd ? validStoredSpace(sd) : '';
    setSpace(sp);
    const ownIds = (own || []).map((r) => r.id);
    const all = await loadMyChildren();
    const kids = sp === 'athlete' ? all.filter((c) => ownIds.includes(c.id))
      : sp === 'parent' ? all.filter((c) => !ownIds.includes(c.id))
      : all;
    setChildren(kids);
    const chosen = (sp === 'admin' || sp === 'coach') ? null : pickChild(kids);
    await loadChildData(chosen);
    return { mem: mem || [], hasChild: all.length > 0, spaces: sd, space: sp };
  }, [loadChildData, loadStaffData]);

  /* Le nom saisi dans l'encart « Comment t'appelles-tu ? » apparaît sans recharger. */
  useEffect(() => {
    const h = () => { fetchMyName().then((r) => setUserName(r.name)).catch(() => {}); };
    window.addEventListener(NAME_EVENT, h);
    return () => window.removeEventListener(NAME_EVENT, h);
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) { router.replace('/login'); return; }
      const res = await load();
      if (res.mem.length === 0 && !res.hasChild) { router.replace('/onboarding'); return; }
      if (res.spaces && !res.space) { router.replace('/choisir-espace'); return; }
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

  /* Réponse du parent depuis le journal : même RPC que l'agenda (contrôle du
     lien parent côté base), puis rechargement de la convocation affichée. */
  const [parentRsvpBusy, setParentRsvpBusy] = useState(false);
  const [parentRsvpErr, setParentRsvpErr] = useState('');
  async function respondParent(eventId, answer) {
    if (!player || !eventId || parentRsvpBusy) return;
    setParentRsvpBusy(true); setParentRsvpErr('');
    try {
      const { error } = await supabase.schema('yps').rpc('rsvp', {
        p_event: eventId, p_player: player.id, p_response: answer,
      });
      if (error) throw error;
      await loadUpcoming(player, false);
    } catch (e) {
      console.error('[rsvp]', e);
      const m = String(e?.message || '');
      const code = ['not_authorized', 'not_convoked', 'event_not_found'].find((c) => m.includes(c));
      setParentRsvpErr(code ? t(`rsvp.err.${code}`) : t('rsvp.err.other'));
    } finally { setParentRsvpBusy(false); }
  }

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

  const wantStaff = !space || space === 'admin' || space === 'coach';
  const curClub = getStored(KEY_CLUB);
  const staff = !wantStaff ? undefined
    : (space === 'admin'
      ? memberships.find((m) => m.role === 'admin' && m.club_id === curClub) || memberships.find((m) => m.role === 'admin')
      : memberships.find((m) => m.role === 'admin' || m.role === 'coach'));

  /* L'utilisateur consulte sa propre fiche : accueil au « tu ». */
  const isAthlete = !!player && myPlayerIds.includes(player.id);

  /* Club en tête de page, et ligne de réassurance « rôle · club ». */
  const playerClub = player?.teams?.clubs || null;
  const headClub = staff ? staff.clubs : playerClub;
  const roleKey = staff ? (staff.role === 'admin' ? 'me.adminRole' : 'space.coach')
    : (isAthlete ? 'space.athlete' : 'space.parent');
  const roleLine = [t(roleKey), headClub?.name].filter(Boolean).join(' · ');

  /* Compétences validées pendant la séance affichée, et non tout le carnet. */
  const sessionSkills = session ? skills.filter((s) => s.session_id === session.id) : [];

  /* Clubs distincts parmi les enfants rattachés au compte. */
  const clubCount = new Set(children.map((c) => c.teams?.clubs?.name).filter(Boolean)).size;

  /* Onglets de la barre basse : ils suivent la vue réellement affichée, pas le rôle
     le plus élevé. Un compte multi-rôles (admin + parent) voit son journal, donc la
     nav parent ; l'accès staff reste les boutons de l'Espace Dirigeant plus bas. */
  const navRole = space || (player ? (isAthlete ? 'athlete' : 'parent') : (staff ? 'coach' : 'parent'));

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
  /* « Mes groupes » liste toutes les équipes du coach : l'équipe mémorisée par le
     sélecteur d'espace ne doit pas masquer les autres. Seul le dirigeant est
     borné au club choisi. */
  const scopedTeams = space === 'admin' && staffTeams.some((tm) => tm.club_id === curClub)
      ? staffTeams.filter((tm) => tm.club_id === curClub)
      : staffTeams;
  const coachTeams = scopedTeams.map((tm) => ({
    ...tm,
    sportName: sportName(tm.sports),
    days: (tm.weekdays || []).map(weekdayName).join(', '),
  }));

  /* Un coach qui n'encadre qu'un club n'a pas besoin de le lire à chaque ligne. */
  const manyClubs = new Set(staffTeams.map((tm) => tm.club_id)).size > 1;

  /* Séance pré-remplie : l'écran Séance sélectionne l'équipe passée en paramètre. */
  const openSession = (teamId, hash = '') =>
    router.push(`/seance${teamId ? `?team=${teamId}` : ''}${hash}`);

  const welcomeClubs = (() => {
    const pc = (spacesData?.parent_clubs || []).filter((c) => c && c.name);
    if (pc.length) return pc;
    const seen = new Set();
    return (spacesData?.children || []).filter((c) => c?.club_name && !seen.has(c.club_name) && seen.add(c.club_name))
      .map((c) => ({ id: c.club_id, name: c.club_name, logo_url: c.logo_url }));
  })();

  return (
    <div className="wrap" style={{ paddingBottom: BOTTOM_NAV_HEIGHT + 24 }}>
      <PilotBanner compact style={{ marginTop: 4 }} />
      {!(player && !isAthlete) && (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        {headClub ? (
          /* Le club en évidence ; YouPlaySport reste en filigrane. */
          <div className="brand" style={{ minWidth: 0 }}>
            <ClubAvatar name={headClub.name} logoUrl={headClub.logo_url} color={headClub.accent_color || 'var(--brand)'}
              size={40} radius={13} fontSize={14} />
            <div style={{ minWidth: 0 }}>
              <div className="q" style={{ fontWeight: 700, fontSize: 16, lineHeight: 1.2, overflow: 'hidden',
                textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{headClub.name}</div>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--muted)', opacity: .8, letterSpacing: '.2px' }}>
                YouPlaySport
              </div>
            </div>
          </div>
        ) : (
          <div className="brand">
            <div className="logo">Y</div>
            <div className="q" style={{ fontWeight: 700, fontSize: 17 }}>
              You<span style={{ color: 'var(--brand)' }}>Play</span>Sport
            </div>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <LangToggle />
          <a href="#" onClick={(e) => { e.preventDefault(); logout(); }} style={{ fontSize: 13, fontWeight: 700 }}>{t('common.logout')}</a>
        </div>
      </div>
      )}

      {err && <div className="error">{err}</div>}

      {/* ---- Vue Parent : la journée sportive de l'enfant sélectionné ---- */}
      {player && !isAthlete && (
        <ParentJournal
          todayLabel={todayLabel}
          userName={userName}
          headClub={headClub}
          onProfile={() => router.push('/profil')}
          onLogout={logout}
          kids={children}
          player={player}
          onRespond={respondParent} respondBusy={parentRsvpBusy} respondErr={parentRsvpErr}
          clubCount={clubCount}
          session={session}
          attendance={attendance}
          attendanceAt={attendanceAt}
          sessionSkills={sessionSkills}
          streak={streak}
          nextEvent={nextEvent}
          convocation={convocation}
          onSwitchChild={switchChild}
          onAdd={() => router.push('/ajouter')}
          onCarnet={() => router.push('/carnet')}
          onAgenda={() => router.push('/agenda')}
          clubUnread={clubUnread}
          onClub={() => router.push('/messages')}
          onReadReply={(id) => router.push(`/messages?r=${id}`)}
        />
      )}

      {/* ---- Vue Athlète : sa propre journée ---- */}
      {player && isAthlete && (
        <AthleteToday
          todayLabel={todayLabel}
          userName={userName} roleLine={roleLine}
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
          {clubUnread.count > 0 && clubUnread.latest && (
            <div className="card" role="status" style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--peach)', border: 'none' }}>
              <Icon name="chat" size={18} />
              <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 700, overflowWrap: 'anywhere' }}>
                {t('msgs.card', { subject: clubUnread.latest.subject || '' })}
              </span>
              <button type="button" className="btn" onClick={() => router.push(`/messages?r=${clubUnread.latest.id}`)}
                style={{ width: 'auto', minHeight: 44, padding: '9px 16px', fontSize: 13, marginBottom: 0 }}>
                {t('msgs.read')}
              </button>
            </div>
          )}
          {player && <div style={{ borderTop: '1px solid var(--border)', margin: '20px 0 4px' }} />}
          <PendingLinks />
          <CoachGroups
            todayLabel={todayLabel}
            coachName={userName} roleLine={roleLine}
            todaySession={staffSession}
            nextEvent={coachTeams.length ? staffEvents.find((e) => coachTeams.some((tm) => tm.id === e.team_id)) || null : null}
            onOpenEvent={(e) => router.push(`/evenements?team=${e.team_id}&event=${e.id}`)}
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

      {/* ---- Vue Parent/Athlète rattaché à un club mais sans enfant/fiche encore ---- */}
      {!player && !staff && (
        <div className="card">
          {welcomeClubs.map((c, i) => (
            <div key={c.id || i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <ClubAvatar name={c.name} logoUrl={c.logo_url} size={40} />
              <span className="q" style={{ fontWeight: 800, fontSize: 15, minWidth: 0 }}>{c.name}</span>
            </div>
          ))}
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
