'use client';

import { useEffect, useState } from 'react';
import { useT, LangToggle } from '../../lib/i18n';
import BottomNav, { BOTTOM_NAV_HEIGHT } from '../components/BottomNav';

export default function AjouterEnfant() {
  const { t } = useT();
  const [code, setCode] = useState('');
  const [firstName, setFirstName] = useState('');
  const [birth, setBirth] = useState('');
  const [notice, setNotice] = useState('');

  /**
   * Invitation reconnue : {club, group}. En partie 1, rien ne la résout — le
   * bloc reste donc masqué. Les paramètres d'URL servent uniquement à
   * prévisualiser la carte ; la vraie détection (code → club/sport) viendra
   * avec le câblage.
   */
  const [invite, setInvite] = useState(null);

  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search);
      if (!q.get('invite')) return;
      setInvite({ club: q.get('club') || '', group: q.get('groupe') || '' });
    } catch { /* pas d'URL exploitable */ }
  }, []);

  /* Partie 1 : la structure est posée, le rattachement n'est pas encore câblé. */
  function comingSoon() { setNotice(t('add.soon')); }

  return (
    <div className="wrap" style={{ paddingBottom: BOTTOM_NAV_HEIGHT + 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <div className="brand">
          <div className="logo">Y</div>
          <div className="q" style={{ fontWeight: 700, fontSize: 17 }}>
            You<span style={{ color: 'var(--brand)' }}>Play</span>Sport
          </div>
        </div>
        <LangToggle />
      </div>

      <div className="label" style={{ marginBottom: 4 }}>{t('add.overtitle')}</div>
      <h1 className="q" style={{ fontSize: 23, letterSpacing: '-0.5px', margin: '0 0 18px', lineHeight: 1.25 }}>
        {t('add.title')}
      </h1>

      {/* Carte d'invitation : visible seulement quand un lien a été reconnu. */}
      {invite && (
        <div className="card" style={{ background: 'var(--peach)', border: '1px solid #EBD3C9' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>▫️</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="label" style={{ color: 'var(--brand-dark)', marginBottom: 2 }}>
                {t('add.invite.label')}
              </div>
              <div className="q" style={{ fontWeight: 700, fontSize: 15 }}>
                {invite.club || t('add.invite.unknownClub')}
              </div>
              {invite.group && (
                <div style={{ fontSize: 12, color: 'var(--brand-dark)', marginTop: 2 }}>{invite.group}</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Saisie manuelle du code, pour qui n'arrive pas par un lien. */}
      <div className="card">
        <div className="q" style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>
          {t('add.code.title')}
        </div>
        <div className="label" style={{ marginBottom: 6 }}>{t('add.code.label')}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="input" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="A1B2C3" style={{ flex: 1, marginBottom: 0, letterSpacing: 2, fontWeight: 700 }} />
          <button type="button" onClick={comingSoon} className="btn ghost"
            style={{ width: 'auto', flexShrink: 0, padding: '13px 16px', fontSize: 14 }}>
            {t('add.code.check')}
          </button>
        </div>
        <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, margin: '10px 0 0' }}>
          {t('add.code.hint')}
        </p>
      </div>

      {/* Identité de l'enfant. Pas de choix de sport : il découle du code du club. */}
      <div className="card">
        <div className="q" style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>
          {t('add.child.title')}
        </div>
        <div className="label" style={{ marginBottom: 6 }}>{t('add.child.first')}</div>
        <input className="input" value={firstName} onChange={(e) => setFirstName(e.target.value)}
          placeholder="Léa" />
        <div className="label" style={{ marginBottom: 6 }}>{t('add.child.birth')}</div>
        <input className="input" type="date" value={birth} onChange={(e) => setBirth(e.target.value)}
          style={{ marginBottom: 0 }} />
      </div>

      {notice && <div className="pill" style={{ marginBottom: 12 }}>{notice}</div>}

      <button type="button" className="btn" onClick={comingSoon}>{t('add.submit')}</button>

      <BottomNav role="parent" />
    </div>
  );
}
