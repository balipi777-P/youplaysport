/**
 * Import CSV des licenciés : analyse locale, sans réseau. Chaque ligne est validée ici ;
 * l'écriture en base (joueur, rattachement des parents) est faite par la console.
 *
 * Colonnes : nom, prenom, date_naissance, email_parent_1, email_parent_2 (optionnelle), groupe.
 * L'ancienne colonne email_parent est lue comme email_parent_1. Une colonne « sport » facultative
 * sert à écarter les lignes d'un autre sport (un club = un seul sport).
 */

export const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]{2,}$/;

export const fold = (x) => `${x ?? ''}`.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

/** Découpe un CSV (guillemets, séparateur , ou ;) en tableau de lignes de cellules. */
export function parseCsv(text) {
  const src = `${text || ''}`.replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] || '';
  const sep = firstLine.includes(';') && !firstLine.includes(',') ? ';' : ',';
  const rows = [];
  let row = []; let cell = ''; let quoted = false;
  for (let i = 0; i < src.length; i += 1) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i += 1; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i += 1;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => `${x}`.trim() !== ''));
}

/** AAAA-MM-JJ ou JJ/MM/AAAA -> { iso } ; vide -> { iso: null } ; autre ou date impossible -> { bad: true }. */
export function parseBirth(raw) {
  const v = `${raw ?? ''}`.trim();
  if (!v) return { iso: null };
  let y; let m; let d;
  let hit = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(v);
  if (hit) [, y, m, d] = hit;
  else {
    hit = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v);
    if (hit) [, d, m, y] = hit;
  }
  if (!hit) return { bad: true };
  const Y = Number(y); const M = Number(m); const D = Number(d);
  const dt = new Date(Date.UTC(Y, M - 1, D));
  const real = dt.getUTCFullYear() === Y && dt.getUTCMonth() === M - 1 && dt.getUTCDate() === D;
  if (!real || Y < 1900 || dt.getTime() > Date.now()) return { bad: true };
  return { iso: `${String(Y).padStart(4, '0')}-${String(M).padStart(2, '0')}-${String(D).padStart(2, '0')}` };
}

const HEADS = {
  nom: 'last', prenom: 'first', date_naissance: 'birth', groupe: 'group', sport: 'sport',
  email_parent_1: 'mail1', email_parent: 'mail1', email_parent_2: 'mail2',
};

/**
 * Lit le texte d'un CSV.
 * @param {string} text
 * @param {{ teams: {id:string,name:string}[], sportLabels: string[] }} ctx groupes du club et noms (repliés) de son sport
 * @returns {{ headerError: boolean, rows: object[], problems: {line:number,key:string,vars?:object}[], skipped: number }}
 *   rows : lignes importables { line, first, last, birth, mails[], teamId } ; problems : lignes écartées ou avertissements.
 */
export function readImport(text, ctx) {
  const table = parseCsv(text);
  const out = { headerError: false, rows: [], problems: [], skipped: 0 };
  if (table.length === 0) { out.headerError = true; return out; }
  const at = {};
  table[0].forEach((h, i) => { const k = HEADS[fold(h).replace(/\s+/g, '_')]; if (k && at[k] === undefined) at[k] = i; });
  if (at.first === undefined) { out.headerError = true; return out; }
  const cell = (r, k) => (at[k] === undefined ? '' : `${r[at[k]] ?? ''}`.trim());
  const teamByName = new Map();
  for (const tm of ctx.teams || []) if (!teamByName.has(fold(tm.name))) teamByName.set(fold(tm.name), tm);
  const seen = new Map();

  table.slice(1).forEach((r, idx) => {
    const line = idx + 2;
    const sportCell = fold(cell(r, 'sport'));
    if (sportCell && ctx.sportLabels.length && !ctx.sportLabels.includes(sportCell)) { out.skipped += 1; return; }

    const first = cell(r, 'first'); const last = cell(r, 'last');
    if (!first) { out.problems.push({ line, key: 'rowNoName' }); return; }

    const birth = parseBirth(cell(r, 'birth'));
    if (birth.bad) { out.problems.push({ line, key: 'rowBadDate', vars: { value: cell(r, 'birth') } }); return; }

    const groupName = cell(r, 'group');
    let teamId = null;
    if (groupName) {
      const tm = teamByName.get(fold(groupName));
      if (!tm) { out.problems.push({ line, key: 'rowBadGroup', vars: { group: groupName } }); return; }
      teamId = tm.id;
    }

    const sig = `${fold(first)}|${fold(last)}|${birth.iso || ''}`;
    if (seen.has(sig)) { out.problems.push({ line, key: 'rowDupFile', vars: { first: seen.get(sig) } }); return; }
    seen.set(sig, line);

    const mails = [];
    ['mail1', 'mail2'].forEach((k, n) => {
      const v = cell(r, k);
      if (!v) return;
      if (!EMAIL_RE.test(v)) { out.problems.push({ line, key: 'rowBadMail', vars: { n: n + 1, value: v }, warn: true }); return; }
      if (mails.some((m) => m.toLowerCase() === v.toLowerCase())) {
        out.problems.push({ line, key: 'rowDupMail', vars: { value: v }, warn: true }); return;
      }
      mails.push(v);
    });

    out.rows.push({ line, first, last, birth: birth.iso, mails, teamId });
  });
  return out;
}
