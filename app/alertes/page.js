'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';
import { loadMyChildren } from '../../lib/children';
import { useT } from '../../lib/i18n';
import BottomNav, { BOTTOM_NAV_HEIGHT } from '../components/BottomNav';

/* Centre de notifications du parent : tous ses enfants, tous leurs clubs.
   Rien n'est inventé — chaque carte pointe une ligne qui existe en base.

   Source. yps.notifications est la table prévue pour ça (elle est lisible par son
   destinataire et lui seul), mais rien ne l'alimente aujourd'hui : aucune fonction,
   aucun déclencheur, et la RLS n'ouvre pas l'insertion au client. Tant qu'elle est
   vide, la boîte est composée des faits que le parent peut déjà lire — mot du coach,
   compte rendu publié, compétence validée, convocation, rattachement. Dès qu'un
   service écrira dans la table, ce sont ses lignes qui s'affichent et la composition
   locale s'efface d'elle-même.

   Le chargement ne manipule aucun libellé : il ne garde que des champs bruts, et
   les phrases sont construites au rendu. Changer de langue ne relit donc rien. */

const GREEN_BG = '#E9F1EA';
const GREEN_LINE = '#CFE2D2';
const GREEN_DOT = '#5E9268';

/* Fenêtre regardée en arrière pour les faits récents, et rappel d'événement. */
const RECENT_DAYS = 30;
const REMINDER_DAYS = 3;
const MAX_ITEMS = 25;
const TRIAL_SOON_DAYS = 14;

/* Catégories du sous-onglet « Réglages push ». Les clés servent aussi de libellé
   de titre dans la boîte. */
const PUSH_KINDS = ['coachWord', 'callup', 'skill', 'reminder', 'report', 'link'];
/* Titres dont le libellé existe ; une ligne stockée d'un autre type reste générique. */
const KNOWN_KINDS = [...PUSH_KINDS, 'trial'];
const EVENT_TYPES = ['match', 'tournoi', 'stage', 'sortie', 'reunion'];

const SEEN_KEY = 'yps_alerts_seen';
const locale = (lang) => (lang === 'en' ? 'en-GB' : 'fr-FR');
const dayISO = (d) => d.toISOString().slice(0, 10);

function hhmm(value, lang) {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{2}:\d{2}/.test(value)) return value.slice(0, 5);
  try {
    return new Date(value).toLocaleTimeString(locale(lang), { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}
function longDate(value, lang) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleDateString(locale(lang), { day: 'numeric', month: 'long' });
  } catch { return ''; }
}

/** Horodatage relatif : « il y a 12 min », « ce matin », « hier », « 3 septembre ». */
function stamp(value, now, t, lang) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const ms = d - now;
  const sameDay = d.toDateString() === now.toDateString();
  if (ms <= 0) {
    const min = Math.round(-ms / 60000);
    if (min < 1) return t('alerts.now');
    if (min < 60) return t('alerts.minsAgo', { n: min });
    if (sameDay) {
      if (d.getHours() < 12 && now.getHours() >= 12) return t('alerts.thisMorning');
      return t('alerts.hoursAgo', { n: Math.round(-ms / 3600000) });
    }
    const y = new Date(now); y.setDate(y.getDate() - 1);
    if (d.toDateString() === y.toDateString()) return t('alerts.yesterday');
    return longDate(d, lang);
  }
  if (sameDay) return t('alerts.today');
  const tm = new Date(now); tm.setDate(tm.getDate() + 1);
  if (d.toDateString() === tm.toDateString()) return t('alerts.tomorrow');
  return longDate(d, lang);
}

export default function Alertes() {
  const router = useRouter();
  const { t, lang } = useT();
  const [ready, setReady] = useState(false);
  const [navRole, setNavRole] = useState('parent');
  const [tab, setTab] = useState('inbox');
  const [items, setItems] = useState([]);
  /* Dernier passage sur la boîte, lu au montage puis repoussé à maintenant : ce qui
     est arrivé depuis est non lu. Faute d'écriture possible sur notifications.read_at,
     ce repère reste local à l'appareil. */
  const [seenAt, setSeenAt] = useState(null);
  /* Réglages push : cases visuelles, rien n'est encore enregistré nulle part. */
  const [push, setPush] = useState(() => Object.fromEntries(PUSH_KINDS.map((k) => [k, true])));

  const loadItems = useCallback(async (children, uid) => {
    const out = [];
    const now = new Date();
    const since = new Date(now.getFullYear(), now.getMonth(), now.getDate() - RECENT_DAYS);

    /* 1. La table dédiée d'abord : si un service l'alimente, elle fait foi. */
    const { data: rows } = await supabase.from('notifications')
      .select('id, type, payload, read_at, created_at')
      .order('created_at', { ascending: false }).limit(MAX_ITEMS);
    if (rows?.length) {
      setItems(rows.map((r) => ({
        id: r.id, at: r.created_at, kind: r.type, stored: true, unread: !r.read_at,
        /* Le contenu d'une ligne est porté par son payload ; on n'affiche que ce
           qu'il contient réellement. */
        storedTitle: typeof r.payload?.title === 'string' ? r.payload.title : '',
        storedBody: typeof r.payload?.body === 'string' ? r.payload.body : '',
      })));
      return;
    }

    if (!children.length) { setItems([]); return; }
    const ids = children.map((c) => c.id);
    const teamIds = [...new Set(children.map((c) => c.team_id).filter(Boolean))];
    const byId = new Map(children.map((c) => [c.id, c]));
    const nameOf = (kid) => kid?.first_name || '';
    const clubOf = (kid) => kid?.teams?.clubs?.name || '';

    /* 2. Comptes rendus publiés, et le mot du coach qui les accompagne. */
    let sessions = [];
    if (teamIds.length) {
      const { data: ss } = await supabase.from('sessions')
        .select('id, team_id, date, theme, published_at')
        .in('team_id', teamIds).gte('date', dayISO(since))
        .not('published_at', 'is', null);
      sessions = ss || [];
    }
    for (const s of sessions) {
      for (const kid of children.filter((c) => c.team_id === s.team_id)) {
        out.push({
          id: `report-${s.id}-${kid.id}`, at: s.published_at, kind: 'report',
          name: nameOf(kid), club: clubOf(kid), theme: s.theme || '',
        });
      }
    }
    if (sessions.length) {
      const { data: msgs } = await supabase.from('messages')
        .select('id, body, created_at, session_id')
        .in('session_id', sessions.map((s) => s.id)).eq('type', 'mot_coach');
      const teamOf = new Map(sessions.map((s) => [s.id, s.team_id]));
      for (const msg of msgs || []) {
        for (const kid of children.filter((c) => c.team_id === teamOf.get(msg.session_id))) {
          out.push({
            id: `coachWord-${msg.id}-${kid.id}`, at: msg.created_at, kind: 'coachWord',
            name: nameOf(kid), club: clubOf(kid), text: msg.body,
          });
        }
      }
    }

    /* 3. Compétences validées. */
    const { data: sk } = await supabase.from('skills')
      .select('id, label, validated_at, player_id')
      .in('player_id', ids).eq('status', 'validee').gte('validated_at', since.toISOString());
    for (const s of sk || []) {
      if (!s.validated_at) continue;
      out.push({
        id: `skill-${s.id}`, at: s.validated_at, kind: 'skill',
        name: nameOf(byId.get(s.player_id)), label: s.label,
      });
    }

    /* 4. Convocations : à confirmer tant que la réponse manque, puis rappel quand
          l'échéance approche. La convocation n'a pas d'horodatage propre, c'est donc
          la création de l'événement qui date la carte. */
    const { data: convs } = await supabase.from('event_convocations')
      .select('id, response, player_id, events(id, type, datetime, place, opponent, rsvp_deadline, created_at)')
      .in('player_id', ids);
    for (const c of convs || []) {
      const e = c.events;
      if (!e?.datetime) continue;
      const when = new Date(e.datetime);
      if (when < now) continue;
      const kid = byId.get(c.player_id);
      const common = {
        name: nameOf(kid), club: clubOf(kid), etype: e.type, opponent: e.opponent,
        datetime: e.datetime, place: e.place, pinned: when,
      };
      if (!c.response) {
        out.push({ ...common, id: `callup-${c.id}`, at: e.created_at || e.datetime,
          kind: 'callup', deadline: e.rsvp_deadline, action: true });
      } else if (when - now <= REMINDER_DAYS * 86400000) {
        out.push({ ...common, id: `reminder-${c.id}`, at: e.datetime,
          since: e.created_at, kind: 'reminder' });
      }
    }

    /* 5. Rattachements : l'occasion de redire qu'un email suffit pour toute la famille. */
    const { data: links } = await supabase.from('player_parents')
      .select('id, player_id, created_at').eq('parent_user_id', uid);
    for (const l of links || []) {
      const kid = byId.get(l.player_id);
      if (!kid || !l.created_at) continue;
      out.push({
        id: `link-${l.id}`, at: l.created_at, kind: 'link',
        name: nameOf(kid), club: clubOf(kid),
      });
    }

    /* 6. Fin d'essai : cela ne concerne que qui administre le club et son abonnement,
          jamais le parent seul. */
    const { data: ms } = await supabase.from('memberships').select('role, clubs(name, trial_ends_at)');
    for (const m of ms || []) {
      const ends = m.role === 'admin' ? m.clubs?.trial_ends_at : null;
      if (!ends) continue;
      const left = Math.ceil((new Date(ends) - now) / 86400000);
      if (left < 0 || left > TRIAL_SOON_DAYS) continue;
      out.push({
        id: `trial-${m.clubs.name}-${ends}`, at: ends, kind: 'trial',
        club: m.clubs.name, days: left, pinned: new Date(ends), action: true,
      });
    }

    /* Ce qui appelle une réponse passe devant, par échéance ; le reste suit, du plus
       récent au plus ancien. */
    out.sort((a, b) => {
      if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
      if (a.pinned && b.pinned) return a.pinned - b.pinned;
      return new Date(b.at) - new Date(a.at);
    });
    setItems(out.slice(0, MAX_ITEMS));
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) { router.replace('/login'); return; }
      const uid = data.session.user.id;
      try { setSeenAt(localStorage.getItem(SEEN_KEY) || null); } catch { setSeenAt(null); }
      const { data: mine } = await supabase.from('players').select('id').eq('user_id', uid);
      const myIds = (mine || []).map((p) => p.id);
      const { data: ms } = await supabase.from('memberships').select('role');
      const children = await loadMyChildren();
      setNavRole(children.length
        ? (children.every((c) => myIds.includes(c.id)) ? 'athlete' : 'parent')
        : ((ms || []).some((r) => r.role === 'admin' || r.role === 'coach') ? 'coach' : 'parent'));
      await loadItems(children, uid);
      setReady(true);
      try { localStorage.setItem(SEEN_KEY, new Date().toISOString()); } catch { /* stockage indisponible */ }
    })();
  }, [router, loadItems]);

  useEffect(() => { document.title = `${t('alerts.title')} · YouPlaySport`; }, [t]);

  if (!ready) return <div className="wrap"><p style={{ color: 'var(--muted)' }}>{t('common.loading')}</p></div>;

  const now = new Date();

  /* Les phrases sont construites ici, à partir des seuls champs rapportés par la base :
     une valeur absente disparaît de la ligne au lieu d'être devinée. */
  const eventLabel = (it) => [
    EVENT_TYPES.includes(it.etype) ? t(`event.${it.etype}`) : t('cal.event'),
    it.opponent,
  ].filter(Boolean).join(' – ');

  const titleOf = (it) => {
    if (it.stored) {
      return it.storedTitle
        || (KNOWN_KINDS.includes(it.kind) && it.kind !== 'reminder'
          ? t(`alerts.t.${it.kind}`) : t('alerts.generic'));
    }
    if (it.kind === 'reminder') return t('alerts.t.reminder', { event: eventLabel(it) });
    return t(`alerts.t.${it.kind}`);
  };

  const bodyOf = (it) => {
    if (it.stored) return it.storedBody;
    switch (it.kind) {
      case 'report':
        return t('alerts.d.report', { name: it.name, club: it.club, theme: it.theme });
      case 'coachWord':
        return t('alerts.d.coachWord', { name: it.name, club: it.club, text: it.text });
      case 'skill':
        return t('alerts.d.skill', { name: it.name, label: it.label });
      case 'callup':
        return [
          t('alerts.d.callup', {
            name: it.name, event: eventLabel(it), date: longDate(it.datetime, lang),
          }),
          it.deadline && t('alerts.d.callupDeadline', { date: longDate(it.deadline, lang) }),
        ].filter(Boolean).join(' ');
      case 'reminder':
        return t('alerts.d.reminder', {
          name: it.name, club: it.club,
          when: [longDate(it.datetime, lang), hhmm(it.datetime, lang), it.place].filter(Boolean).join(' · '),
        });
      case 'link':
        return t('alerts.d.link', { name: it.name, club: it.club });
      case 'trial':
        return t('alerts.d.trial', { club: it.club, n: it.days, date: longDate(it.at, lang) });
      default:
        return '';
    }
  };

  /* Une carte est non lue si elle appelle une réponse, ou si le fait est arrivé
     depuis le dernier passage sur cette boîte. */
  const seenMs = seenAt ? Date.parse(seenAt) : NaN;
  const isUnread = (it) => {
    if (it.stored) return it.unread;
    if (it.action) return true;
    if (Number.isNaN(seenMs)) return true;
    return Date.parse(it.since || it.at) > seenMs;
  };
  const unread = items.filter(isUnread).length;

  return (
    <div className="wrap" style={{ paddingBottom: BOTTOM_NAV_HEIGHT + 24 }}>
      {/* ---- En-tête ---- */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.9px', textTransform: 'uppercase',
            color: 'var(--muted)' }}>
            {t('alerts.eyebrow')}
          </div>
          <h1 className="q" style={{ fontSize: 24, letterSpacing: '-0.4px', margin: '3px 0 0' }}>
            {t('alerts.centre')}
          </h1>
        </div>
        {unread > 0 && (
          <span style={{ flex: '0 0 auto', background: GREEN_BG, color: '#2E5A43',
            border: `1px solid ${GREEN_LINE}`, borderRadius: 999, padding: '6px 12px',
            fontSize: 11.5, fontWeight: 800, whiteSpace: 'nowrap' }}>
            {t(unread > 1 ? 'alerts.unreadMany' : 'alerts.unreadOne', { n: unread })}
          </span>
        )}
      </div>

      {/* ---- Sous-onglets ---- */}
      <div style={{ display: 'flex', gap: 7, margin: '16px 0 14px' }}>
        {[['inbox', 'alerts.tabInbox'], ['push', 'alerts.tabPush']].map(([key, label]) => {
          const on = tab === key;
          return (
            <button key={key} type="button" onClick={() => setTab(key)}
              aria-current={on ? 'true' : undefined}
              style={{ border: 'none', borderRadius: 18, padding: '8px 15px', fontSize: 13, fontWeight: 700,
                cursor: 'pointer', fontFamily: 'inherit',
                background: on ? 'var(--brand)' : '#F1E9E1', color: on ? '#fff' : '#57534A' }}>
              {t(label)}
            </button>
          );
        })}
      </div>

      {tab === 'inbox' && (
        <>
          {items.length === 0 && (
            <div className="card"><p style={{ margin: 0, color: 'var(--muted)', lineHeight: 1.6 }}>
              {t('alerts.empty')}
            </p></div>
          )}

          {items.map((it) => {
            const fresh = isUnread(it);
            const body = bodyOf(it);
            return (
              <div key={it.id} className="card" style={{
                background: fresh ? GREEN_BG : 'var(--card)',
                border: `1px solid ${fresh ? GREEN_LINE : 'var(--border)'}`,
                display: 'flex', gap: 11, alignItems: 'flex-start',
              }}>
                <span aria-hidden="true" style={{ flex: '0 0 9px', width: 9, height: 9, borderRadius: 999,
                  background: fresh ? GREEN_DOT : '#D6D0C4', marginTop: 5 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 700, lineHeight: 1.35 }}>{titleOf(it)}</span>
                    <span style={{ flex: '0 0 auto', fontSize: 9.5, fontWeight: 800, letterSpacing: '.5px',
                      textTransform: 'uppercase', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                      {stamp(it.at, now, t, lang)}
                    </span>
                  </div>
                  {body && (
                    <div style={{ fontSize: 12.5, color: '#57534A', lineHeight: 1.5, marginTop: 4 }}>{body}</div>
                  )}
                </div>
              </div>
            );
          })}

          <button type="button" className="btn ghost" onClick={() => setTab('push')}>
            {t('alerts.managePush')}
          </button>
        </>
      )}

      {tab === 'push' && (
        <>
          <div className="card">
            <div className="q" style={{ fontWeight: 800, fontSize: 15 }}>{t('alerts.pushTitle')}</div>
            <p style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.55, margin: '6px 0 0' }}>
              {t('alerts.pushLead')}
            </p>

            {PUSH_KINDS.map((k, i) => (
              <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 11, cursor: 'pointer',
                borderTop: i ? '1px solid var(--border)' : 'none', padding: '11px 0 0', marginTop: 11 }}>
                <input type="checkbox" checked={push[k]}
                  onChange={() => setPush((p) => ({ ...p, [k]: !p[k] }))}
                  style={{ width: 17, height: 17, accentColor: 'var(--brand)', flex: '0 0 17px' }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 700 }}>{t(`alerts.cat.${k}`)}</span>
                  <span style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.45,
                    marginTop: 2 }}>
                    {t(`alerts.push.${k}`)}
                  </span>
                </span>
              </label>
            ))}
          </div>

          {/* Ces cases ne sont encore reliées à rien : le dire plutôt que le laisser croire. */}
          <div style={{ fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.55, margin: '0 0 14px' }}>
            {t('alerts.pushNotSaved')}
          </div>

          <button type="button" className="btn ghost" onClick={() => setTab('inbox')}>
            {t('alerts.backToInbox')}
          </button>
        </>
      )}

      <BottomNav role={navRole} />
    </div>
  );
}
