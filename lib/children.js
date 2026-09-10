import { supabase } from './supabaseClient';

const KEY = 'yps_child';

// Récupère tous les enfants rattachés à l'utilisateur (parent) + sa propre fiche (athlète).
export async function loadMyChildren() {
  const { data: uinfo } = await supabase.auth.getUser();
  const uid = uinfo?.user?.id;
  const { data: links } = await supabase.from('player_parents').select('player_id').eq('parent_user_id', uid);
  const ids = (links || []).map((l) => l.player_id);
  let rows = [];
  if (ids.length) {
    const { data } = await supabase.from('players')
      .select('id, first_name, last_name, team_id, teams(name, category, clubs(name), sports(name_fr, name_en, icon))').in('id', ids);
    rows = data || [];
  }
  const { data: self } = await supabase.from('players')
    .select('id, first_name, last_name, team_id, teams(name, category, clubs(name), sports(name_fr, name_en, icon))').eq('user_id', uid);
  for (const s of self || []) if (!rows.some((r) => r.id === s.id)) rows.push(s);
  rows.sort((a, b) => (a.first_name || '').localeCompare(b.first_name || ''));
  return rows;
}

export function pickChild(children, preferId) {
  if (!children || children.length === 0) return null;
  const stored = preferId || getStoredChildId();
  return children.find((c) => c.id === stored) || children[0];
}

export function getStoredChildId() {
  try { return localStorage.getItem(KEY) || ''; } catch { return ''; }
}
export function setStoredChildId(id) {
  try { localStorage.setItem(KEY, id); } catch { /* stockage indisponible */ }
}
