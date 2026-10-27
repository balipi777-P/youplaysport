'use client';

import { useId, useState } from 'react';

/**
 * Section pliable : titre cliquable (zone tactile d'au moins 44 px), chevron, aria-expanded.
 * Le contenu reste monté quand la section est repliée (`hidden`), pour ne pas perdre un
 * brouillon ou un état interne. `badge` et `summary` s'affichent dans le titre, donc visibles repliés.
 */
export default function Fold({ title, defaultOpen = false, badge, summary, danger, children, style }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  const ink = danger || 'inherit';
  return (
    <div className="card" style={{ minWidth: 0, padding: 0, ...(danger ? { border: `1.5px solid ${danger}` } : null), ...style }}>
      <button type="button" aria-expanded={open} aria-controls={`${id}-body`} onClick={() => setOpen(!open)}
        style={{ width: '100%', minHeight: 44, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 18px',
          border: 'none', background: 'transparent', font: 'inherit', color: ink, textAlign: 'left', cursor: 'pointer' }}>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span className="q" style={{ display: 'block', fontWeight: 700, fontSize: 15, overflowWrap: 'anywhere' }}>{title}</span>
          {summary && <span style={{ display: 'block', fontSize: 12, color: 'var(--muted)', fontWeight: 600, marginTop: 2 }}>{summary}</span>}
        </span>
        {badge ? (
          <span style={{ flex: '0 0 auto', minWidth: 22, textAlign: 'center', borderRadius: 999, padding: '3px 8px',
            fontSize: 11.5, fontWeight: 800, background: 'var(--brand)', color: '#fff' }}>{badge}</span>
        ) : null}
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" style={{ flex: '0 0 16px',
          transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>
          <path d="M3 6l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <div id={`${id}-body`} hidden={!open} style={{ padding: '0 18px 18px', minWidth: 0 }}>{children}</div>
    </div>
  );
}
