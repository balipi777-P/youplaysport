'use client';

import Icon from './Icon';
import ClubAvatar from './ClubAvatar';
import { useT, LangToggle } from '../../lib/i18n';
import { initialsOfName } from '../../lib/userName';

/* En-tête unique de l'application (parent, coach, athlète, dirigeant, écran vide) :
   logo + nom du club, langue FR/EN, « Se déconnecter », avatar (lien vers le profil).
   Mise en page dans globals.css (.app-hdr) : deux lignes sous 640 px, une seule ligne au-delà.
   hideBrand : console dirigeant, où le club est déjà en haut de la barre latérale.
   avatarUrl : réservé à une future photo ; sans elle, initiales sur fond de couleur. */
export default function AppHeader({ headClub, userName, avatarUrl, avatarColor, onProfile, onLogout, hideBrand = false }) {
  const { t } = useT();
  return (
    <div className={`app-hdr${hideBrand ? ' app-hdr--nobrand' : ''}`}>
      {!hideBrand && (
        <div className="app-hdr-brand">
          {headClub ? (
            <>
              <ClubAvatar name={headClub.name} logoUrl={headClub.logo_url} color={headClub.accent_color || 'var(--brand)'}
                size={34} radius={11} fontSize={13} />
              <span className="q app-hdr-name">{headClub.name}</span>
            </>
          ) : (
            <>
              <div className="logo">Y</div>
              <span className="q app-hdr-name">You<span style={{ color: 'var(--brand)' }}>Play</span>Sport</span>
            </>
          )}
        </div>
      )}
      <LangToggle big style={{ gridArea: 'lang' }} />
      <button type="button" className="yps-logout" onClick={onLogout} aria-label={t('common.logout')} style={{ gridArea: 'logout' }}>
        <Icon name="logout" size={18} />
        <span className="yps-logout-txt">{t('common.logout')}</span>
      </button>
      <button type="button" className="q app-hdr-avatar" onClick={onProfile} aria-label={t('nav.myProfile')}
        style={{ gridArea: 'avatar', background: avatarUrl ? `center/cover url(${avatarUrl})` : (avatarColor || 'var(--peach)') }}>
        {!avatarUrl && (userName ? initialsOfName(userName) : <Icon name="user" size={18} />)}
      </button>
    </div>
  );
}
