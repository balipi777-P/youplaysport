'use client';

import { useT } from '../../lib/i18n';

/* Précisions du coach pour les familles. Rien n'est rendu si le champ est vide.
   Le texte passe par React (échappé, jamais du HTML) et garde ses retours à la ligne. */
export default function EventNotes({ text, style }) {
  const { t } = useT();
  const body = (text || '').trim();
  if (!body) return null;
  return (
    <div style={{ background: '#FBF6F0', border: '1px solid var(--border)', borderRadius: 12,
      padding: '9px 11px', marginTop: 10, ...style }}>
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.6px', textTransform: 'uppercase',
        color: 'var(--muted)', marginBottom: 3 }}>
        {t('evt.notesShow')}
      </div>
      <div style={{ fontSize: 12.5, lineHeight: 1.5, color: '#57534A', whiteSpace: 'pre-wrap',
        overflowWrap: 'anywhere' }}>
        {body}
      </div>
    </div>
  );
}
