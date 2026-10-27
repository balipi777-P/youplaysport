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
  const [draft, setDraft] = useState('');     // choix sélectionné, pas encore forcément enregistré
  const [seats, setSeats] = useState(1);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    if (!eventId) { setSum(null); return; }
    const { data, error } = await sb().rpc('carpool_summary', { p_event: eventId });
    if (error || !data || !data.enabled || data.excluded) { setSum(null); return; }
    setSum(data);
    /* Réouverture : le choix déjà enregistré est présélectionné (un ancien « self » vaut « pas de place »). */
    const m = data.mine;
    if (m?.choice) {
      setDraft(m.choice === 'self' ? 'unavailable' : m.choice);
      if (m.choice === 'drive' && m.seats) setSeats(m.seats);
    }
  }, [eventId]);

  useEffect(() => { load(); }, [load, refreshKey]);

  function pick(c) { setDraft(c); setSaved(false); setErr(''); }

  async function save() {
    if (!draft) return;
    setErr(''); setBusy(true);
    const { error } = await sb().rpc('set_carpool_choice',
      { p_event: eventId, p_choice: draft, p_seats: draft === 'drive' ? seats : null });
    setBusy(false);
    if (error) { console.error('[set_carpool_choice]', error.message); setErr(t(carpoolErrKey(error))); return; }
    await load();
    setSaved(true);
  }

  if (!sum) return null;
  const mine = sum.mine || null;
  const cur = mine?.choice === 'self' ? 'unavailable' : (mine?.choice || '');
  const driveLabel = (n) => t(n > 1 ? 'carpool.driveMany' : 'carpool.driveOne', { n });
  const step = { width: 44, height: 44, flex: '0 0 44px', borderRadius: 12, border: '1px solid var(--border)', background: '#fff',
    fontSize: 20, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', color: 'var(--ink)', padding: 0 };

  return (
    <Fold title={t('carpool.title')} defaultOpen={false}
      summary={cur ? (cur === 'drive' ? driveLabel(mine.seats) : t(`carpool.${cur}`)) : t('carpool.toChoose')}
      style={{ marginTop: 12, marginBottom: 0, boxShadow: 'none', background: '#FBF6F0', border: '1px solid var(--border)' }}>
      <div style={{ fontSize: 12.5, color: '#57534A', fontWeight: 700, marginBottom: 10 }}>
        {t('carpool.sumOffered', { n: sum.seats_offered ?? 0 })} · {t('carpool.sumRequested', { n: sum.seats_requested ?? 0 })}
      </div>
      <div role="group" aria-label={t('carpool.title')} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button type="button" style={step} disabled={busy || seats <= 1} aria-label={t('carpool.minus')}
            onClick={() => { setSeats((n) => Math.max(1, n - 1)); pick('drive'); }}>−</button>
          <button type="button" aria-pressed={draft === 'drive'} disabled={busy}
            className={draft === 'drive' ? 'btn' : 'btn ghost'} style={{ ...TAP, flex: 1, minWidth: 0, marginBottom: 0, padding: '0 8px' }}
            onClick={() => pick('drive')}>
            {driveLabel(seats)}
          </button>
          <button type="button" style={step} disabled={busy || seats >= 8} aria-label={t('carpool.plus')}
            onClick={() => { setSeats((n) => Math.min(8, n + 1)); pick('drive'); }}>+</button>
        </div>
        {['unavailable', 'need'].map((c) => (
          <button key={c} type="button" aria-pressed={draft === c} disabled={busy}
            className={draft === c ? 'btn' : 'btn ghost'} style={{ ...TAP, marginBottom: 0 }}
            onClick={() => pick(c)}>
            {t(`carpool.${c}`)}
          </button>
        ))}
      </div>
      <button type="button" className="btn" disabled={busy || !draft} onClick={save}
        style={{ ...TAP, marginTop: 12, marginBottom: 0 }}>
        {busy ? '…' : t('carpool.confirm')}
      </button>
      {saved && !err && <div className="pill" role="status" style={{ marginTop: 10 }}>✓ {t('carpool.saved')}</div>}
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
            {p.choice === 'drive'
              ? t(p.seats > 1 ? 'carpool.seatsMany' : 'carpool.seatsOne', { n: p.seats || 0 })
              : t(p.choice === 'need' ? 'carpool.staff.need' : 'carpool.staff.unavailable')}
          </div>
        </div>
      ))}
    </Fold>
  );
}
