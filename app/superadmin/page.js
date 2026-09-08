'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';

const C = {
  bg: '#14120F', card: '#1F1C17', line: '#332E27', text: '#EDEAE3',
  muted: '#9C9488', accent: '#E07A5F', gold: '#E8C468', green: '#5FBF7A', red: '#E06A5A',
};
const PLANS = [
  { key: 'petit', name: 'Petit club' },
  { key: 'club', name: 'Club' },
  { key: 'club_plus', name: 'Club +' },
  { key: 'grand', name: 'Grand Club' },
];

export default function Superadmin() {
  const router = useRouter();
  const [state, setState] = useState('loading');
  const [tab, setTab] = useState('clubs');
  const [ov, setOv] = useState(null);
  const [clubs, setClubs] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [audit, setAudit] = useState([]);
  const [planSel, setPlanSel] = useState({}); // {clubId: planKey}
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');

  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(''), 3000); };

  const reload = useCallback(async () => {
    const { data: o } = await supabase.rpc('sa_overview');
    const { data: c } = await supabase.rpc('sa_clubs');
    const { data: t } = await supabase.rpc('sa_tickets');
    const { data: a } = await supabase.rpc('sa_audit');
    setOv(o); setClubs(c || []); setTickets(t || []); setAudit(a || []);
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) { router.replace('/login'); return; }
      const { data: isAdmin } = await supabase.rpc('sa_is_admin');
      if (!isAdmin) { setState('denied'); return; }
      await reload();
      setState('ready');
    })();
  }, [router, reload]);

  async function act(id, fn) {
    setBusy(id);
    try { await fn(); await reload(); }
    catch (e) { flash('Erreur : ' + (e.message || e)); }
    finally { setBusy(''); }
  }

  if (state === 'loading') return <Shell><p style={{ color: C.muted }}>Chargement du cockpit…</p></Shell>;
  if (state === 'denied') return (
    <Shell>
      <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 16, padding: 22 }}>
        <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 6 }}>Accès réservé</div>
        <p style={{ color: C.muted, margin: 0, fontSize: 13, lineHeight: 1.5 }}>
          Cette console est réservée au propriétaire de la plateforme YouPlaySport.
        </p>
        <a href="#" onClick={(e) => { e.preventDefault(); router.push('/'); }}
          style={{ color: C.accent, fontWeight: 700, fontSize: 13, display: 'inline-block', marginTop: 12 }}>← Retour à l’app</a>
      </div>
    </Shell>
  );

  const kpis = [
    { label: 'Clubs', value: ov.clubs, icon: '🏛️' },
    { label: 'Athlètes', value: ov.athletes, icon: '🏅' },
    { label: 'Coachs', value: ov.coaches, icon: '📋' },
    { label: 'Parents', value: ov.parents, icon: '👨‍👩‍👧' },
  ];
  const TABS = [
    { key: 'clubs', label: `Clubs (${clubs.length})` },
    { key: 'support', label: `Support (${tickets.filter((t) => t.status !== 'resolved').length})` },
    { key: 'audit', label: 'Journal' },
  ];

  return (
    <Shell>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 12, color: C.muted, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>Console plateforme</div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>YouPlaySport · Cockpit</div>
        </div>
        <a href="#" onClick={(e) => { e.preventDefault(); router.push('/'); }} style={{ color: C.muted, fontSize: 13, fontWeight: 700 }}>Quitter</a>
      </div>

      {msg && <div style={{ background: '#2A2118', border: `1px solid ${C.gold}`, color: C.gold, borderRadius: 12, padding: '9px 12px', fontSize: 13, marginBottom: 12 }}>{msg}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 12 }}>
        {kpis.map((k) => (
          <div key={k.label} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: '14px 12px' }}>
            <div style={{ fontSize: 17 }}>{k.icon}</div>
            <div style={{ fontSize: 24, fontWeight: 800, marginTop: 4 }}>{k.value}</div>
            <div style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>{k.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
        <Stat label="MRR (payants)" value={`${ov.mrr} €`} color={C.green} />
        <Stat label="Potentiel essais" value={`${ov.trial_potential} €`} color={C.gold} />
        <Stat label="Essais < 14 j" value={ov.expiring} color={C.red} />
      </div>

      {/* Onglets */}
      <div style={{ display: 'flex', gap: 6, background: '#26221C', borderRadius: 12, padding: 4, marginBottom: 14 }}>
        {TABS.map((t) => {
          const on = tab === t.key;
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{ flex: 1, border: 'none', borderRadius: 9, padding: '8px 0', fontSize: 12, fontWeight: 700,
                cursor: 'pointer', fontFamily: 'inherit',
                background: on ? C.accent : 'transparent', color: on ? '#1A130F' : C.muted }}>
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'clubs' && clubs.map((c) => {
        const trial = c.status === 'trial';
        const suspended = c.status === 'suspended';
        const days = c.trial_ends_at ? Math.ceil((new Date(c.trial_ends_at) - new Date()) / 86400000) : null;
        const sel = planSel[c.id] || c.plan_key || 'petit';
        return (
          <div key={c.id} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: 14, marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ flex: 1, fontWeight: 700, fontSize: 15 }}>{c.name}</span>
              <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 10,
                background: suspended ? '#3A1E1E' : trial ? '#3A2E1A' : '#1E3A28',
                color: suspended ? C.red : trial ? C.gold : C.green }}>
                {suspended ? 'Suspendu' : trial ? 'Essai' : (c.plan_name || 'Payant')}
              </span>
            </div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>
              {c.licencies} licencié(s) · {c.teams} équipe(s) · {c.members} membre(s)
              {trial && days !== null && ` · essai : ${days > 0 ? `${days} j restants` : 'expiré'}`}
            </div>

            <div style={{ display: 'flex', gap: 6, marginTop: 11, flexWrap: 'wrap', alignItems: 'center' }}>
              <select value={sel} onChange={(e) => setPlanSel((m) => ({ ...m, [c.id]: e.target.value }))}
                style={{ background: '#15120E', color: C.text, border: `1px solid ${C.line}`, borderRadius: 9, padding: '7px 9px', fontSize: 12, fontFamily: 'inherit' }}>
                {PLANS.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
              </select>
              <SBtn busy={busy === c.id + 'plan'} onClick={() => act(c.id + 'plan', () => supabase.rpc('sa_set_plan', { p_club: c.id, p_plan: sel }).then(r => { if (r.error) throw r.error; flash('Forfait appliqué (club payant) ✓'); }))}>Appliquer</SBtn>
              <SBtn busy={busy === c.id + 'trial'} onClick={() => act(c.id + 'trial', () => supabase.rpc('sa_extend_trial', { p_club: c.id, p_days: 30 }).then(r => { if (r.error) throw r.error; flash('Essai prolongé de 30 j ✓'); }))}>+30 j essai</SBtn>
              {suspended
                ? <SBtn color={C.green} busy={busy === c.id + 'st'} onClick={() => act(c.id + 'st', () => supabase.rpc('sa_set_status', { p_club: c.id, p_status: 'active' }).then(r => { if (r.error) throw r.error; flash('Club réactivé ✓'); }))}>Réactiver</SBtn>
                : <SBtn color={C.red} busy={busy === c.id + 'st'} onClick={() => act(c.id + 'st', () => supabase.rpc('sa_set_status', { p_club: c.id, p_status: 'suspended' }).then(r => { if (r.error) throw r.error; flash('Club suspendu ✓'); }))}>Suspendre</SBtn>}
            </div>
          </div>
        );
      })}

      {tab === 'support' && (
        <>
          {tickets.length === 0 && <Panel title="Support"><div style={{ fontSize: 13, color: C.muted }}>Aucun ticket.</div></Panel>}
          {tickets.map((t) => (
            <div key={t.id} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: 14, marginBottom: 10, opacity: t.status === 'resolved' ? 0.6 : 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ flex: 1, fontWeight: 700, fontSize: 14 }}>{t.subject}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: t.status === 'resolved' ? C.green : C.gold }}>{t.status}</span>
              </div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>{t.club || 'Club inconnu'} · {t.priority}</div>
              <div style={{ fontSize: 13, marginTop: 8, lineHeight: 1.5 }}>{t.body}</div>
              {t.status !== 'resolved' && (
                <div style={{ marginTop: 10 }}>
                  <SBtn color={C.green} busy={busy === t.id} onClick={() => act(t.id, () => supabase.rpc('sa_set_ticket_status', { p_ticket: t.id, p_status: 'resolved' }).then(r => { if (r.error) throw r.error; flash('Ticket résolu ✓'); }))}>Marquer résolu</SBtn>
                </div>
              )}
            </div>
          ))}
        </>
      )}

      {tab === 'audit' && (
        <Panel title="Journal d’audit (40 dernières actions)">
          {audit.length === 0 && <div style={{ fontSize: 13, color: C.muted }}>Aucune action enregistrée.</div>}
          {audit.map((a, i) => (
            <div key={i} style={{ padding: '9px 0', borderTop: i ? `1px solid ${C.line}` : 'none' }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{a.action} <span style={{ color: C.muted, fontWeight: 500 }}>· {a.target}</span></div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                {a.actor || 'système'} · {fmt(a.created_at)}{a.meta && Object.keys(a.meta).length ? ' · ' + JSON.stringify(a.meta) : ''}
              </div>
            </div>
          ))}
        </Panel>
      )}
    </Shell>
  );
}

function Shell({ children }) {
  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif' }}>
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '22px 16px 48px' }}>{children}</div>
    </div>
  );
}
function Stat({ label, value, color }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: '13px 12px' }}>
      <div style={{ fontSize: 19, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, marginTop: 2 }}>{label}</div>
    </div>
  );
}
function Panel({ title, children }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 16, padding: 16, marginBottom: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: .5, marginBottom: 4 }}>{title}</div>
      {children}
    </div>
  );
}
function SBtn({ children, onClick, busy, color }) {
  return (
    <button type="button" disabled={busy} onClick={onClick}
      style={{ border: `1px solid ${color || C.line}`, background: 'transparent', color: color || C.text,
        borderRadius: 9, padding: '7px 11px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: busy ? 0.5 : 1 }}>
      {busy ? '…' : children}
    </button>
  );
}
function fmt(d) {
  if (!d) return '';
  try { return new Date(d).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); }
  catch { return ''; }
}
