'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useT } from '../../lib/i18n';
import { carpoolErrKey } from './Carpool';

const TAP = { minHeight: 44, marginBottom: 0 };

/**
 * Réponse du parent à une convocation : présence et covoiturage en un seul bloc, un seul bouton.
 * Un appel unique rsvp_with_carpool. « Absent » masque le covoiturage et n'envoie aucun choix.
 * Le choix de covoiturage est celui du parent (partagé entre ses enfants), relu depuis carpool_summary.
 */
export default function ConvocationAnswer({ eventId, playerId, response, onSaved }) {
  const { t } = useT();
  const [on, setOn] = useState(false);          // covoiturage ouvert pour cet événement
  const [answer, setAnswer] = useState(response || '');
  const [choice, setChoice] = useState('');
  const [seats, setSeats] = useState(1);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    if (!eventId) { setOn(false); return; }
    const { data, error } = await supabase.schema('yps').rpc('carpool_summary', { p_event: eventId });
    if (error || !data || !data.enabled) { setOn(false); return; }
    setOn(true);
    const m = data.mine;
    if (m?.choice) {
      setChoice(m.choice === 'self' ? 'unavailable' : m.choice);
      if (m.choice === 'drive' && m.seats) setSeats(m.seats);
    }
  }, [eventId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setAnswer(response || ''); }, [response, playerId]);

  const needsChoice = on && answer === 'present';
  const complete = !!answer && (!needsChoice || !!choice);

  function pickAnswer(a) { setAnswer(a); setSaved(false); setErr(''); }
  function pickChoice(c) { setChoice(c); setSaved(false); setErr(''); }

  async function submit() {
    if (!complete || busy) return;
    setBusy(true); setErr(''); setSaved(false);
    const withChoice = needsChoice;
    const { error } = await supabase.schema('yps').rpc('rsvp_with_carpool', {
      p_event: eventId, p_player: playerId, p_response: answer,
      p_choice: withChoice ? choice : null,
      p_seats: withChoice && choice === 'drive' ? seats : null,
    });
    if (error) {
      console.error('[rsvp_with_carpool]', error.message);
      const m = String(error.message || '');
      const code = ['not_authorized', 'not_convoked', 'event_not_found'].find((c) => m.includes(c));
      setErr(t(code ? `rsvp.err.${code}` : (/carpool|seats|choice|event_past/.test(m) ? carpoolErrKey(error) : 'rsvp.err.other')));
      setBusy(false);
      return;
    }
    if (onSaved) await onSaved();
    await load();
    setBusy(false);
    setSaved(true);
  }

  const driveLabel = (n) => t(n > 1 ? 'carpool.driveMany' : 'carpool.driveOne', { n });
  const step = { width: 44, height: 44, flex: '0 0 44px', borderRadius: 12, border: '1px solid var(--border)', background: '#fff',
    fontSize: 20, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', color: 'var(--ink)', padding: 0 };

  return (
    <div style={{ marginTop: 12 }}>
      <div role="group" aria-label={t('agenda.title')} style={{ display: 'flex', gap: 8 }}>
        {[['present', 'agenda.present'], ['absent', 'agenda.absent']].map(([a, key]) => (
          <button key={a} type="button" aria-pressed={answer === a} disabled={busy}
            className={answer === a ? 'btn' : 'btn ghost'} style={{ ...TAP, flex: 1, minWidth: 0 }}
            onClick={() => pickAnswer(a)}>
            {t(key)}
          </button>
        ))}
      </div>

      {needsChoice && (
        <div style={{ marginTop: 12, padding: 10, borderRadius: 12, background: '#FBF6F0', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>{t('carpool.title')}</div>
          <div role="group" aria-label={t('carpool.title')} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button type="button" style={step} disabled={busy || seats <= 1} aria-label={t('carpool.minus')}
                onClick={() => { setSeats((n) => Math.max(1, n - 1)); pickChoice('drive'); }}>−</button>
              <button type="button" aria-pressed={choice === 'drive'} disabled={busy}
                className={choice === 'drive' ? 'btn' : 'btn ghost'} style={{ ...TAP, flex: 1, minWidth: 0, padding: '0 8px' }}
                onClick={() => pickChoice('drive')}>
                {driveLabel(seats)}
              </button>
              <button type="button" style={step} disabled={busy || seats >= 8} aria-label={t('carpool.plus')}
                onClick={() => { setSeats((n) => Math.min(8, n + 1)); pickChoice('drive'); }}>+</button>
            </div>
            {['unavailable', 'need'].map((c) => (
              <button key={c} type="button" aria-pressed={choice === c} disabled={busy}
                className={choice === c ? 'btn' : 'btn ghost'} style={TAP} onClick={() => pickChoice(c)}>
                {t(`carpool.${c}`)}
              </button>
            ))}
          </div>
        </div>
      )}

      <button type="button" className="btn" disabled={!complete || busy} onClick={submit}
        style={{ ...TAP, marginTop: 12, width: '100%' }}>
        {busy ? '…' : t('rsvp.validate')}
      </button>
      {saved && !err && <div className="pill" role="status" style={{ marginTop: 10 }}>✓ {t('rsvp.saved')}</div>}
      {err && <div className="error" role="alert" style={{ marginTop: 10 }}>{err}</div>}
    </div>
  );
}
