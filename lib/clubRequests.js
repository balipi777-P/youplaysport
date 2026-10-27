/** Limites partagées avec les fonctions SQL (supabase/club_requests.sql). */
export const MAX_SUBJECT = 120;
export const MAX_BODY = 2000;

/** Clé i18n d'un message d'erreur à partir du code levé par la fonction SQL. Jamais de message technique à l'écran. */
export function requestError(e) {
  const m = `${(e && e.message) || ''}`;
  if (m.includes('rate_limited')) return 'ctc.errRate';
  if (m.includes('links_forbidden')) return 'ctc.errLinks';
  if (m.includes('too_long')) return 'ctc.errLong';
  if (m.includes('empty')) return 'ctc.errEmpty';
  if (m.includes('closed')) return 'ctc.errClosed';
  if (m.includes('not_allowed')) return 'ctc.errNotAllowed';
  return 'ctc.errGeneric';
}

/** Libellé (clé i18n) et teinte d'une pastille de statut : open | answered | closed. */
export function requestStatus(status) {
  if (status === 'answered') return { key: 'ctc.stAnswered', bg: '#E9F1EA', ink: '#2E5A43' };
  if (status === 'closed') return { key: 'ctc.stClosed', bg: '#EFEBE2', ink: '#5A554B' };
  return { key: 'ctc.stOpen', bg: '#F5E9D6', ink: '#8A5A18' };
}
