'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';
import { useT } from '../../lib/i18n';
import BottomNav, { BOTTOM_NAV_HEIGHT } from '../components/BottomNav';

/* Écran Séance du coach : de la saisie jusqu'au compte rendu publié.
   Le thème, le référentiel de compétences et la bibliothèque de défis viennent
   tous de la base — rien n'est écrit en dur. Les deux référentiels de la
   plateforme (skill_frameworks, challenges_library) sont vides aujourd'hui :
   les blocs le disent au lieu d'afficher des exemples inventés. */

const AXIS_EMOJI = {
  physique: '💪', motricite: '🤸', technique: '🎯',
  tactique: '♟️', mental: '🧠', etat_esprit: '🤝', hygiene: '🌙',
};
const AXIS_KEYS = ['physique', 'motricite', 'technique', 'tactique', 'mental', 'etat_esprit', 'hygiene'];
/* L'hygiène ne se valide pas comme une compétence sportive. */
const AXIS_SKILL_KEYS = AXIS_KEYS.filter((k) => k !== 'hygiene');

const GREEN = { bg: '#E9F1EA', ink: '#2E5A43', soft: '#3E6B54', line: '#DCE8D4' };

/** Date du jour au format ISO, valeur par défaut du champ date. */
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Fourchette d'âge lue dans une catégorie d'équipe : « U18 » → 18, « 8-10 » → 8 à 10. */
function ageRange(category) {
  const span = /(\d+)\s*[-–à]\s*(\d+)/.exec(category || '');
  if (span) return [Number(span[1]), Number(span[2])];
  const one = /(\d+)/.exec(category || '');
  return one ? [Number(one[1]), Number(one[1])] : null;
}

function Chip({ on, onClick, children }) {
  return (
    <button type="button" onClick={onClick}
      style={{ border: 'none', borderRadius: 20, padding: '7px 12px', fontSize: 12, fontWeight: 700,
        cursor: 'pointer', fontFamily: 'inherit',
        background: on ? 'var(--brand)' : '#F1E9E1', color: on ? '#fff' : '#57534A' }}>
      {children}{on ? ' ✓' : ''}
    </button>
  );
}

export default function Seance() {
  const router = useRouter();
  const { t, lang } = useT();
  const [ready, setReady] = useState(false);
  const [teams, setTeams] = useState([]);
  const [teamId, setTeamId] = useState('');
  const [team, setTeam] = useState(null);
  /* En-tête : quand a lieu la séance. sessions porte bien date, start_time et end_time. */
  const [date, setDate] = useState(todayISO());
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  /* Thème : propositions issues des séances déjà tenues dans ce sport, ou saisie libre. */
  const [themes, setThemes] = useState([]);
  const [theme, setTheme] = useState('');
  const [themeCustom, setThemeCustom] = useState('');
  const [teamPlayers, setTeamPlayers] = useState([]);
  const [presence, setPresence] = useState({}); // {playerId: 'present'|'late'|'absent'}
  /* Référentiel de compétences du sport, filtré à l'âge du groupe. */
  const [frameworks, setFrameworks] = useState([]);
  const [picked, setPicked] = useState([]); // libellés sélectionnés, pas encore validés
  const [skillCustom, setSkillCustom] = useState('');
  const [queued, setQueued] = useState([]); // [{label, axis}] écrits à la publication
  const [axes, setAxes] = useState({}); // {key: comment}
  const [challenges, setChallenges] = useState([]);
  const [defi, setDefi] = useState({ name: '', home_exercise: '', competence: '', tip: '' });
  const [mot, setMot] = useState('');
  const [objectif, setObjectif] = useState('');
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) { router.replace('/login'); return; }
      const { data: ct } = await supabase.from('coach_teams').select('team_id, teams(id, name)');
      const { data: adminMem } = await supabase.from('memberships').select('club_id').eq('role', 'admin');
      let all = (ct || []).map((r) => r.teams).filter(Boolean);
      if (adminMem && adminMem.length) {
        const ids = adminMem.map((m) => m.club_id);
        const { data: at } = await supabase.from('teams').select('id, name').in('club_id', ids);
        all = all.concat(at || []);
      }
      const uniq = Object.values(Object.fromEntries(all.map((tm) => [tm.id, tm])));
      setTeams(uniq);
      /* ?team=… : l'accueil coach ouvre la séance d'un groupe précis. L'identifiant
         n'est retenu que s'il correspond vraiment à une équipe encadrée. */
      const wanted = new URLSearchParams(window.location.search).get('team');
      const pre = uniq.find((tm) => tm.id === wanted);
      if (pre) setTeamId(pre.id);
      else if (uniq[0]) setTeamId(uniq[0].id);
      setReady(true);
    })();
  }, [router]);

  /* L'ancre (#presences, #competences) ne peut être suivie qu'une fois l'écran
     rendu : au chargement, les blocs n'existent pas encore. */
  useEffect(() => {
    if (!ready || !window.location.hash) return;
    document.getElementById(window.location.hash.slice(1))
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [ready]);

  /* Tout ce qui dépend du groupe. Les libellés ne sont pas construits ici :
     un changement de langue ne doit relancer aucune requête. */
  const loadTeam = useCallback(async (id) => {
    const { data: tm } = await supabase.from('teams')
      .select('id, name, category, sport_id, sports(name_fr, name_en, icon)')
      .eq('id', id).maybeSingle();
    setTeam(tm || null);

    const { data: pls } = await supabase.from('players')
      .select('id, first_name, last_name').eq('team_id', id).order('first_name');
    const list = pls || [];
    setTeamPlayers(list);
    setPresence(Object.fromEntries(list.map((p) => [p.id, 'present']))); // présents par défaut
    setPicked([]); setQueued([]); setSkillCustom('');

    if (!tm?.sport_id) { setFrameworks([]); setChallenges([]); setThemes([]); return; }

    /* Référentiel de compétences : par sport, puis restreint à l'âge du groupe
       quand la catégorie en dit quelque chose et que la ligne borne un âge. */
    const { data: fw } = await supabase.from('skill_frameworks')
      .select('id, category, name_fr, name_en, min_age, max_age').eq('sport_id', tm.sport_id);
    const span = ageRange(tm.category);
    setFrameworks((fw || []).filter((f) => {
      if (!span) return true;
      if (f.min_age != null && f.min_age > span[1]) return false;
      if (f.max_age != null && f.max_age < span[0]) return false;
      return true;
    }));

    const { data: cl } = await supabase.from('challenges_library')
      .select('id, name, home_exercise, competence, tip').eq('sport_id', tm.sport_id);
    setChallenges(cl || []);

    /* Thèmes proposés : aucune table ne les stocke, mais les séances déjà tenues
       dans ce sport en gardent la trace. Seuls les groupes lisibles remontent. */
    const { data: sameSport } = await supabase.from('teams').select('id').eq('sport_id', tm.sport_id);
    const ids = (sameSport || []).map((r) => r.id);
    if (!ids.length) { setThemes([]); return; }
    const { data: ss } = await supabase.from('sessions')
      .select('theme').in('team_id', ids).not('theme', 'is', null)
      .order('date', { ascending: false }).limit(60);
    const seen = [];
    for (const s of ss || []) {
      const v = (s.theme || '').trim();
      if (v && !seen.includes(v)) seen.push(v);
    }
    setThemes(seen.slice(0, 8));
  }, []);

  useEffect(() => {
    if (!teamId) { setTeam(null); setTeamPlayers([]); setFrameworks([]); setChallenges([]); setThemes([]); return; }
    loadTeam(teamId);
  }, [teamId, loadTeam]);

  function toggleAxis(k) {
    setAxes((a) => {
      const n = { ...a };
      if (k in n) delete n[k]; else n[k] = '';
      return n;
    });
  }

  function togglePicked(label) {
    setPicked((p) => (p.includes(label) ? p.filter((x) => x !== label) : [...p, label]));
  }

  /* File d'attente des validations. Le carnet ne peut être écrit qu'une fois la
     séance créée : on retient la compétence ici, la publication l'y inscrit. */
  function queueSkills() {
    const labels = [...picked, skillCustom.trim()].filter(Boolean);
    if (!labels.length) return;
    /* Axe rattaché : celui du référentiel s'il en désigne un, sinon le premier
       axe coché au programme — c'est ce que le carnet affichera. */
    const worked = Object.keys(axes).filter((k) => AXIS_SKILL_KEYS.includes(k));
    setQueued((q) => {
      const next = [...q];
      for (const label of labels) {
        if (next.some((e) => e.label === label)) continue;
        const fw = frameworks.find((f) => (lang === 'en' ? f.name_en || f.name_fr : f.name_fr) === label);
        const axis = AXIS_SKILL_KEYS.includes(fw?.category) ? fw.category : (worked[0] || 'technique');
        next.push({ label, axis });
      }
      return next;
    });
    setPicked([]); setSkillCustom('');
  }

  function applyChallenge(c) {
    setDefi({
      name: c.name || '', home_exercise: c.home_exercise || '',
      competence: c.competence || '', tip: c.tip || '',
    });
  }

  async function publish() {
    setErr(''); setOk(''); setBusy(true);
    try {
      if (!teamId) throw new Error(t('evt.errTeam'));
      if (!date) throw new Error(t('sea.errDate'));
      const custom = themeCustom.trim();
      const effective = custom || theme;
      if (!effective) throw new Error(t('sea.errTheme'));
      const { data: uinfo } = await supabase.auth.getUser();
      const uid = uinfo?.user?.id;
      const { data: s, error: se } = await supabase.from('sessions').insert({
        team_id: teamId, date, start_time: startTime || null, end_time: endTime || null,
        theme: effective, theme_custom: custom || null,
        coach_user_id: uid, published_at: new Date().toISOString(),
      }).select('id').single();
      if (se) throw se;
      const sid = s.id;
      const axRows = Object.entries(axes).map(([axis, comment]) => ({ session_id: sid, axis, comment }));
      if (axRows.length) { const { error } = await supabase.from('session_axes').insert(axRows); if (error) throw error; }
      if (defi.name.trim()) {
        const { error } = await supabase.from('session_challenge').insert({
          session_id: sid, name: defi.name.trim(), home_exercise: defi.home_exercise,
          competence: defi.competence, tip: defi.tip,
        });
        if (error) throw error;
      }
      const msgs = [];
      if (mot.trim()) msgs.push({ session_id: sid, team_id: teamId, type: 'mot_coach', body: mot.trim(), author_user_id: uid });
      if (objectif.trim()) msgs.push({ session_id: sid, team_id: teamId, type: 'objectif', body: objectif.trim(), author_user_id: uid });
      if (msgs.length) { const { error } = await supabase.from('messages').insert(msgs); if (error) throw error; }
      const attRows = teamPlayers.map((p) => ({ session_id: sid, player_id: p.id, status: presence[p.id] || 'present', marked_by: uid }));
      if (attRows.length) { const { error } = await supabase.from('attendance').insert(attRows); if (error) throw error; }
      /* Les compétences retenues vont d'un coup dans le carnet des présents. */
      const presentIds = teamPlayers.filter((p) => (presence[p.id] || 'present') === 'present').map((p) => p.id);
      if (presentIds.length) {
        for (const q of queued) {
          const { error } = await supabase.rpc('validate_skills', {
            p_session: sid, p_axis: q.axis, p_label: q.label, p_player_ids: presentIds,
          });
          if (error) throw error;
        }
      }
      setOk(t('sea.published'));
      setTheme(''); setThemeCustom(''); setAxes({}); setQueued([]); setPicked([]); setSkillCustom('');
      setDefi({ name: '', home_exercise: '', competence: '', tip: '' }); setMot(''); setObjectif('');
      setStartTime(''); setEndTime('');
    } catch (e) { setErr(e.message || t('common.error')); } finally { setBusy(false); }
  }

  if (!ready) return <div className="wrap"><p style={{ color: 'var(--muted)' }}>{t('common.loading')}</p></div>;

  const sportName = (lang === 'en' ? team?.sports?.name_en || team?.sports?.name_fr : team?.sports?.name_fr) || '';
  const fwLabel = (f) => (lang === 'en' ? f.name_en || f.name_fr : f.name_fr) || '';
  const presentCount = teamPlayers.filter((p) => (presence[p.id] || 'present') === 'present').length;
  const axisCount = Object.keys(axes).length;

  /* Date de la séance dans la langue active, pour le sous-titre. */
  const dateLabel = (() => {
    try {
      return new Date(`${date}T12:00:00`).toLocaleDateString(lang === 'en' ? 'en-GB' : 'fr-FR',
        { weekday: 'long', day: 'numeric', month: 'long' });
    } catch { return date; }
  })();

  /* Étiquette de carte numérotée, pour matérialiser l'ordre de saisie. */
  const step = (n, text, extra) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
      <span className="q" style={{ width: 21, height: 21, flex: '0 0 21px', borderRadius: 8, background: 'var(--peach)',
        color: 'var(--brand-dark)', fontSize: 11, fontWeight: 800,
        display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{n}</span>
      <span className="label">{text}{extra}</span>
    </div>
  );

  /* Badge de comptage, aligné à droite d'un titre de bloc. */
  const badge = (text) => (
    <span style={{ flex: '0 0 auto', background: GREEN.bg, color: GREEN.ink, border: `1px solid ${GREEN.line}`,
      borderRadius: 999, padding: '5px 11px', fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap' }}>
      {text}
    </span>
  );

  return (
    <div className="wrap" style={{ paddingBottom: BOTTOM_NAV_HEIGHT + 24 }}>
      {/* ===== En-tête ===== */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 16 }}>
        <a href="#" onClick={(e) => { e.preventDefault(); router.push('/'); }}
          style={{ fontWeight: 700, fontSize: 16, lineHeight: '24px' }}>←</a>
        <div style={{ minWidth: 0 }}>
          <div className="q" style={{ fontWeight: 700, fontSize: 18, lineHeight: '24px' }}>{t('sea.title')}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, marginTop: 2 }}>
            {[team?.name, dateLabel].filter(Boolean).join(' · ')}
          </div>
        </div>
      </div>

      {teams.length === 0 && (
        <div className="card"><p style={{ margin: 0, color: 'var(--muted)' }}>{t('sea.noTeam')}</p></div>
      )}

      {teams.length > 0 && (
        <>
          {err && <div className="error">{err}</div>}
          {ok && <div className="pill" style={{ marginBottom: 12 }}>{ok}</div>}

          {/* ===== 1. Quand, et avec qui ===== */}
          <div className="card">
            {step(1, t('evt.team'))}
            <select className="input" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
              {teams.map((tm) => <option key={tm.id} value={tm.id}>{tm.name}</option>)}
            </select>
            <div className="label" style={{ marginBottom: 6 }}>{t('sea.date')}</div>
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <div className="label" style={{ marginBottom: 6 }}>{t('sea.hours')}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="input" type="time" style={{ marginBottom: 0, flex: 1 }} value={startTime}
                onChange={(e) => setStartTime(e.target.value)} aria-label={t('sea.startTime')} />
              <input className="input" type="time" style={{ marginBottom: 0, flex: 1 }} value={endTime}
                onChange={(e) => setEndTime(e.target.value)} aria-label={t('sea.endTime')} />
            </div>
          </div>

          {/* ===== 2. Thème ===== */}
          <div className="card">
            {step(2, t('sea.theme'))}
            {themes.length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 10 }}>
                {themes.map((th) => (
                  <Chip key={th} on={theme === th && !themeCustom.trim()}
                    onClick={() => { setTheme(theme === th ? '' : th); setThemeCustom(''); }}>
                    {th}
                  </Chip>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, marginBottom: 10 }}>
                {t('sea.themeNone')}
              </div>
            )}
            <input className="input" value={themeCustom} onChange={(e) => setThemeCustom(e.target.value)}
              placeholder={t('sea.themeCustomPh')} />

            {/* Dépôt de fiche : visuel. documents n'est ouvert en écriture qu'au
                dirigeant du club (doc_write), et aucun stockage n'est branché. */}
            <div className="label" style={{ marginBottom: 6 }}>{t('sea.sheet')}</div>
            <div style={{ border: '1.5px dashed var(--border)', borderRadius: 16, padding: '20px 14px',
              textAlign: 'center', background: '#FCF9F6' }}>
              <div aria-hidden="true" style={{ fontSize: 22, lineHeight: 1 }}>📄</div>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: '#57534A', marginTop: 7 }}>
                {t('sea.sheetDrop')}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 4, lineHeight: 1.5 }}>
                {t('sea.sheetSoon')}
              </div>
            </div>
          </div>

          {/* ===== 3. Présences ===== */}
          <div className="card" id="presences">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              {step(3, t('sea.presence'))}
              {teamPlayers.length > 0 && badge(t('coach.presentOf', { n: presentCount, total: teamPlayers.length }))}
            </div>
            {teamPlayers.length === 0 && <div style={{ fontSize: 13, color: 'var(--muted)' }}>{t('sea.noMembers')}</div>}
            {teamPlayers.map((p, idx) => {
              const st = presence[p.id] || 'present';
              const opts = [
                { k: 'present', lbl: t('sea.letterPresent'), full: t('sea.pPresent'), c: '#1E7B34', bg: '#E6F4EA' },
                { k: 'late', lbl: t('sea.letterLate'), full: t('sea.pLate'), c: '#8A6D1B', bg: '#FBF1D6' },
                { k: 'absent', lbl: t('sea.letterAbsent'), full: t('sea.pAbsent'), c: '#C0392B', bg: '#FDECEA' },
              ];
              return (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8,
                  padding: '9px 0', borderTop: idx === 0 ? 'none' : '1px solid var(--border)' }}>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 700,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.first_name} {p.last_name || ''}
                  </span>
                  <div style={{ display: 'flex', gap: 5, flex: '0 0 auto' }}>
                    {opts.map((o) => {
                      const on = st === o.k;
                      return (
                        <button key={o.k} type="button" title={o.full} aria-label={`${p.first_name} — ${o.full}`}
                          aria-pressed={on} onClick={() => setPresence((m) => ({ ...m, [p.id]: o.k }))}
                          style={{ border: 'none', borderRadius: 12, width: 34, height: 34, fontSize: 13, fontWeight: 800,
                            cursor: 'pointer', fontFamily: 'inherit',
                            background: on ? o.c : o.bg, color: on ? '#fff' : o.c, opacity: on ? 1 : 0.75 }}>
                          {o.lbl}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            <div style={{ fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.5, marginTop: 12 }}>
              {t('sea.legend')}
            </div>
          </div>

          {/* ===== 4. Compétences validées pour le groupe ===== */}
          <div className="card" id="competences">
            {step(4, t('sea.skillsGroup'), <span style={{ textTransform: 'none', fontWeight: 500, color: 'var(--muted)' }}> {t('sea.optional')}</span>)}
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10, lineHeight: 1.5 }}>
              {t('sea.skillsGroupHint')}
            </div>
            {frameworks.length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 10 }}>
                {frameworks.map((f) => {
                  const label = fwLabel(f);
                  return (
                    <Chip key={f.id} on={picked.includes(label)} onClick={() => togglePicked(label)}>
                      {label}
                    </Chip>
                  );
                })}
              </div>
            ) : sportName ? (
              <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, marginBottom: 10 }}>
                {t('sea.skillsNone', { sport: sportName })}
              </div>
            ) : null}
            <input className="input" value={skillCustom} onChange={(e) => setSkillCustom(e.target.value)}
              placeholder={t('sea.skillLabelPh')} />
            <button type="button" className="btn" style={{ marginBottom: 0 }}
              disabled={presentCount === 0 || (!picked.length && !skillCustom.trim())}
              onClick={queueSkills}>
              {t('sea.validateFor', { n: presentCount })}
            </button>
            {queued.length > 0 && (
              <>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 12 }}>
                  {queued.map((q) => (
                    <span key={q.label} style={{ background: GREEN.bg, color: GREEN.ink,
                      border: `1px solid ${GREEN.line}`, borderRadius: 20, padding: '6px 11px',
                      fontSize: 12, fontWeight: 700 }}>
                      🌟 {q.label}
                      <button type="button" aria-label={t('sea.remove')}
                        onClick={() => setQueued((l) => l.filter((e) => e.label !== q.label))}
                        style={{ border: 'none', background: 'transparent', cursor: 'pointer',
                          fontFamily: 'inherit', color: GREEN.soft, fontWeight: 800, marginLeft: 6 }}>
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 8, lineHeight: 1.5 }}>
                  {t('sea.queued')}
                </div>
              </>
            )}
          </div>

          {/* ===== 5. Au programme (axes) ===== */}
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              {step(5, t('home.program'))}
              {badge(t(axisCount === 1 ? 'sea.axisBadgeOne' : 'sea.axisBadgeMany', { n: axisCount }))}
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>{t('sea.programHint')}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 12 }}>
              {AXIS_KEYS.map((k) => (
                <Chip key={k} on={k in axes} onClick={() => toggleAxis(k)}>
                  {`${AXIS_EMOJI[k]} ${t(`axis.long.${k}`)}`}
                </Chip>
              ))}
            </div>
            {AXIS_KEYS.filter((k) => k in axes).map((k) => (
              <div key={k} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.6px', textTransform: 'uppercase',
                    color: 'var(--brand-dark)' }}>
                    {t(`axis.${k}`)}
                  </span>
                  <span style={{ flex: '0 0 auto', fontSize: 11, color: 'var(--muted)' }}>{t(`axis.hint.${k}`)}</span>
                </div>
                <input className="input" style={{ marginBottom: 0, marginTop: 5 }} value={axes[k]}
                  onChange={(e) => setAxes((a) => ({ ...a, [k]: e.target.value }))}
                  placeholder={t('sea.axisCommentPh')} />
              </div>
            ))}
            <div style={{ fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.5, marginTop: 4 }}>
              {t('sea.programNote')}
            </div>
          </div>

          {/* ===== 6. Défi de la semaine ===== */}
          <div className="card" style={{ background: GREEN.bg, border: `1px solid ${GREEN.line}` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              {step(6, t('sea.challenge'))}
              {sportName && badge(t('sea.library', { sport: sportName }))}
            </div>
            {challenges.length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 12 }}>
                {challenges.map((c) => (
                  <Chip key={c.id} on={defi.name === c.name} onClick={() => applyChallenge(c)}>{c.name}</Chip>
                ))}
              </div>
            ) : sportName ? (
              <div style={{ fontSize: 12, color: GREEN.soft, lineHeight: 1.5, marginBottom: 12 }}>
                {t('sea.libraryEmpty', { sport: sportName })}
              </div>
            ) : null}
            <div className="label" style={{ marginBottom: 6, color: GREEN.soft }}>{t('sea.challengeName')}</div>
            <input className="input" value={defi.name} onChange={(e) => setDefi({ ...defi, name: e.target.value })}
              placeholder={t('sea.challengeNamePh')} />
            <div className="label" style={{ marginBottom: 6, color: GREEN.soft }}>{t('sea.homeEx')}</div>
            <input className="input" value={defi.home_exercise}
              onChange={(e) => setDefi({ ...defi, home_exercise: e.target.value })} placeholder={t('sea.homeExPh')} />
            <div className="label" style={{ marginBottom: 6, color: GREEN.soft }}>{t('sea.competence')}</div>
            <input className="input" value={defi.competence}
              onChange={(e) => setDefi({ ...defi, competence: e.target.value })} placeholder={t('sea.competencePh')} />
            <div className="label" style={{ marginBottom: 6, color: GREEN.soft }}>{t('sea.tip')}</div>
            <input className="input" style={{ marginBottom: 0 }} value={defi.tip}
              onChange={(e) => setDefi({ ...defi, tip: e.target.value })} placeholder={t('sea.tipPh')} />
            <div style={{ fontSize: 11.5, color: GREEN.soft, lineHeight: 1.5, marginTop: 10 }}>
              {t('sea.challengeNote')}
            </div>
          </div>

          {/* ===== 7. Mot du coach + objectif ===== */}
          <div className="card">
            {step(7, t('sea.motCoach'))}
            <input className="input" value={mot} onChange={(e) => setMot(e.target.value)} placeholder={t('sea.motPh')} />
            <div className="label" style={{ marginBottom: 6 }}>{t('sea.objective')}</div>
            <input className="input" value={objectif} onChange={(e) => setObjectif(e.target.value)}
              placeholder={t('sea.objectivePh')} />
            <div style={{ fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.5 }}>{t('sea.positiveNote')}</div>
          </div>

          {/* ===== Publication ===== */}
          <div className="card" style={{ background: 'var(--peach)', border: 'none' }}>
            <div className="q" style={{ fontWeight: 800, fontSize: 15, color: '#5F2A1C' }}>
              {t('sea.noDoubleTitle')}
            </div>
            <p style={{ fontSize: 12.5, color: '#7A4030', lineHeight: 1.6, margin: '6px 0 0' }}>
              {t('sea.noDouble')}
            </p>
          </div>
          <button className="btn" disabled={busy} onClick={publish}
            style={{ marginTop: 4, padding: 16, fontSize: 16, borderRadius: 16, boxShadow: '0 8px 20px rgba(192,91,68,.28)' }}>
            {busy ? t('sea.publishing') : t('sea.publishReport')}
          </button>
        </>
      )}

      <BottomNav role="coach" />
    </div>
  );
}
