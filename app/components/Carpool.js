'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useT } from '../../lib/i18n';
import Fold from './Fold';

/**
 * Covoiturage d'un événement de déplacement. Tout passe par les RPC carpool_* (table fermée).
 * - ParentCarpool : le parent concerné choisit (conduire + places, besoin d'une place, je me débrouille,
 *   indisponible) et voit les totaux. Rien n'est rendu si l'option est coupée, si le parent n'est pas
 *   concerné (tous ses enfants « absent ») ou si la lecture échoue.
 * - StaffCarpool : coach de l'équipe et dirigeant voient le détail (parent, enfants, choix, places, sans réponse).
 * Aucune coordonnée n'est lue ni affichée.
 */

/** Types d'événement pour lesquels l'option existe (déplacements). */
export const CARPOOL_TYPES = ['match', 'tournoi', 'stage', 'sortie'];

const CHOICES = ['drive', 'need', 'self', 'unavailable'];
const TAP = { minHeight: 44 };
const sb = () => supabase.schema('yps');

/** Code d'erreur d'une RPC carpool_* → clé de texte. */
export function carpoolErrKey(e) {
  const m = String(e?.message || '');
  const code = ['carpool_off', 'event_past', 'invalid_seats', 'invalid_choice', 'not_found', 'not_allowed']
    .find((c) => m.includes(c));
  return `carpool.err.${code || 'other'}`;
}

export function ParentCarpool({ eventId, refreshKey }) {
  const { t } = useT();
  const [sum, setSum] = useState(null);       // null = rien à afficher
  const [pick, setPick] = useState('');       // choix en cours de saisie (drive attend les places)
  const [seats, setSeats] = useState(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    if (!eventId) { setSum(null); return; }
    const { data, error } = await sb().rpc('carpool_summary', { p_event: eventId });
    if (error || !data || !data.enabled || data.excluded) { setSum(null); return; }
    setSum(data);
  }, [eventId]);

  useEffect(() => { load(); }, [load, refreshKey]);

  async function save(choice, n) {
    setErr(''); setBusy(true);
    const { error } = await sb().rpc('set_carpool_choice',
      { p_event: eventId, p_choice: choice, p_seats: choice === 'drive' ? n : null });
    setBusy(false);
    if (error) { console.error('[set_carpool_choice]', error.message); setErr(t(carpoolErrKey(error))); return; }
    setPick('');
    await load();
  }

  if (!sum) return null;
  const mine = sum.mine || null;
  const shown = pick || mine?.choice || '';
  const label = (c) => t(`carpool.${c}`);

  return (
    <Fold title={t('carpool.title')} defaultOpen={false}
      summary={mine ? (mine.choice === 'drive' ? t('carpool.mineDrive', { n: mine.seats }) : label(mine.choice)) : t('carpool.toChoose')}
      style={{ marginTop: 12, marginBottom: 0, boxShadow: 'none', background: '#FBF6F0', border: '1px solid var(--border)' }}>
      <div style={{ fontSize: 12.5, color: '#57534A', fontWeight: 700, marginBottom: 10 }}>
        {t('carpool.sumOffered', { n: sum.seats_offered ?? 0 })} · {t('carpool.sumRequested', { n: sum.seats_requested ?? 0 })}
      </div>
      <div role="group" aria-label={t('carpool.title')} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {CHOICES.map((c) => {
          const on = shown === c;
          return (
            <button key={c} type="button" aria-pressed={on} disabled={busy}
              className={on ? 'btn' : 'btn ghost'} style={{ ...TAP, marginBottom: 0 }}
              onClick={() => {
                setErr('');
                if (c === 'drive') { setPick('drive'); setSeats(mine?.choice === 'drive' && mine.seats ? mine.seats : 1); }
                else save(c);
              }}>
              {label(c)}
            </button>
          );
        })}
      </div>
      {pick === 'drive' && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 12 }}>
          <label htmlFor={`cp-seats-${eventId}`} style={{ fontSize: 13, fontWeight: 700 }}>{t('carpool.seats')}</label>
          <select id={`cp-seats-${eventId}`} className="input" value={seats} style={{ ...TAP, width: 'auto', marginBottom: 0 }}
            onChange={(e) => setSeats(Number(e.target.value))}>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <button type="button" className="btn" disabled={busy} style={{ ...TAP, width: 'auto', padding: '0 16px', marginBottom: 0 }}
            onClick={() => save('drive', seats)}>
            {busy ? '…' : t('carpool.confirm')}
          </button>
        </div>
      )}
      {err && <div className="error" role="alert" style={{ marginTop: 10 }}>{err}</div>}
    </Fold>
  );
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
            {t(`carpool.${p.choice}`)}{p.choice === 'drive' && p.seats ? ` · ${t('carpool.seatsN', { n: p.seats })}` : ''}
          </div>
        </div>
      ))}
    </Fold>
  );
}
