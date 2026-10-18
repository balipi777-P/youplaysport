import { supabase } from './supabaseClient';
import { KEY_CHILD, getStored, setStored } from './spaces';

// Récupère tous les enfants rattachés à l'utilisateur (parent) + sa propre fiche (athlète).
export async function loadMyChildren() {
  const { data: uinfo } = await supabase.auth.getUser();
  const uid = uinfo?.user?.id;
  const { data: all } = await supabase.from('player_parents')
    .select('player_id, status').eq('parent_user_id', uid);
  /* Un rattachement demandé par le parent reste « pending » tant que le club ne
     l'a pas validé : les vues s'en servent pour afficher « À valider ». Refusé,
     il disparaît — l'enfant n'a jamais été rattaché à ce compte. */
  const links = (all || []).filter((l) => (l.status || 'active') !== 'rejected');
  const ids = links.map((l) => l.player_id);
  const statusOf = Object.fromEntries(links.map((l) => [l.player_id, l.status || 'active']));
  let rows = [];
  if (ids.length) {
    const { data } = await supabase.from('players')
      .select('id, first_name, last_name, team_id, teams(name, category, clubs(name, logo_url, accent_color), sports(name_fr, name_en, icon))').in('id', ids);
    rows = (data || []).map((r) => ({ ...r, link_status: statusOf[r.id] || 'active' }));
  }
  const { data: self } = await supabase.from('players')
    .select('id, first_name, last_name, team_id, teams(name, category, clubs(name, logo_url, accent_color), sports(name_fr, name_en, icon))').eq('user_id', uid);
  /* Sa propre fiche d'athlète ne passe par aucun rattachement : rien à valider. */
  for (const s of self || []) if (!rows.some((r) => r.id === s.id)) rows.push({ ...s, link_status: 'active' });
  rows.sort((a, b) => (a.first_name || '').localeCompare(b.first_name || ''));
  return rows;
}

export function pickChild(children, preferId) {
  if (!children || children.length === 0) return null;
  const stored = preferId || getStoredChildId();
  return children.find((c) => c.id === stored) || children[0];
}

export function getStoredChildId() {
  return getStored(KEY_CHILD);
}
export function setStoredChildId(id) {
  /* Une seule source : même clé et même notification que la pastille du haut. */
  setStored(KEY_CHILD, id);
}
