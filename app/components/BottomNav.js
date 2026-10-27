'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useT } from '../../lib/i18n';
import Icon from './Icon';
import { useClubUnread } from '../../lib/clubUnread';

/* Onglets par rôle. Uniquement des routes qui existent.
   Groupes pointe sur l'accueil : c'est là que le coach voit ses groupes. Le
   dirigeant garde l'écran de gestion du club, atteint depuis ce même accueil. */
const STAFF_TABS = [
  { href: '/', icon: 'groups', key: 'nav.groups' },
  { href: '/seance', icon: 'session', key: 'nav.session' },
  { href: '/evenements', icon: 'events', key: 'nav.events' },
  { href: '/calendrier', icon: 'calendar', key: 'nav.calendar' },
  { href: '/mes-donnees', icon: 'user', key: 'nav.myProfile' },
];

const TABS = {
  parent: [
    { href: '/', icon: 'journal', key: 'nav.journal' },
    { href: '/profil', icon: 'user', key: 'nav.profile' },
    { href: '/calendrier', icon: 'calendar', key: 'nav.calendar' },
    { href: '/alertes', icon: 'bell', key: 'nav.alerts' },
    { href: '/ajouter', icon: 'plus', key: 'nav.add' },
  ],
  athlete: [
    { href: '/', icon: 'bolt', key: 'nav.today' },
    { href: '/carnet', icon: 'star', key: 'nav.carnet' },
    { href: '/calendrier', icon: 'calendar', key: 'nav.calendar' },
    { href: '/alertes', icon: 'bell', key: 'nav.alerts' },
    { href: '/mes-donnees', icon: 'user', key: 'nav.myProfile' },
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
  const { count: unread } = useClubUnread();
  const staff = role === 'coach' || role === 'admin';
  const badgeHref = staff ? '/mes-donnees' : '/alertes';

  const isActive = (href) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  return (
    <nav style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 40,
      background: '#fff', borderTop: '1px solid var(--border)',
      paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div style={{ maxWidth: 460, margin: '0 auto', display: 'flex', alignItems: 'stretch' }}>
        {tabs.map((tab) => {
          const on = isActive(tab.href);
          const accent = tab.icon === 'plus'; // « Ajouter » : pastille terracotta pleine
          return (
            <button key={tab.href} type="button" onClick={() => router.push(tab.href)}
              aria-current={on ? 'page' : undefined}
              style={{ flex: 1, border: 'none', background: 'transparent', cursor: 'pointer',
                fontFamily: 'inherit', padding: '9px 2px 10px',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                color: on ? 'var(--brand)' : 'var(--muted)' }}>
              {accent ? (
                <span style={{ width: 30, height: 30, borderRadius: 999, background: 'var(--brand)', color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 4px 10px rgba(192,91,68,.35)' }}>
                  <Icon name="plus" size={18} strokeWidth={2} />
                </span>
              ) : (
                <span style={{ position: 'relative', display: 'inline-flex' }}>
                  <Icon name={tab.icon} size={21} style={{ opacity: on ? 1 : 0.85 }} />
                  {unread > 0 && tab.href === badgeHref && (
                    <span aria-label={t('ctc.unread')} style={{ position: 'absolute', top: -3, right: -6, minWidth: 8, height: 8,
                      borderRadius: 999, background: 'var(--brand)', border: '1.5px solid #fff' }} />
                  )}
                </span>
              )}
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.2px' }}>{t(tab.key)}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
