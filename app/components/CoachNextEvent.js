'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useT } from '../../lib/i18n';

/** Bloc d'accueil coach : prochain événement (ou en cours) des groupes suivis.
    Les compteurs viennent de event_responses (réservée au coach de l'équipe) ;
    s'ils manquent, le bloc s'affiche quand même sans eux. */
export default function CoachNextEvent({ event, onOpen }) {
  const { t, lang } = useT();
  const [counts, setCounts] = useState(null);

  useEffect(() => {
    let alive = true;
    setCounts(null);
    if (!event?.id) return undefined;
    (async () => {
      const { data, error } = await supabase.schema('yps').rpc('event_responses', { p_event: event.id });
      if (!alive || error || !data) return;
      const present = data.present ?? 0;
      const absent = data.absent ?? 0;
      const pending = data.pending ?? 0;
      setCounts({ convoked: present + absent + pending, replied: present + absent });
    })();
    return () => { alive = false; };
  }, [event?.id]);

  if (!event) return null;
  const loc = lang === 'en' ? 'en-GB' : 'fr-FR';
  const d = new Date(event.datetime);
  const ongoing = d.getTime() <= Date.now();
  const when = [
    d.toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'long' }),
    d.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' }),
  ].join(' · ');
  const title = [t(`event.${event.type}`), event.teamName].filter(Boolean).join(' ')
    + (event.opponent ? ` – ${event.opponent}` : '');

  return (
    <button type="button" onClick={() => onOpen(event)} className="card"
      style={{ display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer', font: 'inherit',
        color: 'inherit', marginTop: 18, border: '1px solid var(--border)' }}>
      <div className="label">{ongoing ? t('coach.eventOngoing') : t('coach.eventNext')}</div>
      <div className="q" style={{ fontSize: 17, fontWeight: 800, margin: '4px 0' }}>{title}</div>
      <div style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.5 }}>
        {[when, event.place && `📍 ${event.place}`].filter(Boolean).join(' · ')}
      </div>
      {counts && (
        <div style={{ marginTop: 8, fontSize: 12.5, fontWeight: 700, color: 'var(--brand-dark)' }}>
          {t('coach.eventCounts', { n: counts.convoked, r: counts.replied })}
        </div>
      )}
    </button>
  );
}
