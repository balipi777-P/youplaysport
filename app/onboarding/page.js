'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';
import { useT, LangToggle } from '../../lib/i18n';
import {
  fetchMySpaces, listSpaces, validStoredSpace, enterSpace, setStored, fetchPendingMembership, KEY_SPACE, KEY_CLUB,
} from '../../lib/spaces';
import WaitingAttach from '../components/WaitingAttach';

const ROLE_KEYS = [
  { key: 'parent', emoji: '👨‍👩‍👧' },
  { key: 'athlete', emoji: '🏅' },
  { key: 'coach', emoji: '📋' },
  { key: 'dirigeant', emoji: '🏛️' },
];

export default function Onboarding() {
  const router = useRouter();
  const { t, lang } = useT();
  const [ready, setReady] = useState(false);
  const [step, setStep] = useState('role'); // 'role' | 'club'
  const [role, setRole] = useState(null);
  const [clubName, setClubName] = useState('');
  const [newClubSport, setNewClubSport] = useState('');
  const [sportList, setSportList] = useState([]);
  const [clubCode, setClubCode] = useState('');
  const [consent, setConsent] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(null); // { role, clubName } : rôle rejoint, pas encore rattaché

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) { router.replace('/login'); return; }
      /* Déjà au moins un espace : le chooser n'a plus lieu d'être, on entre dans l'espace. */
      const d = await fetchMySpaces();
      const spaces = listSpaces(d);
      if (spaces.length > 0) {
        const space = validStoredSpace(d) || spaces[0];
        window.location.replace(enterSpace(space, d));
        return;
      }
      /* Un rôle dans un club mais aucun espace : on attend le rattachement, pas de retour au choix du profil. */
      const { data: sportRows } = await supabase.from('sports').select('id, name_fr, name_en, icon').order('name_fr');
      setSportList(sportRows || []);
      setWaiting(await fetchPendingMembership());
      setReady(true);
    })();
  }, [router]);

  function pickRole(r) { setRole(r); setErr(''); setStep('club'); }

  /** Retient l'espace (et le club rejoint si la RPC l'indique), puis entre dans l'espace sans repasser par le chooser. */
  async function enterAfter(space, result) {
    const clubId = result && typeof result === 'object' && !Array.isArray(result)
      ? (result.club_id || result.id || '') : (typeof result === 'string' ? result : '');
    const d = await fetchMySpaces();
    setStored(KEY_SPACE, space);
    if (space === 'admin' || space === 'coach') {
      if (clubId && space === 'admin') setStored(KEY_CLUB, clubId);
    }
    /* enterSpace complète le contexte (enfant / équipe / club) quand my_spaces le connaît. */
    if (d && listSpaces(d).includes(space)) { window.location.replace(enterSpace(space, d)); return; }
    const pending = await fetchPendingMembership();
    if (pending) { setWaiting(pending); return; }
    window.location.replace('/');
  }

  async function submit() {
    setErr(''); setBusy(true);
    try {
      if (role === 'dirigeant') {
        if (!clubName.trim()) throw new Error(t('onb.errClubName'));
        if (!newClubSport) throw new Error(t('onb.errClubSport'));
        const { data: created, error } = await supabase.rpc('create_club', { p_name: clubName.trim() });
        if (error) throw error;
        const createdClubId = created && typeof created === 'object' && !Array.isArray(created)
          ? (created.club_id || created.id || '') : (typeof created === 'string' ? created : '');
        if (createdClubId) {
          const { error: sportErr } = await supabase.from('clubs').update({ sport_id: newClubSport }).eq('id', createdClubId);
          if (sportErr) throw sportErr;
        }
        await enterAfter('admin', created);
        return;
      } else {
        if (role === 'parent' && !consent) throw new Error(t('onb.errConsent'));
        if (!clubCode.trim()) throw new Error(t('onb.errCode'));
        const { data: joined, error } = await supabase.rpc('join_club', { p_code: clubCode.trim(), p_role: role });
        if (error) throw error;
        await enterAfter(role, joined);
        return;
      }
      router.replace('/');
    } catch (e) {
      setErr(e.message || t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  async function tryDemo() {
    setBusy(true); setErr('');
    const { error } = await supabase.rpc('seed_demo');
    if (error) { setErr(error.message); setBusy(false); return; }
    router.replace('/');
  }

  if (!ready) return <div className="wrap"><p style={{ color: 'var(--muted)' }}>{t('common.loading')}</p></div>;
  if (waiting) return <WaitingAttach role={waiting.role} clubName={waiting.clubName} />;

  return (
    <div className="wrap">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div className="brand">
          <div className="logo">Y</div>
          <div className="q" style={{ fontWeight: 700, fontSize: 17 }}>
            You<span style={{ color: 'var(--brand)' }}>Play</span>Sport
          </div>
        </div>
        <LangToggle />
      </div>

      {err && <div className="error">{err}</div>}

      {step === 'role' && (
        <>
          <h1 className="q" style={{ fontSize: 24, letterSpacing: '-0.5px', margin: '0 0 6px' }}>{t('onb.whoAreYou')}</h1>
          <p style={{ color: 'var(--muted)', marginTop: 0, marginBottom: 18 }}>
            {t('onb.pickProfile')}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            {ROLE_KEYS.map((r) => (
              <button key={r.key} onClick={() => pickRole(r.key)}
                style={{ display: 'flex', alignItems: 'center', gap: 14, background: '#fff',
                  border: '1px solid var(--border)', borderRadius: 18, padding: 15, cursor: 'pointer',
                  textAlign: 'left', fontFamily: 'inherit' }}>
                <div style={{ width: 44, height: 44, borderRadius: 13, background: 'var(--peach)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>{r.emoji}</div>
                <div style={{ flex: 1 }}>
                  <div className="q" style={{ fontWeight: 700, fontSize: 16 }}>{t(`onb.role.${r.key}.title`)}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{t(`onb.role.${r.key}.desc`)}</div>
                </div>
                <span style={{ color: 'var(--muted)' }}>›</span>
              </button>
            ))}
          </div>
          <p style={{ textAlign: 'center', fontSize: 13, marginTop: 18 }}>
            {t('onb.wantTry')}{' '}
            <a href="#" onClick={(e) => { e.preventDefault(); tryDemo(); }}>{t('onb.createDemo')}</a>
          </p>
        </>
      )}

      {step === 'club' && role === 'dirigeant' && (
        <>
          <h1 className="q" style={{ fontSize: 24, letterSpacing: '-0.5px', margin: '0 0 6px' }}>{t('onb.createClub')}</h1>
          <p style={{ color: 'var(--muted)', marginTop: 0, marginBottom: 18 }}>
            {t('onb.createClubDesc')}
          </p>
          <div className="card">
            <div className="label" style={{ marginBottom: 6 }}>{t('onb.clubName')}</div>
            <input className="input" value={clubName} onChange={(e) => setClubName(e.target.value)}
              placeholder={t('onb.clubNamePh')} />
            <div className="label" style={{ marginBottom: 6 }}>{t('onb.clubSport')}</div>
            <select className="input" value={newClubSport} onChange={(e) => setNewClubSport(e.target.value)}>
              <option value="">{t('onb.clubSportPh')}</option>
              {sportList.map((sp) => (
                <option key={sp.id} value={sp.id}>{sp.icon} {(lang === 'en' ? sp.name_en || sp.name_fr : sp.name_fr) || ''}</option>
              ))}
            </select>
            <button className="btn" disabled={busy} onClick={submit}>{busy ? '…' : t('onb.doCreateClub')}</button>
          </div>
          <p style={{ textAlign: 'center', fontSize: 13 }}>
            <a href="#" onClick={(e) => { e.preventDefault(); setStep('role'); }}>{t('onb.changeProfile')}</a>
          </p>
        </>
      )}

      {step === 'club' && role !== 'dirigeant' && (
        <>
          <h1 className="q" style={{ fontSize: 24, letterSpacing: '-0.5px', margin: '0 0 6px' }}>{t('onb.joinClub')}</h1>
          <p style={{ color: 'var(--muted)', marginTop: 0, marginBottom: 18 }}>
            {t('onb.joinClubDesc')}
          </p>
          <div className="card">
            <div className="label" style={{ marginBottom: 6 }}>{t('onb.clubCode')}</div>
            <input className="input" value={clubCode} onChange={(e) => setClubCode(e.target.value.toUpperCase())}
              placeholder="Ex. K7P2QX" style={{ letterSpacing: 2, fontWeight: 700 }} />
            {role === 'parent' && (
              <label style={{ display: 'flex', gap: 9, alignItems: 'flex-start', fontSize: 12,
                color: '#7A5A18', background: '#FFF6E9', border: '1px solid #F6E4C4',
                borderRadius: 12, padding: 12, marginBottom: 10, lineHeight: 1.45 }}>
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)}
                  style={{ marginTop: 2 }} />
                <span>{t('onb.consent')}</span>
              </label>
            )}
            <button className="btn" disabled={busy} onClick={submit}>{busy ? '…' : t('onb.doJoin')}</button>
          </div>
          <p style={{ textAlign: 'center', fontSize: 13 }}>
            <a href="#" onClick={(e) => { e.preventDefault(); setStep('role'); }}>{t('onb.changeProfile')}</a>
          </p>
        </>
      )}
    </div>
  );
}
