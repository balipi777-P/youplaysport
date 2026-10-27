import { fetchMySpaces } from './spaces';

/** Clubs auxquels l'utilisateur peut écrire : ceux de ses enfants et de ses groupes, sauf ceux qu'il dirige. */
export async function loadContactClubs() {
  const d = await fetchMySpaces();
  const byId = new Map();
  const add = (id, name) => { if (id && !byId.has(id)) byId.set(id, name || ''); };
  (d?.parent_clubs || []).forEach((c) => add(c.club_id, c.name));
  (d?.children || []).forEach((c) => add(c.club_id, c.club_name));
  (d?.coach_teams || []).forEach((c) => add(c.club_id, c.club_name));
  (d?.admin_clubs || []).forEach((c) => byId.delete(c.club_id));
  return [...byId].map(([id, name]) => ({ id, name }));
}
