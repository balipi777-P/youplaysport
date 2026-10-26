'use client';

/**
 * Console du dirigeant de club : barre latérale fixe + zone de contenu, et une
 * barre repliable sous 900 px. Tout vient de la base et la RLS fait le tri —
 * un dirigeant ne lit que son club, jamais les autres.
 *
 * Trois éléments de la maquette n'ont aucune source lisible aujourd'hui, et
 * l'écran le dit plutôt que d'inventer :
 *  - le nom d'un coach : app_users n'est lisible que par son titulaire ;
 *  - « depuis {année} » pour un coach : coach_teams ne porte aucune date ;
 *  - le référentiel de compétences : skill_frameworks est vide et réservé en
 *    écriture à la plateforme.
 */

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';
import { useT } from '../../lib/i18n';
import { getStored, KEY_CLUB } from '../../lib/spaces';
import Icon from '../components/Icon';
import ClubAvatar from '../components/ClubAvatar';
import { PendingLinksList } from '../components/PendingLinks';
import { exportClubCsv } from '../../lib/exports';
import { useMyName, firstNameOf, initialsOfName } from '../../lib/userName';
import { BrandingEditor, ClubWelcome, MartialDiscipline, isMartialSport, isHex, darken } from '../components/ClubBranding';

/* Les 8 entrées de la barre latérale. Chacune ouvre une section réellement
   adossée à une table : rien ne mène à un écran vide sans explication. */
const NAV = [
  { key: 'teams', icon: 'groups' },
  { key: 'athletes', icon: 'user' },
  { key: 'coaches', icon: 'events' },
  { key: 'licences', icon: 'folder' },
  { key: 'seasons', icon: 'calendar' },
  { key: 'documents', icon: 'file' },
  { key: 'branding', icon: 'palette' },
  { key: 'support', icon: 'chat' },
];

/* Teintes de pastille par catégorie, reprises des cartes de groupe du coach
   pour que « U11 » ait la même couleur des deux côtés de l'app. */
const CATEGORY_TONES = [
  { bg: '#F3E3DC', ink: '#A0472F' },
  { bg: '#E4EDE4', ink: '#3E6B54' },
  { bg: '#E6EDF5', ink: '#2B4B6F' },
  { bg: '#F5E9D6', ink: '#8A5A18' },
  { bg: '#EDE6F2', ink: '#5B4270' },
];
function tone(label) {
  let h = 0;
  for (let i = 0; i < (label || '').length; i += 1) h = (h * 31 + label.charCodeAt(i)) % 9973;
  return CATEGORY_TONES[h % CATEGORY_TONES.length];
}

const GREEN = { bg: '#E9F1EA', ink: '#2E5A43', soft: '#3E6B54', line: '#DCE8D4' };

/** Nombre d'athlètes affichés dans une carte avant le bouton « Tout afficher ». */
const PREVIEW = 8;

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

/**
 * Colonnes attendues dans le CSV d'import. Les exemples documentent le format
 * du fichier — ce ne sont pas des licenciés du club, et rien n'est lu en base
 * pour les produire.
 */
const CSV_COLUMNS = [
  { col: 'nom', field: 'adm.lic.colLast', sample: 'Reynaud' },
  { col: 'prenom', field: 'adm.lic.colFirst', sample: 'Camille' },
  { col: 'date_naissance', field: 'adm.lic.colBirth', sample: '14/03/2016' },
  { col: 'email_parent', field: 'adm.lic.colParent', sample: 'h.reynaud@email.fr' },
  { col: 'groupe', field: 'adm.lic.colGroup', sample: 'U11 Football' },
];

/** Génère et télécharge le CSV d'exemple (UTF-8 avec BOM pour Excel), côté client. */
function downloadCsvTemplate() {
  const head = CSV_COLUMNS.map((c) => c.col).join(',');
  const rows = [
    CSV_COLUMNS.map((c) => c.sample).join(','),
    'Martin,Léa,02/09/2015,s.martin@email.fr,U11 Football',
    'Bernard,Hugo,21/06/2012,c.bernard@email.fr,U14 Basket',
  ];
  const blob = new Blob(['\ufeff' + [head, ...rows].join('\n') + '\n'], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'modele-import-licencies.csv';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Nombre de lignes de données d'un CSV : on retire l'en-tête et les lignes
 * vides. Purement local — le fichier n'est jamais envoyé, l'import n'est pas
 * encore câblé, mais le compteur du bouton reste un vrai compteur.
 */
function countCsvRows(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  return Math.max(0, lines.length - 1);
}

/** Jours pleins entre aujourd'hui et une date, jamais négatif. */
function daysUntil(iso) {
  const end = new Date(iso);
  if (Number.isNaN(end.getTime())) return null;
  const ms = end.setHours(23, 59, 59, 999) - Date.now();
  return Math.max(0, Math.ceil(ms / 86400000));
}

/** Borne une requête : au-delà de `ms`, elle échoue au lieu de laisser l'écran en attente. */
function withTimeout(promise, ms = 12000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

/** Jamais de message SQL / technique à l'écran : seuls les messages maison passent. */
function friendlyError(e, fallback) {
  const m = `${(e && e.message) || ''}`;
  const technical = !m || (e && e.code) || e?.details || e?.hint
    || /permission denied|function |relation |violates|syntax|jwt|row-level|schema|column|fetch|timeout|network|\b5\d\d\b|pgrst/i.test(m);
  return technical ? fallback : m;
}

export default function Club() {
  const router = useRouter();
  const { t, lang } = useT();
  const [ready, setReady] = useState(false);
  const [section, setSection] = useState('teams');
  const [menuOpen, setMenuOpen] = useState(false);
  const [welcomeSkipped, setWelcomeSkipped] = useState(false);
  const [club, setClub] = useState(null);
  const clubId = club?.id;
  const [sports, setSports] = useState([]);
  const [teams, setTeams] = useState([]);
  const [teamId, setTeamId] = useState('');
  const [heads, setHeads] = useState({});      // {teamId: {members, coaches[]}}
  const [open, setOpen] = useState({});        // {teamId: true} — cartes dépliées
  const [details, setDetails] = useState({});  // {teamId: {loading, athletes[]}}
  const [expanded, setExpanded] = useState({});// {teamId: true} — tableau non tronqué
  const [everyone, setEveryone] = useState(null); // section Athlètes
  const [frameworks, setFrameworks] = useState({}); // {sportId: {n, categories}}
  const [seasons, setSeasons] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [pendings, setPendings] = useState([]);
  const [linkBusy, setLinkBusy] = useState(''); // link_id en cours de décision
  const [csv, setCsv] = useState(null);   // {name, rows} du fichier déposé
  const [dragging, setDragging] = useState(false);
  const [memberCount, setMemberCount] = useState(0);
  const [coachCount, setCoachCount] = useState(0);
  const [copied, setCopied] = useState(false);
  const [csvNote, setCsvNote] = useState(false);
  const [exporting, setExporting] = useState('');
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);

  // Saisies
  const [teamName, setTeamName] = useState('');
  const [teamSport, setTeamSport] = useState('');
  const [teamDiscipline, setTeamDiscipline] = useState('');
  const myName = useMyName();
  const [pFirst, setPFirst] = useState('');
  const [pLast, setPLast] = useState('');
  const [parentEmail, setParentEmail] = useState({});     // {playerId: email}
  const [teamCoachEmail, setTeamCoachEmail] = useState({}); // {teamId: email}
  const [tkSubject, setTkSubject] = useState('');
  const [tkBody, setTkBody] = useState('');
  const [tkPriority, setTkPriority] = useState('normal');
  const [tkBusy, setTkBusy] = useState(false);
  const [pendCoaches, setPendCoaches] = useState([]); // coachs du club sans équipe
  const [delTeam, setDelTeam] = useState(null);    // {id, step: 1|2, typed}
  const [moveCoach, setMoveCoach] = useState(null);  // {uid, from, to}
  const [movePl, setMovePl] = useState(null);        // {id, from, to}
  const [pendTeam, setPendTeam] = useState({});       // {userId: teamId} choisi dans la liste

  const flash = (msg) => { setOk(msg); setErr(''); setTimeout(() => setOk(''), 3500); };

  /**
   * File des demandes de rattachement. Elle traverse la RLS par une fonction
   * security definer : celle-ci ne rend que les demandes des clubs que l'on
   * administre, et joint au passage le parent, que la RLS d'app_users
   * interdirait au dirigeant de lire directement.
   */
  const loadPendings = useCallback(async () => {
    const { data, error } = await supabase.schema('yps').rpc('pending_links_for_admin');
    if (error) { console.error('pending_links_for_admin', error); return; }
    setPendings(data || []);
  }, []);

  /** Coachs entrés avec le code du club mais sans équipe : ils n'ont pas encore d'espace. */
  const loadPendCoaches = useCallback(async (clubId) => {
    const { data, error } = await supabase.schema('yps').rpc('pending_coaches_for_admin', { p_club: clubId });
    if (error) { console.error('pending_coaches_for_admin', error); return; }
    setPendCoaches(data || []);
  }, []);

  /** Licenciés = count sur players ; coachs = distinct coach_user_id. */
  const loadStats = useCallback(async (clubId, teamRows) => {
    try {
      /* 'exact' : 'planned' n'est qu'une estimation des statistiques Postgres,
         fausse sur une petite table (affichait 2 pour 20 licenciés). */
      const { count, error } = await withTimeout(
        supabase.from('players').select('id', { count: 'exact', head: true }).eq('club_id', clubId));
      if (error) throw error;
      setMemberCount(count ?? 0);
    } catch (e) { console.error('loadStats players', e); setMemberCount(0); }
    const ids = (teamRows || []).map((tm) => tm.id);
    if (ids.length === 0) { setCoachCount(0); return; }
    try {
      const { data } = await withTimeout(supabase.from('coach_teams').select('coach_user_id').in('team_id', ids));
      setCoachCount(new Set((data || []).map((r) => r.coach_user_id)).size);
    } catch (e) { console.error('loadStats coaches', e); setCoachCount(0); }
  }, []);

  /**
   * En-têtes des cartes : effectif, coachs et jours d'entraînement, pour toutes
   * les équipes en trois requêtes groupées — l'en-tête reste complet même carte
   * repliée. teams ne porte aucun créneau : les jours se déduisent des séances
   * réellement tenues, et seulement quand un jour revient. Une séance isolée ne
   * fait pas un créneau hebdomadaire.
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
    const { data: ss } = await supabase.from('sessions').select('team_id, date').in('team_id', ids);
    const per = {};
    for (const s of ss || []) {
      const d = new Date(`${s.date}T12:00:00`);
      if (Number.isNaN(d.getTime())) continue;
      per[s.team_id] = per[s.team_id] || {};
      per[s.team_id][d.getDay()] = (per[s.team_id][d.getDay()] || 0) + 1;
    }
    const map = {};
    for (const id of ids) {
      map[id] = {
        members: 0,
        coaches: [],
        coachRows: [],
        weekdays: Object.entries(per[id] || {})
          .filter(([, n]) => n >= 2).map(([d]) => Number(d))
          .sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)),
      };
    }
    for (const p of pls || []) if (map[p.team_id]) map[p.team_id].members += 1;
    for (const r of cts || []) {
      if (!map[r.team_id]) continue;
      map[r.team_id].coaches.push(names[r.coach_user_id] || '');
      map[r.team_id].coachRows.push({ id: r.coach_user_id, name: names[r.coach_user_id] || '' });
    }
    setHeads(map);
  }, []);

  /**
   * Lignes « athlète » d'un ou plusieurs groupes : compte rattaché, statut et
   * présences. Une seule série de requêtes quel que soit le nombre de groupes.
   * Rien n'est traduit ici : la langue se joue au rendu, sinon un changement de
   * langue relancerait toutes ces requêtes.
   */
  const buildAthletesRaw = useCallback(async (teamIds) => {
    if (!clubId) return [];
    if (!teamIds.length) return [];
    const { data: pls } = await supabase.from('players')
      .select('id, first_name, last_name, team_id, user_id').in('team_id', teamIds).order('first_name');
    const roster = pls || [];
    const pids = roster.map((p) => p.id);
    if (!pids.length) return [];

    /* Rattachements parents + noms : app_users n'est pas lisible par le dirigeant,
       la fonction SECURITY DEFINER renvoie nom (ou email masqué) et statut, pour
       les seuls joueurs de son club. */
    const { data: lk, error: lkErr } = await supabase.schema('yps')
      .rpc('parents_for_admin', { p_club: clubId });
    if (lkErr) console.error('parents_for_admin', lkErr);
    const links = (lk || []).filter((l) => pids.includes(l.player_id));

    // Séances publiées de chaque équipe = dénominateur des présences.
    const { data: ss } = await supabase.from('sessions')
      .select('id, team_id').in('team_id', teamIds).not('published_at', 'is', null);
    const held = {};
    for (const s of ss || []) held[s.team_id] = (held[s.team_id] || 0) + 1;
    const sids = (ss || []).map((s) => s.id);

    const presents = {};
    if (sids.length) {
      const { data } = await supabase.from('attendance')
        .select('player_id').in('session_id', sids).in('player_id', pids).eq('status', 'present');
      for (const a of data || []) presents[a.player_id] = (presents[a.player_id] || 0) + 1;
    }

    return roster.map((p) => {
      /* Tous les rattachements sont affichés, refusés compris, avec leur statut ;
         seuls les non refusés comptent pour « Actif / À valider ». */
      const all = links.filter((l) => l.player_id === p.id);
      const mine = all.filter((l) => (l.status || 'active') !== 'rejected');
      /* « À valider » n'est plus une déduction : un rattachement demandé par un
         parent reste en attente jusqu'à ce que le club le valide. Un licencié
         n'est actif que si au moins un de ses liens l'est — ou s'il a son
         propre compte, qui ne passe par aucun rattachement. */
      const anyActive = mine.some((l) => (l.status || 'active') === 'active');
      return {
        id: p.id,
        teamId: p.team_id,
        name: `${p.first_name} ${p.last_name || ''}`.trim(),
        parents: all.map((l) => ({
          name: l.full_name || l.email_masked || '',
          status: l.status || 'active',
        })),
        ownAccount: Boolean(p.user_id),
        linked: anyActive || Boolean(p.user_id),
        presents: presents[p.id] || 0,
        total: held[p.team_id] || 0,
      };
    });
  }, [clubId]);

  /** Jamais bloquant : en cas d'erreur ou de lenteur, on rend une liste vide. */
  const buildAthletes = useCallback(async (teamIds) => {
    try { return await withTimeout(buildAthletesRaw(teamIds), 15000); }
    catch (e) { console.error('buildAthletes', e); return []; }
  }, [buildAthletesRaw]);

  const loadTeamDetail = useCallback(async (tid) => {
    setDetails((d) => ({ ...d, [tid]: { ...(d[tid] || {}), loading: true } }));
    const athletes = await buildAthletes([tid]);
    setDetails((d) => ({ ...d, [tid]: { loading: false, athletes } }));
  }, [buildAthletes]);

  /** Résumé du référentiel de chaque sport présent dans le club. */
  const loadFrameworks = useCallback(async (teamRows) => {
    const sportIds = [...new Set((teamRows || []).map((tm) => tm.sport_id).filter(Boolean))];
    if (!sportIds.length) { setFrameworks({}); return; }
    const { data } = await supabase.from('skill_frameworks').select('sport_id, category').in('sport_id', sportIds);
    const map = {};
    for (const id of sportIds) map[id] = { n: 0, categories: 0 };
    const cats = {};
    for (const row of data || []) {
      map[row.sport_id].n += 1;
      cats[row.sport_id] = cats[row.sport_id] || new Set();
      if (row.category) cats[row.sport_id].add(row.category);
    }
    for (const id of sportIds) map[id].categories = cats[id] ? cats[id].size : 0;
    setFrameworks(map);
  }, []);

  const loadTeams = useCallback(async (clubId, keep) => {
    const { data } = await supabase.from('teams')
      .select('id, name, category, sport_id, sports(name_fr, name_en, icon, accent_color)')
      .eq('club_id', clubId).order('name');
    const list = data || [];
    setTeams(list);
    setTeamId((cur) => {
      const next = keep || cur;
      if (next && list.some((tm) => tm.id === next)) return next;
      return list[0] ? list[0].id : '';
    });
    setEveryone(null);
    await loadStats(clubId, list);
    await loadHeads(list);
    await loadFrameworks(list);
  }, [loadStats, loadHeads, loadFrameworks]);

  useEffect(() => {
    (async () => {
      try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) { router.replace('/login'); return; }
      const { data: mem } = await supabase.from('memberships')
        .select('club_id, clubs(id, name, join_code, created_at, trial_ends_at, logo_url, accent_color, secondary_color, plan_key, status)')
        .eq('role', 'admin');
      /* Club courant choisi dans le sélecteur d'espace, sinon le premier. */
      const cur = (mem || []).find((m) => m.club_id === getStored(KEY_CLUB)) || (mem && mem[0]);
      const c = cur ? cur.clubs : null;
      setClub(c);
      const { data: sp } = await supabase.from('sports').select('id, name_fr, name_en, icon').order('name_fr');
      setSports(sp || []);
      if (sp && sp[0]) setTeamSport(sp[0].id);
      if (c) {
        await loadTeams(c.id);
        const [se, doc, tk] = await Promise.all([
          supabase.from('seasons').select('id, name, start_date, end_date').eq('club_id', c.id).order('start_date'),
          supabase.from('documents').select('id, name, url, team_id, created_at').eq('club_id', c.id).order('created_at', { ascending: false }),
          supabase.from('support_tickets').select('id, subject, status, priority, created_at').eq('club_id', c.id).order('created_at', { ascending: false }),
          loadPendings(),
        ]);
        await loadPendCoaches(c.id);
        setSeasons(se.data || []);
        setDocuments(doc.data || []);
        setTickets(tk.data || []);
      }
      } catch (e) { console.error('club init', e); } finally { setReady(true); }
    })();
  }, [router, loadTeams, loadPendings, loadPendCoaches]);

  /* La couleur principale du club devient l'accent de toute l'UI du club. */
  const accent = club && isHex(club.accent_color) ? club.accent_color : null;
  useEffect(() => {
    if (!accent) return undefined;
    const root = document.documentElement.style;
    root.setProperty('--brand', accent);
    root.setProperty('--brand-dark', darken(accent));
    return () => { root.removeProperty('--brand'); root.removeProperty('--brand-dark'); };
  }, [accent]);

  /* Menu mobile : Échap et passage en desktop le referment ; le scroll de la page
     n'est verrouillé que le temps où le tiroir est ouvert, et toujours rétabli. */
  useEffect(() => {
    if (!menuOpen) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') setMenuOpen(false); };
    const onResize = () => { if (window.innerWidth > 900) setMenuOpen(false); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
    };
  }, [menuOpen]);

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

  /* La section Licenciés travaille sur le groupe choisi dans son sélecteur : son
     contenu se charge même si la carte du groupe n'a jamais été dépliée. */
  useEffect(() => {
    if (section !== 'licences' || !teamId || details[teamId]) return;
    loadTeamDetail(teamId);
  }, [section, teamId, details, loadTeamDetail]);

  /* La section Athlètes agrège tous les groupes, chargée à sa première ouverture. */
  useEffect(() => {
    if (section !== 'athletes' || everyone !== null) return;
    if (teams.length === 0) { setEveryone([]); return; }
    (async () => setEveryone(await buildAthletes(teams.map((tm) => tm.id))))();
  }, [section, everyone, teams, buildAthletes]);

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
    } catch { /* presse-papiers indisponible */ }
  }

  async function logout() { await supabase.auth.signOut(); router.replace('/login'); }

  async function addTeam() {
    setErr(''); setBusy(true);
    try {
      /* Arts martiaux : la discipline précisée sert de nom si aucun nom n'est saisi ;
         sport_id reste celui du référentiel. */
      const chosen = sports.find((s) => s.id === teamSport);
      const discipline = isMartialSport(chosen) ? teamDiscipline.trim() : '';
      const name = teamName.trim() || discipline || (isMartialSport(chosen) ? sportName(chosen) : '');
      if (!name) throw new Error(t('club.errTeamName'));
      const { data, error } = await supabase.from('teams')
        .insert({ club_id: club.id, sport_id: teamSport, name }).select('id').single();
      if (error) throw error;
      setTeamName(''); setTeamDiscipline(''); flash(t('club.teamCreated'));
      await loadTeams(club.id, data.id);
    } catch (e) { setErr(friendlyError(e, t('club.errGeneric'))); } finally { setBusy(false); }
  }

  /** Les RPC de démo renvoient du jsonb ; not_authorized devient un message amical. */
  function demoError(e) {
    if (`${(e && e.message) || ''}`.includes('not_authorized')) return t('club.demoNotAuthorized');
    return friendlyError(e, t('club.errGeneric'));
  }

  async function refreshAfterDemo() {
    await loadTeams(club.id);
    await loadPendings();
    setDetails({});
    setEveryone(null);
  }

  async function seedDemo() {
    setErr(''); setBusy(true);
    try {
      const { data, error } = await withTimeout(
        supabase.schema('yps').rpc('seed_my_club_demo', { p_club: club.id }));
      if (error) throw error;
      if (data?.status === 'already') flash(t('club.demoAlready'));
      else flash(t('club.demoCreated', { teams: data?.teams ?? 0, players: data?.players ?? 0 }));
      await refreshAfterDemo();
    } catch (e) { setErr(demoError(e)); } finally { setBusy(false); }
  }

  async function clearDemo() {
    if (!window.confirm(t('club.demoClearConfirm'))) return;
    setErr(''); setBusy(true);
    try {
      const { data, error } = await withTimeout(
        supabase.schema('yps').rpc('clear_my_club_demo', { p_club: club.id }));
      if (error) throw error;
      flash(t('club.demoCleared', { teams: data?.teams ?? 0, players: data?.players ?? 0 }));
      await refreshAfterDemo();
    } catch (e) { setErr(demoError(e)); } finally { setBusy(false); }
  }

  async function addPlayer() {
    setErr(''); setBusy(true);
    try {
      if (!teamId) throw new Error(t('club.errTeamFirst'));
      if (!pFirst.trim()) throw new Error(t('club.errFirstName'));
      const { error } = await supabase.from('players')
        .insert({ club_id: club.id, team_id: teamId, first_name: pFirst.trim(), last_name: pLast.trim() || null });
      if (error) throw error;
      setPFirst(''); setPLast(''); flash(t('club.memberAdded'));
      await loadStats(club.id, teams);
      await loadHeads(teams);
      setEveryone(null);
      if (details[teamId]) await loadTeamDetail(teamId);
    } catch (e) { setErr(friendlyError(e, t('club.errGeneric'))); } finally { setBusy(false); }
  }

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
      await loadPendCoaches(club.id);
    } catch (e) { setErr(friendlyError(e, t('club.errGeneric'))); } finally { setBusy(false); }
  }

  /** Recharge ce que l'écran montre après un changement d'équipe, de coach ou de joueur. */
  async function refreshAll() {
    await loadStats(club.id, teams);
    await loadHeads(teams);
    await loadPendCoaches(club.id);
    setEveryone(null);
    for (const id of Object.keys(details)) await loadTeamDetail(id);
  }

  /**
   * Suppression d'une équipe. Les joueurs ne sont pas supprimés (players.team_id
   * est en ON DELETE SET NULL) : on le revérifie quand même après coup en
   * comparant l'effectif du club avant / après, et on le signale si ça diverge.
   */
  async function deleteTeam(tm) {
    if (!delTeam || delTeam.typed.trim() !== tm.name.trim()) return;
    setErr(''); setBusy(true);
    try {
      const before = await supabase.from('players').select('id', { count: 'exact', head: true }).eq('club_id', club.id);
      const { error } = await supabase.from('teams').delete().eq('id', tm.id);
      if (error) throw error;
      const after = await supabase.from('players').select('id', { count: 'exact', head: true }).eq('club_id', club.id);
      setDelTeam(null);
      setOpen((m) => ({ ...m, [tm.id]: false }));
      setDetails((m) => { const n = { ...m }; delete n[tm.id]; return n; });
      await loadTeams(club.id);
      setEveryone(null);
      if ((before.count ?? 0) > (after.count ?? 0)) setErr(t('club.delLost', { n: (before.count ?? 0) - (after.count ?? 0) }));
      else flash(t('club.delDone', { name: tm.name }));
    } catch (e) { setErr(friendlyError(e, t('club.errGeneric'))); } finally { setBusy(false); }
  }

  /** Rattache un coach à une autre équipe (to) puis retire l'ancien rattachement ; sans `to`, le retire seulement. */
  async function changeCoach(uid, from, to) {
    setErr(''); setBusy(true);
    try {
      if (to && to !== from) {
        const { error: e1 } = await supabase.from('coach_teams').upsert(
          { coach_user_id: uid, team_id: to }, { onConflict: 'coach_user_id,team_id', ignoreDuplicates: true });
        if (e1) throw e1;
      }
      if (!to || to !== from) {
        const { error: e2 } = await supabase.from('coach_teams').delete().eq('coach_user_id', uid).eq('team_id', from);
        if (e2) throw e2;
      }
      setMoveCoach(null);
      flash(t(to ? 'club.coachMoved' : 'club.coachRemoved'));
      await refreshAll();
    } catch (e) { setErr(friendlyError(e, t('club.errGeneric'))); } finally { setBusy(false); }
  }

  async function movePlayer(pid, to) {
    if (!to) return;
    setErr(''); setBusy(true);
    try {
      const { error } = await supabase.from('players').update({ team_id: to }).eq('id', pid);
      if (error) throw error;
      setMovePl(null);
      flash(t('club.playerMoved'));
      await refreshAll();
    } catch (e) { setErr(friendlyError(e, t('club.errGeneric'))); } finally { setBusy(false); }
  }

  async function linkParent(playerId, tid) {
    setErr(''); setBusy(true);
    try {
      const email = (parentEmail[playerId] || '').trim();
      if (!email) throw new Error(t('club.errParentEmail'));
      const { error } = await supabase.rpc('admin_link_parent_by_email', { p_player: playerId, p_email: email });
      if (error) throw error;
      setParentEmail((m) => ({ ...m, [playerId]: '' })); flash(t('club.parentLinked'));
      setEveryone(null);
      if (details[tid]) await loadTeamDetail(tid);
    } catch (e) { setErr(friendlyError(e, t('club.errGeneric'))); } finally { setBusy(false); }
  }

  /**
   * Lit un CSV déposé pour n'en garder que le nom et le nombre de lignes de
   * données. Tout se passe dans le navigateur : le fichier n'est pas envoyé et
   * l'import n'est pas encore câblé — mais le compteur du bouton est réel.
   */
  async function takeCsv(file) {
    if (!file) return;
    try {
      const text = await file.text();
      setCsv({ name: file.name, rows: countCsvRows(text) });
    } catch {
      setCsv({ name: file.name, rows: 0 });
    }
  }

  const css = `
    .cons { display: flex; align-items: stretch; min-height: 100vh; }
    .cons-side { flex: 0 0 268px; width: 268px; background: #fff; border-right: 1px solid var(--border);
      padding: 20px 16px 22px; position: sticky; top: 0; height: 100vh; overflow-y: auto;
      display: flex; flex-direction: column; gap: 16px; }
    .cons-main { flex: 1; min-width: 0; padding: 28px 32px 64px; max-width: 1240px; }
    .cons-burger { display: none; }
    .cons-backdrop { display: none; }
    .cons-fold { flex: 1; display: flex; flex-direction: column; gap: 16px; min-width: 0; }
    .cons-grid { display: grid; grid-template-columns: minmax(0, 1.85fr) minmax(0, 1fr); gap: 14px; align-items: start; }
    .cons-row { display: grid; grid-template-columns: minmax(0, 2.2fr) minmax(0, 2fr) 104px 88px; gap: 10px; align-items: center; }
    .cons-two { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; align-items: start; }
    .cons-map { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.15fr);
      gap: 8px; align-items: center; }
    @media (max-width: 1080px) { .cons-grid { grid-template-columns: 1fr; } }
    @media (max-width: 900px) {
      .cons { display: block; }
      .cons-side { position: sticky; top: 0; z-index: 30; width: auto; height: auto; flex: none;
        border-right: none; border-bottom: 1px solid var(--border); padding: 10px 16px; background: #fff; }
      .cons-side[data-open="true"] { z-index: 70; }
      .cons-fold { position: fixed; top: 0; left: 0; bottom: 0; width: min(300px, 86vw); z-index: 2;
        background: #FFFFFF; padding: 20px 16px 22px; overflow-y: auto; -webkit-overflow-scrolling: touch;
        box-shadow: 4px 0 24px rgba(0,0,0,.14); transform: translateX(-105%); visibility: hidden;
        transition: transform .22s ease, visibility 0s linear .22s; }
      .cons-side[data-open="true"] .cons-fold { transform: translateX(0); visibility: visible;
        transition: transform .22s ease, visibility 0s; }
      .cons-backdrop { display: block; position: fixed; inset: 0; z-index: 1; background: rgba(0,0,0,.45); }
      .cons-navbtn { min-height: 48px; padding: 12px 14px !important; font-size: 15px !important; border-radius: 14px !important; }
      .cons-navbtn[data-on="false"] { color: #2B2722 !important; }
      .cons-navbtn[data-on="true"] { box-shadow: 0 2px 10px rgba(0,0,0,.18); }
      .cons-burger { display: inline-flex; }
      .cons-main { padding: 18px 16px 48px; }
      .cons-two { grid-template-columns: 1fr; }
    }
    @media (max-width: 640px) {
      .cons-row { grid-template-columns: 1fr; gap: 3px; }
      .cons-row .cons-th { display: none; }
    }
  `;

  if (!ready) {
    return <div className="wrap"><p style={{ color: 'var(--muted)' }}>{t('common.loading')}</p></div>;
  }

  if (club && teams.length === 0 && !welcomeSkipped) {
    return (
      <ClubWelcome club={club} sports={sports} onSkip={() => setWelcomeSkipped(true)}
        onDone={async (b, info) => {
          setClub((c) => ({ ...c, ...b })); await loadTeams(club.id);
          if (info?.logoFailed) flash(t('brand.logoLater'));
        }} />
    );
  }

  if (!club) {
    return (
      <div className="wrap">
        <div className="card"><p style={{ margin: 0, color: 'var(--muted)' }}>{t('club.notAdmin')}</p></div>
        <a href="#" onClick={(e) => { e.preventDefault(); router.push('/'); }}>{t('common.backLabel')}</a>
      </div>
    );
  }

  /* ---------- valeurs dérivées, calculées au rendu (donc traduites) ---------- */

  const sportName = (s) => (lang === 'en' ? s?.name_en || s?.name_fr : s?.name_fr) || '';
  /** Un compte rattaché dont app_users n'est pas lisible (RLS) reste nommé sobrement. */
  const nameOr = (n) => n || t('club.accountLinked');
  const weekdayName = (d) => new Date(Date.UTC(2024, 0, 7 + d))
    .toLocaleDateString(lang === 'en' ? 'en-GB' : 'fr-FR', { weekday: 'long', timeZone: 'UTC' });
  const dayText = (iso) => (iso
    ? new Date(`${iso}T12:00:00`).toLocaleDateString(lang === 'en' ? 'en-GB' : 'fr-FR',
      { day: 'numeric', month: 'short', year: 'numeric' })
    : '');

  const sportCount = new Set(teams.map((tm) => tm.sport_id).filter(Boolean)).size;
  const teamById = Object.fromEntries(teams.map((tm) => [tm.id, tm]));

  /* Essai : la durée n'est pas une constante, c'est l'écart réellement enregistré
     entre la création du club et la fin de son essai. */
  const trialTotal = club.trial_ends_at && club.created_at
    ? Math.max(1, Math.round((new Date(club.trial_ends_at) - new Date(club.created_at)) / 86400000))
    : null;
  const trialLeftRaw = club.trial_ends_at ? daysUntil(club.trial_ends_at) : null;
  const trialLeft = trialLeftRaw !== null && trialTotal ? Math.min(trialLeftRaw, trialTotal) : trialLeftRaw;
  const trialPct = trialLeft !== null && trialTotal
    ? Math.max(0, Math.min(100, Math.round((trialLeft / trialTotal) * 100))) : 0;

  const counts = {
    teams: teams.length,
    athletes: memberCount,
    coaches: coachCount,
    licences: memberCount,
    seasons: seasons.length,
    documents: documents.length,
    branding: null,
    support: tickets.length,
  };

  /* ---------- fragments réutilisés ---------- */

  const statusChip = (linked) => (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, borderRadius: 20, padding: '4px 10px',
      fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap',
      background: linked ? '#E6F4EA' : '#FFF1E3', color: linked ? '#1E7B34' : '#9A5B18',
    }}>
      <i style={{ width: 6, height: 6, borderRadius: '50%', display: 'inline-block',
        background: linked ? '#3FA06A' : '#D99A2B' }} />
      {linked ? t('club.active') : t('club.toValidate')}
    </span>
  );

  /** Colonne « parent / compte » : parent nommé, compte de l'athlète, ou attente. */
  const accountText = (a) => {
    if (a.parents.length) {
      return a.parents.map((pr, i) => (
        <div key={i}>
          {nameOr(pr.name)}
          <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 700,
            color: pr.status === 'rejected' ? '#B3261E' : pr.status === 'pending' ? '#9A5B18' : '#1E7B34' }}>
            · {t(`club.parentSt.${pr.status}`)}
          </span>
        </div>
      ));
    }
    if (a.ownAccount) return t('adm.ownAccount');
    return t('adm.linkPending');
  };

  const athleteHeader = (withGroup) => (
    <div className="cons-row cons-th" style={{ padding: '0 0 8px' }}>
      <div className="label">{t('club.athlete')}</div>
      <div className="label">{withGroup ? t('adm.group') : t('club.parentAccount')}</div>
      <div className="label">{t('club.status')}</div>
      <div className="label" style={{ textAlign: 'right' }}>{t('club.attendance')}</div>
    </div>
  );

  const moveBox = (a) => (
    <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
      <select className="input" style={{ marginBottom: 0, flex: 1, minWidth: 140 }} aria-label={t('club.moveTo')}
        value={movePl?.id === a.id ? movePl.to : ''}
        onChange={(e) => setMovePl({ id: a.id, to: e.target.value })}>
        <option value="">{t('club.moveTo')}</option>
        {teams.filter((tm) => tm.id !== a.teamId).map((tm) => <option key={tm.id} value={tm.id}>{tm.name}</option>)}
      </select>
      <button type="button" className="btn" style={{ width: 'auto', padding: '0 14px' }}
        disabled={busy || !movePl?.to} onClick={() => movePlayer(a.id, movePl.to)}>{t('club.moveConfirm')}</button>
      <button type="button" className="btn ghost" style={{ width: 'auto', padding: '0 14px' }}
        onClick={() => setMovePl(null)}>{t('common.cancel')}</button>
    </div>
  );

  const athleteRow = (a, withGroup) => (
    <div key={a.id} className="cons-row"
      style={{ borderTop: '1px solid var(--border)', padding: '10px 0' }}>
      <div style={{ fontWeight: 700, fontSize: 14 }}>
        {a.name}
        {teams.length > 1 && movePl?.id !== a.id && (
          <div>
            <button type="button" onClick={() => setMovePl({ id: a.id, to: '' })}
              style={{ border: 'none', background: 'transparent', padding: 0, font: 'inherit', fontSize: 12,
                fontWeight: 700, color: 'var(--brand-dark)', cursor: 'pointer' }}>{t('club.movePlayer')}</button>
          </div>
        )}
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>
        {withGroup ? (teamById[a.teamId]?.name || '—') : accountText(a)}
      </div>
      <div>{statusChip(a.linked)}</div>
      <div style={{ textAlign: 'right', fontSize: 13, fontWeight: 700, color: 'var(--brand-dark)' }}>
        {a.total > 0 ? `${a.presents}/${a.total}` : '—'}
      </div>
      {movePl?.id === a.id && moveBox(a)}
    </div>
  );

  const sectionHead = (titleKey, right) => (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
      gap: 14, flexWrap: 'wrap', marginBottom: 18 }}>
      <div>
        <div className="label" style={{ color: 'var(--brand)' }}>{t('adm.eyebrow')}</div>
        <h1 className="q" style={{ margin: '4px 0 0', fontSize: 26, letterSpacing: '-0.5px', fontWeight: 700 }}>
          {t(titleKey)}
        </h1>
      </div>
      {right}
    </div>
  );

  /* Les deux boutons d'en-tête, identiques d'une section à l'autre. Par défaut
     « Nouveau groupe » emmène là où le formulaire de création se trouve. */
  const headButtons = (onNew) => (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <button type="button" className="btn ghost" style={{ width: 'auto', padding: '11px 16px', fontSize: 14 }}
        onClick={() => setCsvNote((v) => !v)}>
        {t('adm.importCsv')}
      </button>
      <button type="button" className="btn" style={{ width: 'auto', padding: '11px 16px', fontSize: 14 }}
        onClick={onNew || (() => { setSection('licences'); setMenuOpen(false); })}>
        {t('adm.newTeam')}
      </button>
    </div>
  );

  /* Le statut d'un ticket est du texte libre, écrit par la plateforme. On
     reconnaît le vocabulaire employé aujourd'hui et on affiche tel quel ce
     qu'on ne connaît pas, plutôt que de le ranger de force dans une case. */
  const ticketStatus = (raw) => {
    const s = (raw || '').toLowerCase().replace(/[\s-]+/g, '_');
    if (s === 'resolved' || s === 'closed') return { label: t('adm.sup.resolved'), bg: '#E6F4EA', ink: '#1E7B34' };
    if (s === 'in_progress' || s === 'pending') return { label: t('adm.sup.inProgress'), bg: '#FFF1E3', ink: '#9A5B18' };
    if (s === 'open') return { label: t('adm.sup.open'), bg: 'var(--peach)', ink: 'var(--brand-dark)' };
    return { label: raw, bg: '#F1EEE8', ink: 'var(--muted)' };
  };

  /* Un coach d'une équipe : déplacer vers une autre équipe ou retirer le rattachement. */
  const coachLine = (tm, c) => {
    const mv = moveCoach && moveCoach.uid === c.id && moveCoach.from === tm.id ? moveCoach : null;
    return (
      <div key={c.id} style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13.5, fontWeight: 600, flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{nameOr(c.name)}</span>
          {!mv && (
            <>
              {teams.length > 1 && (
                <button type="button" onClick={() => setMoveCoach({ uid: c.id, from: tm.id, to: '' })}
                  style={{ border: 'none', background: 'transparent', padding: 0, font: 'inherit', fontSize: 12,
                    fontWeight: 700, color: 'var(--brand-dark)', cursor: 'pointer' }}>{t('club.moveCoach')}</button>
              )}
              <button type="button" disabled={busy}
                onClick={() => { if (window.confirm(t('club.removeCoachConfirm', { name: nameOr(c.name), team: tm.name }))) changeCoach(c.id, tm.id, ''); }}
                style={{ border: 'none', background: 'transparent', padding: 0, font: 'inherit', fontSize: 12,
                  fontWeight: 700, color: '#B3261E', cursor: 'pointer' }}>{t('club.removeCoach')}</button>
            </>
          )}
        </div>
        {mv && (
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 6 }}>
            <select className="input" style={{ marginBottom: 0, flex: 1, minWidth: 140 }} aria-label={t('club.moveTo')}
              value={mv.to} onChange={(e) => setMoveCoach({ ...mv, to: e.target.value })}>
              <option value="">{t('club.moveTo')}</option>
              {teams.filter((x) => x.id !== tm.id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
            <button type="button" className="btn" style={{ width: 'auto', padding: '0 14px' }}
              disabled={busy || !mv.to} onClick={() => changeCoach(c.id, tm.id, mv.to)}>{t('club.moveConfirm')}</button>
            <button type="button" className="btn ghost" style={{ width: 'auto', padding: '0 14px' }}
              onClick={() => setMoveCoach(null)}>{t('common.cancel')}</button>
          </div>
        )}
      </div>
    );
  };

  /* Suppression d'une équipe en deux temps : récapitulatif, puis saisie du nom. */
  const deleteBlock = (tm, head) => {
    const mine = delTeam && delTeam.id === tm.id ? delTeam : null;
    const nPl = head.members || 0;
    const nCo = (head.coachRows || []).length;
    if (!mine) {
      return (
        <button type="button" className="btn ghost" style={{ color: '#B3261E', borderColor: '#E9B8B3' }}
          onClick={() => setDelTeam({ id: tm.id, step: 1, typed: '' })}>{t('club.delTeam')}</button>
      );
    }
    return (
      <div style={{ border: '1px solid #E9B8B3', borderRadius: 12, padding: 12, background: '#FFF4F2' }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>{t('club.delTitle', { name: tm.name })}</div>
        <div style={{ fontSize: 12.5, lineHeight: 1.55, color: '#5F2A1C' }}>
          <div>{nPl > 0 ? t(nPl === 1 ? 'club.delPlayers1' : 'club.delPlayersN', { n: nPl }) : t('club.delPlayers0')}</div>
          <div>{nCo > 0 ? t(nCo === 1 ? 'club.delCoaches1' : 'club.delCoachesN', { n: nCo }) : t('club.delCoaches0')}</div>
          <div style={{ marginTop: 4 }}>{t('club.delCascade')}</div>
        </div>
        {mine.step === 1 ? (
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button type="button" className="btn" style={{ width: 'auto', padding: '0 14px', background: '#B3261E' }}
              onClick={() => setDelTeam({ ...mine, step: 2 })}>{t('club.delContinue')}</button>
            <button type="button" className="btn ghost" style={{ width: 'auto', padding: '0 14px' }}
              onClick={() => setDelTeam(null)}>{t('common.cancel')}</button>
          </div>
        ) : (
          <div style={{ marginTop: 10 }}>
            <label className="label" htmlFor={`del-${tm.id}`}>{t('club.delType', { name: tm.name })}</label>
            <input id={`del-${tm.id}`} className="input" style={{ margin: '6px 0 8px' }} autoComplete="off"
              value={mine.typed} onChange={(e) => setDelTeam({ ...mine, typed: e.target.value })} placeholder={tm.name} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn" style={{ width: 'auto', padding: '0 14px', background: '#B3261E' }}
                disabled={busy || mine.typed.trim() !== tm.name.trim()} onClick={() => deleteTeam(tm)}>
                {t('club.delFinal')}
              </button>
              <button type="button" className="btn ghost" style={{ width: 'auto', padding: '0 14px' }}
                onClick={() => setDelTeam(null)}>{t('common.cancel')}</button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const panel = (title, children) => (
    <div className="card" style={{ marginBottom: 0 }}>
      <div className="label" style={{ marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );

  /* ---------- blocs de la section Licenciés ---------- */

  const csvCard = () => {
    const rows = csv ? csv.rows : 0;
    const off = rows === 0;
    return (
      <div className="card" style={{ marginBottom: 0 }}>
        <div className="label" style={{ marginBottom: 10 }}>{t('adm.lic.importTitle')}</div>

        <label
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); takeCsv(e.dataTransfer.files?.[0]); }}
          style={{ display: 'block', borderRadius: 16, padding: '26px 18px', textAlign: 'center', cursor: 'pointer',
            border: `1.5px dashed ${dragging ? 'var(--brand)' : '#E0D5CB'}`,
            background: dragging ? 'var(--peach)' : '#FDFAF7' }}>
          <input type="file" accept=".csv,text/csv" style={{ display: 'none' }}
            onChange={(e) => takeCsv(e.target.files?.[0])} />
          <span aria-hidden="true" style={{ display: 'block', fontSize: 26, marginBottom: 6 }}>📄</span>
          <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700 }}>{t('adm.lic.drop')}</span>
          {csv && (
            <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--brand-dark)', marginTop: 7 }}>
              {csv.name} · {t(rows === 1 ? 'adm.lic.rowOne' : 'adm.lic.rowMany', { n: rows })}
            </span>
          )}
        </label>

        <div className="label" style={{ margin: '16px 0 8px' }}>{t('adm.lic.mapping')}</div>
        <div className="cons-map cons-th" style={{ paddingBottom: 6 }}>
          <div className="label">{t('adm.lic.hCol')}</div>
          <div className="label">{t('adm.lic.hField')}</div>
          <div className="label">{t('adm.lic.hSample')}</div>
        </div>
        {CSV_COLUMNS.map((c) => (
          <div key={c.col} className="cons-map" style={{ borderTop: '1px solid var(--border)', padding: '9px 0' }}>
            <code style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--brand-dark)' }}>{c.col}</code>
            <div style={{ fontSize: 13 }}>{t(c.field)}</div>
            <div style={{ fontSize: 12.5, color: 'var(--muted)', overflowWrap: 'anywhere' }}>{c.sample}</div>
          </div>
        ))}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
          <button type="button" className="btn" disabled={off} onClick={() => setCsvNote(true)}
            style={{ width: 'auto', padding: '12px 18px', fontSize: 14,
              opacity: off ? 0.5 : 1, cursor: off ? 'not-allowed' : 'pointer' }}>
            {t('adm.lic.importN', { n: rows })}
          </button>
          <button type="button" className="btn ghost" onClick={downloadCsvTemplate}
            style={{ width: 'auto', padding: '12px 18px', fontSize: 14 }}>
            {t('adm.lic.template')}
          </button>
        </div>
      </div>
    );
  };

  /**
   * Tranche une demande de rattachement. Dans les deux cas la ligne quitte la
   * liste : validée ou refusée, elle n'est plus en attente. Et la section
   * Athlètes est vidée, car elle garde en cache l'état d'avant la décision.
   */
  async function decideLink(linkId, approve) {
    if (linkBusy) return;
    setLinkBusy(linkId);
    const fn = approve ? 'validate_child_link' : 'reject_child_link';
    const { error } = await supabase.schema('yps').rpc(fn, { p_link: linkId });
    setLinkBusy('');
    if (error) {
      console.error(fn, error);
      setOk('');
      const m = `${error.message || ''}`;
      if (m.includes('not_admin')) { setErr(t('adm.lic.notAdmin')); return; }
      /* La demande a déjà été tranchée ailleurs : notre liste est en retard,
         on la reprend telle qu'elle est vraiment. */
      if (m.includes('link_not_found')) { setErr(t('adm.lic.linkGone')); await loadPendings(); return; }
      setErr(t('adm.lic.linkFailed'));
      return;
    }
    setPendings((list) => list.filter((p) => p.link_id !== linkId));
    setEveryone(null);
    flash(t(approve ? 'adm.lic.linkValidated' : 'adm.lic.linkRejected'));
  }

  /** Crée un ticket pour ce club (RLS : réservé à ses dirigeants) puis recharge la liste. */
  async function sendTicket() {
    const subject = tkSubject.trim();
    if (!subject || !tkBody.trim() || tkBusy || !club?.id) { if (!subject || !tkBody.trim()) setErr(t('adm.sup.errEmpty')); return; }
    setTkBusy(true); setErr('');
    const { error } = await supabase.schema('yps').from('support_tickets').insert({
      club_id: club.id, subject, body: tkBody.trim(), priority: tkPriority,
    });
    if (error) { console.error('support_tickets insert', error.code); setTkBusy(false); setErr(t('adm.sup.errSend')); return; }
    const { data } = await supabase.from('support_tickets').select('id, subject, status, priority, created_at')
      .eq('club_id', club.id).order('created_at', { ascending: false });
    setTickets(data || []);
    setTkSubject(''); setTkBody(''); setTkPriority('normal'); setTkBusy(false);
    flash(t('adm.sup.sent'));
  }

  const pendingCard = () => panel(t('adm.lic.pending'), (
    <>
      <PendingLinksList pendings={pendings} busy={linkBusy} onDecide={decideLink} />
    </>
  ));

  const brandingCard = () => {
    /* Les pastilles : l'accent du club, puis celui de chaque sport réellement
       pratiqué ici — exactement ce que décrit la note en dessous. */
    const seen = new Set();
    const tones = [];
    for (const tm of teams) {
      const s = tm.sports;
      if (!s?.accent_color || seen.has(s.accent_color)) continue;
      seen.add(s.accent_color);
      tones.push({ color: s.accent_color, label: sportName(s) });
    }
    return panel(t('adm.lic.branding'), (
      <>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          <ClubAvatar name={club.name} logoUrl={club.logo_url} color={club.accent_color || 'var(--brand)'}
            size={48} radius={16} fontSize={16} />
          <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {tones.length === 0 && (
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>{t('adm.lic.noSportTone')}</span>
            )}
            {tones.map((s) => (
              <span key={s.color} title={s.label} style={{ width: 24, height: 24, borderRadius: '50%',
                display: 'inline-block', background: s.color, border: '2px solid #fff',
                boxShadow: '0 0 0 1px var(--border)' }} />
            ))}
          </span>
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 14 }}>{t('adm.lic.brandingNote')}</div>
        <BrandingEditor club={club} bare onSaved={(b) => setClub((c) => ({ ...c, ...b }))} />
      </>
    ));
  };

  const documentsCard = () => panel(t('adm.nav.documents'), (
    <>
      {documents.length === 0 && (
        <div style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.6 }}>{t('adm.noDocuments')}</div>
      )}
      {documents.map((doc, i) => (
        <div key={doc.id} style={{ borderTop: i ? '1px solid var(--border)' : 'none', padding: '9px 0' }}>
          <a href={doc.url} target="_blank" rel="noreferrer"
            style={{ fontSize: 13.5, fontWeight: 700, overflowWrap: 'anywhere' }}>{doc.name}</a>
          <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>
            {[teamById[doc.team_id]?.name, dayText((doc.created_at || '').slice(0, 10))].filter(Boolean).join(' · ')}
          </div>
        </div>
      ))}
      {/* L'attestation n'est pas un fichier déposé : elle se fabrique au moment
          où on la demande, donc elle ne peut pas figurer dans la liste. */}
      <div style={{ borderTop: '1px solid var(--border)', padding: '9px 0 0', marginTop: documents.length ? 0 : 10 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700 }}>{t('adm.lic.certificate')}</div>
        <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>{t('adm.lic.onDemand')}</div>
      </div>
    </>
  ));

  /* ---------- sections ---------- */

  function TeamsSection() {
    return (
      <>
        {sectionHead('adm.nav.teams', headButtons())}

        {csvNote && (
          <div className="card" style={{ background: '#fff', fontSize: 13, color: 'var(--muted)', lineHeight: 1.55 }}>
            {t('adm.importSoon')}
          </div>
        )}

        {/* Bandeau Isolation */}
        <div className="card" style={{ background: 'var(--peach)', border: 'none' }}>
          <span className="pill" style={{ background: '#fff', marginBottom: 8 }}>{t('adm.isolation')}</span>
          <div style={{ fontSize: 13, color: '#7A4030', lineHeight: 1.6 }}>{t('adm.isolationText')}</div>
        </div>

        {pendCoaches.length > 0 && (
          <div className="card" style={{ border: '1px solid #F6E4C4', background: '#FFF6E9' }}>
            <span className="pill" style={{ background: '#fff', marginBottom: 8 }}>
              {t('adm.pendCoach.title')} · {pendCoaches.length}
            </span>
            <div style={{ fontSize: 12.5, color: '#7A5A18', lineHeight: 1.5, marginBottom: 8 }}>{t('adm.pendCoach.hint')}</div>
            {pendCoaches.map((pc) => (
              <div key={pc.user_id} style={{ borderTop: '1px solid #F6E4C4', padding: '10px 0' }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, overflowWrap: 'anywhere' }}>
                  {pc.full_name || t('adm.pendCoach.noName')}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 7, overflowWrap: 'anywhere' }}>{pc.email}</div>
                <div style={{ display: 'flex', gap: 7 }}>
                  <select className="input" style={{ marginBottom: 0, flex: 1, minWidth: 0 }}
                    value={pendTeam[pc.user_id] || ''} aria-label={t('adm.pendCoach.team')}
                    onChange={(e) => setPendTeam((m) => ({ ...m, [pc.user_id]: e.target.value }))}>
                    <option value="">{t('adm.pendCoach.team')}</option>
                    {teams.map((tm) => <option key={tm.id} value={tm.id}>{tm.name}</option>)}
                  </select>
                  <button type="button" className="btn ghost" style={{ width: 'auto', padding: '0 14px', whiteSpace: 'nowrap' }}
                    disabled={busy || !pendTeam[pc.user_id]}
                    onClick={() => linkCoach(pendTeam[pc.user_id], pc.email || '', () => {})}>
                    {t('adm.pendCoach.attach')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {teams.length === 0 && (
          <div className="card"><p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>{t('club.noTeam')}</p></div>
        )}

        {teams.map((tm) => {
          const head = heads[tm.id] || { members: 0, coaches: [], weekdays: [] };
          const isOpen = !!open[tm.id];
          const d = details[tm.id];
          const tn = tone(tm.category || tm.name);
          const days = (head.weekdays || []).map(weekdayName).join(', ');
          const coachLine = head.coaches.map(nameOr).join(', ');
          const sub = [coachLine, days].filter(Boolean).join(' · ') || tm.category || '';
          const all = d && !d.loading ? d.athletes : [];
          const showAll = !!expanded[tm.id];
          const shown = showAll ? all : all.slice(0, PREVIEW);
          const fw = frameworks[tm.sport_id];

          return (
            <div key={tm.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {/* En-tête cliquable : déplie / replie */}
              <button type="button" onClick={() => toggleTeam(tm.id)} aria-expanded={isOpen}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 13, padding: 16,
                  border: 'none', background: 'transparent', font: 'inherit', textAlign: 'left', cursor: 'pointer' }}>
                <span className="q" style={{ flex: '0 0 auto', minWidth: 46, borderRadius: 13, padding: '9px 11px',
                  background: tn.bg, color: tn.ink, fontWeight: 800, fontSize: 13, textAlign: 'center' }}>
                  {tm.category || tm.sports?.icon || '•'}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="q" style={{ display: 'block', fontWeight: 700, fontSize: 16 }}>{tm.name}</span>
                  {sub && <span style={{ display: 'block', fontSize: 12.5, color: 'var(--muted)', marginTop: 2 }}>{sub}</span>}
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, borderRadius: 20,
                  padding: '5px 11px', background: 'var(--peach)', color: 'var(--brand-dark)',
                  fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>
                  {tm.sports?.icon} {sportName(tm.sports)}
                </span>
                {/* Carte repliée : l'effectif suffit. Dépliée : ce que le tableau
                    montre réellement, qui peut être tronqué au-delà de PREVIEW. */}
                <span style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                  {isOpen
                    ? t('adm.shownOf', { n: shown.length, total: head.members })
                    : t(head.members === 1 ? 'coach.memberOne' : 'coach.memberMany', { n: head.members })}
                </span>
                <span aria-hidden="true" style={{ flex: '0 0 30px', width: 30, height: 30, borderRadius: 10,
                  border: '1px solid var(--border)', display: 'inline-flex', alignItems: 'center',
                  justifyContent: 'center', fontSize: 15, fontWeight: 700, color: 'var(--muted)' }}>
                  {isOpen ? '−' : '+'}
                </span>
              </button>

              {isOpen && (
                <div style={{ borderTop: `1px solid ${GREEN.line}`, background: GREEN.bg, padding: 16 }}>
                  <div className="cons-grid">
                    {/* ---- Tableau des athlètes ---- */}
                    <div className="card" style={{ marginBottom: 0 }}>
                      {athleteHeader(false)}
                      {(!d || d.loading) && (
                        <div style={{ fontSize: 13, color: 'var(--muted)' }}>{t('common.loading')}</div>
                      )}
                      {d && !d.loading && all.length === 0 && (
                        <div style={{ fontSize: 13, color: 'var(--muted)' }}>{t('club.noMembers')}</div>
                      )}
                      {shown.map((a) => athleteRow(a, false))}
                      {all.length > PREVIEW && (
                        <button type="button"
                          onClick={() => setExpanded((m) => ({ ...m, [tm.id]: !showAll }))}
                          style={{ marginTop: 10, border: 'none', background: 'transparent', padding: 0,
                            font: 'inherit', fontSize: 13, fontWeight: 700, color: 'var(--brand-dark)', cursor: 'pointer' }}>
                          {showAll ? t('adm.showLess') : t('adm.showAll')}
                        </button>
                      )}
                    </div>

                    {/* ---- Encarts de droite ---- */}
                    <div style={{ display: 'grid', gap: 14 }}>
                      {panel(t('club.coaches'), (
                        <>
                          {head.coaches.length === 0
                            ? <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 10 }}>{t('club.noCoach')}</div>
                            : (head.coachRows || []).map((c) => coachLine(tm, c))}
                          {head.coaches.length > 0 && (
                            <div style={{ fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.5, margin: '6px 0 10px' }}>
                              {t('adm.coachPrivacy')}
                            </div>
                          )}
                          <div style={{ display: 'flex', gap: 7 }}>
                            <input className="input" style={{ marginBottom: 0, flex: 1, minWidth: 0 }}
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
                        </>
                      ))}

                      {panel(t('adm.framework'), (
                        <>
                          <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 4 }}>
                            {sportName(tm.sports) || '—'}
                          </div>
                          <div style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.55, marginBottom: 10 }}>
                            {fw && fw.n > 0
                              ? t('adm.frameworkCount', { n: fw.n, c: fw.categories })
                              : t('adm.frameworkEmpty')}
                          </div>
                          <button type="button" className="btn ghost" disabled
                            style={{ opacity: 0.55, cursor: 'not-allowed' }}>
                            {t('adm.editFramework')}
                          </button>
                          <div style={{ fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.5, marginTop: 8 }}>
                            {t('adm.frameworkLocked')}
                          </div>
                        </>
                      ))}

                      {deleteBlock(tm, head)}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        <div className="card" style={{ background: 'var(--peach)', border: 'none' }}>
          <div className="q" style={{ fontWeight: 700, fontSize: 14, color: '#5F2A1C', marginBottom: 4 }}>{t('club.demoTitle')}</div>
          <div style={{ fontSize: 12.5, color: '#7A4030', marginBottom: 10, lineHeight: 1.55 }}>{t('club.demoDesc')}</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn ghost" style={{ width: 'auto', padding: '11px 16px' }} disabled={busy} onClick={seedDemo}>
              {busy ? '…' : t('club.demoBtn')}
            </button>
            <button className="btn ghost" style={{ width: 'auto', padding: '11px 16px' }} disabled={busy} onClick={clearDemo}>
              {t('club.demoClearBtn')}
            </button>
          </div>
        </div>
      </>
    );
  }

  function AthletesSection() {
    return (
      <>
        {sectionHead('adm.nav.athletes')}
        <div className="card">
          {everyone === null && <div style={{ fontSize: 13, color: 'var(--muted)' }}>{t('common.loading')}</div>}
          {everyone !== null && everyone.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>{t('club.noMembers')}</div>
          )}
          {everyone !== null && everyone.length > 0 && (
            <>
              {athleteHeader(true)}
              {everyone.map((a) => athleteRow(a, true))}
            </>
          )}
        </div>
      </>
    );
  }

  function CoachesSection() {
    return (
      <>
        {sectionHead('adm.nav.coaches')}
        <div className="card" style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
          {t('club.coachHint', { code: club.join_code || '—' })}
          <div style={{ marginTop: 6 }}>{t('adm.coachPrivacy')}</div>
        </div>
        {teams.length === 0 && (
          <div className="card"><p style={{ margin: 0, color: 'var(--muted)' }}>{t('club.noTeam')}</p></div>
        )}
        <div className="cons-two">
          {teams.map((tm) => {
            const head = heads[tm.id] || { coaches: [] };
            return (
              <div key={tm.id} className="card" style={{ marginBottom: 0 }}>
                <div className="q" style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>{tm.name}</div>
                {head.coaches.length === 0
                  ? <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 10 }}>{t('club.noCoach')}</div>
                  : (head.coachRows || []).map((c) => coachLine(tm, c))}
                <div style={{ display: 'flex', gap: 7, marginTop: 10 }}>
                  <input className="input" style={{ marginBottom: 0, flex: 1, minWidth: 0 }}
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
            );
          })}
        </div>
      </>
    );
  }

  function LicencesSection() {
    const roster = details[teamId];
    return (
      <>
        {sectionHead('adm.lic.title', headButtons(
          () => { setTeamName(''); document.getElementById('adm-newteam')?.focus(); },
        ))}

        <div className="card">
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{t('exp.clubT')}</div>
          <div style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.5, marginBottom: 10 }}>{t('exp.clubD')}</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {['licencies', 'equipes', 'presences'].map((k) => (
              <button key={k} type="button" className="btn ghost" style={{ width: 'auto', padding: '0 14px', marginBottom: 0 }}
                disabled={Boolean(exporting) || !clubId}
                onClick={async () => {
                  setExporting(k); setErr(''); setOk('');
                  try { const n = await exportClubCsv(clubId, k, club?.name); setOk(t('exp.done', { n })); }
                  catch (e) { console.error('[club_export]', e); setErr(t('exp.clubErr')); }
                  finally { setExporting(''); }
                }}>
                {exporting === k ? '…' : t(`exp.${k}`)}
              </button>
            ))}
          </div>
        </div>

        {csvNote && (
          <div className="card" style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.55 }}>{t('adm.importSoon')}</div>
        )}

        <div className="cons-grid">
          {/* ============ Colonne principale ============ */}
          <div style={{ display: 'grid', gap: 14 }}>
            {csvCard()}

            <div className="cons-two">
              <div className="card" style={{ marginBottom: 0 }}>
                <div className="label" style={{ marginBottom: 8 }}>{t('club.createTeam')}</div>
                <input id="adm-newteam" className="input" value={teamName}
                  onChange={(e) => setTeamName(e.target.value)} placeholder={t('club.teamNamePh')} />
                <select className="input" value={teamSport} onChange={(e) => setTeamSport(e.target.value)}>
                  {sports.map((s) => <option key={s.id} value={s.id}>{s.icon} {sportName(s)}</option>)}
                </select>
                {isMartialSport(sports.find((s) => s.id === teamSport)) && (
                  <MartialDiscipline value={teamDiscipline} onChange={setTeamDiscipline} />
                )}
                <button className="btn" disabled={busy} onClick={addTeam}>{busy ? '…' : t('club.doCreateTeam')}</button>
              </div>

              <div className="card" style={{ marginBottom: 0 }}>
                <div className="label" style={{ marginBottom: 6 }}>{t('club.teamConcerned')}</div>
                <select className="input" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
                  {teams.map((tm) => <option key={tm.id} value={tm.id}>{tm.sports?.icon} {tm.name} · {sportName(tm.sports)}</option>)}
                </select>
                <div style={{ display: 'flex', gap: 7 }}>
                  <input className="input" style={{ marginBottom: 0, flex: 1, minWidth: 0 }} value={pFirst}
                    onChange={(e) => setPFirst(e.target.value)} placeholder={t('club.firstNamePh')} />
                  <input className="input" style={{ marginBottom: 0, flex: 1, minWidth: 0 }} value={pLast}
                    onChange={(e) => setPLast(e.target.value)} placeholder={t('club.lastNamePh')} />
                </div>
                <button className="btn" style={{ marginTop: 9 }} disabled={busy} onClick={addPlayer}>{t('club.addMember')}</button>
              </div>
            </div>

            {teamId && (
              <div className="card" style={{ marginBottom: 0 }}>
                <div className="label" style={{ marginBottom: 10 }}>
                  {t('club.membersOf', { name: teamById[teamId]?.name || t('club.theTeam') })}
                </div>
                {(!roster || roster.loading) && (
                  <div style={{ fontSize: 13, color: 'var(--muted)' }}>{t('common.loading')}</div>
                )}
                {roster && !roster.loading && roster.athletes.length === 0 && (
                  <div style={{ fontSize: 13, color: 'var(--muted)' }}>{t('club.noMembers')}</div>
                )}
                {roster && !roster.loading && roster.athletes.map((a) => (
                  <div key={a.id} style={{ borderTop: '1px solid var(--border)', padding: '11px 0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, fontSize: 14 }}>{a.name}</span>
                      <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{accountText(a)}</span>
                      {statusChip(a.linked)}
                    </div>
                    <div style={{ display: 'flex', gap: 7, marginTop: 7 }}>
                      <input className="input" style={{ marginBottom: 0, flex: 1, minWidth: 0, maxWidth: 360 }}
                        value={parentEmail[a.id] || ''}
                        onChange={(e) => setParentEmail((m) => ({ ...m, [a.id]: e.target.value }))}
                        placeholder={t('club.parentEmailPh')} />
                      <button className="btn ghost" style={{ width: 'auto', padding: '0 14px' }} disabled={busy}
                        onClick={() => linkParent(a.id, teamId)}>{t('club.link')}</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ============ Colonne latérale ============ */}
          <div style={{ display: 'grid', gap: 14 }}>
            {pendingCard()}
            {brandingCard()}
            {documentsCard()}
          </div>
        </div>
      </>
    );
  }

  function SeasonsSection() {
    return (
      <>
        {sectionHead('adm.nav.seasons')}
        <div className="card">
          {seasons.length === 0
            ? <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>{t('adm.noSeasons')}</div>
            : seasons.map((s, i) => (
              <div key={s.id} style={{ borderTop: i ? '1px solid var(--border)' : 'none', padding: '10px 0',
                display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 700, fontSize: 14 }}>{s.name}</span>
                <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>
                  {[dayText(s.start_date), dayText(s.end_date)].filter(Boolean).join(' → ')}
                </span>
              </div>
            ))}
        </div>
      </>
    );
  }

  function DocumentsSection() {
    return (
      <>
        {sectionHead('adm.nav.documents')}
        <div className="card">
          {documents.length === 0
            ? <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>{t('adm.noDocuments')}</div>
            : documents.map((doc, i) => (
              <div key={doc.id} style={{ borderTop: i ? '1px solid var(--border)' : 'none', padding: '10px 0',
                display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <a href={doc.url} target="_blank" rel="noreferrer" style={{ fontWeight: 700, fontSize: 14 }}>{doc.name}</a>
                <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>
                  {[teamById[doc.team_id]?.name, dayText((doc.created_at || '').slice(0, 10))].filter(Boolean).join(' · ')}
                </span>
              </div>
            ))}
        </div>
      </>
    );
  }

  function BrandingSection() {
    return (
      <>
        {sectionHead('adm.nav.branding')}
        <BrandingEditor club={club} onSaved={(b) => setClub((c) => ({ ...c, ...b }))} />
      </>
    );
  }

  function SupportSection() {
    /* La date de résolution n'est enregistrée nulle part : support_tickets ne
       porte que created_at. On le dit une fois, et seulement si un ticket est
       effectivement résolu. */
    const anyResolved = tickets.some((tk) => ['resolved', 'closed'].includes((tk.status || '').toLowerCase()));
    const prio = (key, label) => (
      <button type="button" onClick={() => setTkPriority(key)}
        style={{ flex: 1, padding: '11px 12px', borderRadius: 12, fontSize: 13.5, fontWeight: 700,
          cursor: 'pointer', border: `1.5px solid ${tkPriority === key ? 'var(--brand)' : 'var(--border)'}`,
          background: tkPriority === key ? 'var(--peach)' : '#fff',
          color: tkPriority === key ? 'var(--brand-dark)' : 'var(--ink)' }}>
        {label}
      </button>
    );

    return (
      <>
        {sectionHead('adm.sup.title', headButtons())}

        {csvNote && (
          <div className="card" style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.55 }}>{t('adm.importSoon')}</div>
        )}

        <div className="cons-two">
          {/* ============ Contacter le support ============ */}
          <div className="card" style={{ marginBottom: 0 }}>
            <div className="label" style={{ marginBottom: 8 }}>{t('adm.sup.contact')}</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 14 }}>
              {t('adm.sup.intro')}
            </div>

            <input className="input" value={tkSubject} onChange={(e) => setTkSubject(e.target.value)}
              placeholder={t('adm.sup.subjectPh')} />
            <textarea className="input" rows={5} value={tkBody} onChange={(e) => setTkBody(e.target.value)}
              placeholder={t('adm.sup.bodyPh')} style={{ marginTop: 10, resize: 'vertical', lineHeight: 1.5 }} />

            <div className="label" style={{ margin: '14px 0 8px' }}>{t('adm.sup.priority')}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {prio('normal', t('adm.sup.normal'))}
              {prio('urgent', t('adm.sup.urgent'))}
            </div>

            <button type="button" className="btn" style={{ marginTop: 14 }}
              disabled={tkBusy} onClick={sendTicket}>
              {t('adm.sup.send')}
            </button>
          </div>

          {/* ============ Mes tickets ============ */}
          <div className="card" style={{ marginBottom: 0 }}>
            <div className="label" style={{ marginBottom: 8 }}>{t('adm.sup.mine')}</div>
            {tickets.length === 0 && (
              <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>{t('adm.noTickets')}</div>
            )}
            {tickets.map((tk, i) => {
              const st = ticketStatus(tk.status);
              const sub = [
                t('adm.sup.openedOn', { d: dayText((tk.created_at || '').slice(0, 10)) }),
                tk.priority ? t(tk.priority === 'urgent' ? 'adm.sup.urgent' : 'adm.sup.normal') : '',
              ].filter(Boolean).join(' · ');
              return (
                <div key={tk.id} style={{ borderTop: i ? '1px solid var(--border)' : 'none', padding: '11px 0',
                  display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, overflowWrap: 'anywhere' }}>
                      {tk.subject || t('adm.sup.noSubject')}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>{sub}</div>
                  </div>
                  <span style={{ flex: '0 0 auto', fontSize: 11.5, fontWeight: 700, padding: '5px 10px',
                    borderRadius: 999, background: st.bg, color: st.ink }}>
                    {st.label}
                  </span>
                </div>
              );
            })}
            {anyResolved && (
              <div style={{ fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.5, marginTop: 10 }}>
                {t('adm.sup.noResolvedDate')}
              </div>
            )}
          </div>
        </div>
      </>
    );
  }

  /* Appelées comme de simples fonctions, pas montées comme des composants :
     un composant redéfini à chaque rendu serait remonté à chaque frappe et les
     champs de saisie perdraient le focus. */
  const SECTIONS = {
    teams: TeamsSection,
    athletes: AthletesSection,
    coaches: CoachesSection,
    licences: LicencesSection,
    seasons: SeasonsSection,
    documents: DocumentsSection,
    branding: BrandingSection,
    support: SupportSection,
  };
  const current = (SECTIONS[section] || TeamsSection)();

  return (
    <>
      <style>{css}</style>
      <div className="cons">
        {/* ===================== Barre latérale ===================== */}
        <aside className="cons-side" data-open={menuOpen ? 'true' : 'false'}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <ClubAvatar name={club.name} logoUrl={club.logo_url} size={44} radius={15} fontSize={16} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span className="q" style={{ display: 'block', fontWeight: 700, fontSize: 16, letterSpacing: '-0.3px' }}>
                {club.name}
              </span>
              <span style={{ display: 'block', fontSize: 12, color: 'var(--muted)', fontWeight: 600, marginTop: 2 }}>
                {t(sportCount === 1 ? 'adm.clubSportOne' : 'adm.clubSportMany', { n: sportCount })}
              </span>
            </span>
            <button type="button" className="cons-burger" onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen} aria-label={t('adm.menu')}
              style={{ border: '1px solid var(--border)', borderRadius: 11, background: '#fff',
                width: 38, height: 38, alignItems: 'center', justifyContent: 'center',
                fontSize: 15, cursor: 'pointer', fontFamily: 'inherit', color: 'var(--brand-dark)' }}>
              {menuOpen ? '✕' : '☰'}
            </button>
          </div>

          {myName && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, padding: '9px 11px',
              borderRadius: 14, background: 'var(--peach)' }}>
              <span className="q" aria-hidden="true" style={{ width: 34, height: 34, flex: '0 0 34px', borderRadius: 11,
                background: '#fff', color: 'var(--brand-dark)', display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: 13, fontWeight: 800 }}>{initialsOfName(myName)}</span>
              <span style={{ minWidth: 0 }}>
                <span className="q" style={{ display: 'block', fontWeight: 700, fontSize: 14, color: '#5F2A1C' }}>
                  {t('hello.name', { name: firstNameOf(myName) })}
                </span>
                <span style={{ display: 'block', fontSize: 11.5, color: '#7A4030', fontWeight: 600 }}>
                  {[t('me.adminRole'), club.name].join(' · ')}
                </span>
              </span>
            </div>
          )}

          {menuOpen && <div className="cons-backdrop" onClick={() => setMenuOpen(false)} aria-hidden="true" />}
          <div className="cons-fold">
          <nav style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {NAV.map((item) => {
              const on = section === item.key;
              return (
                <button key={item.key} type="button" className="cons-navbtn" data-on={on ? 'true' : 'false'}
                  onClick={() => { setSection(item.key); setMenuOpen(false); setErr(''); }}
                  aria-current={on ? 'page' : undefined}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                    border: 'none', borderRadius: 13, padding: '10px 12px', cursor: 'pointer', fontFamily: 'inherit',
                    fontSize: 13.5, fontWeight: 700,
                    background: on ? 'var(--brand)' : 'transparent', color: on ? '#fff' : '#6B6357' }}>
                  <span aria-hidden="true" style={{ display: 'inline-flex', opacity: on ? 1 : 0.8 }}><Icon name={item.icon} size={18} /></span>
                  <span style={{ flex: 1, minWidth: 0 }}>{t(`adm.nav.${item.key}`)}</span>
                  {counts[item.key] !== null && counts[item.key] > 0 && (
                    <span style={{ fontSize: 11.5, fontWeight: 700, opacity: on ? 0.9 : 0.65 }}>{counts[item.key]}</span>
                  )}
                </button>
              );
            })}
          </nav>

          <div style={{ marginTop: 'auto', display: 'grid', gap: 10 }}>
            {/* Code d'invitation : le dirigeant le donne aux coachs et aux familles. */}
            {club.join_code && (
              <div style={{ background: 'var(--peach)', borderRadius: 14, padding: '10px 12px',
                display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="label" style={{ display: 'block', color: '#A8837A' }}>{t('club.inviteCode')}</span>
                  <span style={{ display: 'block', fontWeight: 800, fontSize: 16, letterSpacing: 2,
                    color: 'var(--brand-dark)', marginTop: 2 }}>{club.join_code}</span>
                </span>
                <button type="button" onClick={copyCode}
                  style={{ border: 'none', borderRadius: 10, padding: '8px 11px', fontSize: 12, fontWeight: 700,
                    cursor: 'pointer', fontFamily: 'inherit', background: '#fff', color: 'var(--brand-dark)', whiteSpace: 'nowrap' }}>
                  {copied ? t('club.copied') : t('club.copyCode')}
                </button>
              </div>
            )}

            {/* Essai : la durée est l'écart réellement enregistré en base, pas une constante. */}
            <div style={{ border: '1px solid var(--border)', borderRadius: 16, padding: 14 }}>
              <div className="label" style={{ color: 'var(--brand)' }}>{t('adm.trial')}</div>
              <div style={{ fontSize: 13, fontWeight: 700, margin: '6px 0 8px', lineHeight: 1.45 }}>
                {trialLeft === null
                  ? t('adm.trialNone')
                  : trialLeft === 0
                    ? t('adm.trialOver')
                    : t('adm.trialLeft', { n: trialLeft, total: trialTotal })}
              </div>
              {trialLeft !== null && trialTotal && (
                <div style={{ height: 6, borderRadius: 4, background: '#F1E9E1', overflow: 'hidden', marginBottom: 11 }}>
                  <div style={{ width: `${trialPct}%`, height: '100%', background: 'var(--brand)' }} />
                </div>
              )}
              <button type="button" className="btn" style={{ padding: '11px 12px', fontSize: 13.5 }}
                onClick={() => router.push('/forfaits')}>
                {t('adm.choosePlan')}
              </button>
            </div>

            <button type="button" onClick={() => router.push('/mes-donnees')}
              style={{ border: 'none', background: 'transparent', color: 'var(--brand-dark)', fontFamily: 'inherit',
                fontSize: 12.5, fontWeight: 700, cursor: 'pointer', padding: '2px 0', textAlign: 'left' }}>
              {t('nav.myProfile')}
            </button>
            <button type="button" onClick={logout}
              style={{ border: 'none', background: 'transparent', color: 'var(--muted)', fontFamily: 'inherit',
                fontSize: 12.5, fontWeight: 700, cursor: 'pointer', padding: '2px 0', textAlign: 'left' }}>
              {t('common.logout')}
            </button>
          </div>
          </div>
        </aside>

        {/* ===================== Zone de contenu ===================== */}
        <main className="cons-main">
          {err && <div className="error" role="alert">{err}</div>}
          {ok && <div className="pill" style={{ marginBottom: 12 }}>{ok}</div>}
          {current}
        </main>
      </div>
    </>
  );
}
