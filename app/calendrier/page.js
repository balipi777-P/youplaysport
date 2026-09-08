'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';
import { loadMyChildren, pickChild, setStoredChildId } from '../../lib/children';
import { useT } from '../../lib/i18n';

const TICON = { match: '⚽', tournoi: '🏆', stage: '🏕️', sortie: '🚌', reunion: '👥' };
const ATT_COLOR = { present: '#2E9E4F', late: '#C89B1B', absent: '#D0473B' };

// Clé date locale 'YYYY-MM-DD'
function dkey(d) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

export default function Calendrier() {
  const router = useRouter();
  const { t, lang } = useT();
  const [ready, setReady] = useState(false);
  const [children, setChildren] = useState([]);
  const [player, setPlayer] = useState(null);
  const [att, setAtt] = useState({});    // dateKey -> status
  const [evs, setEvs] = useState({});    // dateKey -> [{type, response, opponent, datetime, place}]
  const [cursor, setCursor] = useState(() => { const n = new Date(); return { y: n.getFullYear(), m: n.getMonth() }; });

  const loadData = useCallback(async (p) => {
    setPlayer(p || null);
    if (!p) { setAtt({}); setEvs({}); return; }
    const { data: attRows } = await supabase.from('attendance')
      .select('status, sessions(date)').eq('player_id', p.id);
    const amap = {};
    for (const r of attRows || []) { if (r.sessions?.date) amap[dkey(r.sessions.date)] = r.status; }
    setAtt(amap);
    const { data: convs } = await supabase.from('event_convocations')
      .select('response, events(type, datetime, place, opponent)').eq('player_id', p.id);
    const emap = {};
    for (const c of convs || []) {
      if (!c.events?.datetime) continue;
      const k = dkey(c.events.datetime);
      (emap[k] ||= []).push({ ...c.events, response: c.response });
    }
    setEvs(emap);
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) { router.replace('/login'); return; }
      const kids = await loadMyChildren();
      setChildren(kids);
      await loadData(pickChild(kids));
      setReady(true);
    })();
  }, [router, loadData]);

  function switchChild(id) {
    setStoredChildId(id);
    loadData(children.find((c) => c.id === id));
  }

  function shiftMonth(delta) {
    setCursor((c) => {
      const d = new Date(c.y, c.m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  }

  if (!ready) return <div className="wrap"><p style={{ color: 'var(--muted)' }}>{t('common.loading')}</p></div>;

  if (!player) return (
    <div className="wrap">
      <div className="card"><p style={{ margin: 0, color: 'var(--muted)' }}>{t('common.noChild')}</p></div>
      <a href="#" onClick={(e) => { e.preventDefault(); router.push('/'); }}>{t('common.backLabel')}</a>
    </div>
  );

  const { y, m } = cursor;
  const locale = lang === 'en' ? 'en-GB' : 'fr-FR';
  const monthStart = new Date(y, m, 1);
  const monthLabel = monthStart.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
  const startOffset = (monthStart.getDay() + 6) % 7; // 0 = lundi
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const todayKey = dkey(new Date());

  // En-têtes de jours (lundi -> dimanche) selon la locale
  const weekdays = [];
  for (let i = 0; i < 7; i++) {
    const ref = new Date(2024, 0, 1 + i); // 1 jan 2024 = lundi
    weekdays.push(ref.toLocaleDateString(locale, { weekday: 'short' }).replace('.', ''));
  }

  // Cellules
  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  // Récap du mois (présences)
  let nP = 0, nL = 0, nA = 0;
  const monthItems = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const k = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const st = att[k];
    if (st === 'present') nP++; else if (st === 'late') nL++; else if (st === 'absent') nA++;
    if (st) monthItems.push({ day: d, kind: 'session', status: st });
    for (const e of evs[k] || []) monthItems.push({ day: d, kind: 'event', ev: e });
  }
  monthItems.sort((a, b) => a.day - b.day);

  return (
    <div className="wrap">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 2 }}>
        <a href="#" onClick={(e) => { e.preventDefault(); router.push('/'); }} style={{ fontWeight: 700 }}>←</a>
        <div className="q" style={{ fontWeight: 700, fontSize: 18 }}>{t('cal.title')}</div>
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
                  background: on ? 'var(--brand)' : '#F1E9E1', color: on ? '#fff' : '#57534A' }}>
                {c.first_name}
              </button>
            );
          })}
        </div>
      )}

      {/* Navigation du mois */}
      <div className="card" style={{ paddingBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <button type="button" onClick={() => shiftMonth(-1)} style={navBtn}>‹</button>
          <div className="q" style={{ fontWeight: 700, fontSize: 15, textTransform: 'capitalize' }}>{monthLabel}</div>
          <button type="button" onClick={() => shiftMonth(1)} style={navBtn}>›</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3, marginBottom: 4 }}>
          {weekdays.map((w, i) => (
            <div key={i} style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>{w}</div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
          {cells.map((d, i) => {
            if (d === null) return <div key={i} />;
            const k = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const st = att[k];
            const dayEvs = evs[k] || [];
            const isToday = k === todayKey;
            return (
              <div key={i} style={{
                minHeight: 44, borderRadius: 10, padding: '4px 0 3px',
                background: isToday ? 'var(--peach)' : '#FBF7F2',
                border: isToday ? '1px solid var(--brand)' : '1px solid var(--border)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
              }}>
                <span style={{ fontSize: 12, fontWeight: isToday ? 800 : 600, color: isToday ? 'var(--brand-dark)' : '#57534A' }}>{d}</span>
                <div style={{ display: 'flex', gap: 2, alignItems: 'center', height: 8 }}>
                  {st && <span style={{ width: 7, height: 7, borderRadius: 4, background: ATT_COLOR[st] }} />}
                  {dayEvs.slice(0, 2).map((e, j) => (
                    <span key={j} style={{ fontSize: 8, lineHeight: '8px' }}>{TICON[e.type] || '📅'}</span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Récap présences */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <SummaryPill color={ATT_COLOR.present} label={t('cal.summaryPresent', { n: nP })} />
        <SummaryPill color={ATT_COLOR.late} label={t('cal.summaryLate', { n: nL })} />
        <SummaryPill color={ATT_COLOR.absent} label={t('cal.summaryAbsent', { n: nA })} />
      </div>

      {/* Détail du mois */}
      {monthItems.length === 0 ? (
        <div className="card"><p style={{ margin: 0, color: 'var(--muted)' }}>{t('cal.noData')}</p></div>
      ) : (
        <div className="card">
          <div className="label" style={{ marginBottom: 8 }}>{t('cal.monthItems')}</div>
          {monthItems.map((it, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, borderTop: i ? '1px solid var(--border)' : 'none', paddingTop: i ? 9 : 0, marginTop: i ? 9 : 0 }}>
              <span style={{ width: 26, textAlign: 'center', fontWeight: 800, fontSize: 13, color: 'var(--brand-dark)' }}>{it.day}</span>
              {it.kind === 'session' ? (
                <>
                  <span style={{ width: 8, height: 8, borderRadius: 4, background: ATT_COLOR[it.status] }} />
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{t('cal.session')}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: ATT_COLOR[it.status] }}>
                    {it.status === 'present' ? t('sea.pPresent') : it.status === 'late' ? t('sea.pLate') : t('sea.pAbsent')}
                  </span>
                </>
              ) : (
                <>
                  <span style={{ fontSize: 14 }}>{TICON[it.ev.type] || '📅'}</span>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>
                    {t(`event.${it.ev.type}`)}{it.ev.opponent ? ` vs ${it.ev.opponent}` : ''}
                  </span>
                  {it.ev.response && (
                    <span style={{ fontSize: 12, fontWeight: 700, color: it.ev.response === 'present' ? ATT_COLOR.present : ATT_COLOR.absent }}>
                      {it.ev.response === 'present' ? t('agenda.present') : t('agenda.absent')}
                    </span>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const navBtn = {
  border: '1px solid var(--border)', background: '#fff', borderRadius: 10, width: 34, height: 34,
  fontSize: 18, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', color: 'var(--brand-dark)', lineHeight: 1,
};

function SummaryPill({ color, label }) {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center',
      background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: '9px 6px' }}>
      <span style={{ width: 9, height: 9, borderRadius: 5, background: color }} />
      <span style={{ fontSize: 12, fontWeight: 700 }}>{label}</span>
    </div>
  );
}
