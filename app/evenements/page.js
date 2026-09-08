'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';
import { useT } from '../../lib/i18n';

const TYPES = [
  { key: 'match', icon: '⚽', hasOpponent: true },
  { key: 'tournoi', icon: '🏆', hasOpponent: true },
  { key: 'stage', icon: '🏕️', hasOpponent: false },
  { key: 'sortie', icon: '🚌', hasOpponent: false },
  { key: 'reunion', icon: '👥', hasOpponent: false },
];
const TMAP = Object.fromEntries(TYPES.map((t) => [t.key, t]));

export default function Evenements() {
  const router = useRouter();
  const { t, lang } = useT();
  const [ready, setReady] = useState(false);
  const [teams, setTeams] = useState([]);
  const [teamId, setTeamId] = useState('');
  const [events, setEvents] = useState([]);
  const [type, setType] = useState('match');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [place, setPlace] = useState('');
  const [opponent, setOpponent] = useState('');
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);

  const flash = (m) => { setOk(m); setErr(''); setTimeout(() => setOk(''), 3500); };

  const loadEvents = useCallback(async (tid) => {
    if (!tid) { setEvents([]); return; }
    const { data } = await supabase.from('events')
      .select('id, type, datetime, place, opponent, event_convocations(response)')
      .eq('team_id', tid).order('datetime', { ascending: true });
    setEvents(data || []);
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) { router.replace('/login'); return; }
      const { data: ct } = await supabase.from('coach_teams').select('teams(id, name)');
      const { data: adminMem } = await supabase.from('memberships').select('club_id').eq('role', 'admin');
      let all = (ct || []).map((r) => r.teams).filter(Boolean);
      if (adminMem && adminMem.length) {
        const ids = adminMem.map((m) => m.club_id);
        const { data: at } = await supabase.from('teams').select('id, name').in('club_id', ids);
        all = all.concat(at || []);
      }
      const uniq = Object.values(Object.fromEntries(all.map((t) => [t.id, t])));
      setTeams(uniq);
      if (uniq[0]) setTeamId(uniq[0].id);
      setReady(true);
    })();
  }, [router]);

  useEffect(() => { loadEvents(teamId); }, [teamId, loadEvents]);

  async function create() {
    setErr(''); setBusy(true);
    try {
      if (!teamId) throw new Error(t('evt.errTeam'));
      if (!date || !time) throw new Error(t('evt.errDate'));
      const iso = new Date(`${date}T${time}`).toISOString();
      const { error } = await supabase.rpc('create_event', {
        p_team: teamId, p_type: type, p_datetime: iso,
        p_place: place || null, p_opponent: TMAP[type].hasOpponent ? (opponent || null) : null,
      });
      if (error) throw error;
      setDate(''); setTime(''); setPlace(''); setOpponent('');
      flash(t('evt.created'));
      await loadEvents(teamId);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  if (!ready) return <div className="wrap"><p style={{ color: 'var(--muted)' }}>{t('common.loading')}</p></div>;

  return (
    <div className="wrap">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <a href="#" onClick={(e) => { e.preventDefault(); router.push('/'); }} style={{ fontWeight: 700 }}>←</a>
        <div className="q" style={{ fontWeight: 700, fontSize: 18 }}>{t('evt.title')}</div>
      </div>

      {teams.length === 0 && (
        <div className="card"><p style={{ margin: 0, color: 'var(--muted)' }}>
          {t('evt.noTeam')}
        </p></div>
      )}

      {teams.length > 0 && (
        <>
          {err && <div className="error">{err}</div>}
          {ok && <div className="pill" style={{ marginBottom: 12 }}>{ok}</div>}

          <div className="card">
            <div className="label" style={{ marginBottom: 6 }}>{t('evt.team')}</div>
            <select className="input" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
              {teams.map((tm) => <option key={tm.id} value={tm.id}>{tm.name}</option>)}
            </select>
          </div>

          <div className="card">
            <div className="label" style={{ marginBottom: 8 }}>{t('evt.newEvent')}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 12 }}>
              {TYPES.map((ty) => {
                const on = type === ty.key;
                return (
                  <button key={ty.key} type="button" onClick={() => setType(ty.key)}
                    style={{ border: 'none', borderRadius: 18, padding: '7px 12px', fontSize: 12, fontWeight: 700,
                      cursor: 'pointer', fontFamily: 'inherit',
                      background: on ? 'var(--brand)' : '#F1E9E1', color: on ? '#fff' : '#57534A' }}>
                    {ty.icon} {t(`event.${ty.key}`)}
                  </button>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 7 }}>
              <input className="input" type="date" style={{ flex: 1 }} value={date} onChange={(e) => setDate(e.target.value)} />
              <input className="input" type="time" style={{ flex: 1 }} value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
            <input className="input" value={place} onChange={(e) => setPlace(e.target.value)} placeholder={t('evt.placePh')} />
            {TMAP[type].hasOpponent && (
              <input className="input" value={opponent} onChange={(e) => setOpponent(e.target.value)} placeholder={t('evt.opponentPh')} />
            )}
            <button className="btn" disabled={busy} onClick={create}>{busy ? '…' : t('evt.create')}</button>
          </div>

          <div className="card">
            <div className="label" style={{ marginBottom: 8 }}>{t('evt.upcoming')}</div>
            {events.length === 0 && <div style={{ fontSize: 13, color: 'var(--muted)' }}>{t('evt.none')}</div>}
            {events.map((ev) => {
              const icon = TMAP[ev.type]?.icon || '📅';
              const rows = ev.event_convocations || [];
              const present = rows.filter((r) => r.response === 'present').length;
              const absent = rows.filter((r) => r.response === 'absent').length;
              const pending = rows.length - present - absent;
              return (
                <div key={ev.id} style={{ borderTop: '1px solid var(--border)', paddingTop: 11, marginTop: 11 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>
                    {icon} {t(`event.${ev.type}`)}{ev.opponent ? ` vs ${ev.opponent}` : ''}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                    {fmt(ev.datetime, lang)}{ev.place ? ` · ${ev.place}` : ''}
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    <span className="pill" style={{ background: '#E6F4EA', color: '#1E7B34' }}>{t('evt.presentN', { n: present })}</span>
                    <span className="pill" style={{ background: '#FDECEA', color: '#C0392B' }}>{t('evt.absentN', { n: absent })}</span>
                    <span className="pill">{t('evt.pendingN', { n: pending })}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function fmt(d, lang) {
  if (!d) return '';
  try {
    return new Date(d).toLocaleString(lang === 'en' ? 'en-GB' : 'fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch { return d; }
}
