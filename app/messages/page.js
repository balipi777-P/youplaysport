'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';
import { useT } from '../../lib/i18n';
import BottomNav, { BOTTOM_NAV_HEIGHT } from '../components/BottomNav';
import ContactClub from '../components/ContactClub';

/* Messages avec le club : liste des demandes, nouveau message, conversation. */
export default function Messages() {
  const router = useRouter();
  const { t } = useT();
  const [ready, setReady] = useState(false);
  const [navRole, setNavRole] = useState('parent');

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) { router.replace('/login'); return; }
      const { data: ms } = await supabase.from('memberships').select('role');
      const roles = (ms || []).map((m) => m.role);
      setNavRole(roles.includes('admin') ? 'admin' : roles.includes('coach') ? 'coach' : 'parent');
      setReady(true);
    })();
  }, [router]);

  useEffect(() => { document.title = `${t('msgs.title')} · YouPlaySport`; }, [t]);

  if (!ready) return <div className="wrap"><p style={{ color: 'var(--muted)' }}>{t('common.loading')}</p></div>;

  return (
    <div className="wrap" style={{ paddingBottom: BOTTOM_NAV_HEIGHT + 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
        <a href="#" onClick={(e) => { e.preventDefault(); router.back(); }} aria-label={t('common.back')}
          style={{ fontWeight: 700, minWidth: 44, minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>←</a>
        <h1 className="q" style={{ fontWeight: 700, fontSize: 20, margin: 0 }}>{t('msgs.title')}</h1>
      </div>
      <ContactClub />
      <BottomNav role={navRole} />
    </div>
  );
}
