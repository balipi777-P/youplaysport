'use client';

import { useT } from '../../lib/i18n';

/* Vue « Journée sportive » du parent. Composant purement présentatif : toutes les
   données arrivent en props depuis l'accueil, qui reste seul à parler à Supabase.
   Rien n'est écrit en dur — un bloc dont la donnée manque ne s'affiche pas. */

const GREEN_BG = '#E9F1EA';
const GREEN_INK = '#2E5A43';
const GREEN_SOFT = '#3E6B54';
const GREEN_LINE = '#DCE8D4';
const CHIP_BG = '#EDF4E8';

function Chip({ children, tone = 'green' }) {
  const c = tone === 'green'
    ? { background: CHIP_BG, color: '#3E5A3E', border: `1px solid ${GREEN_LINE}` }
    : { background: '#fff', color: GREEN_INK, border: '1px solid #fff' };
  return (
    <span style={{ ...c, borderRadius: 999, padding: '5px 11px', fontSize: 11.5, fontWeight: 700, display: 'inline-block' }}>
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

export default function ParentJournal({
  todayLabel, parentName, kids, player, clubCount,
  session, attendance, attendanceAt, sessionSkills, streak,
  nextEvent, convocation,
  onSwitchChild, onAlerts, onAdd, onCarnet, onAgenda,
}) {
  const { t, lang } = useT();

  const mot = session?.messages?.find((m) => m.type === 'mot_coach');
  const objectif = session?.messages?.find((m) => m.type === 'objectif');
  const defi = session?.session_challenge;
  const axes = session?.session_axes || [];

  const team = player?.teams;
  const clubName = team?.clubs?.name || '';

  /* Décomptes réels : enfants rattachés au compte, clubs distincts parmi eux. */
  const childLabel = t(kids.length === 1 ? 'journal.childCount' : 'journal.childCountMany', { n: kids.length });
  const clubLabel = t(clubCount === 1 ? 'journal.clubCount' : 'journal.clubCountMany', { n: clubCount });
  const subtitle = [parentName, `${childLabel}, ${clubLabel}`].filter(Boolean).join(' · ');

  const initials = (c) => `${(c.first_name || '')[0] || ''}${(c.last_name || '')[0] || ''}`.toUpperCase();
  const sportName = (sp) => (lang === 'en' ? sp?.name_en || sp?.name_fr : sp?.name_fr) || '';

  /* Horaire de la séance : les deux bornes si elles existent, sinon celle qu'on a.
     La table sessions n'a pas de colonne de lieu : rien n'est affiché à sa place. */
  const slot = [hhmm(session?.start_time, lang), hhmm(session?.end_time, lang)].filter(Boolean).join(' – ');

  /* Fil de la séance : seuls les moments réellement horodatés en base y figurent. */
  const timeline = [];
  if (attendanceAt && attendance !== 'absent') {
    timeline.push({ time: hhmm(attendanceAt, lang), title: t('journal.tlArrival') });
  }
  if (session?.theme) {
    timeline.push({
      time: hhmm(session.start_time, lang), title: t('journal.tlTheme'), text: session.theme,
      chips: axes.map((a) => t(`axis.${a.axis}`)),
    });
  }
  if (sessionSkills.length > 0) {
    timeline.push({
      time: hhmm(sessionSkills[0].validated_at, lang), title: t('journal.tlWorked'),
      chips: sessionSkills.map((s) => `${s.label} — ${t('journal.validatedSuffix')}`),
    });
  }
  if (mot) {
    timeline.push({ time: hhmm(mot.created_at, lang), title: t('journal.tlCoach'), quote: mot.body });
  }
  if (objectif) {
    timeline.push({ time: hhmm(objectif.created_at, lang), title: t('journal.tlGoal'), text: objectif.body });
  }

  /* Bloc d'implication : il ne s'affiche que si la présence a été pointée, et ses
     pastilles ne reprennent que des faits comptés en base (série, compétences). */
  const involvedKey = attendance === 'present' ? 'journal.involved'
    : attendance === 'late' ? 'journal.involvedLate' : null;

  const evDate = nextEvent?.datetime ? new Date(nextEvent.datetime) : null;
  const evTitle = nextEvent
    ? [
      [t(`event.${nextEvent.type}`), team?.category].filter(Boolean).join(' '),
      clubName,
    ].filter(Boolean).join(' · ') + (nextEvent.opponent ? ` – ${nextEvent.opponent}` : '')
    : '';

  return (
    <>
      {/* ---- En-tête : le jour, le titre, la portée du compte ---- */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: 'var(--muted)', fontSize: 10.5, fontWeight: 800, letterSpacing: '.9px' }}>
            {todayLabel}
          </div>
          <h1 className="q" style={{ fontSize: 24, letterSpacing: '-0.4px', margin: '3px 0 4px' }}>
            {t('home.todayTitle')}
          </h1>
          <div style={{ fontSize: 12.5, color: 'var(--muted)', fontWeight: 600 }}>{subtitle}</div>
        </div>
        <button type="button" onClick={onAlerts}
          style={{ flex: '0 0 auto', border: '1px solid var(--border)', background: '#fff', borderRadius: 999,
            padding: '8px 13px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
            color: 'var(--brand-dark)' }}>
          🔔 {t('nav.alerts')}
        </button>
      </div>

      {/* ---- Pastilles enfants : une par rattachement, plus l'accès à l'ajout ---- */}
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', margin: '16px 0 8px' }}>
        {kids.map((c) => {
          const on = c.id === player.id;
          const sp = c.teams?.sports;
          return (
            <button key={c.id} type="button" onClick={() => onSwitchChild(c.id)}
              style={{ border: 'none', borderRadius: 18, padding: '9px 14px 9px 9px', textAlign: 'left',
                cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 9,
                background: on ? 'var(--brand)' : '#F1E9E1', color: on ? '#fff' : '#57534A' }}>
              <span className="q" style={{ width: 30, height: 30, flex: '0 0 30px', borderRadius: 10,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800,
                background: on ? 'rgba(255,255,255,.24)' : '#fff', color: on ? '#fff' : 'var(--brand-dark)' }}>
                {initials(c)}
              </span>
              <span>
                <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700 }}>{c.first_name}</span>
                <span style={{ display: 'block', fontSize: 9.5, fontWeight: 800, letterSpacing: '.5px',
                  textTransform: 'uppercase', opacity: .85, marginTop: 2 }}>
                  {[c.teams?.clubs?.name, sportName(sp)].filter(Boolean).join(' · ')}
                </span>
              </span>
            </button>
          );
        })}
        <button type="button" onClick={onAdd} aria-label={t('journal.addAria')} title={t('journal.addAria')}
          style={{ width: 44, borderRadius: 18, border: '1.5px dashed #D8CDC2', background: 'transparent',
            cursor: 'pointer', fontFamily: 'inherit', fontSize: 19, fontWeight: 700, color: 'var(--brand-dark)' }}>
          +
        </button>
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.5, marginBottom: 14 }}>
        {`${childLabel}, ${clubLabel}, ${t('journal.scopeTail')}`}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button className="btn ghost" style={{ marginBottom: 0 }} onClick={onCarnet}>{t('home.carnet')}</button>
        <button className="btn ghost" style={{ marginBottom: 0 }} onClick={onAgenda}>{t('home.agenda')}</button>
      </div>

      {!session && (
        <div className="card"><p style={{ margin: 0, color: 'var(--muted)' }}>{t('home.noSession')}</p></div>
      )}

      {session && (
        <>
          {/* ---- Présence et implication ---- */}
          {involvedKey && (
            <div className="card" style={{ background: GREEN_BG, border: 'none' }}>
              <div className="q" style={{ fontWeight: 800, fontSize: 16, color: GREEN_INK }}>{t(involvedKey)}</div>
              <p style={{ fontSize: 13, color: GREEN_SOFT, lineHeight: 1.55, margin: '6px 0 0' }}>
                {t('journal.involvedLead', { name: player.first_name })}
              </p>
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 12 }}>
                {streak > 1 && <Chip tone="white">{t('journal.chipStreak', { n: streak })}</Chip>}
                {sessionSkills.length === 1 && <Chip tone="white">{t('journal.chipNewSkill')}</Chip>}
                {sessionSkills.length > 1 && (
                  <Chip tone="white">{t('journal.chipNewSkills', { n: sessionSkills.length })}</Chip>
                )}
              </div>
            </div>
          )}

          {/* ---- Compte rendu de séance ---- */}
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <SectionLabel>{t('journal.report')}</SectionLabel>
              {clubName && (
                <span style={{ background: 'var(--peach)', color: '#5F2A1C', borderRadius: 999,
                  padding: '4px 10px', fontSize: 10.5, fontWeight: 800, whiteSpace: 'nowrap' }}>
                  {clubName}
                </span>
              )}
            </div>
            <h2 className="q" style={{ fontSize: 17, fontWeight: 800, lineHeight: 1.3, margin: '8px 0 4px' }}>
              {session.theme}
            </h2>
            <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
              {[dayLong(session.date, lang), slot].filter(Boolean).join(' · ')}
            </div>
            {attendance === 'absent' && (
              <div style={{ marginTop: 10 }}><Chip>{t('home.absent')}</Chip></div>
            )}

            {axes.length > 0 && (
              <>
                <SectionLabel style={{ margin: '18px 0 10px' }}>{t('journal.axes')}</SectionLabel>
                {axes.map((a, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                    <span style={{ flex: '0 0 8px', width: 8, height: 8, borderRadius: 999,
                      background: '#6E9C6E', marginTop: 5 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{t(`axis.${a.axis}`)}</div>
                      {a.comment && (
                        <div style={{ fontSize: 12.5, color: '#57534A', lineHeight: 1.5 }}>{a.comment}</div>
                      )}
                    </div>
                  </div>
                ))}
              </>
            )}

            {sessionSkills.length > 0 && (
              <>
                <SectionLabel style={{ margin: '18px 0 10px' }}>{t('journal.skillValidated')}</SectionLabel>
                <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                  {sessionSkills.map((s, i) => <Chip key={i}>✓ {s.label}</Chip>)}
                </div>
              </>
            )}

            {mot && (
              <>
                <SectionLabel style={{ margin: '18px 0 10px' }}>{t('journal.coachWord')}</SectionLabel>
                <blockquote style={{ margin: 0, padding: '2px 0 2px 12px', borderLeft: '3px solid var(--peach)',
                  fontSize: 13.5, lineHeight: 1.6, color: '#3D3A33' }}>
                  « {mot.body} »
                </blockquote>
                {/* Signature : le nom du coach n'est pas lisible par un parent (RLS
                    app_users), on signe donc avec ce que le parent peut voir. */}
                <div style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 600, marginTop: 8 }}>
                  {[team?.category, clubName].filter(Boolean).join(' · ')}
                </div>
              </>
            )}
          </div>

          {/* ---- Défi de la semaine ---- */}
          {defi && (
            <div className="card" style={{ background: GREEN_BG, border: 'none' }}>
              <SectionLabel style={{ color: GREEN_SOFT, marginBottom: 10 }}>{t('journal.challenge')}</SectionLabel>
              <Chip tone="white">🏠 {t('journal.atHome')}</Chip>
              <div className="q" style={{ fontWeight: 800, fontSize: 16, color: GREEN_INK, margin: '10px 0 0' }}>
                {defi.name}
              </div>
              {defi.home_exercise && (
                <>
                  <SectionLabel style={{ margin: '14px 0 6px', color: GREEN_SOFT }}>{t('journal.exercise')}</SectionLabel>
                  <div style={{ fontSize: 13, color: GREEN_SOFT, lineHeight: 1.55 }}>{defi.home_exercise}</div>
                </>
              )}
              {defi.competence && (
                <>
                  <SectionLabel style={{ margin: '14px 0 6px', color: GREEN_SOFT }}>{t('journal.skillDeveloped')}</SectionLabel>
                  <Chip tone="white">{defi.competence}</Chip>
                </>
              )}
              {defi.tip && (
                <>
                  <SectionLabel style={{ margin: '14px 0 6px', color: GREEN_SOFT }}>{t('journal.coachTip')}</SectionLabel>
                  <div style={{ fontSize: 13, color: GREEN_SOFT, lineHeight: 1.55 }}>💡 {defi.tip}</div>
                </>
              )}
              <div style={{ fontSize: 11.5, color: GREEN_SOFT, opacity: .85, lineHeight: 1.5, marginTop: 14 }}>
                {t('journal.noReturn')}
              </div>
            </div>
          )}

          {/* ---- Fil de la séance ---- */}
          {timeline.length > 0 && (
            <div className="card">
              <SectionLabel style={{ marginBottom: 14 }}>{t('journal.timeline')}</SectionLabel>
              <div style={{ paddingLeft: 20 }}>
                {timeline.map((it, i) => (
                  <div key={i} style={{ position: 'relative', paddingBottom: i === timeline.length - 1 ? 0 : 18 }}>
                    <span style={{ position: 'absolute', left: -17, top: 4, width: 10, height: 10,
                      borderRadius: 999, background: '#6E9C6E' }} />
                    {i < timeline.length - 1 && (
                      <span style={{ position: 'absolute', left: -13, top: 16, bottom: 0, width: 2,
                        background: GREEN_LINE }} />
                    )}
                    {it.time && (
                      <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.5px', color: 'var(--muted)' }}>
                        {it.time}
                      </div>
                    )}
                    <div style={{ fontWeight: 700, fontSize: 13, marginTop: 1 }}>{it.title}</div>
                    {it.text && (
                      <div style={{ fontSize: 12.5, color: '#57534A', lineHeight: 1.5, marginTop: 2 }}>{it.text}</div>
                    )}
                    {it.quote && (
                      <div style={{ fontSize: 12.5, color: '#57534A', lineHeight: 1.55, marginTop: 2, fontStyle: 'italic' }}>
                        « {it.quote} »
                      </div>
                    )}
                    {it.chips?.length > 0 && (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 7 }}>
                        {it.chips.map((c, j) => <Chip key={j}>{c}</Chip>)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ---- Prochaine convocation. Sans ligne de convocation, l'enfant n'est pas
             appelé sur cette échéance : on n'annonce rien. ---- */}
      {nextEvent && convocation && (
        <div className="card">
          <SectionLabel style={{ marginBottom: 10 }}>{t('journal.nextCall')}</SectionLabel>
          {nextEvent.rsvp_deadline && (
            <span style={{ background: '#FFF1E3', color: '#9A5B18', border: '1px solid #F6DCC0',
              borderRadius: 999, padding: '5px 11px', fontSize: 11.5, fontWeight: 700, display: 'inline-block' }}>
              {t('journal.replyBefore', { date: dayLong(nextEvent.rsvp_deadline, lang) })}
            </span>
          )}
          <div className="q" style={{ fontSize: 16, fontWeight: 800, lineHeight: 1.3, margin: '10px 0 4px' }}>
            {evTitle}
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
            {[
              dayLong(nextEvent.datetime, lang),
              nextEvent.place && `📍 ${nextEvent.place}`,
              evDate && t('journal.kickoff', { time: hhmm(nextEvent.datetime, lang) }),
            ].filter(Boolean).join(' · ')}
          </div>
          {/* Boutons visuels : la réponse du parent sera câblée avec le reste du
              flux de convocation. L'état affiché dessous, lui, vient de la base. */}
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            {[['present', 'journal.present'], ['absent', 'journal.absent']].map(([answer, key]) => {
              const on = convocation?.response === answer;
              return (
                <button key={answer} type="button" className={on ? 'btn' : 'btn ghost'}
                  style={{ marginBottom: 0, flex: 1 }}>
                  {t(key)}
                </button>
              );
            })}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.5, marginTop: 10 }}>
            {convocation?.response
              ? t('journal.answered', { answer: t(convocation.response === 'present' ? 'journal.present' : 'journal.absent') })
              : t('journal.noAnswer')}
          </div>
        </div>
      )}
    </>
  );
}
