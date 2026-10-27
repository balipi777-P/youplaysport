'use client';

import { useEffect, useRef, useState } from 'react';
import Icon from './Icon';
import ClubAvatar from './ClubAvatar';
import { useT, LangToggle } from '../../lib/i18n';
import { initialsOfName } from '../../lib/userName';

/* En-tête de l'accueil coach : club en petit à gauche, avatar + menu (profil, langue, déconnexion) à droite. */
const menuItem = { display: 'block', width: '100%', minHeight: 44, textAlign: 'left', padding: '0 12px', border: 'none',
  background: 'transparent', fontFamily: 'inherit', fontSize: 14, fontWeight: 600, color: 'var(--ink)', cursor: 'pointer', borderRadius: 10 };

export default function AccountHeader({ headClub, userName, onProfile, onLogout }) {
  const { t } = useT();
  const [menu, setMenu] = useState(false);
  const menuRef = useRef(null);
  useEffect(() => {
    if (!menu) return undefined;
    const off = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenu(false); };
    const esc = (e) => { if (e.key === 'Escape') setMenu(false); };
    document.addEventListener('mousedown', off); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', off); document.removeEventListener('keydown', esc); };
  }, [menu]);

  return (
    <>
      {/* ---- En-tête : club en petit à gauche, avatar + menu à droite ---- */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
          {headClub ? (
            <>
              <ClubAvatar name={headClub.name} logoUrl={headClub.logo_url} color={headClub.accent_color || 'var(--brand)'}
                size={30} radius={10} fontSize={12} />
              <span className="q" style={{ fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {headClub.name}
              </span>
            </>
          ) : (
            <span className="q" style={{ fontWeight: 700, fontSize: 15 }}>You<span style={{ color: 'var(--brand)' }}>Play</span>Sport</span>
          )}
        </div>
        <div ref={menuRef} style={{ position: 'relative', flex: '0 0 auto' }}>
          <button type="button" className="q" onClick={() => setMenu((v) => !v)} aria-haspopup="menu" aria-expanded={menu}
            aria-label={t('journal.menuAria')}
            style={{ width: 44, height: 44, borderRadius: 14, border: 'none', background: 'var(--peach)', color: 'var(--brand-dark)',
              fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
            {userName ? initialsOfName(userName) : <Icon name="user" size={18} />}
          </button>
          {menu && (
            <div role="menu" style={{ position: 'absolute', right: 0, top: 50, zIndex: 30, minWidth: 190, background: '#fff',
              border: '1px solid var(--border)', borderRadius: 14, boxShadow: '0 8px 22px rgba(28,26,23,0.12)', padding: 6 }}>
              <button type="button" role="menuitem" onClick={() => { setMenu(false); onProfile(); }} style={menuItem}>{t('nav.myProfile')}</button>
              <div style={{ ...menuItem, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'default' }}>
                <span>{t('journal.menuLang')}</span><LangToggle big />
              </div>
              <button type="button" role="menuitem" onClick={() => { setMenu(false); onLogout(); }} style={menuItem}>{t('common.logout')}</button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
