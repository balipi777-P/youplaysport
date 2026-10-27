import { supabase } from './supabaseClient';

/* Exports de données. Tout passe par des fonctions SECURITY DEFINER
   (export_child_data, club_export) qui vérifient le rôle, le rattachement
   ou le club et journalisent l'appel ; aucune lecture directe des tables. */

function download(name, text, mime) {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const slug = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'export';
const today = () => new Date().toISOString().slice(0, 10);

/* Une cellule commençant par = + - @ serait interprétée comme une formule par
   Excel/Sheets : on la neutralise avec une apostrophe, puis on échappe le CSV. */
function cell(v) {
  if (v === null || v === undefined) return '';
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/* Ordre des colonnes par export (jsonb ne garde pas l'ordre des clés) : nom puis prénom en premier. */
const COLUMNS = {
  licencies: ['nom', 'prenom', 'naissance', 'equipe', 'categorie', 'parents_lies', 'inscrit_le'],
  equipes: ['equipe', 'categorie', 'joueurs', 'coachs', 'creee_le'],
  presences: ['nom', 'prenom', 'equipe', 'date', 'statut'],
};
/* Dates écrites AAAA-MM-JJ : un tableur n'a plus à deviner le format (10/25/2026). */
const DATE_COLS = new Set(['naissance', 'inscrit_le', 'creee_le', 'date']);
const isoDay = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : v);

export function toCsv(rows, kind) {
  if (!rows.length) return '';
  const known = COLUMNS[kind] || [];
  const present = Object.keys(rows[0]);
  const cols = [...known.filter((c) => present.includes(c)), ...present.filter((c) => !known.includes(c))];
  rows = rows.map((r) => Object.fromEntries(cols.map((c) => [c, DATE_COLS.has(c) ? isoDay(r[c]) : r[c]])));
  const lines = [cols.map(cell).join(';')];
  rows.forEach((r) => lines.push(cols.map((c) => cell(r[c])).join(';')));
  /* BOM + séparateur ; : s'ouvre correctement dans Excel en français. */
  return `﻿${lines.join('\r\n')}\r\n`;
}

export async function exportChildData(player) {
  const { data, error } = await supabase.rpc('export_child_data', { p_player: player.id });
  if (error) throw error;
  download(`youplaysport-${slug(player.first_name)}-${today()}.json`, JSON.stringify(data ?? {}, null, 2), 'application/json');
}

export async function exportClubCsv(clubId, kind, clubName) {
  const { data, error } = await supabase.rpc('club_export', { p_club: clubId, p_kind: kind });
  if (error) throw error;
  download(`${slug(clubName)}-${kind}-${today()}.csv`, toCsv(data || [], kind), 'text/csv');
  return (data || []).length;
}
