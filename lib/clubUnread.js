'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabaseClient';

/* Messages du club non lus (supabase/club_requests_read.sql : my_club_unread).
   Un seul appel partagé par la barre du bas, le Journal et la page Messages ; si la fonction n'existe pas
   encore ou échoue, on affiche « rien de non lu » plutôt qu'une erreur. */

const EMPTY = { count: 0, latest: null };
const TTL = 30000;
const EVENT = 'yps:club-unread';
let cache = null;     // { at, value }
let inflight = null;

export function fetchClubUnread(force = false) {
  if (!force && cache && Date.now() - cache.at < TTL) return Promise.resolve(cache.value);
  if (!inflight) {
    inflight = (async () => {
      let value = EMPTY;
      try {
        const { data, error } = await supabase.schema('yps').rpc('my_club_unread');
        if (!error && data && typeof data.count === 'number') {
          value = { count: data.count, latest: data.latest && data.latest.id ? data.latest : null };
        }
      } catch { /* pas de pastille */ }
      cache = { at: Date.now(), value };
      return value;
    })().finally(() => { inflight = null; });
  }
  return inflight;
}

/** À appeler après une lecture, une réponse ou une clôture : les pastilles se remettent à jour. */
export function refreshClubUnread() {
  cache = null;
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENT));
}

export function useClubUnread() {
  const [value, setValue] = useState(EMPTY);
  const load = useCallback((force) => { fetchClubUnread(force).then(setValue); }, []);
  useEffect(() => {
    load(false);
    const on = () => load(true);
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, [load]);
  return value;
}
