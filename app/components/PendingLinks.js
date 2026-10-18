'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useT } from '../../lib/i18n';

/** Ancienneté d'une demande, en clé de traduction + quantité. */
function since(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return null;
  const d = Math.floor(ms / 86400000);
  if (d >= 1) return { key: d === 1 ? 'adm.lic.sinceDay' : 'adm.lic.sinceDays', n: d };
  const h = Math.floor(ms / 3600000);
  if (h >= 1) return { key: h === 1 ? 'adm.lic.sinceHour' : 'adm.lic.sinceHours', n: h };
  return { key: 'adm.lic.sinceNow', n: 0 };
}

/** Âge révolu à partir d'une date de naissance, ou null si elle manque. */
function ageOf(birthdate) {
  if (!birthdate) return null;
  const b = new Date(`${birthdate}T12:00:00`);
  if (Number.isNaN(b.getTime())) return null;
  const now = new Date();
  let a = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) a -= 1;
  return a >= 0 ? a : null;
}

/** Liste des demandes de rattachement (présentation seule), commune à /club et à l'espace Coach. */
export function PendingLinksList({ pendings, busy, onDecide, note = true }) {
  const { t } = useT();
  return (
    <>
      {pendings.length === 0 && (
        <div style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.6 }}>{t('adm.lic.noPending')}</div>
      )}
      {pendings.map((p, i) => {
        const ago = since(p.requested_at);
        const age = ageOf(p.birthdate);
        /* Sans email, la demande ne vient d'aucun parent : c'est le licencié
           lui-même qui réclame son compte. */
        const self = !p.parent_email;
        const who = `${p.first_name || ''} ${p.last_name || ''}`.trim() || t('adm.lic.unknownAthlete');
        const title = self
          ? (age === null ? t('adm.lic.selfRequest') : t('adm.lic.selfRequestAge', { n: age }))
          : `${who} ← ${p.parent_email}`;
        const sub = [
          t('adm.lic.parentRequest'),
          self ? who : '',
          [p.club_name, p.team_name].filter(Boolean).join(' · '),
          ago ? t(ago.key, { n: ago.n }) : '',
        ].filter(Boolean).join(' · ');
        const wait = busy === p.link_id;
        const btn = { width: 'auto', padding: '8px 13px', fontSize: 12.5,
          opacity: wait ? 0.5 : 1, cursor: wait ? 'not-allowed' : 'pointer' };
        return (
          <div key={p.link_id} style={{ borderTop: i ? '1px solid var(--border)' : 'none', padding: '10px 0' }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, overflowWrap: 'anywhere' }}>{title}</div>
            {sub && <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>{sub}</div>}
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <button type="button" className="btn" disabled={wait} onClick={() => onDecide(p.link_id, true)} style={btn}>
                {t('adm.lic.validate')}
              </button>
              <button type="button" className="btn ghost" disabled={wait} onClick={() => onDecide(p.link_id, false)} style={btn}>
                {t('adm.lic.reject')}
              </button>
            </div>
          </div>
        );
      })}
      {note && (
        <div style={{ fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.5, marginTop: 10 }}>
          {t('adm.lic.pendingNote')}
        </div>
      )}
    </>
  );
}

/** Encart autonome pour l'espace Coach : charge les demandes de mes groupes. Masqué s'il n'y en a aucune. */
export default function PendingLinks() {
  const { t } = useT();
  const [pendings, setPendings] = useState([]);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    const { data, error } = await supabase.schema('yps').rpc('pending_links_for_admin');
    if (error) { console.error('pending_links_for_admin', error); return; }
    setPendings(data || []);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function decide(linkId, approve) {
    if (busy) return;
    setBusy(linkId); setErr('');
    const fn = approve ? 'validate_child_link' : 'reject_child_link';
    const { error } = await supabase.schema('yps').rpc(fn, { p_link: linkId });
    setBusy('');
    if (error) {
      console.error(fn, error);
      const m = `${error.message || ''}`;
      if (m.includes('link_not_found')) { setErr(t('adm.lic.linkGone')); await load(); return; }
      setErr(m.includes('not_admin') ? t('adm.lic.notAdmin') : t('adm.lic.linkFailed'));
      return;
    }
    setPendings((list) => list.filter((p) => p.link_id !== linkId));
  }

  if (pendings.length === 0 && !err) return null;
  return (
    <div className="card">
      <div className="label" style={{ marginBottom: 8 }}>{t('adm.lic.pending')}</div>
      {err && <div className="error" style={{ marginBottom: 8 }}>{err}</div>}
      <PendingLinksList pendings={pendings} busy={busy} onDecide={decide} note={false} />
    </div>
  );
}
