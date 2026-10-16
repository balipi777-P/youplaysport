'use client';

import { useEffect, useState, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';
import { useT } from '../../lib/i18n';
import {
  fetchMySpaces, listSpaces, validStoredSpace, contextOptions, enterSpace,
  getStored, setStored, clearSpaceStorage, CONTEXT_KEY, SPACE_HOME, KEY_SPACE,
} from '../../lib/spaces';

/* Pages sans compte connecté (ou qui aiguillent elles-mêmes). */
const HIDDEN = ['/login', '/bienvenue', '/mot-de-passe-oublie', '/reinitialiser', '/onboarding',
  '/cgu', '/confidentialite', '/choisir-espace'];

const CTX_LABEL = { parent: 'space.child', coach: 'space.team', admin: 'space.club' };

/** Sélecteur d'espace PERMANENT + contexte secondaire (enfant / équipe / club). */
export default function SpaceBar() {
  const { t } = useT();
  const pathname = usePathname();
  const [data, setData] = useState(null);
  const [space, setSpace] = useState('');
  const [ctx, setCtx] = useState('');

  const refresh = useCallback(async () => {
    const { data: s } = await supabase.auth.getSession();
    if (!s.session) { setData(null); return; }
    const d = await fetchMySpaces();
    setData(d);
    setSpace(validStoredSpace(d));
  }, []);

  useEffect(() => { refresh(); }, [refresh, pathname]);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') { clearSpaceStorage(); setData(null); setSpace(''); }
      if (event === 'SIGNED_IN') refresh();
    });
    return () => sub.subscription.unsubscribe();
  }, [refresh]);

  useEffect(() => {
    setCtx(space && CONTEXT_KEY[space] ? getStored(CONTEXT_KEY[space]) : '');
  }, [space, data]);

  if (!data || HIDDEN.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return null;
  const spaces = listSpaces(data);
  if (spaces.length === 0) return null;

  /* Navigation complète : tous les écrans relisent l'espace et le contexte stockés. */
  const go = (href) => { window.location.assign(href); };

  function onSpace(e) {
    const next = e.target.value;
    if (!next) return;
    if (next === 'superadmin') { go(SPACE_HOME.superadmin); return; }
    go(enterSpace(next, data));
  }
  function onContext(e) {
    setStored(CONTEXT_KEY[space], e.target.value);
    setCtx(e.target.value);
    go(SPACE_HOME[space] || '/');
  }

  const opts = space ? contextOptions(space, data) : [];
  const sel = { border: '1px solid var(--border)', borderRadius: 10, padding: '6px 8px', fontSize: 12.5,
    fontWeight: 700, fontFamily: 'inherit', background: '#fff', color: '#57534A', maxWidth: '100%', minWidth: 0 };

  return (
    <div style={{ position: 'sticky', top: 0, zIndex: 50, background: 'var(--bg, #FAF3ED)',
      borderBottom: '1px solid var(--border)' }}>
      <div style={{ maxWidth: 460, margin: '0 auto', padding: '7px 16px', display: 'flex',
        alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <select aria-label={t('space.switch')} value={space} onChange={onSpace} style={sel}
          data-key={KEY_SPACE}>
          {!space && <option value="">{t('space.pick')}</option>}
          {spaces.map((k) => <option key={k} value={k}>{t(`space.${k}`)}</option>)}
        </select>
        {opts.length > 1 && (
          <select aria-label={t(CTX_LABEL[space])} value={ctx} onChange={onContext} style={sel}>
            {opts.map((o) => (
              <option key={o.id} value={o.id}>{o.hint ? `${o.label} · ${o.hint}` : o.label}</option>
            ))}
          </select>
        )}
        {opts.length === 1 && (
          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--muted)' }}>{opts[0].label}</span>
        )}
      </div>
    </div>
  );
}
