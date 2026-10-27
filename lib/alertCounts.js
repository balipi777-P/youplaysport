'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabaseClient';

/* Compteurs d'alertes des accueils (supabase/alerts.sql). Lecture seule, un appel partagé et mis en cache
   30 s par fonction. Si la fonction échoue, on affiche « rien » plutôt qu'une erreur. */

const TTL = 30000;
const EVENT = 'yps:alert-counts';
const cache = {};     // name -> { at, value }
const inflight = {};

function fetchCounts(name, empty, force) {
  const c = cache[name];
  if (!force && c && Date.now() - c.at < TTL) return Promise.resolve(c.value);
  if (!inflight[name]) {
    inflight[name] = (async () => {
      let value = empty;
      try {
        const { data, error } = await supabase.schema('yps').rpc(name);
        if (!error && Array.isArray(data)) value = data;
        else if (!error && data && typeof data === 'object') value = { ...empty, ...data };
      } catch { /* pas de pastille */ }
      cache[name] = { at: Date.now(), value };
      return value;
    })().finally(() => { delete inflight[name]; });
  }
  return inflight[name];
}

/** À appeler après une réponse, une ouverture d'événement, un pointage : les pastilles se remettent à jour. */
export function refreshAlertCounts() {
  Object.keys(cache).forEach((k) => delete cache[k]);
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENT));
}

function useCounts(name, empty, enabled = true) {
  const [value, setValue] = useState(empty);
  const load = useCallback((force) => {
    if (enabled) fetchCounts(name, empty, force).then(setValue);
  }, [name, empty, enabled]);
  useEffect(() => {
    load(false);
    const on = () => load(true);
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, [load]);
  return value;
}

const PARENT_EMPTY = { convocations: 0, carpool: 0 };
const STAFF_EMPTY = { events: 0, sessions: 0, messages: 0 };
const NEWS_EMPTY = [];
const PENDING_EMPTY = { count: 0, next: null };

export const useParentAlerts = () => useCounts('parent_alert_counts', PARENT_EMPTY);
export const useStaffAlerts = (enabled = true) => useCounts('staff_alert_counts', STAFF_EMPTY, enabled);
/** Événements du staff qui ont du nouveau : [{ event_id, responses, carpool }]. */
export const useStaffEventNews = () => useCounts('staff_event_news', NEWS_EMPTY);
export const usePendingConvocations = () => useCounts('my_pending_convocations', PENDING_EMPTY);

/** Appelé à l'ouverture d'un événement par le staff ; l'erreur (not_allowed, fonction absente) est ignorée. */
export async function markEventSeen(eventId) {
  if (!eventId) return;
  try {
    const { error } = await supabase.schema('yps').rpc('mark_event_seen', { p_event: eventId });
    if (!error) refreshAlertCounts();
  } catch { /* silencieux */ }
}
