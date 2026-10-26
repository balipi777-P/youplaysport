/** Longueur maximale des précisions d'un événement (contrainte events_notes_len). */
export const NOTES_MAX = 1000;

/**
 * Lit events avec la colonne notes, puis sans elle si la base ne la connaît pas
 * encore (migration event_notes.sql pas appliquée) : l'écran reste utilisable.
 * `run(withNotes)` construit et exécute la requête ; renvoie { data, error }.
 */
export async function withNotes(run) {
  const r = await run(true);
  if (!r.error) return r;
  console.warn('[events.notes] lecture sans notes', r.error.message);
  return run(false);
}
