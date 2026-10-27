'use client';

import HeaderActions from './HeaderActions';
import ClubAvatar from './ClubAvatar';

/* En-tête de l'accueil coach : club en petit à gauche, déconnexion + avatar (lien vers Mon profil) à droite. */
export default function AccountHeader({ headClub, userName, onProfile, onLogout }) {
  return (
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
      <HeaderActions userName={userName} onProfile={onProfile} onLogout={onLogout} />
    </div>
  );
}
