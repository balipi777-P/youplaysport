'use client';

import { useEffect, useState, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';
import { useT } from '../../lib/i18n';
import Icon from './Icon';
import ClubAvatar from './ClubAvatar';
import {
  fetchMySpaces, listSpaces, validStoredSpace, contextOptions, enterSpace,
  getStored, setStored, clearSpaceStorage, CONTEXT_KEY, CONTEXT_EVENT, SPACE_HOME, KEY_SPACE,
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
  const [clubLogo, setClubLogo] = useState({ id: '', url: '', name: '' });

  const refresh = useCallback(async () => {
    const { data: s } = await supabase.auth.getSession();
    if (!s.session) { setData(null); return; }
    const d = await fetchMySpaces();
    setData(d);
    setSpace(validStoredSpace(d));
  }, []);

  useEffect(() => { refresh(); }, [refresh, pathname]);

  /* Logo du club courant (espace dirigeant) : l'RPC des espaces ne le renvoie pas,
     on le lit dans clubs. Repli sur les initiales si absent. */
  useEffect(() => {
    if (space !== 'admin' || !ctx) { setClubLogo({ id: '', url: '', name: '' }); return undefined; }
    let alive = true;
    supabase.from('clubs').select('name, logo_url').eq('id', ctx).maybeSingle()
      .then(({ data: c }) => { if (alive) setClubLogo({ id: ctx, url: c?.logo_url || '', name: c?.name || '' }); });
    return () => { alive = false; };
  }, [space, ctx, pathname]);

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

  /* Le contexte peut changer ailleurs (carte enfant, autre onglet) : on relit le stockage. */
  useEffect(() => {
    if (!space || !CONTEXT_KEY[space]) return undefined;
    const sync = () => setCtx(getStored(CONTEXT_KEY[space]));
    window.addEventListener(CONTEXT_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(CONTEXT_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, [space]);

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
  const sel = { appearance: 'none', WebkitAppearance: 'none', border: '1px solid var(--border)', borderRadius: 999,
    padding: '6px 28px 6px 12px', fontSize: 12.5, fontWeight: 800, fontFamily: 'inherit',
    background: '#fff', color: 'var(--brand-dark)', maxWidth: '100%', minWidth: 0, cursor: 'pointer' };
  const chev = { position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)',
    pointerEvents: 'none', color: 'var(--brand-dark)' };
  const wrapSel = { position: 'relative', display: 'inline-flex', alignItems: 'center', minWidth: 0, maxWidth: '100%' };

  return (
    <div style={{ position: 'sticky', top: 0, zIndex: 50, background: 'var(--paper)',
      borderBottom: '1px solid var(--border)' }}>
      <div style={{ maxWidth: 460, margin: '0 auto', padding: '7px 16px', display: 'flex',
        alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {spaces.length > 1 && (
          <span style={wrapSel}>
            <select aria-label={t('space.switch')} value={space} onChange={onSpace} style={sel}
              data-key={KEY_SPACE}>
              {!space && <option value="">{t('space.pick')}</option>}
              {spaces.map((k) => <option key={k} value={k}>{t(`space.${k}`)}</option>)}
            </select>
            <Icon name="chevron" size={14} strokeWidth={2} style={chev} />
          </span>
        )}
        {space === 'admin' && clubLogo.id === ctx && clubLogo.name && (
          <ClubAvatar name={clubLogo.name} logoUrl={clubLogo.url} size={26} radius={9} fontSize={10} />
        )}
        {opts.length > 1 && (
          <span style={wrapSel}>
            <select aria-label={t(CTX_LABEL[space])} value={ctx} onChange={onContext} style={sel}>
              {opts.map((o) => (
                <option key={o.id} value={o.id}>{o.hint ? `${o.label} · ${o.hint}` : o.label}</option>
              ))}
            </select>
            <Icon name="chevron" size={14} strokeWidth={2} style={chev} />
          </span>
        )}
        {opts.length === 1 && (
          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--muted)' }}>{opts[0].label}</span>
        )}
      </div>
    </div>
  );
}
