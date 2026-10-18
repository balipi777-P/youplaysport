'use client';

import { useEffect, useState } from 'react';

/** Initiales d'un nom de club (repli quand il n'y a pas de logo). */
function initialsOf(name) {
  return (name || '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
}

/** Avatar de club : logo si logo_url est renseigné (et se charge), sinon initiales. */
export default function ClubAvatar({ name, logoUrl, color = 'var(--brand)', size = 44, radius, fontSize, style }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => { setBroken(false); }, [logoUrl]);
  const showLogo = !!logoUrl && !broken;
  return (
    <span className="q" role="img" aria-label={name || undefined}
      style={{ width: size, height: size, flex: `0 0 ${size}px`, borderRadius: radius ?? Math.round(size * 0.34),
        background: showLogo ? '#fff' : color, color: '#fff', display: 'inline-flex', alignItems: 'center',
        justifyContent: 'center', fontWeight: 800, fontSize: fontSize ?? Math.round(size * 0.36),
        letterSpacing: '.5px', overflow: 'hidden', boxShadow: showLogo ? 'inset 0 0 0 1px var(--border)' : 'none',
        ...style }}>
      {showLogo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt="" onError={() => setBroken(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      ) : initialsOf(name)}
    </span>
  );
}
