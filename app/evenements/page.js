'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';
import { useT } from '../../lib/i18n';
import { getStored, KEY_TEAM } from '../../lib/spaces';
import { NOTES_MAX, withNotes } from '../../lib/eventNotes';
import { markEventSeen } from '../../lib/alertCounts';
import { StaffCarpool, CARPOOL_TYPES, carpoolErrKey } from '../components/Carpool';
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
  const [summary, setSummary] = useState(null); // {present, absent, pending} d'event_responses
  const [resending, setResending] = useState(false);
  const [sel, setSel] = useState(() => new Set()); // joueurs cochés pour un nouvel événement
  const [adding, setAdding] = useState('');         // id du joueur en cours d'ajout
  const [type, setType] = useState('match');
  const [opponent, setOpponent] = useState('');
  const [place, setPlace] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [deadline, setDeadline] = useState('');
  const [notes, setNotes] = useState('');
  const [carpool, setCarpool] = useState(false);
  const [carpoolAsk, setCarpoolAsk] = useState(false); // confirmation avant de couper le covoiturage
  const [carpoolCount, setCarpoolCount] = useState(0); // choix déjà saisis par les familles
  const [carpoolKey, setCarpoolKey] = useState(0);
  const [carpoolBusy, setCarpoolBusy] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);

  /* Message clair pour les erreurs des RPC de convocation. */
  const rpcMsg = (e) => {
    const m = String(e?.message || '');
    if (m.includes('no_players')) return t('evt.errNoPlayers');
    if (m.includes('player_not_in_team')) return t('evt.errNotInTeam');
    const code = ['not_authorized', 'not_convoked', 'event_not_found'].find((c) => m.includes(c));
    return code ? t(`rsvp.err.${code}`) : t('rsvp.err.other');
  };

  const okTimer = useRef(null);
  const flash = (m) => {
    setOk(m); setErr('');
    clearTimeout(okTimer.current);
    okTimer.current = setTimeout(() => setOk(''), 6000);
  };
  /* ?event=… : l'accueil ouvre l'écran sur un événement précis (lu une seule fois). */
  const wantedEvent = useRef(null);
  useEffect(() => { wantedEvent.current = new URLSearchParams(window.location.search).get('event'); }, []);
  useEffect(() => () => clearTimeout(okTimer.current), []);

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
      const stored = uniq.find((tm) => tm.id === getStored(KEY_TEAM));
      setTeamId(pre ? pre.id : (stored?.id || uniq[0]?.id || ''));
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
    setSel(new Set(ids)); // par défaut : tout le groupe est convoqué

    const { data: evs } = await withNotes((wn) => supabase.from('events')
      .select(`id, type, datetime, place, opponent, rsvp_deadline, carpool${wn ? ', notes' : ''}`)
      .eq('team_id', tid).order('datetime', { ascending: true }));
    setEvents(evs || []);
    if (wantedEvent.current) {
      if ((evs || []).some((e) => e.id === wantedEvent.current)) setEventId(wantedEvent.current);
      wantedEvent.current = null;
    }
  }, []);

  useEffect(() => { setEventId(''); setCarpool(false); setCarpoolAsk(false); loadTeam(teamId); }, [teamId, loadTeam]);

  /* Réponses réelles de l'événement affiché. Un événement qui n'existe pas
     encore n'a aucune ligne : tout le monde est en attente. */
  const loadConvocations = useCallback(async (eid) => {
    if (!eid) { setConvocations({}); setSummary(null); return; }
    const { data, error } = await supabase.schema('yps').rpc('event_responses', { p_event: eid });
    if (error) {
      console.error('[event_responses]', error);
      setConvocations({}); setSummary(null); setErr(rpcMsg(error));
      return;
    }
    setConvocations(Object.fromEntries((data?.players || []).map((r) => [r.player_id, r.response])));
    setSummary({ present: data?.present ?? 0, absent: data?.absent ?? 0, pending: data?.pending ?? 0 });
  }, [t]);

  useEffect(() => { loadConvocations(eventId); }, [eventId, loadConvocations]);
  /* Le staff a ouvert l'événement : le repère de lecture avance (erreur ignorée en silence). */
  useEffect(() => { if (eventId) markEventSeen(eventId); }, [eventId]);

  /* Sélectionner un événement existant, c'est le consulter : les champs
     reprennent ses valeurs et ne sont plus modifiables ici. */
  function pickEvent(id) {
    setEventId(id);
    setErr('');
    setCarpoolAsk(false); setCarpoolCount(0);
    const ev = events.find((e) => e.id === id);
    setCarpool(Boolean(ev?.carpool));
    if (!ev) { setOpponent(''); setPlace(''); setDate(''); setTime(''); setDeadline(''); setNotes(''); return; }
    setType(ev.type);
    setOpponent(ev.opponent || '');
    setPlace(ev.place || '');
    setNotes(ev.notes || '');
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

  async function resend() {
    setErr(''); setResending(true);
    try {
      const { data, error } = await supabase.schema('yps').rpc('send_convocations', { p_event: eventId });
      if (error) throw error;
      const n = Number(data) || 0;
      flash(n > 0 ? t('rsvp.sentN', { n }) : t('rsvp.upToDate'));
      await loadConvocations(eventId);
    } catch (e) {
      console.error('[send_convocations]', e);
      setErr(rpcMsg(e));
    } finally { setResending(false); }
  }

  /* Les précisions restent modifiables après publication : seul champ de
     l'événement qu'on peut encore changer, via une RPC réservée au staff. */
  async function saveNotes() {
    setErr(''); setSavingNotes(true);
    try {
      const { error } = await supabase.rpc('update_event_notes', { p_event: eventId, p_notes: notes });
      if (error) throw error;
      await loadTeam(teamId);
      flash(t('evt.notesSaved'));
    } catch (e) {
      console.error('[update_event_notes]', e);
      setErr(rpcMsg(e));
    } finally { setSavingNotes(false); }
  }

  /* Joueur oublié : ajout après publication, sans doublon (fait côté base). */
  async function addToCallup(pid) {
    setErr(''); setAdding(pid);
    try {
      const { error } = await supabase.rpc('add_event_convocations', { p_event: eventId, p_players: [pid] });
      if (error) throw error;
      await loadConvocations(eventId);
      flash(t('evt.added'));
    } catch (e) {
      console.error('[add_event_convocations]', e);
      setErr(rpcMsg(e));
    } finally { setAdding(''); }
  }

  /* Covoiturage d'un événement existant : activer est immédiat ; désactiver supprime les choix
     des familles, donc confirmation si certains existent. */
  async function applyCarpool(on) {
    setErr(''); setCarpoolBusy(true);
    try {
      const { error } = await supabase.schema('yps').rpc('set_event_carpool', { p_event: eventId, p_enabled: on });
      if (error) throw error;
      setCarpool(on); setCarpoolAsk(false); setCarpoolCount(0);
      setCarpoolKey((k) => k + 1);
      await loadTeam(teamId);
    } catch (e) {
      console.error('[set_event_carpool]', e);
      setErr(t(carpoolErrKey(e)));
    } finally { setCarpoolBusy(false); }
  }
  function onCarpoolBox(on) {
    if (!locked) { setCarpool(on); return; }
    if (!on && carpoolCount > 0) { setCarpoolAsk(true); return; }
    applyCarpool(on);
  }

  const toggleOne = (id) => setSel((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allOn = players.length > 0 && sel.size === players.length;
  const toggleAll = () => setSel(allOn ? new Set() : new Set(players.map((p) => p.id)));

  async function send() {
    setErr(''); setBusy(true);
    try {
      const mine = (m) => Object.assign(new Error(m), { mine: true });
      if (!teamId) throw mine(t('evt.errTeam'));
      if (sel.size === 0) throw mine(t('evt.errNoPlayers'));
      if (!date || !time) throw mine(t('evt.errDate'));
      /* La date-limite couvre toute la journée saisie : le parent qui répond
         le soir même n'est pas hors délai. */
      const rsvp = deadline ? new Date(`${deadline}T23:59:59`).toISOString() : null;
      const { data: newId, error } = await supabase.rpc('create_event', {
        p_team: teamId, p_type: type, p_datetime: new Date(`${date}T${time}`).toISOString(),
        p_place: place || null, p_opponent: TMAP[type].hasOpponent ? (opponent || null) : null,
        p_rsvp_deadline: rsvp,
        /* Envoyé seulement s'il est rempli : un événement sans précision reste
           créable même avant l'application de la migration. */
        ...(notes.trim() ? { p_notes: notes.trim() } : {}),
        /* Liste envoyée seulement si le groupe n'est pas entier : « tout le
           groupe » reste l'appel historique (p_players null côté base). */
        ...(sel.size < players.length ? { p_players: [...sel] } : {}),
      });
      if (error) throw error;
      let cpFailed = false;
      if (newId && carpool && CARPOOL_TYPES.includes(type)) {
        const { error: cpErr } = await supabase.schema('yps').rpc('set_event_carpool', { p_event: newId, p_enabled: true });
        if (cpErr) { console.error('[set_event_carpool]', cpErr); cpFailed = true; }
      }
      await loadTeam(teamId);
      if (newId) setEventId(newId);
      setCarpool(carpool && !cpFailed);
      if (cpFailed) { setErr(t('carpool.err.other')); }
      flash(t(sel.size === 1 ? 'evt.sent1' : 'evt.sent', { n: sel.size }));
    } catch (e) {
      console.error('[create_event]', e);
      /* Toujours un message français : les erreurs de la base sont traduites. */
      setOk('');
      setErr(e?.mine ? e.message : rpcMsg(e));
    } finally { setBusy(false); }
  }

  if (!ready) return <div className="wrap"><p style={{ color: 'var(--muted)' }}>{t('common.loading')}</p></div>;

  const locked = Boolean(eventId); // un événement existant se consulte, il ne se ressaisit pas
  const answered = (p) => convocations[p.id] || 'pending';
  const count = (s) => (summary && eventId ? summary[s] : players.filter((p) => answered(p) === s).length);

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
      {/* ===== Confirmation : tout en haut, fermable, disparaît seule ===== */}
      {ok && (
        <div role="status" aria-live="polite" style={{ position: 'sticky', top: 8, zIndex: 20, display: 'flex',
          alignItems: 'center', gap: 10, background: '#E7F4EA', color: '#1E6B3A', border: '1px solid #BFE0C8',
          borderRadius: 12, padding: '10px 12px', fontSize: 14, fontWeight: 700, marginBottom: 12,
          boxShadow: '0 2px 8px rgba(0,0,0,.08)' }}>
          <span style={{ flex: 1 }}>✓ {ok}</span>
          <button type="button" aria-label={t('common.close')} onClick={() => setOk('')}
            style={{ background: 'none', border: 'none', color: 'inherit', fontSize: 18, lineHeight: 1,
              cursor: 'pointer', padding: 4 }}>×</button>
        </div>
      )}
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
          {err && <div className="error" role="alert">{err}</div>}

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

            {/* Covoiturage : déplacements uniquement, modifiable après publication. */}
            {CARPOOL_TYPES.includes(type) && (
              <div style={{ marginTop: 14 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 44, cursor: 'pointer' }}>
                  <input type="checkbox" checked={carpool} disabled={carpoolBusy}
                    onChange={(e) => onCarpoolBox(e.target.checked)}
                    style={{ flex: '0 0 auto', width: 22, height: 22, accentColor: 'var(--brand-dark)' }} />
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 14, fontWeight: 700 }}>{t('carpool.option')}</span>
                    <span style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.4 }}>{t('carpool.optionHint')}</span>
                  </span>
                </label>
                {carpoolAsk && (
                  <div role="alertdialog" aria-label={t('carpool.offTitle')} style={{ marginTop: 8, padding: 12, borderRadius: 12,
                    background: '#FFF1E3', border: '1px solid #F6DCC0' }}>
                    <div style={{ fontSize: 13.5, fontWeight: 800, color: '#9A5B18' }}>{t('carpool.offTitle')}</div>
                    <div style={{ fontSize: 12.5, color: '#57534A', margin: '4px 0 10px', lineHeight: 1.5 }}>{t('carpool.offBody')}</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button type="button" className="btn" disabled={carpoolBusy}
                        style={{ minHeight: 44, width: 'auto', padding: '0 16px', marginBottom: 0 }}
                        onClick={() => applyCarpool(false)}>{t('carpool.offYes')}</button>
                      <button type="button" className="btn ghost" disabled={carpoolBusy}
                        style={{ minHeight: 44, width: 'auto', padding: '0 16px', marginBottom: 0 }}
                        onClick={() => setCarpoolAsk(false)}>{t('carpool.offNo')}</button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Consignes pour les familles : modifiables même après publication. */}
            <div style={{ marginTop: 14 }}>
              {field(t('evt.notes'))}
              <textarea className="input" rows={4} value={notes} maxLength={NOTES_MAX}
                onChange={(e) => setNotes(e.target.value)} placeholder={t('evt.notesPh')}
                style={{ resize: 'vertical', marginBottom: 4, whiteSpace: 'pre-wrap' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10,
                fontSize: 11, color: 'var(--muted)' }}>
                <span>{t('evt.notesHint')}</span>
                <span style={{ flex: '0 0 auto' }}>{t('evt.notesCount', { n: notes.length, max: NOTES_MAX })}</span>
              </div>
              {locked && (
                <button type="button" className="btn ghost" style={{ marginTop: 10, marginBottom: 0 }}
                  disabled={savingNotes || notes === (events.find((e) => e.id === eventId)?.notes || '')}
                  onClick={saveNotes}>
                  {savingNotes ? t('evt.sending') : t('evt.notesSave')}
                </button>
              )}
            </div>
          </div>

          {/* ===== Convocations ===== */}
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
              <span className="label" style={{ marginBottom: 0 }}>{t('evt.callups')}</span>
              {players.length > 0 && locked && (
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

            {!locked && players.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                gap: 10, margin: '8px 0 4px', flexWrap: 'wrap' }}>
                <button type="button" className="btn" aria-pressed={allOn}
                  style={{ width: 'auto', padding: '0 14px', marginBottom: 0,
                    background: allOn ? 'var(--brand)' : 'var(--peach)',
                    color: allOn ? '#fff' : 'var(--brand-dark)',
                    border: allOn ? 'none' : '1px solid var(--brand)' }} onClick={toggleAll}>
                  {allOn ? t('evt.deselectAll') : t('evt.allPlayers')}
                </button>
                <span aria-live="polite" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--muted)' }}>
                  {t('evt.selectedCount', { n: sel.size, total: players.length })}
                </span>
              </div>
            )}

            {players.map((p, i) => {
              const invited = Object.prototype.hasOwnProperty.call(convocations, p.id);
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
                  {!locked ? (
                    <input type="checkbox" checked={sel.has(p.id)} onChange={() => toggleOne(p.id)}
                      aria-label={`${p.first_name} ${p.last_name || ''}`}
                      style={{ flex: '0 0 auto', width: 22, height: 22, accentColor: 'var(--brand-dark)' }} />
                  ) : invited ? (
                    <span style={{ flex: '0 0 auto', background: st.bg, color: st.ink, borderRadius: 999,
                      padding: '5px 11px', fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap' }}>
                      {t(st.key)}
                    </span>
                  ) : (
                    <button type="button" className="btn ghost" disabled={adding === p.id}
                      style={{ flex: '0 0 auto', width: 'auto', padding: '0 12px', marginBottom: 0, fontSize: 12 }}
                      onClick={() => addToCallup(p.id)}>
                      {adding === p.id ? '…' : t('evt.addToCallup')}
                    </button>
                  )}
                </div>
              );
            })}

            {!locked && players.length > 0 && (
              <div style={{ fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.5, marginTop: 10 }}>
                {t('evt.notSentYet')}
              </div>
            )}
          </div>

          {locked && carpool && CARPOOL_TYPES.includes(type) && (
            <StaffCarpool eventId={eventId} refreshKey={carpoolKey}
              onLoaded={(d) => setCarpoolCount(Array.isArray(d?.people) ? d.people.length : 0)} />
          )}

          {/* Un événement existant se consulte : aucun bouton d'envoi, les
              convocations sont déjà parties au moment de sa création. */}
          {locked ? (
            <>
              <button type="button" className="btn" disabled={resending} onClick={resend}>
                {resending ? t('evt.sending') : t('rsvp.sendCallups')}
              </button>
              <button type="button" className="btn ghost" onClick={() => pickEvent('')}>
                {t('evt.newEvent')}
              </button>
            </>
          ) : (
            <button className="btn" disabled={busy || players.length === 0 || sel.size === 0} onClick={send}
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
