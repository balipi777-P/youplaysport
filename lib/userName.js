'use client';

import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';

/* Nom affiché de l'utilisateur : app_users.full_name (lu sur sa propre ligne) et
   écrit par la RPC set_my_name. Jamais l'email comme titre. */

export const NAME_EVENT = 'yps:name';
const PENDING_KEY = 'yps_pending_name';

/** Nom saisi à l'inscription quand la session n'existe pas encore (email à confirmer). */
export function rememberPendingName(name, email) {
  try { window.localStorage.setItem(PENDING_KEY, JSON.stringify({ name, email: (email || '').toLowerCase() })); }
  catch { /* sans effet */ }
}
/** Le nom en attente, seulement s'il a été saisi avec l'email du compte qui se connecte. */
export function takePendingName(email) {
  try {
    const p = JSON.parse(window.localStorage.getItem(PENDING_KEY) || 'null');
    return p && p.email === (email || '').toLowerCase() ? (p.name || '').trim() : '';
  } catch { return ''; }
}
export function clearPendingName() {
  try { window.localStorage.removeItem(PENDING_KEY); } catch { /* sans effet */ }
}

/** { uid, name } du compte connecté ; uid '' si personne. */
export async function fetchMyName() {
  const { data: u } = await supabase.auth.getUser();
  const uid = u?.user?.id;
  if (!uid) return { uid: '', name: '' };
  const { data } = await supabase.from('app_users').select('full_name').eq('id', uid).maybeSingle();
  return { uid, name: (data?.full_name || '').trim() };
}

export async function saveMyName(name) {
  const clean = (name || '').trim().replace(/\s+/g, ' ');
  if (!clean) throw new Error('empty_name');
  const { error } = await supabase.schema('yps').rpc('set_my_name', { p_name: clean });
  if (error) throw error;
  clearPendingName();
  try { window.dispatchEvent(new Event(NAME_EVENT)); } catch { /* sans effet */ }
  return clean;
}

export const firstNameOf = (name) => (name || '').trim().split(/\s+/)[0] || '';

export function initialsOfName(name) {
  return (name || '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

/** Nom du compte connecté, relu quand il est enregistré ailleurs dans l'app. */
export function useMyName() {
  const [name, setName] = useState('');
  useEffect(() => {
    let alive = true;
    const load = () => fetchMyName().then((r) => { if (alive) setName(r.name); }).catch(() => {});
    load();
    window.addEventListener(NAME_EVENT, load);
    return () => { alive = false; window.removeEventListener(NAME_EVENT, load); };
  }, []);
  return name;
}
