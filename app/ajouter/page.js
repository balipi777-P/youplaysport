'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';
import { loadMyChildren } from '../../lib/children';
import { useT, LangToggle } from '../../lib/i18n';
import BottomNav, { BOTTOM_NAV_HEIGHT } from '../components/BottomNav';

/* Ajouter un enfant · rejoindre un club.

   Tout vient de la base : le compte connecté, les enfants déjà rattachés avec
   leurs clubs, et — depuis le câblage — le club derrière un code.

   La RLS ferme yps.clubs et yps.teams à qui n'en est pas déjà membre. Deux
   fonctions security definer ouvrent juste ce qu'il faut, sans plus :
    - club_by_code() rend le nom du club et ses groupes à qui connaît le code,
      qui est le secret que le club distribue lui-même ;
    - request_child_link() crée la fiche du licencié et son rattachement, en
      « pending » tant que le club ne l'a pas validé.

   Aucun compte n'est créé ici : le parent est déjà connecté, et l'enfant est
   une fiche rattachée à son compte, pas un second compte.

   Le sport n'est jamais choisi par le parent — il découle du groupe, qui
   découle du club. */

/* Bleu du lien d'invitation, vert du compte détecté, et les deux boutons pleins. */
const BLUE = { bg: '#E8EFF7', line: '#D2E0EF', ink: '#2B4B6F' };
const GREEN = { bg: '#E9F1EA', line: '#CFE2D2', ink: '#2E5A43' };
const TEAL_BTN = '#23786F';
const GREEN_BTN = '#3F8455';

const CODE_MAX = 8;

/** Initiales : 2 lettres max (« AS Château-Thierry » → « AC »). */
function initials(name) {
  return (name || '')
    .split(/\s+/).filter(Boolean).slice(0, 2)
    .map((w) => w[0]).join('').toUpperCase();
}

export default function AjouterEnfant() {
  const router = useRouter();
  const { t, lang } = useT();
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [children, setChildren] = useState([]);

  const [code, setCode] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [birth, setBirth] = useState('');
  const [teamId, setTeamId] = useState('');
  const [consent, setConsent] = useState(false);
  const [notice, setNotice] = useState('');

  /** Club résolu par club_by_code() : {club_id, club_name, teams[]}. */
  const [found, setFound] = useState(null);
  const [codeErr, setCodeErr] = useState('');
  const [checking, setChecking] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendErr, setSendErr] = useState('');
  /** Demande partie : {club_name, child} — l'écran passe en confirmation. */
  const [sent, setSent] = useState(null);

  /**
   * Invitation reconnue. Elle ne sert qu'à pré-remplir le code : le nom du club
   * et ses groupes viennent ensuite de la base, jamais de l'URL.
   */
  const [invite, setInvite] = useState(null);

  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search);
      if (!q.get('invite')) return;
      const c = (q.get('code') || q.get('invite') || '').toUpperCase().trim();
      setInvite({ code: c });
      if (c && c !== '1') setCode(c.slice(0, CODE_MAX));
    } catch { /* pas d'URL exploitable */ }
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) { router.replace('/login'); return; }
      setEmail(data.session.user.email || '');
      /* La RLS de app_users n'ouvre que sa propre ligne : c'est bien le nom du
         titulaire du compte, et lui seul, qui est lu ici. */
      const { data: me } = await supabase.from('app_users')
        .select('full_name').eq('id', data.session.user.id).maybeSingle();
      setFullName(me?.full_name || '');
      setChildren(await loadMyChildren());
      setReady(true);
    })();
  }, [router]);

  useEffect(() => { document.title = `${t('add.title')} · YouPlaySport`; }, [t]);

  /**
   * Vérifie le code auprès de club_by_code(). La fonction rend null quand aucun
   * club ne porte ce code : on le dit, et on n'affiche rien de plus.
   */
  async function checkCode() {
    const c = code.trim();
    setNotice(''); setSendErr(''); setCodeErr(''); setFound(null); setTeamId('');
    if (!c) { setCodeErr(t('add.code.unknown')); return; }
    setChecking(true);
    const { data, error } = await supabase.rpc('club_by_code', { p_code: c });
    setChecking(false);
    if (error) {
      if (`${error.message}`.includes('not_authenticated')) { router.replace('/login'); return; }
      setCodeErr(t('add.code.failed'));
      return;
    }
    if (!data) { setCodeErr(t('add.code.unknown')); return; }
    setFound(data);
    /* Un seul groupe proposé : le choix est déjà fait. */
    const list = data.teams || [];
    if (list.length === 1) setTeamId(list[0].id);
  }

  /** Traduit l'erreur Postgres en phrase, et renvoie au login si la session a expiré. */
  function linkError(message) {
    const m = `${message || ''}`;
    if (m.includes('not_authenticated')) { router.replace('/login'); return ''; }
    if (m.includes('club_not_found')) return t('add.err.clubNotFound');
    if (m.includes('consent_required')) return t('add.err.consent');
    if (m.includes('team_mismatch')) return t('add.err.teamMismatch');
    if (m.includes('first_name_required')) return t('add.err.firstName');
    return t('add.err.generic');
  }

  async function submitRequest() {
    if (!canSubmit || sending) return;
    setSending(true); setSendErr(''); setNotice('');
    const { data, error } = await supabase.rpc('request_child_link', {
      p_code: code.trim(),
      p_first: firstName.trim(),
      p_last: lastName.trim(),
      p_birthdate: birth,
      p_team: teamId || null,
      p_consent: true,
    });
    setSending(false);
    if (error) { setSendErr(linkError(error.message)); return; }
    setSent({ club: data?.club_name || found?.club_name || '', child: firstName.trim() });
    /* La fiche existe désormais : la liste du compte la reprend, en « à valider ». */
    setChildren(await loadMyChildren());
  }

  if (!ready) return <div className="wrap"><p style={{ color: 'var(--muted)' }}>{t('common.loading')}</p></div>;

  const sportName = (sp) => (lang === 'en' ? sp?.name_en || sp?.name_fr : sp?.name_fr) || '';
  const parentName = fullName || email;
  const clubName = found?.club_name || '';
  const childName = firstName.trim();
  const groups = found?.teams || [];

  /** Libellé d'un groupe : son nom, sinon sa catégorie et son sport. */
  const groupLabel = (g) => g.name
    || [g.category, lang === 'en' ? g.sport_en || g.sport_fr : g.sport_fr].filter(Boolean).join(' · ')
    || t('add.group.untitled');

  /* Le bouton n'est actif que si la demande a tout ce qu'il lui faut : un club
     vérifié, un prénom, une date de naissance, le consentement — et un groupe
     dès lors que le club en propose. */
  const canSubmit = Boolean(found) && childName !== '' && birth !== '' && consent
    && (groups.length === 0 || teamId !== '');

  /* Un club par nom, avec l'enfant qui y est licencié : la même famille peut avoir
     deux enfants dans deux clubs, et c'est cette liste-là qui n'appartient qu'au parent. */
  const clubs = [];
  for (const c of children) {
    const name = c.teams?.clubs?.name;
    if (!name || clubs.some((x) => x.name === name)) continue;
    clubs.push({
      name,
      child: c.first_name || '',
      category: c.teams?.category || '',
      sport: sportName(c.teams?.sports),
    });
  }

  const known = children[0];
  const whoChild = childName || known?.first_name || '';
  const whoClub = clubName || known?.teams?.clubs?.name || '';

  const sectionLabel = (text) => (
    <div className="label" style={{ margin: '2px 0 8px' }}>{text}</div>
  );

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

      {/* ---- 1. Lien d'invitation ouvert (seulement si le lien porte l'information) ---- */}
      {invite && (
        <div className="card" style={{ background: BLUE.bg, border: `1px solid ${BLUE.line}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* Vignette QR : un motif, pas un vrai code — rien à scanner tant que le lien
                n'est pas signé côté serveur. */}
            <div aria-hidden="true" style={{ width: 46, height: 46, borderRadius: 12, background: '#fff',
              border: `1px solid ${BLUE.line}`, flexShrink: 0, padding: 7,
              display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gridAutoRows: '1fr', gap: 2 }}>
              {[1, 1, 0, 1, 1, 0, 1, 0, 0, 1, 1, 1, 1, 0, 1, 0].map((on, i) => (
                <span key={i} style={{ background: on ? BLUE.ink : 'transparent', borderRadius: 1 }} />
              ))}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="label" style={{ color: BLUE.ink, marginBottom: 2 }}>
                {t('add.invite.label')}
              </div>
              {/* Le lien ne porte qu'un code. Le nom du club, lui, vient de la
                  base — tant que le code n'est pas vérifié, on ne l'annonce pas. */}
              <div className="q" style={{ fontWeight: 700, fontSize: 15 }}>
                {clubName || t('add.invite.unknownClub')}
              </div>
              <div style={{ fontSize: 12, color: BLUE.ink, marginTop: 2 }}>
                {clubName
                  ? t(groups.length === 1 ? 'add.group.countOne' : 'add.group.countMany', { n: groups.length })
                  : t('add.invite.toCheck')}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---- 2. Compte détecté : l'email est celui de la session, rien n'est deviné ---- */}
      <div className="card" style={{ background: GREEN.bg, border: `1px solid ${GREEN.line}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ background: '#fff', color: GREEN.ink, border: `1px solid ${GREEN.line}`,
            borderRadius: 20, padding: '5px 11px', fontSize: 11.5, fontWeight: 800 }}>
            {t('add.detected.badge')}
          </span>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: GREEN.ink, wordBreak: 'break-all' }}>
            {email}
          </span>
        </div>
        <div className="q" style={{ fontWeight: 700, fontSize: 15, margin: '12px 0 6px' }}>
          {t('add.detected.title')}
        </div>
        <p style={{ fontSize: 12.5, color: '#4A5A4E', lineHeight: 1.6, margin: 0 }}>
          {[
            t('add.detected.noSecond'),
            clubName
              ? t('add.detected.textClub', { club: clubName, parent: parentName })
              : t('add.detected.text', { parent: parentName }),
            clubs.length ? t('add.detected.beside', { clubs: clubs.map((c) => c.name).join(', ') }) : '',
          ].filter(Boolean).join(' ')}
        </p>
        <button type="button" onClick={() => document.getElementById('add-code')?.focus()}
          style={{ display: 'block', width: '100%', marginTop: 14, background: TEAL_BTN, color: '#fff',
            border: 'none', borderRadius: 14, padding: 13, fontWeight: 700, fontSize: 14.5,
            fontFamily: 'inherit', cursor: 'pointer' }}>
          {t('add.detected.cta')}
        </button>
        <div style={{ textAlign: 'center', marginTop: 10 }}>
          {/* Se déconnecter est la seule façon honnête de « ce n'est pas moi » :
              cet écran ne crée aucun compte. */}
          <a href="#" onClick={async (e) => { e.preventDefault(); await supabase.auth.signOut(); router.replace('/login'); }}
            style={{ fontSize: 12.5, fontWeight: 700, color: GREEN.ink }}>
            {t('add.detected.notMine')}
          </a>
        </div>
      </div>

      {/* ---- 3. Code du club ---- */}
      <div className="card">
        <div className="q" style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>
          {t('add.code.title')}
        </div>
        {sectionLabel(t('add.code.label'))}
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="input" id="add-code" value={code} maxLength={CODE_MAX}
            onChange={(e) => { setCode(e.target.value.toUpperCase()); setFound(null); setCodeErr(''); setTeamId(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter') checkCode(); }}
            placeholder="V0L-7K2Q" style={{ flex: 1, marginBottom: 0, letterSpacing: 2, fontWeight: 700 }} />
          <button type="button" onClick={checkCode} className="btn ghost" disabled={checking}
            style={{ width: 'auto', flexShrink: 0, padding: '13px 16px', fontSize: 14,
              opacity: checking ? 0.6 : 1 }}>
            {checking ? t('add.code.checking') : t('add.code.check')}
          </button>
        </div>

        {codeErr && <div className="error" style={{ marginTop: 10 }}>{codeErr}</div>}

        {found && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12,
            background: GREEN.bg, border: `1px solid ${GREEN.line}`, borderRadius: 14, padding: '10px 12px' }}>
            <span className="q" style={{ width: 34, height: 34, flex: '0 0 34px', borderRadius: 11,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800,
              color: '#fff', background: found.accent_color || GREEN.ink }}>
              {initials(found.club_name)}
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700 }}>{found.club_name}</div>
              <div style={{ fontSize: 11.5, color: GREEN.ink }}>
                {t(groups.length === 1 ? 'add.group.countOne' : 'add.group.countMany', { n: groups.length })}
              </div>
            </div>
          </div>
        )}

        <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, margin: '10px 0 0' }}>
          {t('add.code.hint')}
        </p>
      </div>

      {/* ---- 4. L'enfant à rattacher. Pas de choix de sport : il découle du club. ---- */}
      <div className="card">
        <div className="q" style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>
          {t('add.child.title')}
        </div>
        {sectionLabel(t('add.child.first'))}
        <input className="input" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
        {sectionLabel(t('add.child.last'))}
        <input className="input" value={lastName} onChange={(e) => setLastName(e.target.value)} />
        {sectionLabel(t('add.child.birth'))}
        <input className="input" type="date" value={birth} onChange={(e) => setBirth(e.target.value)}
          style={{ marginBottom: 0 }} />
      </div>

      {/* ---- 5. Groupes du club, tels que la base les connaît. Le sport en
               découle : il n'est jamais choisi par le parent. ---- */}
      {found && groups.length > 0 && (
        <div className="card">
          {sectionLabel(t('add.group.byClub', { club: clubName }))}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {groups.map((g) => {
              const on = teamId === g.id;
              return (
                <button key={g.id} type="button" onClick={() => setTeamId(g.id)}
                  aria-pressed={on ? 'true' : 'false'}
                  style={{ border: `1px solid ${on ? 'var(--brand)' : 'var(--border)'}`, borderRadius: 20,
                    padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                    fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 6,
                    background: on ? 'var(--peach)' : '#fff', color: on ? 'var(--brand-dark)' : 'var(--ink)' }}>
                  {g.sport_icon && <span aria-hidden="true">{g.sport_icon}</span>}
                  {groupLabel(g)}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {found && groups.length === 0 && (
        <div className="card" style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.6 }}>
          {t('add.group.none', { club: clubName })}
        </div>
      )}

      {/* ---- 6. Consentement, pour ce club-là seulement ---- */}
      <label className="card" style={{ display: 'flex', gap: 11, alignItems: 'flex-start', cursor: 'pointer' }}>
        <input type="checkbox" checked={consent} onChange={() => setConsent((v) => !v)}
          style={{ width: 17, height: 17, accentColor: 'var(--brand)', flex: '0 0 17px', marginTop: 2 }} />
        <span style={{ fontSize: 12.5, lineHeight: 1.6 }}>
          {clubName && childName ? t('add.consent.full', { club: clubName, child: childName })
            : clubName ? t('add.consent.club', { club: clubName })
              : childName ? t('add.consent.child', { child: childName })
                : t('add.consent.plain')}
        </span>
      </label>

      {notice && <div className="pill" style={{ marginBottom: 12 }}>{notice}</div>}
      {sendErr && <div className="error" style={{ marginBottom: 12 }}>{sendErr}</div>}

      {sent ? (
        /* Demande partie : plus de bouton, mais ce que le club doit faire ensuite. */
        <div className="card" style={{ background: GREEN.bg, border: `1px solid ${GREEN.line}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ background: '#fff', color: GREEN.ink, border: `1px solid ${GREEN.line}`,
              borderRadius: 20, padding: '5px 11px', fontSize: 11.5, fontWeight: 800 }}>
              {t('add.sent.badge')}
            </span>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: GREEN.ink }}>
              {t('add.sent.byClub', { club: sent.club })}
            </span>
          </div>
          <div className="q" style={{ fontWeight: 700, fontSize: 15, margin: '12px 0 6px' }}>
            {t('add.sent.title', { child: sent.child })}
          </div>
          <p style={{ fontSize: 12.5, color: '#4A5A4E', lineHeight: 1.6, margin: 0 }}>
            {t('add.sent.noAccount')}
          </p>
        </div>
      ) : (
        <>
          <button type="button" onClick={submitRequest} disabled={!canSubmit || sending}
            style={{ display: 'block', width: '100%', background: GREEN_BTN, color: '#fff', border: 'none',
              borderRadius: 14, padding: 14, fontWeight: 700, fontSize: 15, fontFamily: 'inherit',
              opacity: !canSubmit || sending ? 0.45 : 1,
              cursor: !canSubmit || sending ? 'not-allowed' : 'pointer' }}>
            {sending ? t('add.sending') : t('add.submitRequest')}
          </button>
          <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, margin: '10px 0 22px', textAlign: 'center' }}>
            {t('add.stayNote', { email })}
          </p>
        </>
      )}

      {/* ---- 7. Votre compte après rattachement ---- */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div className="q" style={{ fontWeight: 700, fontSize: 15 }}>{t('add.after.title')}</div>
          <span style={{ flex: '0 0 auto', background: GREEN.bg, color: GREEN.ink,
            border: `1px solid ${GREEN.line}`, borderRadius: 20, padding: '5px 11px',
            fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap' }}>
            {t('add.after.badge')}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 11, margin: '14px 0 4px' }}>
          <div style={{ width: 40, height: 40, borderRadius: 13, background: 'var(--peach)',
            color: 'var(--brand-dark)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 800, fontSize: 14, flexShrink: 0 }}>
            {initials(parentName) || '—'}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            {fullName && <div style={{ fontSize: 13.5, fontWeight: 700 }}>{fullName}</div>}
            <div style={{ fontSize: 12, color: 'var(--muted)', wordBreak: 'break-all' }}>{email}</div>
          </div>
        </div>

        {children.map((c) => {
          /* Le rattachement demandé par le parent reste à valider par le club :
             c'est player_parents.status qui le dit, pas une supposition. */
          const pending = c.link_status === 'pending';
          return (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 10, borderTop: '1px solid var(--border)', padding: '11px 0 0', marginTop: 11 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{c.first_name}</div>
                <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                  {[c.teams?.clubs?.name, c.teams?.category].filter(Boolean).join(' · ')}
                </div>
              </div>
              <span style={{ flex: '0 0 auto', borderRadius: 20, padding: '4px 10px',
                fontSize: 11, fontWeight: 800,
                background: pending ? '#FFF1E3' : GREEN.bg,
                color: pending ? '#9A5B18' : GREEN.ink,
                border: `1px solid ${pending ? '#F1DCC2' : GREEN.line}` }}>
                {t(pending ? 'add.after.pending' : 'add.after.linked')}
              </span>
            </div>
          );
        })}

        {/* L'enfant en cours de saisie, tant qu'il n'est qu'une intention. Une
            fois la demande partie, il figure dans la liste ci-dessus. */}
        {childName && !sent && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 10, borderTop: '1px solid var(--border)', padding: '11px 0 0', marginTop: 11 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{childName}</div>
              {(() => {
                const g = groups.find((x) => x.id === teamId);
                const line = [clubName, g ? groupLabel(g) : ''].filter(Boolean).join(' · ');
                return line ? <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{line}</div> : null;
              })()}
            </div>
            <span style={{ flex: '0 0 auto', background: 'var(--peach)', color: 'var(--brand-dark)',
              border: '1px solid #EBD3C9', borderRadius: 20, padding: '4px 10px',
              fontSize: 11, fontWeight: 800 }}>
              {t('add.after.new')}
            </span>
          </div>
        )}

        <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.55, margin: '12px 0 0' }}>
          {clubs.length
            ? t(clubs.length > 1 ? 'add.after.noteMany' : 'add.after.noteOne', { n: clubs.length })
            : t('add.after.noteNone')}
        </p>
      </div>

      {/* ---- 8. Qui voit quoi ---- */}
      <div className="card">
        <div className="q" style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>
          {t('add.who.title')}
        </div>
        {[
          ['you', t('add.who.you'), t('add.who.youText'), '#6E9C6E'],
          ['club', t('add.who.club'),
            whoClub && whoChild ? t('add.who.clubText', { club: whoClub, child: whoChild })
              : t('add.who.clubTextPlain'), 'var(--brand)'],
          ['coach', t('add.who.coach'), t('add.who.coachText'), '#7E8AA0'],
        ].map(([key, head, text, dot], i) => (
          <div key={key} style={{ display: 'flex', gap: 10, alignItems: 'flex-start',
            borderTop: i ? '1px solid var(--border)' : 'none', padding: i ? '11px 0 0' : 0,
            marginTop: i ? 11 : 0 }}>
            <span aria-hidden="true" style={{ flex: '0 0 9px', width: 9, height: 9, borderRadius: 999,
              background: dot, marginTop: 5 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{head}</div>
              <div style={{ fontSize: 12, color: '#57534A', lineHeight: 1.55, marginTop: 3 }}>{text}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ---- 9. Vos clubs : la liste que le parent est seul à voir ---- */}
      <div className="card" style={{ marginBottom: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div className="q" style={{ fontWeight: 700, fontSize: 15 }}>{t('add.clubs.title')}</div>
          {clubs.length > 0 && (
            <span style={{ flex: '0 0 auto', background: 'var(--peach)', color: 'var(--brand-dark)',
              border: '1px solid #EBD3C9', borderRadius: 20, padding: '5px 11px',
              fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap' }}>
              {t(clubs.length > 1 ? 'add.clubs.badgeMany' : 'add.clubs.badgeOne', { n: clubs.length })}
            </span>
          )}
        </div>

        {clubs.length === 0 && (
          <p style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.6, margin: '12px 0 0' }}>
            {t('add.clubs.empty')}
          </p>
        )}

        {clubs.map((c, i) => (
          <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: 11,
            borderTop: i ? '1px solid var(--border)' : 'none', padding: i ? '11px 0 0' : 0,
            marginTop: i ? 11 : 14 }}>
            <div style={{ width: 38, height: 38, borderRadius: 12, background: '#F4F0E9',
              color: '#6B6558', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 800, fontSize: 13, flexShrink: 0 }}>
              {initials(c.name)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{c.name}</div>
              <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                {[c.child, c.category].filter(Boolean).join(' · ')}
              </div>
            </div>
            {c.sport && (
              <span style={{ flex: '0 0 auto', background: '#EDF4E8', color: '#3E5A3E',
                border: `1px solid ${GREEN.line}`, borderRadius: 20, padding: '4px 10px',
                fontSize: 11, fontWeight: 800 }}>
                {c.sport}
              </span>
            )}
          </div>
        ))}

        <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.55, margin: '12px 0 0' }}>
          {t('add.clubs.note')}
        </p>
      </div>

      <BottomNav role="parent" />
    </div>
  );
}
