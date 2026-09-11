'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';
import { loadMyChildren } from '../../lib/children';
import { useT } from '../../lib/i18n';
import BottomNav, { BOTTOM_NAV_HEIGHT } from '../components/BottomNav';

/* Calendrier de la famille : tous les enfants rattachés au compte, tous leurs clubs,
   sur un seul mois. Vue privée au parent — chaque club n'y voit rien.
   Deux sources, et seulement celles-là :
     · les convocations de l'enfant (event_convocations → events), qui disent qu'il
       est attendu sur un événement daté ;
     · les séances publiées de son groupe (sessions), qui sont l'entraînement.
   Aucun libellé n'est inventé : un événement sans adversaire n'en affiche pas. */

const GREEN_BG = '#E9F1EA';
const GREEN_LINE = '#CFE2D2';

/* Pastille de type, à droite de chaque item. Les clés suivent l'enum event_type ;
   `seance` est la séance d'entraînement, qui n'est pas un événement. */
const TONE_BRAND = { bg: 'var(--peach)', ink: '#5F2A1C', border: '#EBD3C9' };
const TONE_GREEN = { bg: '#EDF4E8', ink: '#3E5A3E', border: GREEN_LINE };
const TONE_PLAIN = { bg: '#F4F0E9', ink: '#6B6558', border: '#E6E0D5' };
const TYPE_TONE = {
  match: TONE_BRAND, tournoi: TONE_BRAND, seance: TONE_GREEN,
  stage: TONE_PLAIN, sortie: TONE_PLAIN, reunion: TONE_PLAIN,
};

/* Les types que l'enum event_type connaît. Tout autre type reste affiché, sous le
   libellé générique « Événement » : on ne devine pas un nom qui n'existe pas. */
const EVENT_TYPES = ['match', 'tournoi', 'stage', 'sortie', 'reunion'];

/* Combien de jours la liste « à venir » regarde devant elle. */
const AHEAD_DAYS = 92;
const UPCOMING_MAX = 12;

const pad = (n) => String(n).padStart(2, '0');
const isoDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const locale = (lang) => (lang === 'en' ? 'en-GB' : 'fr-FR');

/** « 17:30 » à partir d'un time Postgres ('17:30:00') ou d'un timestamp. */
function hhmm(value, lang) {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{2}:\d{2}/.test(value)) return value.slice(0, 5);
  try {
    return new Date(value).toLocaleTimeString(locale(lang), { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

export default function Calendrier() {
  const router = useRouter();
  const { t, lang } = useT();
  const [ready, setReady] = useState(false);
  const [navRole, setNavRole] = useState('parent');
  const [kids, setKids] = useState([]);
  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState(() => {
    const n = new Date();
    return { y: n.getFullYear(), m: n.getMonth() };
  });

  /* Les items du mois affiché, plus ceux des prochaines semaines pour la liste
     « à venir » : une seule fenêtre, rechargée quand on change de mois. */
  const loadItems = useCallback(async (children, y, m) => {
    if (!children.length) { setItems([]); return; }
    const ids = children.map((c) => c.id);
    const teamIds = [...new Set(children.map((c) => c.team_id).filter(Boolean))];
    const byId = new Map(children.map((c) => [c.id, c]));

    const now = new Date();
    const from = new Date(Math.min(new Date(y, m, 1), new Date(now.getFullYear(), now.getMonth(), now.getDate())));
    const to = new Date(Math.max(
      new Date(y, m + 1, 0),
      new Date(now.getFullYear(), now.getMonth(), now.getDate() + AHEAD_DAYS),
    ));

    const out = [];

    /* Événements : seuls ceux sur lesquels l'enfant est convoqué le concernent. */
    const { data: convs } = await supabase.from('event_convocations')
      .select('player_id, response, events(id, type, datetime, place, opponent)')
      .in('player_id', ids);
    for (const c of convs || []) {
      const e = c.events;
      if (!e?.datetime) continue;
      const when = new Date(e.datetime);
      if (when < from || when > new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59)) continue;
      out.push({
        key: `e${e.id}-${c.player_id}`, when, day: isoDay(when),
        kid: byId.get(c.player_id), type: e.type, response: c.response,
        opponent: e.opponent, at: e.datetime, place: e.place,
      });
    }

    /* Séances : l'entraînement du groupe, une fois publié par le club. */
    if (teamIds.length) {
      const { data: ss } = await supabase.from('sessions')
        .select('id, team_id, date, start_time, end_time, theme')
        .in('team_id', teamIds).gte('date', isoDay(from)).lte('date', isoDay(to))
        .not('published_at', 'is', null);
      for (const s of ss || []) {
        for (const kid of children.filter((c) => c.team_id === s.team_id)) {
          out.push({
            key: `s${s.id}-${kid.id}`, when: new Date(`${s.date}T${s.start_time || '00:00:00'}`),
            day: s.date, kid, type: 'seance',
            theme: s.theme, start: s.start_time, end: s.end_time,
          });
        }
      }
    }

    out.sort((a, b) => a.when - b.when);
    setItems(out);
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) { router.replace('/login'); return; }
      const uid = data.session.user.id;
      /* Onglets de la barre : l'athlète et le staff ne voient pas ceux du parent. */
      const { data: ms } = await supabase.from('memberships').select('role');
      const { data: mine } = await supabase.from('players').select('id').eq('user_id', uid);
      const myIds = (mine || []).map((p) => p.id);
      const children = await loadMyChildren();
      setKids(children);
      setNavRole(children.length
        ? (children.every((c) => myIds.includes(c.id)) ? 'athlete' : 'parent')
        : ((ms || []).some((r) => r.role === 'admin' || r.role === 'coach') ? 'coach' : 'parent'));
      setReady(true);
    })();
  }, [router]);

  useEffect(() => { loadItems(kids, cursor.y, cursor.m); }, [kids, cursor, loadItems]);

  useEffect(() => { document.title = `${t('cal.title')} · YouPlaySport`; }, [t]);

  function shiftMonth(step) {
    setCursor((c) => {
      const d = new Date(c.y, c.m + step, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  }

  if (!ready) return <div className="wrap"><p style={{ color: 'var(--muted)' }}>{t('common.loading')}</p></div>;

  if (!kids.length) return (
    <div className="wrap" style={{ paddingBottom: BOTTOM_NAV_HEIGHT + 24 }}>
      <div className="card"><p style={{ margin: 0, color: 'var(--muted)' }}>{t('common.noChild')}</p></div>
      <BottomNav role={navRole} />
    </div>
  );

  const { y, m } = cursor;
  const monthLabel = new Date(y, m, 1).toLocaleDateString(locale(lang), { month: 'long', year: 'numeric' });
  const firstDow = (new Date(y, m, 1).getDay() + 6) % 7; // 0 = lundi
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const cells = [
    ...Array.from({ length: firstDow }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const todayKey = isoDay(new Date());
  /* Jours porteurs d'au moins un item, et ceux qui sont encore devant nous. */
  const marked = new Set(items.map((it) => it.day));
  const monthItems = items.filter((it) => it.day.startsWith(`${y}-${pad(m + 1)}`));
  const upcoming = items.filter((it) => it.day >= todayKey).slice(0, UPCOMING_MAX);

  return (
    <div className="wrap" style={{ paddingBottom: BOTTOM_NAV_HEIGHT + 24 }}>
      {/* ---- En-tête : le mois affiché et sa navigation ---- */}
      <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.9px', textTransform: 'uppercase',
        color: 'var(--muted)' }}>
        {t('cal.title')}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
        margin: '3px 0 14px' }}>
        <h1 className="q" style={{ fontSize: 24, letterSpacing: '-0.4px', margin: 0, textTransform: 'capitalize' }}>
          {monthLabel}
        </h1>
        <div style={{ display: 'flex', gap: 7, flex: '0 0 auto' }}>
          {[[-1, 'cal.prevMonth', '‹'], [1, 'cal.nextMonth', '›']].map(([step, key, glyph]) => (
            <button key={key} type="button" onClick={() => shiftMonth(step)}
              aria-label={t(key)} title={t(key)}
              style={{ width: 32, height: 32, borderRadius: 999, border: '1px solid var(--border)',
                background: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: 16, fontWeight: 700,
                color: 'var(--brand-dark)', lineHeight: 1 }}>
              {glyph}
            </button>
          ))}
        </div>
      </div>

      {/* ---- Grille du mois, semaine commençant le lundi ---- */}
      <div className="card">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 6 }}>
          {['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => (
            <div key={d} style={{ textAlign: 'center', fontSize: 10, fontWeight: 800, letterSpacing: '.4px',
              color: 'var(--muted)' }}>
              {t(`cal.dow.${d}`)}
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
          {cells.map((d, i) => {
            if (d === null) return <div key={`e${i}`} />;
            const key = `${y}-${pad(m + 1)}-${pad(d)}`;
            const has = marked.has(key);
            const ahead = has && key >= todayKey;
            const isToday = key === todayKey;
            return (
              <div key={d} style={{
                minHeight: 42, borderRadius: 10, padding: '6px 0 5px',
                background: ahead ? GREEN_BG : '#FBF7F2',
                border: `1px solid ${isToday ? 'var(--brand)' : ahead ? GREEN_LINE : 'var(--border)'}`,
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              }}>
                <span style={{ fontSize: 12, fontWeight: isToday ? 800 : 600,
                  color: isToday ? 'var(--brand-dark)' : '#57534A' }}>
                  {d}
                </span>
                <span aria-hidden="true" style={{ width: 5, height: 5, borderRadius: 999,
                  background: has ? (ahead ? '#6E9C6E' : '#C9C2B6') : 'transparent' }} />
              </div>
            );
          })}
        </div>

        {monthItems.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.55, marginTop: 12 }}>
            {t('cal.noData')}
          </div>
        )}
      </div>

      {/* ---- À venir : tous les enfants, tous les clubs, dans l'ordre ---- */}
      <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.9px', textTransform: 'uppercase',
        color: 'var(--muted)', margin: '18px 0 10px' }}>
        {t('cal.upcoming')}
      </div>

      {upcoming.length === 0 && (
        <div className="card"><p style={{ margin: 0, color: 'var(--muted)' }}>{t('cal.noUpcoming')}</p></div>
      )}

      {upcoming.map((it) => {
        const tone = TYPE_TONE[it.type] || TONE_PLAIN;
        const club = it.kid?.teams?.clubs?.name || '';
        const d = new Date(`${it.day}T00:00:00`);
        const typeLabel = it.type === 'seance' ? t('cal.session')
          : EVENT_TYPES.includes(it.type) ? t(`event.${it.type}`) : t('cal.event');
        /* Titre : le thème pour une séance, le type (et l'adversaire s'il est
           renseigné) pour un événement. */
        const title = it.type === 'seance'
          ? (it.theme || typeLabel)
          : [typeLabel, it.opponent].filter(Boolean).join(' – ');
        const detail = it.type === 'seance'
          ? [hhmm(it.start, lang), hhmm(it.end, lang)].filter(Boolean).join(' – ')
          : [hhmm(it.at, lang), it.place].filter(Boolean).join(' · ');
        return (
          <div key={it.key} className="card" style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            {/* Pastille de date : jour et mois abrégé, dans la langue affichée. */}
            <div style={{ flex: '0 0 46px', width: 46, borderRadius: 12, background: 'var(--peach)',
              color: '#5F2A1C', textAlign: 'center', padding: '7px 0 6px' }}>
              <div className="q" style={{ fontSize: 17, fontWeight: 800, lineHeight: 1 }}>{d.getDate()}</div>
              <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.5px', textTransform: 'uppercase',
                marginTop: 3 }}>
                {d.toLocaleDateString(locale(lang), { month: 'short' }).replace('.', '')}
              </div>
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, lineHeight: 1.35 }}>
                {[it.kid?.first_name, title].filter(Boolean).join(' · ')}
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, marginTop: 3 }}>
                {[club, detail].filter(Boolean).join(' · ')}
              </div>
              {it.response && (
                <div style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 600, marginTop: 5 }}>
                  {t(it.response === 'present' ? 'agenda.present' : 'agenda.absent')}
                </div>
              )}
            </div>

            <span style={{ flex: '0 0 auto', background: tone.bg, color: tone.ink,
              border: `1px solid ${tone.border}`, borderRadius: 999, padding: '4px 10px',
              fontSize: 10.5, fontWeight: 800, whiteSpace: 'nowrap' }}>
              {typeLabel}
            </span>
          </div>
        );
      })}

      <BottomNav role={navRole} />
    </div>
  );
}
