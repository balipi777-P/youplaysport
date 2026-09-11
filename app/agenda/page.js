'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';
import { loadMyChildren, pickChild, setStoredChildId } from '../../lib/children';
import { useT } from '../../lib/i18n';

const TICON = { match: '⚽', tournoi: '🏆', stage: '🏕️', sortie: '🚌', reunion: '👥' };

export default function Agenda() {
  const router = useRouter();
  const { t, lang } = useT();
  const [ready, setReady] = useState(false);
  const [children, setChildren] = useState([]);
  const [player, setPlayer] = useState(null);
  const [items, setItems] = useState([]);
  const [busyId, setBusyId] = useState('');

  const loadEvents = useCallback(async (p) => {
    setPlayer(p || null);
    if (!p) { setItems([]); return; }
    const { data: convs } = await supabase.from('event_convocations')
      .select('id, response, event_id, events(id, type, datetime, place, opponent)')
      .eq('player_id', p.id);
    const rows = (convs || [])
      .filter((c) => c.events)
      .map((c) => ({ convId: c.id, response: c.response, ev: c.events }))
      .sort((a, b) => new Date(a.ev.datetime) - new Date(b.ev.datetime));
    setItems(rows);
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) { router.replace('/login'); return; }
      const kids = await loadMyChildren();
      setChildren(kids);
      await loadEvents(pickChild(kids));
      setReady(true);
    })();
  }, [router, loadEvents]);

  function switchChild(id) {
    setStoredChildId(id);
    loadEvents(children.find((c) => c.id === id));
  }

  async function respond(item, response) {
    setBusyId(item.convId);
    try {
      await supabase.from('event_convocations')
        .update({ response, responded_at: new Date().toISOString() })
        .eq('id', item.convId);
      await loadEvents(player);
    } finally { setBusyId(''); }
  }

  if (!ready) return <div className="wrap"><p style={{ color: 'var(--muted)' }}>{t('common.loading')}</p></div>;

  if (!player) return (
    <div className="wrap">
      <div className="card"><p style={{ margin: 0, color: 'var(--muted)' }}>{t('common.noChild')}</p></div>
      <a href="#" onClick={(e) => { e.preventDefault(); router.push('/'); }}>{t('common.backLabel')}</a>
    </div>
  );

  const now = new Date();
  const upcoming = items.filter((i) => new Date(i.ev.datetime) >= now);

  return (
    <div className="wrap">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 2 }}>
        <a href="#" onClick={(e) => { e.preventDefault(); router.push('/'); }} style={{ fontWeight: 700 }}>←</a>
        <div className="q" style={{ fontWeight: 700, fontSize: 18 }}>{t('agenda.title')}</div>
      </div>
      <h1 className="q" style={{ fontSize: 22, margin: '2px 0 14px' }}>{player.first_name} {player.last_name || ''}</h1>

      {children.length > 1 && (
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 16 }}>
          {children.map((c) => {
            const on = c.id === player.id;
            return (
              <button key={c.id} type="button" onClick={() => switchChild(c.id)}
                style={{ border: 'none', borderRadius: 18, padding: '7px 13px', fontSize: 13, fontWeight: 700,
                  cursor: 'pointer', fontFamily: 'inherit',
                  background: on ? 'var(--brand)' : '#F1E9E1', color: on ? '#fff' : '#57534A',
                  display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {c.first_name}
                {/* Rattachement demandé, pas encore validé par le club. */}
                {c.link_status === 'pending' && (
                  <span style={{ borderRadius: 20, padding: '2px 7px', fontSize: 9.5, fontWeight: 800,
                    background: on ? 'rgba(255,255,255,.24)' : '#FFF1E3', color: on ? '#fff' : '#9A5B18' }}>
                    {t('add.after.pending')}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {upcoming.length === 0 && (
        <div className="card"><p style={{ margin: 0, color: 'var(--muted)' }}>{t('agenda.none')}</p></div>
      )}

      {upcoming.map((i) => {
        const icon = TICON[i.ev.type] || '📅';
        const label = t(`event.${i.ev.type}`);
        return (
          <div key={i.convId} className="card">
            <div style={{ fontWeight: 700, fontSize: 15 }}>
              {icon} {label}{i.ev.opponent ? ` vs ${i.ev.opponent}` : ''}
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>
              {fmt(i.ev.datetime, lang)}{i.ev.place ? ` · ${i.ev.place}` : ''}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button type="button" disabled={busyId === i.convId} onClick={() => respond(i, 'present')}
                style={btn(i.response === 'present', '#1E7B34', '#E6F4EA')}>{t('agenda.present')}</button>
              <button type="button" disabled={busyId === i.convId} onClick={() => respond(i, 'absent')}
                style={btn(i.response === 'absent', '#C0392B', '#FDECEA')}>{t('agenda.absent')}</button>
            </div>
            {!i.response && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>{t('agenda.pleaseRespond')}</div>}
          </div>
        );
      })}
    </div>
  );
}

function btn(active, color, bg) {
  return {
    flex: 1, border: 'none', borderRadius: 12, padding: '11px 0', fontSize: 13, fontWeight: 700,
    cursor: 'pointer', fontFamily: 'inherit',
    background: active ? color : bg, color: active ? '#fff' : color,
  };
}

function fmt(d, lang) {
  if (!d) return '';
  try {
    return new Date(d).toLocaleString(lang === 'en' ? 'en-GB' : 'fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch { return d; }
}
