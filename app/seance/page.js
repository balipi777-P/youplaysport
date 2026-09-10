'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';
import { useT } from '../../lib/i18n';

const AXIS_EMOJI = {
  physique: '💪', motricite: '🤸', technique: '🎯',
  tactique: '♟️', mental: '🧠', etat_esprit: '🤝', hygiene: '🌙',
};
const AXIS_KEYS = ['physique', 'motricite', 'technique', 'tactique', 'mental', 'etat_esprit', 'hygiene'];
const AXIS_SKILL_KEYS = AXIS_KEYS.filter((k) => k !== 'hygiene');

export default function Seance() {
  const router = useRouter();
  const { t, lang } = useT();
  const [ready, setReady] = useState(false);
  const [teams, setTeams] = useState([]);
  const [teamId, setTeamId] = useState('');
  const [theme, setTheme] = useState('');
  const [axes, setAxes] = useState({}); // {key: comment}
  const [defi, setDefi] = useState({ name: '', home_exercise: '', competence: '', tip: '' });
  const [mot, setMot] = useState('');
  const [objectif, setObjectif] = useState('');
  const [teamPlayers, setTeamPlayers] = useState([]);
  const [presence, setPresence] = useState({}); // {playerId: 'present'|'late'|'absent'}
  const [validations, setValidations] = useState([]); // [{axis, label, ids:{pid:true}}]
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);

  const axisLabel = (k) => `${AXIS_EMOJI[k] || ''} ${t(`axis.${k}`)}`.trim();

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
      const uniq = Object.values(Object.fromEntries(all.map((t) => [t.id, t])));
      setTeams(uniq);
      if (uniq[0]) setTeamId(uniq[0].id);
      setReady(true);
    })();
  }, [router]);

  useEffect(() => {
    if (!teamId) { setTeamPlayers([]); return; }
    (async () => {
      const { data } = await supabase.from('players').select('id, first_name, last_name').eq('team_id', teamId).order('first_name');
      const list = data || [];
      setTeamPlayers(list);
      setPresence(Object.fromEntries(list.map((p) => [p.id, 'present']))); // présents par défaut
      setValidations([]);
    })();
  }, [teamId]);

  function toggleAxis(k) {
    setAxes((a) => {
      const n = { ...a };
      if (k in n) delete n[k]; else n[k] = '';
      return n;
    });
  }

  function addValidation() {
    setValidations((v) => {
      const worked = Object.keys(axes).filter((k) => AXIS_SKILL_KEYS.includes(k));
      const axis = worked[0] || AXIS_SKILL_KEYS[0];
      return [...v, { axis, label: '', ids: {} }];
    });
  }
  function updateValidation(i, patch) {
    setValidations((v) => v.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));
  }
  function removeValidation(i) {
    setValidations((v) => v.filter((_, idx) => idx !== i));
  }
  function togglePlayer(i, pid) {
    setValidations((v) => v.map((e, idx) => {
      if (idx !== i) return e;
      const ids = { ...e.ids };
      if (ids[pid]) delete ids[pid]; else ids[pid] = true;
      return { ...e, ids };
    }));
  }

  async function publish() {
    setErr(''); setOk(''); setBusy(true);
    try {
      if (!teamId) throw new Error(t('evt.errTeam'));
      if (!theme.trim()) throw new Error(t('sea.errTheme'));
      const { data: uinfo } = await supabase.auth.getUser();
      const uid = uinfo?.user?.id;
      const { data: s, error: se } = await supabase.from('sessions').insert({
        team_id: teamId, date: new Date().toISOString().slice(0, 10),
        theme: theme.trim(), coach_user_id: uid, published_at: new Date().toISOString(),
      }).select('id').single();
      if (se) throw se;
      const sid = s.id;
      const axRows = Object.entries(axes).map(([axis, comment]) => ({ session_id: sid, axis, comment }));
      if (axRows.length) { const { error } = await supabase.from('session_axes').insert(axRows); if (error) throw error; }
      if (defi.name.trim()) {
        const { error } = await supabase.from('session_challenge').insert({ session_id: sid, name: defi.name, home_exercise: defi.home_exercise, tip: defi.tip });
        if (error) throw error;
      }
      const msgs = [];
      if (mot.trim()) msgs.push({ session_id: sid, team_id: teamId, type: 'mot_coach', body: mot.trim(), author_user_id: uid });
      if (objectif.trim()) msgs.push({ session_id: sid, team_id: teamId, type: 'objectif', body: objectif.trim(), author_user_id: uid });
      if (msgs.length) { const { error } = await supabase.from('messages').insert(msgs); if (error) throw error; }
      const attRows = teamPlayers.map((p) => ({ session_id: sid, player_id: p.id, status: presence[p.id] || 'present', marked_by: uid }));
      if (attRows.length) { const { error } = await supabase.from('attendance').insert(attRows); if (error) throw error; }
      for (const v of validations) {
        const ids = Object.keys(v.ids);
        if (!v.label.trim() || ids.length === 0) continue;
        const { error } = await supabase.rpc('validate_skills', {
          p_session: sid, p_axis: v.axis, p_label: v.label.trim(), p_player_ids: ids,
        });
        if (error) throw error;
      }
      setOk(t('sea.published'));
      setTheme(''); setAxes({}); setDefi({ name: '', home_exercise: '', competence: '', tip: '' }); setMot(''); setObjectif(''); setValidations([]);
    } catch (e) { setErr(e.message || t('common.error')); } finally { setBusy(false); }
  }

  if (!ready) return <div className="wrap"><p style={{ color: 'var(--muted)' }}>{t('common.loading')}</p></div>;

  /* Date du jour dans la langue active : « jeudi 10 septembre » / « Thursday 10 September ». */
  const todayLabel = new Date().toLocaleDateString(lang === 'en' ? 'en-GB' : 'fr-FR',
    { weekday: 'long', day: 'numeric', month: 'long' });

  /* Étiquette de carte numérotée, pour matérialiser l'ordre de saisie. */
  const step = (n, text, extra) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
      <span className="q" style={{ width: 21, height: 21, flex: '0 0 21px', borderRadius: 8, background: 'var(--peach)',
        color: 'var(--brand-dark)', fontSize: 11, fontWeight: 800,
        display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{n}</span>
      <span className="label">{text}{extra}</span>
    </div>
  );

  return (
    <div className="wrap">
      {/* ===== En-tête ===== */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 16 }}>
        <a href="#" onClick={(e) => { e.preventDefault(); router.push('/'); }}
          style={{ fontWeight: 700, fontSize: 16, lineHeight: '24px' }}>←</a>
        <div style={{ minWidth: 0 }}>
          <div className="q" style={{ fontWeight: 700, fontSize: 18, lineHeight: '24px' }}>{t('sea.title')}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, marginTop: 2 }}>{todayLabel}</div>
        </div>
      </div>

      {teams.length === 0 && (
        <div className="card"><p style={{ margin: 0, color: 'var(--muted)' }}>
          {t('sea.noTeam')}
        </p></div>
      )}

      {teams.length > 0 && (
        <>
          {err && <div className="error">{err}</div>}
          {ok && <div className="pill" style={{ marginBottom: 12 }}>{ok}</div>}

          {/* ===== 1. Équipe + thème ===== */}
          <div className="card">
            {step(1, t('evt.team'))}
            <select className="input" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
              {teams.map((tm) => <option key={tm.id} value={tm.id}>{tm.name}</option>)}
            </select>
            <div className="label" style={{ marginBottom: 6 }}>{t('sea.theme')}</div>
            <input className="input" style={{ marginBottom: 0 }} value={theme} onChange={(e) => setTheme(e.target.value)} placeholder={t('sea.themePh')} />
          </div>

          {/* ===== 2. Présences ===== */}
          <div className="card">
            {step(2, t('sea.presence'))}
            {teamPlayers.length === 0 && <div style={{ fontSize: 13, color: 'var(--muted)' }}>{t('sea.noMembers')}</div>}
            {teamPlayers.map((p, idx) => {
              const st = presence[p.id] || 'present';
              const opts = [
                { k: 'present', lbl: t('sea.pPresent'), c: '#1E7B34', bg: '#E6F4EA' },
                { k: 'late', lbl: t('sea.pLate'), c: '#8A6D1B', bg: '#FBF1D6' },
                { k: 'absent', lbl: t('sea.pAbsent'), c: '#C0392B', bg: '#FDECEA' },
              ];
              return (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8,
                  padding: '9px 0', borderTop: idx === 0 ? 'none' : '1px solid var(--border)' }}>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 700,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.first_name} {p.last_name || ''}
                  </span>
                  <div style={{ display: 'flex', gap: 4, flex: '0 0 auto' }}>
                    {opts.map((o) => {
                      const on = st === o.k;
                      return (
                        <button key={o.k} type="button" onClick={() => setPresence((m) => ({ ...m, [p.id]: o.k }))}
                          style={{ border: 'none', borderRadius: 14, padding: '7px 10px', fontSize: 11, fontWeight: 700,
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
          </div>

          {/* ===== 3. Au programme (axes) ===== */}
          <div className="card">
            {step(3, t('home.program'))}
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>{t('sea.programHint')}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 12 }}>
              {AXIS_KEYS.map((k) => {
                const on = k in axes;
                return (
                  <button key={k} onClick={() => toggleAxis(k)}
                    style={{ border: 'none', borderRadius: 20, padding: '7px 12px', fontSize: 12, fontWeight: 700,
                      cursor: 'pointer', fontFamily: 'inherit',
                      background: on ? 'var(--brand)' : '#F1E9E1', color: on ? '#fff' : '#57534A' }}>
                    {axisLabel(k)}{on ? ' ✓' : ''}
                  </button>
                );
              })}
            </div>
            {Object.keys(axes).map((k) => (
              <div key={k} style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--brand-dark)', marginBottom: 4 }}>
                  {axisLabel(k)}
                </div>
                <input className="input" style={{ marginBottom: 0 }} value={axes[k]}
                  onChange={(e) => setAxes((a) => ({ ...a, [k]: e.target.value }))}
                  placeholder={t('sea.axisCommentPh')} />
              </div>
            ))}
          </div>

          {/* ===== 4. Compétences validées ===== */}
          <div className="card">
            {step(4, t('sea.skillsTitle'), <span style={{ textTransform: 'none', fontWeight: 500, color: 'var(--muted)' }}> {t('sea.optional')}</span>)}
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10, lineHeight: 1.5 }}>
              {t('sea.skillsHint')}
            </div>
            {validations.map((v, i) => (
              <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 14, padding: 12, marginBottom: 10 }}>
                <div style={{ display: 'flex', gap: 7, marginBottom: 8 }}>
                  <select className="input" style={{ marginBottom: 0, width: 'auto', flex: '0 0 auto' }}
                    value={v.axis} onChange={(e) => updateValidation(i, { axis: e.target.value })}>
                    {AXIS_SKILL_KEYS.map((k) => <option key={k} value={k}>{axisLabel(k)}</option>)}
                  </select>
                  <input className="input" style={{ marginBottom: 0, flex: 1 }} value={v.label}
                    onChange={(e) => updateValidation(i, { label: e.target.value })}
                    placeholder={t('sea.skillLabelPh')} />
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                  {teamPlayers.length === 0 && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{t('sea.noMembers')}</span>}
                  {teamPlayers.map((p) => {
                    const on = !!v.ids[p.id];
                    return (
                      <button key={p.id} type="button" onClick={() => togglePlayer(i, p.id)}
                        style={{ border: 'none', borderRadius: 16, padding: '6px 11px', fontSize: 12, fontWeight: 700,
                          cursor: 'pointer', fontFamily: 'inherit',
                          background: on ? 'var(--brand)' : '#F1E9E1', color: on ? '#fff' : '#57534A' }}>
                        {p.first_name}{on ? ' ✓' : ''}
                      </button>
                    );
                  })}
                </div>
                <a href="#" onClick={(e) => { e.preventDefault(); removeValidation(i); }} style={{ fontSize: 12 }}>{t('sea.remove')}</a>
              </div>
            ))}
            <button className="btn ghost" type="button" style={{ marginBottom: 0 }} onClick={addValidation}>{t('sea.addSkill')}</button>
          </div>

          {/* ===== 5. Défi de la semaine ===== */}
          <div className="card">
            {step(5, t('sea.challenge'))}
            <input className="input" value={defi.name} onChange={(e) => setDefi({ ...defi, name: e.target.value })} placeholder={t('sea.challengeNamePh')} />
            <input className="input" value={defi.home_exercise} onChange={(e) => setDefi({ ...defi, home_exercise: e.target.value })} placeholder={t('sea.homeExPh')} />
            <input className="input" style={{ marginBottom: 0 }} value={defi.tip} onChange={(e) => setDefi({ ...defi, tip: e.target.value })} placeholder={t('sea.tipPh')} />
          </div>

          {/* ===== 6. Mot du coach + objectif ===== */}
          <div className="card">
            {step(6, t('sea.motCoach'))}
            <input className="input" value={mot} onChange={(e) => setMot(e.target.value)} placeholder={t('sea.motPh')} />
            <div className="label" style={{ marginBottom: 6 }}>{t('sea.objective')}</div>
            <input className="input" style={{ marginBottom: 0 }} value={objectif} onChange={(e) => setObjectif(e.target.value)} placeholder={t('sea.objectivePh')} />
          </div>

          {/* ===== Publication ===== */}
          <button className="btn" disabled={busy} onClick={publish}
            style={{ marginTop: 4, padding: 16, fontSize: 16, borderRadius: 16, boxShadow: '0 8px 20px rgba(192,91,68,.28)' }}>
            {busy ? t('sea.publishing') : t('sea.publish')}
          </button>
        </>
      )}
    </div>
  );
}
