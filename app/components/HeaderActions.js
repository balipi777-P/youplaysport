'use client';

import Icon from './Icon';
import { useT } from '../../lib/i18n';
import { initialsOfName } from '../../lib/userName';

/* Actions de compte en haut de l'accueil, à droite : « Se déconnecter » (icône + texte, 44 px),
   puis l'avatar, lien direct vers « Mon profil ». Le libellé passe en icône seule sur les très
   petits écrans (classe .yps-logout-txt, voir globals.css) ; il reste lu par aria-label. */
export default function HeaderActions({ userName, onProfile, onLogout }) {
  const { t } = useT();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '0 0 auto' }}>
      <button type="button" className="yps-logout" onClick={onLogout} aria-label={t('common.logout')}>
        <Icon name="logout" size={18} />
        <span className="yps-logout-txt">{t('common.logout')}</span>
      </button>
      <button type="button" className="q" onClick={onProfile} aria-label={t('nav.myProfile')}
        style={{ width: 44, height: 44, borderRadius: 14, border: 'none', background: 'var(--peach)', color: 'var(--brand-dark)',
          fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', flex: '0 0 auto' }}>
        {userName ? initialsOfName(userName) : <Icon name="user" size={18} />}
      </button>
    </div>
  );
}
