'use client';

import { useT } from '../../lib/i18n';

/* Vue « Aujourd'hui » de l'athlète, au tutoiement. Composant purement présentatif :
   l'accueil reste seul à parler à Supabase et passe tout en props.
   Rien n'est écrit en dur — un bloc dont la donnée manque ne s'affiche pas. */

const GREEN_BG = '#E9F1EA';
const GREEN_INK = '#2E5A43';
const GREEN_LINE = '#DCE8D4';
const CHIP_BG = '#EDF4E8';
const ORANGE = { bg: '#FFF1E3', ink: '#9A5B18', line: '#F6DCC0' };

/* Les 3 valeurs de l'enum skill_status, du plus acquis au moins acquis. */
const SKILL_STATES = [
  { status: 'validee', key: 'skill.validee', pct: 100, fill: 'var(--brand)' },
  { status: 'en_progres', key: 'skill.enProgres', pct: 60, fill: '#D97A5C' },
  { status: 'a_travailler', key: 'skill.aTravailler', pct: 22, fill: '#E3B49F' },
];

/* Couleur d'une barre de série, par état de pointage. */
const BAR = { present: '#6E9C6E', late: '#E0A264', absent: '#E0B5A8' };

function Chip({ children, tone = 'green' }) {
  const c = tone === 'orange'
    ? { background: ORANGE.bg, color: ORANGE.ink, border: `1px solid ${ORANGE.line}` }
    : tone === 'white'
      ? { background: '#fff', color: GREEN_INK, border: '1px solid #fff' }
      : { background: CHIP_BG, color: '#3E5A3E', border: `1px solid ${GREEN_LINE}` };
  return (
    <span style={{ ...c, borderRadius: 999, padding: '5px 11px', fontSize: 11.5, fontWeight: 700,
      display: 'inline-block' }}>
      {children}
    </span>
  );
}

/** Sur-titre de section, en capitales. */
function SectionLabel({ children, style }) {
  return (
    <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.9px', textTransform: 'uppercase',
      color: 'var(--muted)', ...style }}>
      {children}
    </div>
  );
}

/** « 17:30 » à partir d'un time Postgres ('17:30:00') ou d'un timestamp. */
function hhmm(value, lang) {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{2}:\d{2}/.test(value)) return value.slice(0, 5);
  try {
    return new Date(value).toLocaleTimeString(lang === 'en' ? 'en-GB' : 'fr-FR',
      { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

/** « lundi 8 septembre » */
function dayLong(value, lang) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleDateString(lang === 'en' ? 'en-GB' : 'fr-FR',
      { weekday: 'long', day: 'numeric', month: 'long' });
  } catch { return ''; }
}

export default function AthleteToday({
  todayLabel, player, season,
  todaySession, session, attendance, attendanceAt, sessionSkills,
  allSkills, convocations, history,
  rsvpBusy, onRespond,
}) {
  const { t, lang } = useT();

  const team = player?.teams;
  const clubName = team?.clubs?.name || '';
  const initials = `${(player?.first_name || '')[0] || ''}${(player?.last_name || '')[0] || ''}`.toUpperCase();

  const mot = session?.messages?.find((m) => m.type === 'mot_coach');
  const axes = session?.session_axes || [];

  /* Séance du jour. La table sessions n'a pas de colonne de lieu : la ligne se
     limite à l'horaire et au thème. */
  const todaySlot = todaySession
    ? [hhmm(todaySession.start_time, lang), hhmm(todaySession.end_time, lang)].filter(Boolean).join(' – ')
    : '';

  /* Carnet : le décompte « cette saison » n'est affirmé que si la saison de l'équipe
     a des bornes en base. Sinon le badge annonce simplement le total validé. */
  const validated = allSkills.filter((s) => s.status === 'validee');
  const inSeason = season?.start_date && season?.end_date
    ? validated.filter((s) => s.validated_at
      && s.validated_at >= season.start_date && s.validated_at <= `${season.end_date}T23:59:59`)
    : null;
  const count = inSeason ? inSeason.length : validated.length;
  const countKey = inSeason
    ? (count > 1 ? 'profile.validatedSeasonMany' : 'profile.validatedSeasonOne')
    : (count > 1 ? 'profile.validatedMany' : 'profile.validatedOne');

  /* Série : un trait par séance pointée, dans l'ordre. */
  const done = history.filter((h) => h.status === 'present' || h.status === 'late').length;
  const total = history.length;
  const streakKey = season?.start_date
    ? (done > 1 ? 'athlete.streakSeasonMany' : 'athlete.streakSeasonOne')
    : (done > 1 ? 'athlete.streakMany' : 'athlete.streakOne');

  return (
    <>
      {/* ---- En-tête : le jour, le salut, l'avatar ---- */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: 'var(--muted)', fontSize: 10.5, fontWeight: 800, letterSpacing: '.9px' }}>
            {todayLabel}
          </div>
          <h1 className="q" style={{ fontSize: 24, letterSpacing: '-0.4px', margin: '3px 0 4px' }}>
            {t('athlete.hello', { name: player.first_name })}
          </h1>
          {(clubName || team?.category) && (
            <div style={{ fontSize: 12.5, color: 'var(--muted)', fontWeight: 600 }}>
              {[clubName, team?.category].filter(Boolean).join(' · ')}
            </div>
          )}
        </div>
        <span className="q" aria-hidden="true" style={{ flex: '0 0 44px', width: 44, height: 44,
          borderRadius: 15, background: 'var(--peach)', color: 'var(--brand-dark)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 800 }}>
          {initials}
        </span>
      </div>

      {/* ---- CE SOIR : la séance du jour, publiée ou non ---- */}
      {todaySession && (
        <div className="card" style={{ background: 'var(--peach)', border: '1px solid #EBD3C9',
          marginTop: 18 }}>
          <SectionLabel style={{ color: 'var(--brand-dark)' }}>{t('athlete.tonight')}</SectionLabel>
          <div className="q" style={{ fontSize: 17, fontWeight: 800, lineHeight: 1.3, margin: '8px 0 4px' }}>
            {[t('cal.session'), team?.category].filter(Boolean).join(' · ')}
          </div>
          <div style={{ fontSize: 12.5, color: '#7A4030', lineHeight: 1.5 }}>
            {[todaySlot, todaySession.theme && t('athlete.themeIs', { theme: todaySession.theme })]
              .filter(Boolean).join(' · ')}
          </div>
          {/* Boutons visuels : une séance n'a pas de réponse à donner en base —
              seuls les événements portent une convocation. */}
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button type="button" className="btn" style={{ marginBottom: 0, flex: 1 }}>{t('rsvp.yes')}</button>
            <button type="button" className="btn ghost" style={{ marginBottom: 0, flex: 1 }}>{t('rsvp.no')}</button>
          </div>
          {todaySession.start_time && (
            <div style={{ fontSize: 11.5, color: '#7A4030', lineHeight: 1.5, marginTop: 10 }}>
              {t('athlete.replyBeforeStart', { time: hhmm(todaySession.start_time, lang) })}
            </div>
          )}
        </div>
      )}

      {/* ---- Ta dernière séance ---- */}
      <SectionLabel style={{ margin: '20px 0 8px' }}>{t('athlete.lastSession')}</SectionLabel>
      {!session ? (
        <div className="card"><p style={{ margin: 0, color: 'var(--muted)' }}>{t('home.noSession')}</p></div>
      ) : (
        <div className="card">
          <h2 className="q" style={{ fontSize: 17, fontWeight: 800, lineHeight: 1.3, margin: '0 0 4px' }}>
            {session.theme}
          </h2>
          <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
            {[dayLong(session.date, lang),
              [hhmm(session.start_time, lang), hhmm(session.end_time, lang)].filter(Boolean).join(' – ')]
              .filter(Boolean).join(' · ')}
          </div>

          {/* Pastilles : la présence pointée, puis les axes travaillés et les
              compétences validées pendant cette séance-là. */}
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 12 }}>
            {attendance === 'present' && (
              <Chip>{t('athlete.chipPresent', { time: hhmm(attendanceAt, lang) }).trim()}</Chip>
            )}
            {attendance === 'late' && <Chip tone="orange">{t('home.late')}</Chip>}
            {attendance === 'absent' && <Chip tone="orange">{t('home.absent')}</Chip>}
            {axes.map((a, i) => <Chip key={`a${i}`}>{t(`axis.${a.axis}`)}</Chip>)}
            {sessionSkills.map((s, i) => <Chip key={`s${i}`}>✓ {s.label}</Chip>)}
          </div>

          {mot && (
            <>
              <SectionLabel style={{ margin: '18px 0 10px' }}>{t('athlete.coachWord')}</SectionLabel>
              <blockquote style={{ margin: 0, padding: '2px 0 2px 12px', borderLeft: '3px solid var(--peach)',
                fontSize: 13.5, lineHeight: 1.6, color: '#3D3A33' }}>
                « {mot.body} »
              </blockquote>
              {/* Signature : le nom du coach n'est pas lisible par un licencié
                  (RLS app_users), on signe donc avec ce qui l'est. */}
              <div style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 600, marginTop: 8 }}>
                {[t('athlete.signCoach'), dayLong(mot.created_at, lang)].filter(Boolean).join(' · ')}
              </div>
            </>
          )}
        </div>
      )}

      {/* ---- Ton carnet ---- */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div className="q" style={{ fontWeight: 800, fontSize: 16 }}>{t('athlete.notebook')}</div>
          {count > 0 && (
            <span style={{ flex: '0 0 auto', background: GREEN_BG, color: GREEN_INK,
              border: `1px solid ${GREEN_LINE}`, borderRadius: 999, padding: '5px 11px',
              fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap' }}>
              {t(countKey, { n: count })}
            </span>
          )}
        </div>

        {allSkills.length === 0 && (
          <p style={{ margin: '12px 0 0', fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
            {t('athlete.noSkills')}
          </p>
        )}

        {SKILL_STATES.flatMap(({ status, key, pct, fill }) =>
          allSkills.filter((s) => s.status === status).map((s, i) => (
            <div key={`${status}-${i}`} style={{ marginTop: 14 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#3D3A33' }}>{s.label}</span>
                <span style={{ flex: '0 0 auto', fontSize: 9.5, fontWeight: 800, letterSpacing: '.5px',
                  textTransform: 'uppercase', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                  {t(key)}
                </span>
              </div>
              <div style={{ height: 7, borderRadius: 4, background: '#F1E9E1', overflow: 'hidden',
                marginTop: 5 }}>
                <div style={{ width: `${pct}%`, height: '100%', borderRadius: 4, background: fill }} />
              </div>
            </div>
          )))}
      </div>

      {/* ---- Tes convocations. Sans ligne de convocation, tu n'es pas appelé·e :
             on n'annonce rien. ---- */}
      {convocations.length > 0 && (
        <div className="card">
          <div className="q" style={{ fontWeight: 800, fontSize: 16, marginBottom: 4 }}>
            {t('athlete.callups')}
          </div>
          {convocations.map((c, i) => {
            const e = c.events;
            const title = [
              [t(`event.${e.type}`), team?.category].filter(Boolean).join(' '),
              [team?.name, e.opponent].filter(Boolean).join(' – '),
            ].filter(Boolean).join(' · ');
            return (
              <div key={c.id} style={{ borderTop: i ? '1px solid var(--border)' : 'none',
                padding: i ? '14px 0 0' : 0, marginTop: 14 }}>
                <div className="q" style={{ fontSize: 15, fontWeight: 800, lineHeight: 1.3 }}>{title}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, marginTop: 3 }}>
                  {/* La table events n'a pas d'heure de rendez-vous : l'horaire
                      affiché est celui du coup d'envoi. */}
                  {[dayLong(e.datetime, lang), hhmm(e.datetime, lang), e.place].filter(Boolean).join(' · ')}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap', marginTop: 10 }}>
                  {c.response === 'present' && <Chip>{t('athlete.confirmed')}</Chip>}
                  {c.response === 'absent' && <Chip tone="orange">{t('athlete.declined')}</Chip>}
                  {!c.response && <Chip tone="orange">{t('athlete.waiting')}</Chip>}
                  <span style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 600 }}>
                    {c.response && c.responded_at
                      ? t('athlete.answeredOn', { date: dayLong(c.responded_at, lang) })
                      : !c.response && e.rsvp_deadline
                        ? t('athlete.before', { date: dayLong(e.rsvp_deadline, lang) })
                        : ''}
                  </span>
                </div>
                {/* Contrairement à la séance, une convocation se répond vraiment :
                    la policy ec_respond autorise l'athlète sur ses propres lignes. */}
                {!c.response && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <button type="button" className="btn" disabled={rsvpBusy}
                      onClick={() => onRespond(e.id, 'present')}
                      style={{ marginBottom: 0, flex: 1 }}>
                      {t('rsvp.yes')}
                    </button>
                    <button type="button" className="btn ghost" disabled={rsvpBusy}
                      onClick={() => onRespond(e.id, 'absent')}
                      style={{ marginBottom: 0, flex: 1 }}>
                      {t('rsvp.no')}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ---- Ta série ---- */}
      {total > 0 && (
        <div className="card">
          <div className="q" style={{ fontWeight: 800, fontSize: 16, marginBottom: 12 }}>
            {t('athlete.streak')}
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 34 }}>
            {history.map((h, i) => (
              <span key={i} title={t(`profile.legend.${h.status}`)} style={{ flex: 1, minWidth: 5, maxWidth: 14,
                height: h.status === 'present' ? '100%' : h.status === 'late' ? '70%' : '40%',
                borderRadius: 4, background: BAR[h.status] || '#E6E0D5' }} />
            ))}
          </div>
          <p style={{ fontSize: 12.5, color: '#57534A', lineHeight: 1.55, margin: '12px 0 0' }}>
            {t(streakKey, { n: done, total })}
          </p>
        </div>
      )}
    </>
  );
}
