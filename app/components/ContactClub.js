'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useT } from '../../lib/i18n';
import { fetchMySpaces } from '../../lib/spaces';
import { requestError, requestStatus, MAX_SUBJECT, MAX_BODY } from '../../lib/clubRequests';

/**
 * Bloc « Contacter mon club » + « Mes demandes » de la page Mon profil.
 * Réservé aux parents et aux coachs : un athlète (compte autonome, mineur) et un
 * dirigeant (destinataire des demandes) ne voient rien. Le lien « Contacter la plateforme »
 * ouvre le même formulaire de ticket que la console, via create_platform_ticket.
 */
export default function ContactClub() {
  const { t, lang } = useT();
  const [clubs, setClubs] = useState(null);       // null = en chargement, [] = bloc masqué
  const [clubId, setClubId] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [mine, setMine] = useState(null);         // null = pas encore lu
  const [openId, setOpenId] = useState('');
  const [replies, setReplies] = useState({});
  const [platform, setPlatform] = useState(false);
  const [pSubject, setPSubject] = useState('');
  const [pBody, setPBody] = useState('');

  const loadMine = useCallback(async () => {
    const { data, error } = await supabase.schema('yps').rpc('my_club_requests');
    if (error) { console.error('my_club_requests', error.code); setMine([]); return; }
    setMine(Array.isArray(data) ? data : []);
  }, []);

  useEffect(() => {
    (async () => {
      const d = await fetchMySpaces();
      const byId = new Map();
      const add = (id, name) => { if (id && !byId.has(id)) byId.set(id, name || ''); };
      (d?.parent_clubs || []).forEach((c) => add(c.club_id, c.name));
      (d?.children || []).forEach((c) => add(c.club_id, c.club_name));
      (d?.coach_teams || []).forEach((c) => add(c.club_id, c.club_name));
      /* Le club que l'on dirige n'a pas de « contact » : on est son destinataire. */
      (d?.admin_clubs || []).forEach((c) => byId.delete(c.club_id));
      const list = [...byId].map(([id, name]) => ({ id, name }));
      setClubs(list);
      if (list.length) { setClubId(list[0].id); loadMine(); }
    })();
  }, [loadMine]);

  if (!clubs || clubs.length === 0) return null;

  const dayText = (iso) => new Date(iso).toLocaleDateString(lang === 'en' ? 'en-GB' : 'fr-FR', { day: 'numeric', month: 'short' });
  const area = { marginTop: 0, resize: 'vertical', lineHeight: 1.5, minWidth: 0, maxWidth: '100%' };

  async function send() {
    setErr(''); setMsg('');
    if (!subject.trim() || !body.trim()) { setErr(t('ctc.errEmpty')); return; }
    setBusy('send');
    const { error } = await supabase.schema('yps').rpc('create_club_request',
      { p_club: clubId, p_subject: subject.trim(), p_body: body.trim() });
    setBusy('');
    if (error) { console.error('create_club_request', error.message); setErr(t(requestError(error))); return; }
    setSubject(''); setBody(''); setMsg(t('ctc.sent'));
    loadMine();
  }

  async function reply(id) {
    const text = (replies[id] || '').trim();
    if (!text) return;
    setErr(''); setMsg(''); setBusy(`r-${id}`);
    const { error } = await supabase.schema('yps').rpc('reply_club_request', { p_request: id, p_body: text });
    setBusy('');
    if (error) { console.error('reply_club_request', error.message); setErr(t(requestError(error))); return; }
    setReplies((m) => ({ ...m, [id]: '' }));
    loadMine();
  }

  async function close(id) {
    setErr(''); setMsg(''); setBusy(`c-${id}`);
    const { error } = await supabase.schema('yps').rpc('close_club_request', { p_request: id });
    setBusy('');
    if (error) { console.error('close_club_request', error.message); setErr(t(requestError(error))); return; }
    loadMine();
  }

  async function sendPlatform() {
    setErr(''); setMsg('');
    if (!pSubject.trim() || !pBody.trim()) { setErr(t('adm.sup.errEmpty')); return; }
    setBusy('platform');
    const { error } = await supabase.schema('yps').rpc('create_platform_ticket',
      { p_club: clubId, p_subject: pSubject.trim(), p_body: pBody.trim() });
    setBusy('');
    if (error) { console.error('create_platform_ticket', error.message); setErr(t(requestError(error))); return; }
    setPSubject(''); setPBody(''); setPlatform(false); setMsg(t('adm.sup.sent'));
  }

  return (
    <>
      <div className="card" style={{ minWidth: 0 }}>
        <div className="q" style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>{t('ctc.title')}</div>
        <p style={{ fontSize: 13, color: '#5A554B', lineHeight: 1.55, margin: '0 0 12px' }}>{t('ctc.intro')}</p>

        {clubs.length > 1 && (
          <select className="input" value={clubId} onChange={(e) => setClubId(e.target.value)} aria-label={t('ctc.club')}>
            {clubs.map((c) => <option key={c.id} value={c.id}>{c.name || t('ctc.club')}</option>)}
          </select>
        )}
        {clubs.length === 1 && clubs[0].name && (
          <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 8 }}>{t('ctc.to', { club: clubs[0].name })}</div>
        )}
        <input className="input" value={subject} maxLength={MAX_SUBJECT} placeholder={t('ctc.subjectPh')}
          onChange={(e) => setSubject(e.target.value)} />
        <textarea className="input" rows={5} value={body} maxLength={MAX_BODY} placeholder={t('ctc.bodyPh')}
          onChange={(e) => setBody(e.target.value)} style={area} />
        <div style={{ fontSize: 11.5, color: 'var(--muted)', margin: '4px 0 10px', lineHeight: 1.45 }}>
          {t('ctc.rules', { n: body.length, max: MAX_BODY })}
        </div>
        <button type="button" className="btn" disabled={busy !== ''} onClick={send}>
          {busy === 'send' ? '…' : t('ctc.send')}
        </button>
        {msg && <div className="pill" style={{ marginTop: 12 }}>{msg}</div>}
        {err && <div className="error" role="alert" style={{ marginTop: 12 }}>{err}</div>}

        <div style={{ marginTop: 14, fontSize: 12.5 }}>
          <a href="#" style={{ color: 'var(--muted)' }}
            onClick={(e) => { e.preventDefault(); setPlatform((v) => !v); setErr(''); setMsg(''); }}>
            {t('ctc.platformLink')}
          </a>
        </div>
        {platform && (
          <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <div className="label" style={{ marginBottom: 8 }}>{t('adm.sup.contact')}</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.55, marginBottom: 10 }}>{t('ctc.platformIntro')}</div>
            <input className="input" value={pSubject} maxLength={MAX_SUBJECT} placeholder={t('adm.sup.subjectPh')}
              onChange={(e) => setPSubject(e.target.value)} />
            <textarea className="input" rows={5} value={pBody} maxLength={4000} placeholder={t('ctc.platformBodyPh')}
              onChange={(e) => setPBody(e.target.value)} style={area} />
            <button type="button" className="btn" disabled={busy !== ''} onClick={sendPlatform}>
              {busy === 'platform' ? '…' : t('adm.sup.send')}
            </button>
          </div>
        )}
      </div>

      {mine && mine.length > 0 && (
        <div className="card" style={{ minWidth: 0 }}>
          <div className="q" style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>{t('ctc.mine')}</div>
          {mine.map((r, i) => {
            const st = requestStatus(r.status);
            const open = openId === r.id;
            return (
              <div key={r.id} style={{ borderTop: i ? '1px solid var(--border)' : 'none', padding: '10px 0', minWidth: 0 }}>
                <button type="button" aria-expanded={open} onClick={() => setOpenId(open ? '' : r.id)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, border: 'none', background: 'transparent',
                    padding: 0, font: 'inherit', color: 'inherit', textAlign: 'left', cursor: 'pointer' }}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700, overflowWrap: 'anywhere' }}>{r.subject}</span>
                    <span style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)' }}>
                      {[r.club_name, dayText(r.created_at)].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <span style={{ flex: '0 0 auto', fontSize: 11.5, fontWeight: 700, padding: '5px 10px', borderRadius: 999,
                    background: st.bg, color: st.ink }}>{t(st.key)}</span>
                </button>
                {open && (
                  <div style={{ marginTop: 10 }}>
                    {(r.messages || []).map((m) => (
                      <div key={m.id} style={{ margin: '6px 0', padding: '9px 12px', borderRadius: 14, fontSize: 13.5, lineHeight: 1.5,
                        background: m.side === 'club' ? 'var(--peach)' : '#F6F3EC', overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>
                        <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--muted)', marginBottom: 2 }}>
                          {m.side === 'club' ? t('ctc.fromClub') : t('ctc.you')} · {dayText(m.created_at)}
                        </div>
                        {m.body}
                      </div>
                    ))}
                    {r.status !== 'closed' && (
                      <>
                        <textarea className="input" rows={3} value={replies[r.id] || ''} maxLength={MAX_BODY}
                          placeholder={t('ctc.replyPh')} style={{ ...area, marginTop: 8 }}
                          onChange={(e) => setReplies((m) => ({ ...m, [r.id]: e.target.value }))} />
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <button type="button" className="btn" style={{ width: 'auto', padding: '9px 14px', fontSize: 13 }}
                            disabled={busy !== ''} onClick={() => reply(r.id)}>
                            {busy === `r-${r.id}` ? '…' : t('ctc.reply')}
                          </button>
                          <button type="button" className="btn ghost" style={{ width: 'auto', padding: '9px 14px', fontSize: 13 }}
                            disabled={busy !== ''} onClick={() => close(r.id)}>
                            {busy === `c-${r.id}` ? '…' : t('ctc.close')}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
