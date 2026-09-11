'use client';

import { useT } from '../../lib/i18n';

/* Onglet « Groupes » du coach — l'accueil de son espace. Composant purement
   présentatif : l'accueil reste seul à parler à Supabase et passe tout en props.
   Rien n'est écrit en dur ; un bloc sans donnée ne s'affiche pas. */

const GREEN = { bg: '#E9F1EA', ink: '#2E5A43', soft: '#3E6B54', line: '#DCE8D4' };

/* Teintes des pastilles de catégorie. Le choix est déterministe (dérivé du
   libellé) : une même catégorie garde sa couleur d'un écran à l'autre. */
const CATEGORY_TONES = [
  { bg: '#F3E3DC', ink: '#A0472F' },
  { bg: '#E4EDE4', ink: '#3E6B54' },
  { bg: '#E6EDF5', ink: '#2B4B6F' },
  { bg: '#F5E9D6', ink: '#8A5A18' },
  { bg: '#EDE6F2', ink: '#5B4270' },
];

function tone(label) {
  let h = 0;
  for (let i = 0; i < label.length; i += 1) h = (h * 31 + label.charCodeAt(i)) % 9973;
  return CATEGORY_TONES[h % CATEGORY_TONES.length];
}

/** « 17:30 » à partir d'un time Postgres ('17:30:00'). */
function hhmm(value) {
  return typeof value === 'string' && /^\d{2}:\d{2}/.test(value) ? value.slice(0, 5) : '';
}

/** « mercredi 10 septembre » */
function dayLong(value, lang) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleDateString(lang === 'en' ? 'en-GB' : 'fr-FR',
      { weekday: 'long', day: 'numeric', month: 'long' });
  } catch { return ''; }
}

function Chip({ children }) {
  return (
    <span style={{ background: '#fff', color: GREEN.ink, borderRadius: 999, padding: '6px 12px',
      fontSize: 12, fontWeight: 700, display: 'inline-block' }}>
      {children}
    </span>
  );
}

export default function CoachGroups({
  todayLabel, coachName, todaySession, teams, showClub,
  joinCode, onOpenSession, onNewSession, onNewEvent, onPresence, onSkills, onManageClub,
}) {
  const { t, lang } = useT();

  const name = coachName || t('coach.fallbackName');
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2)
    .map((w) => w[0]).join('').toUpperCase();

  /* Horaire de la séance du jour. La table sessions n'a pas de colonne de lieu :
     la ligne se limite à la date et à l'horaire. */
  const slot = todaySession
    ? [hhmm(todaySession.start_time), hhmm(todaySession.end_time)].filter(Boolean).join(' – ')
    : '';

  const quick = [
    { key: 'coach.newSession', icon: '📝', run: onNewSession },
    { key: 'coach.newEvent', icon: '📣', run: onNewEvent },
    { key: 'coach.markPresence', icon: '✅', run: onPresence },
    { key: 'coach.validateSkills', icon: '🌟', run: onSkills },
  ];

  return (
    <>
      {/* ---- En-tête : le rôle, le nom, l'avatar ---- */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: 'var(--muted)', fontSize: 10.5, fontWeight: 800, letterSpacing: '.9px' }}>
            {t('coach.eyebrow')}
          </div>
          <h1 className="q" style={{ fontSize: 24, letterSpacing: '-0.4px', margin: '3px 0 4px',
            wordBreak: 'break-word' }}>
            {name}
          </h1>
          <div style={{ fontSize: 12.5, color: 'var(--muted)', fontWeight: 600 }}>{todayLabel}</div>
        </div>
        <span className="q" aria-hidden="true" style={{ flex: '0 0 44px', width: 44, height: 44,
          borderRadius: 15, background: 'var(--peach)', color: 'var(--brand-dark)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 800 }}>
          {initials}
        </span>
      </div>

      {/* ---- Séance du jour. Lisible avant publication : la RLS de sessions
             n'ouvre que sur l'équipe. ---- */}
      {todaySession && (
        <div className="card" style={{ background: GREEN.bg, border: `1px solid ${GREEN.line}`,
          marginTop: 18 }}>
          <div className="label" style={{ color: GREEN.soft }}>{t('coach.sessionOfDay')}</div>
          <div className="q" style={{ fontSize: 17, fontWeight: 800, color: GREEN.ink,
            lineHeight: 1.3, margin: '8px 0 4px' }}>
            {todaySession.teams?.name}
          </div>
          <div style={{ fontSize: 12.5, color: GREEN.soft, lineHeight: 1.5 }}>
            {[dayLong(todaySession.date, lang), slot].filter(Boolean).join(' · ')}
          </div>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 12 }}>
            {todaySession.theme && <Chip>{todaySession.theme}</Chip>}
            {/* Le pointage n'existe qu'une fois la séance enregistrée : tant qu'il
                n'y a aucune ligne d'attendance, on ne compte pas des absents. */}
            <Chip>
              {todaySession.marked
                ? `✓ ${t('coach.presentOf', { n: todaySession.presents, total: todaySession.roster })}`
                : t('coach.notMarked')}
            </Chip>
          </div>
          <button type="button" className="btn" style={{ marginTop: 14, marginBottom: 0 }}
            onClick={() => onOpenSession(todaySession.team_id)}>
            {t('coach.openSession')}
          </button>
        </div>
      )}

      {/* Code d'invitation : propre au dirigeant, absent de la vue coach. */}
      {joinCode && (
        <div className="card" style={{ background: 'var(--peach)', border: 'none', marginTop: 14 }}>
          <div className="label" style={{ color: 'var(--brand-dark)' }}>{t('home.inviteCode')}</div>
          <div className="q" style={{ fontSize: 26, fontWeight: 800, letterSpacing: 3,
            color: '#5F2A1C', marginTop: 4 }}>
            {joinCode}
          </div>
          <div style={{ fontSize: 12, color: '#7A4030', marginTop: 6 }}>{t('home.inviteHint')}</div>
        </div>
      )}

      {/* ---- Mes groupes ---- */}
      <div className="label" style={{ margin: '20px 0 8px' }}>{t('coach.myGroups')}</div>
      {teams.length === 0 ? (
        <div className="card"><p style={{ margin: 0, color: 'var(--muted)', fontSize: 13 }}>{t('club.noTeam')}</p></div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {teams.map((tm, i) => {
            const cat = tm.category || '';
            const c = tone(cat || tm.name || '');
            /* Sous-ligne : ce que la base sait réellement du groupe. teams ne
               porte ni niveau ni jours d'entraînement — les jours affichés sont
               ceux que ses séances font ressortir. */
            const sub = [showClub ? tm.clubs?.name : null, tm.sportName, tm.days].filter(Boolean).join(' · ');
            return (
              <button key={tm.id} type="button" onClick={() => onOpenSession(tm.id)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 11, padding: '12px 14px',
                  background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                  textAlign: 'left', borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}>
                <span className="q" style={{ flex: '0 0 42px', width: 42, height: 34, borderRadius: 11,
                  background: c.bg, color: c.ink, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontSize: cat.length > 4 ? 10 : 12, fontWeight: 800 }}>
                  {cat || tm.sports?.icon || '🏅'}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontWeight: 700, fontSize: 13.5, color: 'var(--ink)' }}>
                    {tm.name}
                  </span>
                  {sub && (
                    <span style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)', marginTop: 1 }}>
                      {sub}
                    </span>
                  )}
                </span>
                <span style={{ flex: '0 0 auto', fontSize: 11.5, fontWeight: 700,
                  color: 'var(--brand-dark)', whiteSpace: 'nowrap' }}>
                  {t(tm.memberCount === 1 ? 'coach.memberOne' : 'coach.memberMany', { n: tm.memberCount || 0 })}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* ---- Accès rapide ---- */}
      <div className="label" style={{ margin: '20px 0 8px' }}>{t('coach.quickAccess')}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {quick.map((q) => (
          <button key={q.key} type="button" onClick={q.run}
            style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 18,
              padding: '16px 12px', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
              boxShadow: '0 8px 22px rgba(28,26,23,0.05)' }}>
            <span aria-hidden="true" style={{ display: 'block', fontSize: 20, lineHeight: 1 }}>{q.icon}</span>
            <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--ink)',
              lineHeight: 1.35, marginTop: 8 }}>
              {t(q.key)}
            </span>
          </button>
        ))}
      </div>

      {onManageClub && (
        <button type="button" className="btn ghost" style={{ margin: '14px 0 0' }} onClick={onManageClub}>
          {t('home.manageClub')}
        </button>
      )}
    </>
  );
}
