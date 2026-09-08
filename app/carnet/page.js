'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';
import { loadMyChildren, pickChild, setStoredChildId } from '../../lib/children';
import { useT } from '../../lib/i18n';

const DOMAIN_KEYS = [
  { key: 'physique', icon: '💪' },
  { key: 'motricite', icon: '🤸' },
  { key: 'technique', icon: '🎯' },
  { key: 'tactique', icon: '♟️' },
  { key: 'mental', icon: '🧠' },
  { key: 'etat_esprit', icon: '🤝' },
];

export default function Carnet() {
  const router = useRouter();
  const { t, lang } = useT();
  const [ready, setReady] = useState(false);
  const [children, setChildren] = useState([]);
  const [player, setPlayer] = useState(null);
  const [skills, setSkills] = useState([]);

  const loadSkills = useCallback(async (p) => {
    setPlayer(p || null);
    if (!p) { setSkills([]); return; }
    const { data: sk } = await supabase.from('skills')
      .select('label, axis, validated_at').eq('player_id', p.id).eq('status', 'validee')
      .order('validated_at', { ascending: false });
    setSkills(sk || []);
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) { router.replace('/login'); return; }
      const kids = await loadMyChildren();
      setChildren(kids);
      await loadSkills(pickChild(kids));
      setReady(true);
    })();
  }, [router, loadSkills]);

  function switchChild(id) {
    setStoredChildId(id);
    loadSkills(children.find((c) => c.id === id));
  }

  if (!ready) return <div className="wrap"><p style={{ color: 'var(--muted)' }}>{t('common.loading')}</p></div>;

  if (!player) return (
    <div className="wrap">
      <div className="card"><p style={{ margin: 0, color: 'var(--muted)' }}>{t('common.noChild')}</p></div>
      <a href="#" onClick={(e) => { e.preventDefault(); router.push('/'); }}>{t('common.backLabel')}</a>
    </div>
  );

  const byDomain = {};
  for (const s of skills) { const k = s.axis || 'autre'; (byDomain[k] ||= []).push(s); }
  const total = skills.length;

  return (
    <div className="wrap">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 2 }}>
        <a href="#" onClick={(e) => { e.preventDefault(); router.push('/'); }} style={{ fontWeight: 700 }}>←</a>
        <div className="q" style={{ fontWeight: 700, fontSize: 18 }}>{t('carnet.title')}</div>
      </div>
      <h1 className="q" style={{ fontSize: 22, margin: '2px 0 2px' }}>{player.first_name} {player.last_name || ''}</h1>
      <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 14 }}>
        {total === 0 ? t('carnet.introEmpty') :
          t(total > 1 ? 'carnet.countMany' : 'carnet.countOne', { n: total })}
      </div>

      {children.length > 1 && (
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 16 }}>
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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
        {DOMAIN_KEYS.map((d) => {
          const n = (byDomain[d.key] || []).length;
          const active = n > 0;
          return (
            <div key={d.key} style={{
              background: active ? 'var(--peach)' : '#fff',
              border: '1px solid var(--border)', borderRadius: 14, padding: '11px 8px', textAlign: 'center',
              opacity: active ? 1 : 0.7 }}>
              <div style={{ fontSize: 19 }}>{d.icon}</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: active ? 'var(--brand-dark)' : 'var(--muted)', marginTop: 3, lineHeight: 1.2 }}>{t(`axis.${d.key}`)}</div>
              <div className="q" style={{ fontSize: 18, fontWeight: 800, color: active ? 'var(--brand-dark)' : '#C9C2B6', marginTop: 2 }}>{n}</div>
            </div>
          );
        })}
      </div>

      {total === 0 && (
        <div className="card"><p style={{ margin: 0, color: 'var(--muted)' }}>
          {t('carnet.emptyCard')}
        </p></div>
      )}
      {DOMAIN_KEYS.filter((d) => (byDomain[d.key] || []).length > 0).map((d) => {
        const items = byDomain[d.key];
        return (
          <div key={d.key} className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 17 }}>{d.icon}</span>
              <span className="q" style={{ fontWeight: 700, fontSize: 15 }}>{t(`axis.${d.key}`)}</span>
              <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--muted)' }}>{items.length}</span>
            </div>
            {items.map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, borderTop: i ? '1px solid var(--border)' : 'none', paddingTop: i ? 9 : 0, marginTop: i ? 9 : 0 }}>
                <span style={{ color: 'var(--brand)', fontWeight: 800 }}>✓</span>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{s.label}</span>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>{fmt(s.validated_at, lang)}</span>
              </div>
            ))}
          </div>
        );
      })}

      {(byDomain.autre || []).length > 0 && (
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 17 }}>⭐</span>
            <span className="q" style={{ fontWeight: 700, fontSize: 15 }}>{t('carnet.others')}</span>
            <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--muted)' }}>{byDomain.autre.length}</span>
          </div>
          {byDomain.autre.map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, borderTop: i ? '1px solid var(--border)' : 'none', paddingTop: i ? 9 : 0, marginTop: i ? 9 : 0 }}>
              <span style={{ color: 'var(--brand)', fontWeight: 800 }}>✓</span>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{s.label}</span>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>{fmt(s.validated_at, lang)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function fmt(d, lang) {
  if (!d) return '';
  try { return new Date(d).toLocaleDateString(lang === 'en' ? 'en-GB' : 'fr-FR', { day: 'numeric', month: 'short' }); }
  catch { return ''; }
}
