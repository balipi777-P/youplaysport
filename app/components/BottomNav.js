'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useT } from '../../lib/i18n';

/* Onglets par rôle. Uniquement des routes qui existent.
   Groupes pointe sur l'accueil : c'est là que le coach voit ses groupes. Le
   dirigeant garde l'écran de gestion du club, atteint depuis ce même accueil. */
const STAFF_TABS = [
  { href: '/', icon: '👥', key: 'nav.groups' },
  { href: '/seance', icon: '📝', key: 'nav.session' },
  { href: '/evenements', icon: '📣', key: 'nav.events' },
  { href: '/calendrier', icon: '📆', key: 'nav.calendar' },
];

const TABS = {
  parent: [
    { href: '/', icon: '📖', key: 'nav.journal' },
    { href: '/profil', icon: '👤', key: 'nav.profile' },
    { href: '/calendrier', icon: '📆', key: 'nav.calendar' },
    { href: '/alertes', icon: '🔔', key: 'nav.alerts' },
    { href: '/ajouter', icon: '➕', key: 'nav.add' },
  ],
  athlete: [
    { href: '/', icon: '⚡', key: 'nav.today' },
    { href: '/carnet', icon: '🌟', key: 'nav.carnet' },
    { href: '/calendrier', icon: '📆', key: 'nav.calendar' },
    { href: '/alertes', icon: '🔔', key: 'nav.alerts' },
  ],
  coach: STAFF_TABS,
  admin: STAFF_TABS,
};

/** Hauteur réservée sous le contenu pour que la barre ne masque rien. */
export const BOTTOM_NAV_HEIGHT = 70;

export default function BottomNav({ role = 'parent' }) {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useT();
  const tabs = TABS[role] || TABS.parent;

  const isActive = (href) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  return (
    <nav style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 40,
      background: '#fff', borderTop: '1px solid var(--border)',
      paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div style={{ maxWidth: 460, margin: '0 auto', display: 'flex', alignItems: 'stretch' }}>
        {tabs.map((tab) => {
          const on = isActive(tab.href);
          return (
            <button key={tab.href} type="button" onClick={() => router.push(tab.href)}
              aria-current={on ? 'page' : undefined}
              style={{ flex: 1, border: 'none', background: 'transparent', cursor: 'pointer',
                fontFamily: 'inherit', padding: '9px 2px 10px',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                color: on ? 'var(--brand)' : '#8A7A6E' }}>
              <span style={{ fontSize: 18, lineHeight: 1, opacity: on ? 1 : 0.75 }}>{tab.icon}</span>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.2px' }}>{t(tab.key)}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
