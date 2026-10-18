'use client';

import { useId } from 'react';

/* Bloc repliable. Le titre et une ligne de résumé restent toujours visibles ; le
   détail se déroule au clic (transition douce sur la hauteur, via grid-template-rows).
   Contrôlé par le parent (open / onToggle) pour permettre « une seule ouverte à la fois ».
   tone="green" reprend le fond vert des blocs défi/présence, sinon crème par défaut. */

const TONES = {
  cream: { bg: '#fff', border: '1px solid var(--border)', title: 'inherit', sum: 'var(--muted)', chev: 'var(--brand-dark)' },
  green: { bg: '#E9F1EA', border: '1px solid #DCE8D4', title: '#2E5A43', sum: '#3E6B54', chev: '#2E5A43' },
};

export default function Accordion({ open, onToggle, title, summary, number, tone = 'cream', id, children }) {
  const uid = useId();
  const panelId = `${uid}-panel`;
  const c = TONES[tone] || TONES.cream;
  return (
    <div id={id} className="card" style={{ background: c.bg, border: c.border, padding: 0, overflow: 'hidden' }}>
      <button type="button" onClick={onToggle} aria-expanded={open} aria-controls={panelId}
        style={{ width: '100%', minHeight: 56, border: 'none', background: 'transparent', cursor: 'pointer',
          fontFamily: 'inherit', textAlign: 'left', color: 'inherit', padding: '14px 16px',
          display: 'flex', alignItems: 'center', gap: 11 }}>
        {number != null && (
          <span className="q" aria-hidden="true" style={{ width: 24, height: 24, flex: '0 0 24px', borderRadius: 9,
            background: open ? 'var(--brand)' : 'var(--peach)', color: open ? '#fff' : 'var(--brand-dark)',
            fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background .25s, color .25s' }}>{number}</span>
        )}
        <span style={{ flex: 1, minWidth: 0 }}>
          <span className="q" style={{ display: 'block', fontWeight: 800, fontSize: 15, lineHeight: 1.3, color: c.title }}>
            {title}
          </span>
          {summary && (
            <span style={{ display: 'block', fontSize: 12, color: c.sum, lineHeight: 1.45, marginTop: 2,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {summary}
            </span>
          )}
        </span>
        <span aria-hidden="true" style={{ flex: '0 0 auto', width: 28, height: 28, borderRadius: 999,
          background: open ? 'var(--peach)' : '#F1E9E1', color: c.chev, display: 'flex',
          alignItems: 'center', justifyContent: 'center', transition: 'transform .3s ease, background .25s',
          transform: open ? 'rotate(180deg)' : 'none' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6"
            strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
        </span>
      </button>
      <div id={panelId} role="region"
        style={{ display: 'grid', gridTemplateRows: open ? '1fr' : '0fr', opacity: open ? 1 : 0,
          visibility: open ? 'visible' : 'hidden',
          transition: 'grid-template-rows .32s ease, opacity .25s ease, visibility 0s linear ' + (open ? '0s' : '.32s') }}>
        <div style={{ overflow: 'hidden', minHeight: 0 }}>
          <div style={{ padding: '2px 16px 16px' }}>{children}</div>
        </div>
      </div>
    </div>
  );
}
