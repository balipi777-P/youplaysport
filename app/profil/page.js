'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';
import { loadMyChildren, pickChild, setStoredChildId } from '../../lib/children';
import { useT } from '../../lib/i18n';
import BottomNav, { BOTTOM_NAV_HEIGHT } from '../components/BottomNav';

/* Fiche athlète d'un enfant, pour un seul club à la fois : celui de son groupe.
   Tout ce qui est affiché vient de la base — un bloc sans donnée ne s'affiche pas. */

/* Les trois états de l'enum skill_status, du plus acquis au moins acquis, avec le
   remplissage de barre de chacun. Le schéma n'en connaît pas d'autre. */
const SKILL_STATES = {
  validee: { key: 'skill.validee', pct: 100, fill: 'var(--brand)' },
  en_progres: { key: 'skill.enProgres', pct: 60, fill: '#D97A5C' },
  a_travailler: { key: 'skill.aTravailler', pct: 22, fill: '#E3B49F' },
};
const STATE_ORDER = ['validee', 'en_progres', 'a_travailler'];

/* Couleurs des journées de la grille. `marked` couvre la séance dont la présence
   n'a pas encore été pointée : on ne préjuge pas de ce qui n'est pas en base. */
const DAY_TONES = {
  present: { bg: '#E9F1EA', ink: '#2E5A43', border: '#CFE2D2' },
  late: { bg: '#FFF1E3', ink: '#9A5B18', border: '#F6DCC0' },
  absent: { bg: '#F7E3DE', ink: '#8E3A26', border: '#EBD3C9' },
  marked: { bg: '#fff', ink: '#8A8577', border: 'var(--border)' },
  none: { bg: '#F4F0E9', ink: '#BDB5A7', border: 'transparent' },
};
/* Ordre de gravité : si deux séances tombent le même jour, la grille montre l'état
   le plus notable. */
const SEVERITY = ['absent', 'late', 'present'];

const pad = (n) => String(n).padStart(2, '0');
const isoDay = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const locale = (lang) => (lang === 'en' ? 'en-GB' : 'fr-FR');

/** « 10 septembre » */
function dayShort(value, lang) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleDateString(locale(lang), { day: 'numeric', month: 'long' });
  } catch { return ''; }
}

/** Âge en années révolues, ou null si la date de naissance n'est pas renseignée. */
function ageOf(birthdate) {
  if (!birthdate) return null;
  const b = new Date(birthdate);
  if (Number.isNaN(b.getTime())) return null;
  const now = new Date();
  let a = now.getFullYear() - b.getFullYear();
  const before = now.getMonth() < b.getMonth()
    || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate());
  if (before) a -= 1;
  return a >= 0 && a < 120 ? a : null;
}

/** Initiales des en-têtes de colonnes, lundi en premier, dans la langue affichée. */
function weekdayInitials(lang) {
  const monday = new Date(2024, 0, 1); // 1er janvier 2024 est un lundi
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
    return d.toLocaleDateString(locale(lang), { weekday: 'narrow' });
  });
}

export default function Profil() {
  const router = useRouter();
  const { t, lang } = useT();
  const [ready, setReady] = useState(false);
  const [children, setChildren] = useState([]);
  const [player, setPlayer] = useState(null);
  const [parentName, setParentName] = useState('');
  const [detail, setDetail] = useState(null);
  const [skills, setSkills] = useState([]);
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const [dayStates, setDayStates] = useState({});
  const [monthCount, setMonthCount] = useState({ done: 0, total: 0 });

  /* Identité et carnet de l'enfant sélectionné. */
  const loadChild = useCallback(async (p) => {
    setPlayer(p || null);
    if (!p) { setDetail(null); setSkills([]); return; }
    const { data: d } = await supabase.from('players')
      .select('birthdate, created_at, teams(season_id, seasons(name, start_date, end_date))')
      .eq('id', p.id).maybeSingle();
    setDetail(d || null);
    const { data: sk } = await supabase.from('skills')
      .select('label, status, validated_at, sessions(date, theme)')
      .eq('player_id', p.id).order('validated_at', { ascending: false });
    setSkills(sk || []);
  }, []);

  /* Présences du mois affiché : les séances publiées du groupe, puis le pointage
     de l'enfant sur celles-ci. */
  const loadMonth = useCallback(async (p, y, m) => {
    if (!p) { setDayStates({}); setMonthCount({ done: 0, total: 0 }); return; }
    const first = isoDay(y, m, 1);
    const last = new Date(y, m + 1, 0);
    const { data: ss } = await supabase.from('sessions')
      .select('id, date').eq('team_id', p.team_id)
      .gte('date', first).lte('date', isoDay(y, m, last.getDate()))
      .not('published_at', 'is', null);
    const list = ss || [];
    let att = [];
    if (list.length) {
      const { data } = await supabase.from('attendance')
        .select('session_id, status').eq('player_id', p.id)
        .in('session_id', list.map((s) => s.id));
      att = data || [];
    }
    const bySession = new Map(att.map((a) => [a.session_id, a.status]));
    const states = {};
    for (const s of list) {
      const st = bySession.get(s.id) || 'marked';
      const cur = states[s.date];
      states[s.date] = cur && SEVERITY.indexOf(cur) < SEVERITY.indexOf(st) ? cur : st;
    }
    setDayStates(states);
    setMonthCount({
      done: att.filter((a) => a.status === 'present' || a.status === 'late').length,
      total: list.length,
    });
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) { router.replace('/login'); return; }
      /* RLS app_users : un parent ne lit que sa propre fiche. Le rattachement
         affiché est donc toujours celui de la personne connectée. */
      const { data: me } = await supabase.from('app_users')
        .select('full_name').eq('id', data.session.user.id).maybeSingle();
      setParentName(me?.full_name || '');
      const kids = await loadMyChildren();
      setChildren(kids);
      await loadChild(pickChild(kids));
      setReady(true);
    })();
  }, [router, loadChild]);

  useEffect(() => { loadMonth(player, month.y, month.m); }, [player, month, loadMonth]);

  useEffect(() => { document.title = `${t('profile.title')} · YouPlaySport`; }, [t]);

  function switchChild(id) {
    setStoredChildId(id);
    loadChild(children.find((c) => c.id === id));
  }

  function shiftMonth(step) {
    setMonth((cur) => {
      const d = new Date(cur.y, cur.m + step, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  }

  if (!ready) return <div className="wrap"><p style={{ color: 'var(--muted)' }}>{t('common.loading')}</p></div>;

  if (!player) return (
    <div className="wrap" style={{ paddingBottom: BOTTOM_NAV_HEIGHT + 24 }}>
      <div className="card"><p style={{ margin: 0, color: 'var(--muted)' }}>{t('common.noChild')}</p></div>
      <BottomNav role="parent" />
    </div>
  );

  const team = player.teams;
  const sport = lang === 'en'
    ? team?.sports?.name_en || team?.sports?.name_fr
    : team?.sports?.name_fr;
  const chips = [team?.clubs?.name, sport, team?.category].filter(Boolean);

  const age = ageOf(detail?.birthdate);
  const sinceYear = detail?.created_at ? new Date(detail.created_at).getFullYear() : null;
  const identity = [
    age !== null && t('profile.age', { n: age }),
    sinceYear && t('profile.since', { year: sinceYear }),
    parentName && t('profile.linkedTo', { name: parentName }),
  ].filter(Boolean).join(' · ');

  /* « cette saison » n'est affirmé que si le groupe est rattaché à une saison
     bornée ; sinon le compte porte sur tout le carnet, sans autre promesse. */
  const season = detail?.teams?.seasons;
  const validated = skills.filter((s) => s.status === 'validee');
  const inSeason = season?.start_date && season?.end_date
    ? validated.filter((s) => s.validated_at
      && s.validated_at.slice(0, 10) >= season.start_date
      && s.validated_at.slice(0, 10) <= season.end_date)
    : null;
  const seasonCount = inSeason ? inSeason.length : validated.length;
  const seasonKey = inSeason
    ? (seasonCount > 1 ? 'profile.validatedSeasonMany' : 'profile.validatedSeasonOne')
    : (seasonCount > 1 ? 'profile.validatedMany' : 'profile.validatedOne');

  const ordered = [...skills].sort((a, b) => {
    const d = STATE_ORDER.indexOf(a.status) - STATE_ORDER.indexOf(b.status);
    return d !== 0 ? d : (a.label || '').localeCompare(b.label || '');
  });

  /* Grille du mois, lundi en premier. */
  const firstDow = (new Date(month.y, month.m, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(month.y, month.m + 1, 0).getDate();
  const cells = [
    ...Array.from({ length: firstDow }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  const monthLabel = new Date(month.y, month.m, 1)
    .toLocaleDateString(locale(lang), { month: 'long', year: 'numeric' });
  /* Légende : seulement les états réellement présents dans le mois affiché. */
  const used = new Set(Object.values(dayStates));
  const legend = ['present', 'late', 'absent', 'marked'].filter((k) => used.has(k)).concat('none');
  const countKey = monthCount.done > 1 ? 'profile.attendanceCountMany' : 'profile.attendanceCountOne';

  const milestones = validated.filter((s) => s.validated_at).slice(0, 6);

  return (
    <div className="wrap" style={{ paddingBottom: BOTTOM_NAV_HEIGHT + 24 }}>
      {/* ---- En-tête ---- */}
      <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.9px', textTransform: 'uppercase',
        color: 'var(--muted)' }}>
        {t('profile.eyebrow')}
      </div>
      <h1 className="q" style={{ fontSize: 24, letterSpacing: '-0.4px', margin: '3px 0 14px' }}>
        {[player.first_name, player.last_name].filter(Boolean).join(' ')}
      </h1>

      {children.length > 1 && (
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 14 }}>
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

      {/* ---- Carte identité. Aucune photo n'est stockée aujourd'hui : la vignette
             porte les initiales. ---- */}
      <div className="card">
        <div style={{ display: 'flex', gap: 13, alignItems: 'center' }}>
          <div className="q" aria-hidden="true" style={{ width: 58, height: 58, flex: '0 0 58px',
            borderRadius: 16, background: 'var(--peach)', color: 'var(--brand-dark)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 19, fontWeight: 800 }}>
            {`${(player.first_name || '')[0] || ''}${(player.last_name || '')[0] || ''}`.toUpperCase()}
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="q" style={{ fontWeight: 800, fontSize: 16 }}>
              {[player.first_name, player.last_name].filter(Boolean).join(' ')}
            </div>
            {identity && (
              <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, marginTop: 3 }}>{identity}</div>
            )}
          </div>
        </div>

        {chips.length > 0 && (
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 13 }}>
            {chips.map((c, i) => (
              <span key={i} style={{ background: 'var(--peach)', color: '#5F2A1C', borderRadius: 999,
                padding: '5px 11px', fontSize: 11.5, fontWeight: 700 }}>{c}</span>
            ))}
          </div>
        )}

        <div style={{ fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.55, marginTop: 13 }}>
          {t('profile.scope')}
        </div>
      </div>

      {/* ---- Carnet de compétences ---- */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div className="q" style={{ fontWeight: 800, fontSize: 15 }}>{t('profile.skills')}</div>
          <span style={{ background: '#EDF4E8', color: '#3E5A3E', border: '1px solid #DCE8D4',
            borderRadius: 999, padding: '4px 10px', fontSize: 10.5, fontWeight: 800, whiteSpace: 'nowrap' }}>
            {t(seasonKey, { n: seasonCount })}
          </span>
        </div>

        {ordered.length === 0 && (
          <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, margin: '12px 0 0' }}>
            {t('profile.skillsEmpty')}
          </p>
        )}

        {ordered.map((s, i) => {
          const st = SKILL_STATES[s.status];
          if (!st) return null;
          return (
            <div key={i} style={{ marginTop: 14 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#3D3A33' }}>{s.label}</span>
                <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.7px', textTransform: 'uppercase',
                  color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                  {t(st.key)}
                </span>
              </div>
              <div style={{ height: 7, borderRadius: 4, background: '#F1E9E1', overflow: 'hidden', marginTop: 5 }}>
                <div style={{ width: `${st.pct}%`, height: '100%', borderRadius: 4, background: st.fill }} />
              </div>
            </div>
          );
        })}

        <div style={{ fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.55, marginTop: 16 }}>
          {t('profile.skillsFoot')}
        </div>
      </div>

      {/* ---- Présences du mois ---- */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div className="q" style={{ fontWeight: 800, fontSize: 15 }}>
            {t('profile.attendance', { month: monthLabel })}
          </div>
          {monthCount.total > 0 && (
            <span style={{ background: 'var(--peach)', color: '#5F2A1C', borderRadius: 999,
              padding: '4px 10px', fontSize: 10.5, fontWeight: 800, whiteSpace: 'nowrap' }}>
              {t(countKey, { n: monthCount.done, total: monthCount.total })}
            </span>
          )}
        </div>

        {/* Navigation de mois : sans elle, un mois sans séance serait une impasse. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
          {[[-1, 'profile.prevMonth', '‹'], [1, 'profile.nextMonth', '›']].map(([step, key, glyph]) => (
            <button key={key} type="button" onClick={() => shiftMonth(step)}
              aria-label={t(key)} title={t(key)}
              style={{ width: 30, height: 30, borderRadius: 999, border: '1px solid var(--border)',
                background: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: 15, fontWeight: 700,
                color: 'var(--brand-dark)', lineHeight: 1 }}>
              {glyph}
            </button>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 5, marginTop: 12 }}>
          {weekdayInitials(lang).map((w, i) => (
            <div key={`h${i}`} style={{ textAlign: 'center', fontSize: 9.5, fontWeight: 800,
              letterSpacing: '.4px', textTransform: 'uppercase', color: 'var(--muted)' }}>
              {w}
            </div>
          ))}
          {cells.map((d, i) => {
            if (d === null) return <div key={`e${i}`} />;
            const state = dayStates[isoDay(month.y, month.m, d)] || 'none';
            const tone = DAY_TONES[state];
            return (
              <div key={d} title={state === 'none' ? undefined : t(`profile.legend.${state}`)}
                style={{ aspectRatio: '1 / 1', borderRadius: 9, background: tone.bg, color: tone.ink,
                  border: `1px solid ${tone.border}`, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontSize: 11.5, fontWeight: 700 }}>
                {d}
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
          {legend.map((k) => (
            <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 6,
              fontSize: 11.5, color: 'var(--muted)', fontWeight: 600 }}>
              <span style={{ width: 11, height: 11, borderRadius: 4, background: DAY_TONES[k].bg,
                border: `1px solid ${DAY_TONES[k].border === 'transparent' ? DAY_TONES[k].bg : DAY_TONES[k].border}` }} />
              {t(`profile.legend.${k}`)}
            </span>
          ))}
        </div>

        {monthCount.total === 0 && (
          <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.55, marginTop: 12 }}>
            {t('profile.noSessions')}
          </div>
        )}
      </div>

      {/* ---- Jalons de progrès. Le schéma ne stocke pas de jalon : ce sont les
             compétences validées, avec la séance où elles l'ont été. ---- */}
      <div className="card">
        <div className="q" style={{ fontWeight: 800, fontSize: 15, marginBottom: 12 }}>
          {t('profile.milestones')}
        </div>
        {milestones.length === 0 && (
          <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, margin: 0 }}>
            {t('profile.milestonesEmpty')}
          </p>
        )}
        {milestones.map((s, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, marginBottom: i === milestones.length - 1 ? 0 : 11 }}>
            <span style={{ flex: '0 0 8px', width: 8, height: 8, borderRadius: 999,
              background: '#6E9C6E', marginTop: 5 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{s.label}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
                {[dayShort(s.validated_at, lang), s.sessions?.theme].filter(Boolean).join(' · ')}
              </div>
            </div>
          </div>
        ))}
      </div>

      <BottomNav role="parent" />
    </div>
  );
}
