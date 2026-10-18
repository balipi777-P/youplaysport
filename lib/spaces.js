import { supabase } from './supabaseClient';

/* Aiguillage « un email = un compte » : yps.my_spaces() est la source de vérité.
   L'espace courant et son contexte (enfant / équipe / club) sont retenus dans
   localStorage ; les écrans les lisent au lieu de valeurs figées. */

export const KEY_SPACE = 'yps_current_space';
export const KEY_CHILD = 'yps_current_child';
export const KEY_TEAM = 'yps_current_team';
export const KEY_CLUB = 'yps_current_club';

const ORDER = ['admin', 'coach', 'parent', 'athlete', 'superadmin'];

/** Accueil de chaque espace : l'admin arrive sur la console club (club courant), les autres sur l'accueil. */
export const SPACE_HOME = {
  admin: '/club', coach: '/', parent: '/', athlete: '/', superadmin: '/superadmin',
};

export function getStored(key) {
  try { return localStorage.getItem(key) || ''; } catch { return ''; }
}
export const CONTEXT_EVENT = 'yps:context';
export function setStored(key, value) {
  try { if (value) localStorage.setItem(key, value); else localStorage.removeItem(key); } catch { /* stockage indisponible */ }
  /* Prévient les composants montés (ex. pastille du haut) : le localStorage seul ne notifie pas l'onglet courant. */
  try { window.dispatchEvent(new CustomEvent(CONTEXT_EVENT, { detail: { key } })); } catch { /* SSR */ }
}
export function clearSpaceStorage() {
  for (const k of [KEY_SPACE, KEY_CHILD, KEY_TEAM, KEY_CLUB]) setStored(k, '');
}

/** Contenu de yps.my_spaces(), ou null en cas d'erreur. */
export async function fetchMySpaces() {
  const { data, error } = await supabase.schema('yps').rpc('my_spaces');
  if (error) { console.error('[my_spaces]', error); return null; }
  return data || null;
}

/** Espaces du compte, dans l'ordre d'affichage. Superadmin n'y figure que s'il est réel. */
export function listSpaces(d) {
  if (!d) return [];
  const set = new Set(d.spaces || []);
  if (d.is_platform_admin) set.add('superadmin');
  return ORDER.filter((k) => set.has(k));
}

/** Espace stocké, s'il existe encore dans le compte courant (sinon ''). */
export function validStoredSpace(d) {
  const s = getStored(KEY_SPACE);
  return s && s !== 'superadmin' && listSpaces(d).includes(s) ? s : '';
}

/** Éléments du contexte secondaire de l'espace : [{ id, label }]. */
export function contextOptions(space, d) {
  if (!d) return [];
  if (space === 'parent') return (d.children || []).map((c) => ({ id: c.player_id, label: c.name }));
  if (space === 'coach') {
    return (d.coach_teams || []).map((tm) => ({ id: tm.team_id, label: tm.name, hint: tm.club_name }));
  }
  if (space === 'admin') return (d.admin_clubs || []).map((c) => ({ id: c.club_id, label: c.name }));
  return [];
}
export const CONTEXT_KEY = { parent: KEY_CHILD, coach: KEY_TEAM, admin: KEY_CLUB };

/** Fixe l'espace courant et un contexte valide (le stocké s'il existe, sinon le premier). */
export function enterSpace(space, d) {
  setStored(KEY_SPACE, space);
  if (space === 'athlete') {
    if (d?.athlete?.player_id) setStored(KEY_CHILD, d.athlete.player_id);
  } else if (CONTEXT_KEY[space]) {
    const opts = contextOptions(space, d);
    const cur = getStored(CONTEXT_KEY[space]);
    if (!opts.some((o) => o.id === cur)) setStored(CONTEXT_KEY[space], opts[0]?.id || '');
  }
  return SPACE_HOME[space] || '/';
}
