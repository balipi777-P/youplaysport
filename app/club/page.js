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

/* Les 8 entrées de la barre latérale. Chacune ouvre une section réellement
   adossée à une table : rien ne mène à un écran vide sans explication. */
const NAV = [
  { key: 'teams', icon: '👥' },
  { key: 'athletes', icon: '🏃' },
  { key: 'coaches', icon: '📣' },
  { key: 'licences', icon: '🗂️' },
  { key: 'seasons', icon: '🗓️' },
  { key: 'documents', icon: '📄' },
  { key: 'branding', icon: '🎨' },
  { key: 'support', icon: '💬' },
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

/**
 * Nombre de lignes de données d'un CSV : on retire l'en-tête et les lignes
 * vides. Purement local — le fichier n'est jamais envoyé, l'import n'est pas
 * encore câblé, mais le compteur du bouton reste un vrai compteur.
 */
function countCsvRows(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  return Math.max(0, lines.length - 1);
}

/** Ancienneté d'une demande, en clé de traduction + quantité. */
function since(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return null;
  const d = Math.floor(ms / 86400000);
  if (d >= 1) return { key: d === 1 ? 'adm.lic.sinceDay' : 'adm.lic.sinceDays', n: d };
  const h = Math.floor(ms / 3600000);
  if (h >= 1) return { key: h === 1 ? 'adm.lic.sinceHour' : 'adm.lic.sinceHours', n: h };
  return { key: 'adm.lic.sinceNow', n: 0 };
}

/** Âge révolu à partir d'une date de naissance, ou null si elle manque. */
function ageOf(birthdate) {
  if (!birthdate) return null;
  const b = new Date(`${birthdate}T12:00:00`);
  if (Number.isNaN(b.getTime())) return null;
  const now = new Date();
  let a = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) a -= 1;
  return a >= 0 ? a : null;
}

/** Jours pleins entre aujourd'hui et une date, jamais négatif. */
function daysUntil(iso) {
  const end = new Date(iso);
  if (Number.isNaN(end.getTime())) return null;
  const ms = end.setHours(23, 59, 59, 999) - Date.now();
  return Math.max(0, Math.ceil(ms / 86400000));
}

export default function Club() {
  const router = useRouter();
  const { t, lang } = useT();
  const [ready, setReady] = useState(false);
  const [section, setSection] = useState('teams');
  const [menuOpen, setMenuOpen] = useState(false);
  const [club, setClub] = useState(null);
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
  const [csv, setCsv] = useState(null);   // {name, rows} du fichier déposé
  const [dragging, setDragging] = useState(false);
  const [memberCount, setMemberCount] = useState(0);
  const [coachCount, setCoachCount] = useState(0);
  const [copied, setCopied] = useState(false);
  const [csvNote, setCsvNote] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);

  // Saisies
  const [teamName, setTeamName] = useState('');
  const [teamSport, setTeamSport] = useState('');
  const [pFirst, setPFirst] = useState('');
  const [pLast, setPLast] = useState('');
  const [parentEmail, setParentEmail] = useState({});     // {playerId: email}
  const [teamCoachEmail, setTeamCoachEmail] = useState({}); // {teamId: email}

  const flash = (msg) => { setOk(msg); setErr(''); setTimeout(() => setOk(''), 3500); };

  /** Licenciés = count sur players ; coachs = distinct coach_user_id. */
  const loadStats = useCallback(async (clubId, teamRows) => {
    const { count } = await supabase.from('players').select('id', { count: 'exact', head: true }).eq('club_id', clubId);
    setMemberCount(count || 0);
    const ids = (teamRows || []).map((tm) => tm.id);
    if (ids.length === 0) { setCoachCount(0); return; }
    const { data } = await supabase.from('coach_teams').select('coach_user_id').in('team_id', ids);
    setCoachCount(new Set((data || []).map((r) => r.coach_user_id)).size);
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
        weekdays: Object.entries(per[id] || {})
          .filter(([, n]) => n >= 2).map(([d]) => Number(d))
          .sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)),
      };
    }
    for (const p of pls || []) if (map[p.team_id]) map[p.team_id].members += 1;
    for (const r of cts || []) if (map[r.team_id]) map[r.team_id].coaches.push(names[r.coach_user_id] || '');
    setHeads(map);
  }, []);

  /**
   * Lignes « athlète » d'un ou plusieurs groupes : compte rattaché, statut et
   * présences. Une seule série de requêtes quel que soit le nombre de groupes.
   * Rien n'est traduit ici : la langue se joue au rendu, sinon un changement de
   * langue relancerait toutes ces requêtes.
   */
  const buildAthletes = useCallback(async (teamIds) => {
    if (!teamIds.length) return [];
    const { data: pls } = await supabase.from('players')
      .select('id, first_name, last_name, team_id, user_id').in('team_id', teamIds).order('first_name');
    const roster = pls || [];
    const pids = roster.map((p) => p.id);
    if (!pids.length) return [];

    // Rattachements parents : lisibles par le dirigeant (can_manage_player).
    const { data: lk } = await supabase.from('player_parents')
      .select('player_id, parent_user_id').in('player_id', pids);
    const links = lk || [];

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

    // Un seul aller-retour pour tous les noms de parents.
    const uids = [...new Set(links.map((l) => l.parent_user_id))];
    const names = {};
    if (uids.length) {
      const { data } = await supabase.from('app_users').select('id, full_name, email').in('id', uids);
      for (const u of data || []) names[u.id] = accountLabel(u);
    }

    return roster.map((p) => {
      const mine = links.filter((l) => l.player_id === p.id);
      return {
        id: p.id,
        teamId: p.team_id,
        name: `${p.first_name} ${p.last_name || ''}`.trim(),
        parents: mine.map((l) => names[l.parent_user_id] || ''),
        ownAccount: Boolean(p.user_id),
        linked: mine.length > 0 || Boolean(p.user_id),
        presents: presents[p.id] || 0,
        total: held[p.team_id] || 0,
      };
    });
  }, []);

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
      const { data } = await supabase.auth.getSession();
      if (!data.session) { router.replace('/login'); return; }
      const { data: mem } = await supabase.from('memberships')
        .select('club_id, clubs(id, name, join_code, created_at, trial_ends_at, logo_url, accent_color, plan_key, status)')
        .eq('role', 'admin').limit(1);
      const c = mem && mem[0] ? mem[0].clubs : null;
      setClub(c);
      const { data: sp } = await supabase.from('sports').select('id, name_fr, name_en, icon').order('name_fr');
      setSports(sp || []);
      if (sp && sp[0]) setTeamSport(sp[0].id);
      if (c) {
        await loadTeams(c.id);
        const [se, doc, tk, pl] = await Promise.all([
          supabase.from('seasons').select('id, name, start_date, end_date').eq('club_id', c.id).order('start_date'),
          supabase.from('documents').select('id, name, url, team_id, created_at').eq('club_id', c.id).order('created_at', { ascending: false }),
          supabase.from('support_tickets').select('id, subject, status, priority, created_at').eq('club_id', c.id).order('created_at', { ascending: false }),
          supabase.from('pending_links').select('id, target_type, target_ref, email, created_at, expires_at')
            .eq('club_id', c.id).order('created_at', { ascending: false }),
        ]);
        setSeasons(se.data || []);
        setDocuments(doc.data || []);
        setTickets(tk.data || []);

        /* Demandes en attente : on écarte celles qui ont expiré, puis on résout
           le licencié visé en un seul aller-retour. */
        const rows = (pl.data || []).filter((r) => !r.expires_at || new Date(r.expires_at) > new Date());
        const refs = [...new Set(rows.map((r) => r.target_ref).filter(Boolean))];
        const who = {};
        if (refs.length) {
          const { data: ps } = await supabase.from('players').select('id, first_name, last_name, birthdate').in('id', refs);
          for (const p of ps || []) {
            who[p.id] = { name: `${p.first_name} ${p.last_name || ''}`.trim(), birthdate: p.birthdate };
          }
        }
        setPendings(rows.map((r) => ({ ...r, player: who[r.target_ref] || null })));
      }
      setReady(true);
    })();
  }, [router, loadTeams]);

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
    if (section !== 'athletes' || everyone !== null || teams.length === 0) return;
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
      if (!teamName.trim()) throw new Error(t('club.errTeamName'));
      const { data, error } = await supabase.from('teams')
        .insert({ club_id: club.id, sport_id: teamSport, name: teamName.trim() }).select('id').single();
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
      const { error } = await supabase.from('players')
        .insert({ club_id: club.id, team_id: teamId, first_name: pFirst.trim(), last_name: pLast.trim() || null });
      if (error) throw error;
      setPFirst(''); setPLast(''); flash(t('club.memberAdded'));
      await loadStats(club.id, teams);
      await loadHeads(teams);
      setEveryone(null);
      if (details[teamId]) await loadTeamDetail(teamId);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
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
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
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
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
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
    .cons-grid { display: grid; grid-template-columns: minmax(0, 1.85fr) minmax(0, 1fr); gap: 14px; align-items: start; }
    .cons-row { display: grid; grid-template-columns: minmax(0, 2.2fr) minmax(0, 2fr) 104px 88px; gap: 10px; align-items: center; }
    .cons-two { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; align-items: start; }
    .cons-map { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.15fr);
      gap: 8px; align-items: center; }
    @media (max-width: 1080px) { .cons-grid { grid-template-columns: 1fr; } }
    @media (max-width: 900px) {
      .cons { display: block; }
      .cons-side { position: static; width: auto; height: auto; flex: none;
        border-right: none; border-bottom: 1px solid var(--border); padding: 14px 16px; }
      .cons-side[data-open="false"] .cons-fold { display: none; }
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
  const trialLeft = club.trial_ends_at ? daysUntil(club.trial_ends_at) : null;
  const trialTotal = club.trial_ends_at && club.created_at
    ? Math.max(1, Math.round((new Date(club.trial_ends_at) - new Date(club.created_at)) / 86400000))
    : null;
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
    if (a.parents.length) return a.parents.map(nameOr).join(', ');
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

  const athleteRow = (a, withGroup) => (
    <div key={a.id} className="cons-row"
      style={{ borderTop: '1px solid var(--border)', padding: '10px 0' }}>
      <div style={{ fontWeight: 700, fontSize: 14 }}>{a.name}</div>
      <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>
        {withGroup ? (teamById[a.teamId]?.name || '—') : accountText(a)}
      </div>
      <div>{statusChip(a.linked)}</div>
      <div style={{ textAlign: 'right', fontSize: 13, fontWeight: 700, color: 'var(--brand-dark)' }}>
        {a.total > 0 ? `${a.presents}/${a.total}` : '—'}
      </div>
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
          <button type="button" className="btn ghost" onClick={() => setCsvNote(true)}
            style={{ width: 'auto', padding: '12px 18px', fontSize: 14 }}>
            {t('adm.lic.template')}
          </button>
        </div>
      </div>
    );
  };

  const pendingCard = () => panel(t('adm.lic.pending'), (
    <>
      {pendings.length === 0 && (
        <div style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.6 }}>{t('adm.lic.noPending')}</div>
      )}
      {pendings.map((p, i) => {
        const ago = since(p.created_at);
        const age = ageOf(p.player?.birthdate);
        /* Sans email, la demande ne vient d'aucun parent : c'est le licencié
           lui-même qui réclame son compte. */
        const self = !p.email;
        const who = p.player?.name || t('adm.lic.unknownAthlete');
        const title = self
          ? (age === null ? t('adm.lic.selfRequest') : t('adm.lic.selfRequestAge', { n: age }))
          : `${who} ← ${p.email}`;
        const sub = [self ? who : t('adm.lic.parentRequest'), ago ? t(ago.key, { n: ago.n }) : '']
          .filter(Boolean).join(' · ');
        return (
          <div key={p.id} style={{ borderTop: i ? '1px solid var(--border)' : 'none', padding: '10px 0',
            display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, overflowWrap: 'anywhere' }}>{title}</div>
              {sub && <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>{sub}</div>}
            </div>
            <button type="button" className="btn ghost" onClick={() => flash(t('adm.lic.validateSoon'))}
              style={{ width: 'auto', padding: '8px 13px', fontSize: 12.5 }}>
              {t('adm.lic.validate')}
            </button>
          </div>
        );
      })}
      <div style={{ fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.5, marginTop: 10 }}>
        {t('adm.lic.pendingNote')}
      </div>
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
          <span className="q" style={{ width: 48, height: 48, flex: '0 0 48px', borderRadius: 16,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
            fontWeight: 800, fontSize: 16, background: club.accent_color || 'var(--brand)',
            backgroundImage: club.logo_url ? `url(${club.logo_url})` : 'none',
            backgroundSize: 'cover', backgroundPosition: 'center' }}>
            {club.logo_url ? '' : initials(club.name)}
          </span>
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
        <div style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.6 }}>{t('adm.lic.brandingNote')}</div>
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
        {sectionHead('adm.nav.teams', (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn ghost" style={{ width: 'auto', padding: '11px 16px', fontSize: 14 }}
              onClick={() => setCsvNote((v) => !v)}>
              {t('adm.importCsv')}
            </button>
            <button type="button" className="btn" style={{ width: 'auto', padding: '11px 16px', fontSize: 14 }}
              onClick={() => { setSection('licences'); setMenuOpen(false); }}>
              {t('adm.newTeam')}
            </button>
          </div>
        ))}

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
                            : head.coaches.map((c, i) => (
                              <div key={i} style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 4 }}>{nameOr(c)}</div>
                            ))}
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
          <button className="btn ghost" style={{ width: 'auto', padding: '11px 16px' }} disabled={busy} onClick={seedDemo}>
            {busy ? '…' : t('club.demoBtn')}
          </button>
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
                  : head.coaches.map((c, i) => (
                    <div key={i} style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 4 }}>{nameOr(c)}</div>
                  ))}
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
        {sectionHead('adm.lic.title', (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn ghost" style={{ width: 'auto', padding: '11px 16px', fontSize: 14 }}
              onClick={() => setCsvNote((v) => !v)}>
              {t('adm.importCsv')}
            </button>
            <button type="button" className="btn" style={{ width: 'auto', padding: '11px 16px', fontSize: 14 }}
              onClick={() => { setTeamName(''); document.getElementById('adm-newteam')?.focus(); }}>
              {t('adm.newTeam')}
            </button>
          </div>
        ))}

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
    const hasAny = Boolean(club.logo_url || club.accent_color);
    return (
      <>
        {sectionHead('adm.nav.branding')}
        <div className="card">
          {!hasAny && <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 14 }}>{t('adm.brandingNone')}</div>}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <span className="q" style={{ width: 62, height: 62, borderRadius: 20, display: 'inline-flex',
              alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 21, color: '#fff',
              background: club.accent_color || 'var(--brand)',
              backgroundImage: club.logo_url ? `url(${club.logo_url})` : 'none',
              backgroundSize: 'cover', backgroundPosition: 'center' }}>
              {club.logo_url ? '' : initials(club.name)}
            </span>
            <div>
              <div className="label">{t('adm.brandingColor')}</div>
              <div style={{ fontSize: 14, fontWeight: 700, marginTop: 3 }}>{club.accent_color || '—'}</div>
            </div>
            <div>
              <div className="label">{t('adm.brandingLogo')}</div>
              <div style={{ fontSize: 14, fontWeight: 700, marginTop: 3 }}>{club.logo_url ? t('adm.brandingSet') : '—'}</div>
            </div>
          </div>
        </div>
      </>
    );
  }

  function SupportSection() {
    return (
      <>
        {sectionHead('adm.nav.support')}
        <div className="card">
          {tickets.length === 0
            ? <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>{t('adm.noTickets')}</div>
            : tickets.map((tk, i) => (
              <div key={tk.id} style={{ borderTop: i ? '1px solid var(--border)' : 'none', padding: '10px 0',
                display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 700, fontSize: 14 }}>{tk.subject}</span>
                <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>
                  {[tk.status, dayText((tk.created_at || '').slice(0, 10))].filter(Boolean).join(' · ')}
                </span>
              </div>
            ))}
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
            <span className="q" style={{ width: 44, height: 44, flex: '0 0 44px', borderRadius: 15,
              background: 'var(--brand)', color: '#fff', display: 'inline-flex', alignItems: 'center',
              justifyContent: 'center', fontWeight: 800, fontSize: 16, letterSpacing: '.5px' }}>
              {initials(club.name)}
            </span>
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

          <nav className="cons-fold" style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {NAV.map((item) => {
              const on = section === item.key;
              return (
                <button key={item.key} type="button"
                  onClick={() => { setSection(item.key); setMenuOpen(false); setErr(''); }}
                  aria-current={on ? 'page' : undefined}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                    border: 'none', borderRadius: 13, padding: '10px 12px', cursor: 'pointer', fontFamily: 'inherit',
                    fontSize: 13.5, fontWeight: 700,
                    background: on ? 'var(--brand)' : 'transparent', color: on ? '#fff' : '#6B6357' }}>
                  <span aria-hidden="true" style={{ fontSize: 15, opacity: on ? 1 : 0.8 }}>{item.icon}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>{t(`adm.nav.${item.key}`)}</span>
                  {counts[item.key] !== null && counts[item.key] > 0 && (
                    <span style={{ fontSize: 11.5, fontWeight: 700, opacity: on ? 0.9 : 0.65 }}>{counts[item.key]}</span>
                  )}
                </button>
              );
            })}
          </nav>

          <div className="cons-fold" style={{ marginTop: 'auto', display: 'grid', gap: 10 }}>
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

            <button type="button" onClick={logout}
              style={{ border: 'none', background: 'transparent', color: 'var(--muted)', fontFamily: 'inherit',
                fontSize: 12.5, fontWeight: 700, cursor: 'pointer', padding: '2px 0', textAlign: 'left' }}>
              {t('common.logout')}
            </button>
          </div>
        </aside>

        {/* ===================== Zone de contenu ===================== */}
        <main className="cons-main">
          {err && <div className="error">{err}</div>}
          {ok && <div className="pill" style={{ marginBottom: 12 }}>{ok}</div>}
          {current}
        </main>
      </div>
    </>
  );
}
