'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';
import { useT } from '../../lib/i18n';
import BottomNav, { BOTTOM_NAV_HEIGHT } from '../components/BottomNav';

/* Écran Événements du coach : poser un match et convoquer le groupe.
   Le groupe, ses athlètes et l'état des réponses viennent tous de la base.
   Personne n'est inventé : les convocations affichées sont les lignes réelles
   de event_convocations, et un événement qui vient d'être créé n'affiche que
   des « en attente » — c'est l'état vrai tant que personne n'a répondu. */

/* L'ordre suit l'énumération event_type. L'adversaire n'a de sens que pour une
   rencontre : create_event met la colonne à null pour les autres types. */
const TYPES = [
  { key: 'match', icon: '⚽', hasOpponent: true },
  { key: 'tournoi', icon: '🏆', hasOpponent: true },
  { key: 'stage', icon: '🏕️', hasOpponent: false },
  { key: 'sortie', icon: '🚌', hasOpponent: false },
  { key: 'reunion', icon: '👥', hasOpponent: false },
];
const TMAP = Object.fromEntries(TYPES.map((ty) => [ty.key, ty]));

const STATUS = {
  present: { bg: '#E6F4EA', ink: '#1E7B34', key: 'evt.badgePresent' },
  absent: { bg: '#FDECEA', ink: '#C0392B', key: 'evt.badgeAbsent' },
  pending: { bg: '#FFF1E3', ink: '#9A5B18', key: 'evt.badgePending' },
};

/** « ER » à partir d'un prénom et d'un nom. */
function initials(p) {
  return [p.first_name, p.last_name].filter(Boolean)
    .map((w) => w.trim()[0]).join('').toUpperCase() || '?';
}

export default function Evenements() {
  const router = useRouter();
  const { t, lang } = useT();
  const [ready, setReady] = useState(false);
  const [teams, setTeams] = useState([]);
  const [teamId, setTeamId] = useState('');
  const [events, setEvents] = useState([]);
  const [eventId, setEventId] = useState(''); // '' = nouvel événement
  const [players, setPlayers] = useState([]);
  const [convocations, setConvocations] = useState({}); // {playerId: response|null}
  const [type, setType] = useState('match');
  const [opponent, setOpponent] = useState('');
  const [place, setPlace] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [deadline, setDeadline] = useState('');
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);

  const flash = (m) => { setOk(m); setErr(''); setTimeout(() => setOk(''), 3500); };

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
      const uniq = Object.values(Object.fromEntries(all.map((tm) => [tm.id, tm])));
      setTeams(uniq);
      /* ?team=… : l'accueil coach ouvre l'écran sur un groupe précis. */
      const wanted = new URLSearchParams(window.location.search).get('team');
      const pre = uniq.find((tm) => tm.id === wanted);
      setTeamId(pre ? pre.id : (uniq[0]?.id || ''));
      setReady(true);
    })();
  }, [router]);

  /* Effectif du groupe et ses événements. Le coach lit player_parents sur ses
     propres licenciés (pp_select) : c'est ce qui permet de dire qui répond. */
  const loadTeam = useCallback(async (tid) => {
    if (!tid) { setPlayers([]); setEvents([]); return; }
    const { data: pls } = await supabase.from('players')
      .select('id, first_name, last_name, user_id').eq('team_id', tid).order('first_name');
    const list = pls || [];
    const ids = list.map((p) => p.id);
    let linked = new Set();
    if (ids.length) {
      const { data: pp } = await supabase.from('player_parents').select('player_id').in('player_id', ids);
      linked = new Set((pp || []).map((r) => r.player_id));
    }
    setPlayers(list.map((p) => ({ ...p, hasParent: linked.has(p.id) })));

    const { data: evs } = await supabase.from('events')
      .select('id, type, datetime, place, opponent, rsvp_deadline')
      .eq('team_id', tid).order('datetime', { ascending: true });
    setEvents(evs || []);
  }, []);

  useEffect(() => { setEventId(''); loadTeam(teamId); }, [teamId, loadTeam]);

  /* Réponses réelles de l'événement affiché. Un événement qui n'existe pas
     encore n'a aucune ligne : tout le monde est en attente. */
  const loadConvocations = useCallback(async (eid) => {
    if (!eid) { setConvocations({}); return; }
    const { data } = await supabase.from('event_convocations')
      .select('player_id, response').eq('event_id', eid);
    setConvocations(Object.fromEntries((data || []).map((r) => [r.player_id, r.response])));
  }, []);

  useEffect(() => { loadConvocations(eventId); }, [eventId, loadConvocations]);

  /* Sélectionner un événement existant, c'est le consulter : les champs
     reprennent ses valeurs et ne sont plus modifiables ici. */
  function pickEvent(id) {
    setEventId(id);
    setErr('');
    const ev = events.find((e) => e.id === id);
    if (!ev) { setOpponent(''); setPlace(''); setDate(''); setTime(''); setDeadline(''); return; }
    setType(ev.type);
    setOpponent(ev.opponent || '');
    setPlace(ev.place || '');
    if (ev.datetime) {
      const d = new Date(ev.datetime);
      setDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
      setTime(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
    } else { setDate(''); setTime(''); }
    if (ev.rsvp_deadline) {
      const d = new Date(ev.rsvp_deadline);
      setDeadline(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    } else setDeadline('');
  }

  async function send() {
    setErr(''); setBusy(true);
    try {
      if (!teamId) throw new Error(t('evt.errTeam'));
      if (!date || !time) throw new Error(t('evt.errDate'));
      /* La date-limite couvre toute la journée saisie : le parent qui répond
         le soir même n'est pas hors délai. */
      const rsvp = deadline ? new Date(`${deadline}T23:59:59`).toISOString() : null;
      const { data: newId, error } = await supabase.rpc('create_event', {
        p_team: teamId, p_type: type, p_datetime: new Date(`${date}T${time}`).toISOString(),
        p_place: place || null, p_opponent: TMAP[type].hasOpponent ? (opponent || null) : null,
        p_rsvp_deadline: rsvp,
      });
      if (error) throw error;
      await loadTeam(teamId);
      if (newId) setEventId(newId);
      flash(t('evt.sent', { n: players.length }));
    } catch (e) { setErr(e.message || t('common.error')); } finally { setBusy(false); }
  }

  if (!ready) return <div className="wrap"><p style={{ color: 'var(--muted)' }}>{t('common.loading')}</p></div>;

  const locked = Boolean(eventId); // un événement existant se consulte, il ne se ressaisit pas
  const answered = (p) => convocations[p.id] || 'pending';
  const count = (s) => players.filter((p) => answered(p) === s).length;

  /* Qui est en droit de répondre. event_convocations ne garde pas l'auteur de
     la réponse : ce qui est sûr, c'est le compte rattaché au licencié. */
  function whoAnswers(p) {
    if (p.user_id && p.hasParent) return t('evt.byBoth');
    if (p.user_id) return t('evt.byAthlete');
    if (p.hasParent) return t('evt.byParent');
    return t('evt.byNobody');
  }

  const evLabel = (ev) => {
    const when = ev.datetime
      ? new Date(ev.datetime).toLocaleString(lang === 'en' ? 'en-GB' : 'fr-FR',
        { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
      : '';
    return [t(`event.${ev.type}`), ev.opponent, when].filter(Boolean).join(' · ');
  };

  const field = (text) => <div className="label" style={{ marginBottom: 6 }}>{text}</div>;

  return (
    <div className="wrap" style={{ paddingBottom: BOTTOM_NAV_HEIGHT + 24 }}>
      {/* ===== En-tête ===== */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 18 }}>
        <a href="#" onClick={(e) => { e.preventDefault(); router.push('/'); }}
          style={{ fontWeight: 700, fontSize: 16, lineHeight: '22px' }}>‹</a>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: 'var(--muted)', fontSize: 10.5, fontWeight: 800, letterSpacing: '.9px' }}>
            {t('evt.eyebrow')}
          </div>
          <h1 className="q" style={{ fontSize: 22, letterSpacing: '-0.3px', margin: '3px 0 0' }}>
            {t('evt.headTitle')}
          </h1>
        </div>
      </div>

      {teams.length === 0 && (
        <div className="card"><p style={{ margin: 0, color: 'var(--muted)' }}>{t('evt.noTeam')}</p></div>
      )}

      {teams.length > 0 && (
        <>
          {err && <div className="error">{err}</div>}
          {ok && <div className="pill" style={{ marginBottom: 12 }}>{ok}</div>}

          {/* ===== Le groupe, et l'événement regardé ===== */}
          <div className="card">
            {field(t('evt.team'))}
            <select className="input" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
              {teams.map((tm) => <option key={tm.id} value={tm.id}>{tm.name}</option>)}
            </select>
            {events.length > 0 && (
              <>
                {field(t('evt.which'))}
                <select className="input" style={{ marginBottom: 0 }} value={eventId}
                  onChange={(e) => pickEvent(e.target.value)}>
                  <option value="">{t('evt.newEvent')}</option>
                  {events.map((ev) => <option key={ev.id} value={ev.id}>{evLabel(ev)}</option>)}
                </select>
              </>
            )}
          </div>

          {/* ===== Type, adversaire, lieu, RDV ===== */}
          <div className="card">
            {field(t('evt.type'))}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 14 }}>
              {TYPES.map((ty) => {
                const on = type === ty.key;
                return (
                  <button key={ty.key} type="button" disabled={locked}
                    onClick={() => setType(ty.key)}
                    style={{ border: 'none', borderRadius: 20, padding: '7px 12px', fontSize: 12, fontWeight: 700,
                      cursor: locked ? 'default' : 'pointer', fontFamily: 'inherit',
                      opacity: locked && !on ? 0.45 : 1,
                      background: on ? 'var(--brand)' : '#F1E9E1', color: on ? '#fff' : '#57534A' }}>
                    {ty.icon} {t(`event.${ty.key}`)}
                  </button>
                );
              })}
            </div>

            {TMAP[type].hasOpponent && (
              <>
                {field(t('evt.opponent'))}
                <input className="input" value={opponent} disabled={locked}
                  onChange={(e) => setOpponent(e.target.value)} placeholder={t('evt.opponentPh')} />
              </>
            )}

            {field(t('evt.place'))}
            <input className="input" value={place} disabled={locked}
              onChange={(e) => setPlace(e.target.value)} placeholder={t('evt.placePh')} />

            {field(t('evt.date'))}
            <input className="input" type="date" value={date} disabled={locked}
              onChange={(e) => setDate(e.target.value)} />

            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                {field(t('evt.meetTime'))}
                <input className="input" type="time" style={{ marginBottom: 0 }} value={time}
                  disabled={locked} onChange={(e) => setTime(e.target.value)} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                {field(t('evt.replyBefore'))}
                <input className="input" type="date" style={{ marginBottom: 0 }} value={deadline}
                  disabled={locked} onChange={(e) => setDeadline(e.target.value)} />
              </div>
            </div>
          </div>

          {/* ===== Convocations ===== */}
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
              <span className="label" style={{ marginBottom: 0 }}>{t('evt.callups')}</span>
              {players.length > 0 && (
                <span style={{ flex: '0 0 auto', fontSize: 11, fontWeight: 700, color: 'var(--muted)' }}>
                  <span style={{ color: STATUS.present.ink }}>{t('evt.recapPresent', { n: count('present') })}</span>
                  {' · '}
                  <span style={{ color: STATUS.absent.ink }}>{t('evt.recapAbsent', { n: count('absent') })}</span>
                  {' · '}
                  <span style={{ color: STATUS.pending.ink }}>{t('evt.recapPending', { n: count('pending') })}</span>
                </span>
              )}
            </div>

            {players.length === 0 && (
              <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 8 }}>{t('evt.noPlayers')}</div>
            )}

            {players.map((p, i) => {
              const st = STATUS[answered(p)];
              return (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0',
                  borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}>
                  <span className="q" aria-hidden="true" style={{ flex: '0 0 36px', width: 36, height: 36,
                    borderRadius: 12, background: 'var(--peach)', color: 'var(--brand-dark)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12.5, fontWeight: 800 }}>
                    {initials(p)}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.first_name} {p.last_name || ''}
                    </span>
                    <span style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)', marginTop: 1 }}>
                      {whoAnswers(p)}
                    </span>
                  </span>
                  <span style={{ flex: '0 0 auto', background: st.bg, color: st.ink, borderRadius: 999,
                    padding: '5px 11px', fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap' }}>
                    {t(st.key)}
                  </span>
                </div>
              );
            })}

            {!locked && players.length > 0 && (
              <div style={{ fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.5, marginTop: 10 }}>
                {t('evt.notSentYet')}
              </div>
            )}
          </div>

          {/* Un événement existant se consulte : aucun bouton d'envoi, les
              convocations sont déjà parties au moment de sa création. */}
          {locked ? (
            <button type="button" className="btn ghost" onClick={() => pickEvent('')}>
              {t('evt.newEvent')}
            </button>
          ) : (
            <button className="btn" disabled={busy || players.length === 0} onClick={send}
              style={{ padding: 16, fontSize: 16, borderRadius: 16,
                boxShadow: '0 8px 20px rgba(192,91,68,.28)' }}>
              {busy ? t('evt.sending') : t('evt.send')}
            </button>
          )}
        </>
      )}

      <BottomNav role="coach" />
    </div>
  );
}
