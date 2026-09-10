'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../lib/supabaseClient';
import { loadMyChildren, pickChild, setStoredChildId } from '../lib/children';
import { useT, LangToggle } from '../lib/i18n';
import BottomNav, { BOTTOM_NAV_HEIGHT } from './components/BottomNav';

const AXIS_EMOJI = {
  physique: '💪', motricite: '🤸', technique: '🎯',
  tactique: '♟️', mental: '🧠', etat_esprit: '🤝', hygiene: '🌙',
};

export default function Home() {
  const router = useRouter();
  const { t, lang } = useT();
  const [ready, setReady] = useState(false);
  const [memberships, setMemberships] = useState([]);
  const [children, setChildren] = useState([]);
  const [player, setPlayer] = useState(null);
  const [session, setSession] = useState(null);
  const [attendance, setAttendance] = useState(null);
  const [skills, setSkills] = useState([]);
  const [isSA, setIsSA] = useState(false);
  const [err, setErr] = useState('');

  const loadChildData = useCallback(async (p) => {
    setPlayer(p || null);
    if (!p) { setSession(null); setSkills([]); setAttendance(null); return; }
    const { data: sessions } = await supabase
      .from('sessions')
      .select('id, date, theme, session_axes(axis, comment), session_challenge(name, home_exercise, competence, tip), messages(type, body)')
      .eq('team_id', p.team_id).not('published_at', 'is', null)
      .order('date', { ascending: false }).limit(1);
    const s = sessions && sessions[0];
    setSession(s || null);
    if (s) {
      const { data: att } = await supabase.from('attendance').select('status')
        .eq('session_id', s.id).eq('player_id', p.id).limit(1);
      setAttendance(att && att[0] ? att[0].status : null);
    } else setAttendance(null);
    const { data: sk } = await supabase.from('skills').select('label, status')
      .eq('player_id', p.id).eq('status', 'validee');
    setSkills(sk || []);
  }, []);

  const load = useCallback(async () => {
    setErr('');
    const { data: mem } = await supabase
      .from('memberships').select('role, club_id, clubs(name, join_code)');
    setMemberships(mem || []);
    const kids = await loadMyChildren();
    setChildren(kids);
    const chosen = pickChild(kids);
    await loadChildData(chosen);
    const { data: sa } = await supabase.rpc('sa_is_admin');
    setIsSA(!!sa);
    return { mem: mem || [], hasChild: !!chosen };
  }, [loadChildData]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) { router.replace('/login'); return; }
      const res = await load();
      if (res.mem.length === 0 && !res.hasChild) { router.replace('/onboarding'); return; }
      setReady(true);
    })();
  }, [router, load]);

  function switchChild(id) {
    setStoredChildId(id);
    const c = children.find((x) => x.id === id);
    loadChildData(c);
  }

  async function logout() { await supabase.auth.signOut(); router.replace('/login'); }

  if (!ready) return <div className="wrap"><p style={{ color: 'var(--muted)' }}>{t('common.loading')}</p></div>;

  const staff = memberships.find((m) => m.role === 'admin' || m.role === 'coach');
  const mot = session?.messages?.find((m) => m.type === 'mot_coach');
  const objectif = session?.messages?.find((m) => m.type === 'objectif');
  const defi = session?.session_challenge;
  const axisLabel = (a) => `${AXIS_EMOJI[a] || ''} ${t(`axis.${a}`)}`.trim();

  /* Onglets de la barre basse : ils suivent la vue réellement affichée, pas le rôle
     le plus élevé. Un compte multi-rôles (admin + parent) voit son journal, donc la
     nav parent ; l'accès staff reste les boutons de l'Espace Dirigeant plus bas. */
  const navRole = player
    ? (memberships.some((m) => m.role === 'athlete') ? 'athlete' : 'parent')
    : (staff ? 'coach' : 'parent');

  /* Date du jour : « MERCREDI 10 SEPTEMBRE 2026 » / « WEDNESDAY 10 SEPTEMBER 2026 ». */
  const todayLabel = new Date()
    .toLocaleDateString(lang === 'en' ? 'en-GB' : 'fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    .toUpperCase();

  /* Initiales d'un enfant, pour la pastille du sélecteur. */
  const childInitials = (c) => `${(c.first_name || '')[0] || ''}${(c.last_name || '')[0] || ''}`.toUpperCase();

  /* Sous-ligne d'une pastille : « {icône} {club} · {sport} », sans les infos absentes. */
  const childSub = (c) => {
    const sp = c.teams?.sports;
    const sport = (lang === 'en' ? sp?.name_en || sp?.name_fr : sp?.name_fr) || '';
    const text = [c.teams?.clubs?.name, sport].filter(Boolean).join(' · ');
    if (!text) return '';
    return sp?.icon ? `${sp.icon} ${text}` : text;
  };

  return (
    <div className="wrap" style={{ paddingBottom: BOTTOM_NAV_HEIGHT + 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <div className="brand">
          <div className="logo">Y</div>
          <div className="q" style={{ fontWeight: 700, fontSize: 17 }}>
            You<span style={{ color: 'var(--brand)' }}>Play</span>Sport
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <LangToggle />
          <a href="#" onClick={(e) => { e.preventDefault(); logout(); }} style={{ fontSize: 13, fontWeight: 700 }}>{t('common.logout')}</a>
        </div>
      </div>

      {err && <div className="error">{err}</div>}

      {/* ---- Vue Parent : le journal ---- */}
      {player && (
        <>
          <div style={{ marginBottom: 3, color: 'var(--muted)', fontSize: 10.5, fontWeight: 800, letterSpacing: '.9px' }}>
            {todayLabel}
          </div>
          <h1 className="q" style={{ fontSize: 24, letterSpacing: '-0.4px', margin: '0 0 12px' }}>
            {t('home.todayTitle')}
          </h1>

          {/* Sélecteur d'enfant (visible dès un enfant) */}
          {children.length > 0 && (
            <>
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: children.length > 1 ? 8 : 14 }}>
                {children.map((c) => {
                  const on = c.id === player.id;
                  const sub = childSub(c);
                  return (
                    <button key={c.id} type="button" onClick={() => switchChild(c.id)}
                      style={{ border: 'none', borderRadius: 18, padding: '9px 14px 9px 9px', textAlign: 'left',
                        cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 9,
                        background: on ? 'var(--brand)' : '#F1E9E1', color: on ? '#fff' : '#57534A' }}>
                      <span className="q" style={{ width: 30, height: 30, flex: '0 0 30px', borderRadius: 10,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800,
                        background: on ? 'rgba(255,255,255,.24)' : '#fff', color: on ? '#fff' : 'var(--brand-dark)' }}>
                        {childInitials(c)}
                      </span>
                      <span>
                        <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700 }}>{c.first_name}</span>
                        {sub && <span style={{ display: 'block', fontSize: 10.5, fontWeight: 600, opacity: .8, marginTop: 1 }}>{sub}</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
              {children.length > 1 && (
                <div style={{ fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.5, marginBottom: 14 }}>
                  {t('home.oneAccount')}
                </div>
              )}
            </>
          )}

          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <button className="btn ghost" style={{ marginBottom: 0 }} onClick={() => router.push('/carnet')}>{t('home.carnet')}</button>
            <button className="btn ghost" style={{ marginBottom: 0 }} onClick={() => router.push('/agenda')}>{t('home.agenda')}</button>
            <button className="btn ghost" style={{ marginBottom: 0 }} onClick={() => router.push('/calendrier')}>{t('home.calendar')}</button>
          </div>
          {!session && <div className="card"><p style={{ margin: 0, color: 'var(--muted)' }}>{t('home.noSession')}</p></div>}
          {session && (
            <>
              <div className="card" style={{ background: 'var(--brand)', color: '#fff', border: 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span className="q" style={{ fontWeight: 700, fontSize: 16 }}>⚽ {player.teams?.name}</span>
                  <span style={{ fontSize: 12, opacity: .9 }}>{fmt(session.date, lang)}</span>
                </div>
                <div style={{ fontSize: 13, opacity: .95 }}>{t('home.theme')} : {session.theme}{attendance === 'present' && ` · ${t('home.present')}`}{attendance === 'late' && ` · ${t('home.late')}`}{attendance === 'absent' && ` · ${t('home.absent')}`}</div>
              </div>
              <div className="card">
                <div className="label" style={{ marginBottom: 12 }}>{t('home.program')}</div>
                {(session.session_axes || []).map((a, i) => (
                  <div key={i} style={{ display: 'flex', gap: 11, marginBottom: 11 }}>
                    <div style={{ fontSize: 15 }}>{AXIS_EMOJI[a.axis] || ''}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{t(`axis.${a.axis}`)}</div>
                      <div style={{ fontSize: 12, color: '#57534A', lineHeight: 1.4 }}>{a.comment}</div>
                    </div>
                  </div>
                ))}
              </div>
              {skills.length > 0 && (
                <div className="card" style={{ background: 'var(--peach)', border: 'none' }}>
                  <div className="label" style={{ color: 'var(--brand-dark)' }}>{t('home.skillValidated')}</div>
                  <div className="q" style={{ fontSize: 15, fontWeight: 700, color: '#5F2A1C', marginTop: 4 }}>{skills.map((s) => s.label).join(', ')} ✓</div>
                </div>
              )}
              {defi && (
                <div className="card" style={{ background: 'var(--ink)', color: '#fff', border: 'none' }}>
                  <div className="q" style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{t('home.weekChallenge')}</div>
                  <div className="q" style={{ fontSize: 15, fontWeight: 700, color: '#F0B8A8', marginBottom: 8 }}>🎯 {defi.name}</div>
                  <div style={{ fontSize: 13, color: '#E5E2DB', lineHeight: 1.5 }}>{defi.home_exercise} 💡 {defi.tip}</div>
                </div>
              )}
              {(mot || objectif) && (
                <div className="card">
                  {mot && <div style={{ fontSize: 13, lineHeight: 1.5, color: '#3D3A33' }}>« {mot.body} »</div>}
                  {objectif && <div className="pill" style={{ marginTop: 10 }}>🎯 {objectif.body}</div>}
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ---- Vue Staff (coach / dirigeant) ---- */}
      {staff && (
        <>
          {player && <div style={{ borderTop: '1px solid var(--border)', margin: '20px 0 4px' }} />}
          <div style={{ marginBottom: 4, color: 'var(--muted)', fontSize: 13, fontWeight: 600 }}>
            {t('home.space')} {t(`role.${staff.role}`)}
          </div>
          <h1 className="q" style={{ fontSize: 22, letterSpacing: '-0.4px', margin: '0 0 16px' }}>
            {staff.clubs?.name || t('home.yourClub')}
          </h1>
          {staff.role === 'admin' && staff.clubs?.join_code && (
            <div className="card" style={{ background: 'var(--peach)', border: 'none' }}>
              <div className="label" style={{ color: 'var(--brand-dark)' }}>{t('home.inviteCode')}</div>
              <div className="q" style={{ fontSize: 26, fontWeight: 800, letterSpacing: 3, color: '#5F2A1C', marginTop: 4 }}>
                {staff.clubs.join_code}
              </div>
              <div style={{ fontSize: 12, color: '#7A4030', marginTop: 6 }}>
                {t('home.inviteHint')}
              </div>
            </div>
          )}
          {staff.role === 'admin' && (
            <button className="btn" style={{ marginBottom: 10 }} onClick={() => router.push('/club')}>{t('home.manageClub')}</button>
          )}
          <button className="btn" style={{ marginBottom: 10 }} onClick={() => router.push('/seance')}>{t('home.createSession')}</button>
          <button className="btn ghost" style={{ marginBottom: 10 }} onClick={() => router.push('/evenements')}>{t('home.eventsAgenda')}</button>
        </>
      )}

      {isSA && (
        <div style={{ marginTop: 22 }}>
          <button className="btn" style={{ background: '#1F1C17' }} onClick={() => router.push('/superadmin')}>{t('home.superadmin')}</button>
        </div>
      )}

      {/* ---- Vue Parent/Athlète rattaché à un club mais sans enfant/fiche encore ---- */}
      {!player && !staff && (
        <div className="card">
          <h1 className="q" style={{ fontSize: 20, margin: '0 0 6px' }}>{t('home.welcome')}</h1>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 0 }}>
            {t('home.welcomeHint')}
          </p>
        </div>
      )}

      <BottomNav role={navRole} />
    </div>
  );
}

function fmt(d, lang) {
  try { return new Date(d).toLocaleDateString(lang === 'en' ? 'en-GB' : 'fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }); }
  catch { return d; }
}
