'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useT } from '../../lib/i18n';
import Fold from './Fold';

/**
 * Covoiturage d'un événement de déplacement. Tout passe par les RPC carpool_* (table fermée).
 * - Côté parent, le choix est saisi avec la réponse à la convocation (ConvocationAnswer, rsvp_with_carpool).
 * - StaffCarpool : coach de l'équipe et dirigeant voient le détail (parent, enfants, choix, places, sans réponse).
 * Aucune coordonnée n'est lue ni affichée.
 */

/** Types d'événement pour lesquels l'option existe (déplacements). */
export const CARPOOL_TYPES = ['match', 'tournoi', 'stage', 'sortie'];

const TAP = { minHeight: 44 };
const sb = () => supabase.schema('yps');

/** Code d'erreur d'une RPC carpool_* → clé de texte. */
export function carpoolErrKey(e) {
  const m = String(e?.message || '');
  const code = ['carpool_off', 'event_past', 'invalid_seats', 'invalid_choice', 'not_found', 'not_allowed']
    .find((c) => m.includes(c));
  return `carpool.err.${code || 'other'}`;
}

export function StaffCarpool({ eventId, refreshKey, onLoaded }) {
  const { t } = useT();
  const [d, setD] = useState(null);
  const [failed, setFailed] = useState(false);
  const cb = useRef(onLoaded);
  cb.current = onLoaded;

  const load = useCallback(async () => {
    if (!eventId) { setD(null); return; }
    const { data, error } = await sb().rpc('carpool_detail', { p_event: eventId });
    if (error) { console.error('[carpool_detail]', error.message); setFailed(true); setD(null); return; }
    setFailed(false); setD(data || null);
    if (cb.current) cb.current(data || null);
  }, [eventId]);

  useEffect(() => { load(); }, [load, refreshKey]);

  if (failed) return <div className="error" role="alert" style={{ marginTop: 10 }}>{t('carpool.err.load')}</div>;
  if (!d || !d.enabled) return null;
  const people = Array.isArray(d.people) ? d.people : [];
  return (
    <Fold title={t('carpool.title')} defaultOpen={false} badge={people.length || null}
      summary={`${t('carpool.sumOffered', { n: d.seats_offered ?? 0 })} · ${t('carpool.sumRequested', { n: d.seats_requested ?? 0 })} · ${t('carpool.noAnswer', { n: d.no_answer ?? 0 })}`}
      style={{ marginTop: 12 }}>
      {people.length === 0 && <div style={{ fontSize: 13, color: 'var(--muted)' }}>{t('carpool.none')}</div>}
      {people.map((p, i) => (
        <div key={i} style={{ padding: '10px 0', borderTop: i === 0 ? 'none' : '1px solid var(--border)', minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, overflowWrap: 'anywhere' }}>{p.parent_name}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', overflowWrap: 'anywhere' }}>{(p.children || []).join(', ')}</div>
          <div style={{ fontSize: 12.5, fontWeight: 700, marginTop: 2 }}>
            {p.choice === 'drive'
              ? t(p.seats > 1 ? 'carpool.seatsMany' : 'carpool.seatsOne', { n: p.seats || 0 })
              : t(p.choice === 'need' ? 'carpool.staff.need' : 'carpool.staff.unavailable')}
          </div>
        </div>
      ))}
    </Fold>
  );
}
