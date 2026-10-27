'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useT } from '../../lib/i18n';
import { loadContactClubs } from '../../lib/clubContact';
import { refreshClubUnread } from '../../lib/clubUnread';
import { requestError, requestStatus, MAX_SUBJECT, MAX_BODY } from '../../lib/clubRequests';

/**
 * Messages avec le club (page /messages) : « Mes demandes », « Nouveau message », conversation.
 * Réservé aux parents et aux coachs : un athlète (compte autonome, mineur) et un dirigeant
 * (destinataire des demandes) n'ont aucun club à qui écrire et voient seulement un message d'état.
 * Ouvrir une demande la marque comme lue ; `?r=<id>` dans l'adresse ouvre directement une conversation.
 */
const TAP = { minHeight: 44 };

export default function ContactClub() {
  const { t, lang } = useT();
  const [clubs, setClubs] = useState(null);       // null = en chargement, [] = rien à écrire
  const [clubId, setClubId] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [mine, setMine] = useState(null);         // null = pas encore lu
  const [loadFailed, setLoadFailed] = useState(false);
  const [view, setView] = useState('');           // '' = liste, 'new' = formulaire, sinon id de la demande ouverte
  const [reply, setReply] = useState('');

  const loadMine = useCallback(async () => {
    const { data, error } = await supabase.schema('yps').rpc('my_club_requests');
    if (error) { console.error('my_club_requests', error.code); setLoadFailed(true); setMine([]); return []; }
    setLoadFailed(false);
    const list = Array.isArray(data) ? data.filter((r) => r && r.id) : [];
    setMine(list);
    return list;
  }, []);

  const markRead = useCallback(async (id) => {
    const { error } = await supabase.schema('yps').rpc('mark_club_request_read', { p_request: id });
    if (error) { console.error('mark_club_request_read', error.code); return; }
    setMine((list) => (list || []).map((r) => (r.id === id ? { ...r, unread: false } : r)));
    refreshClubUnread();
  }, []);

  const open = useCallback((id) => {
    setView(id); setReply(''); setErr(''); setMsg('');
    markRead(id);
  }, [markRead]);

  useEffect(() => {
    (async () => {
      let list = [];
      try { list = await loadContactClubs(); } catch { list = []; }
      setClubs(list);
      if (!list.length) return;
      setClubId(list[0].id);
      const reqs = await loadMine();
      let wanted = '';
      try { wanted = new URLSearchParams(window.location.search).get('r') || ''; } catch { wanted = ''; }
      if (wanted && reqs.some((r) => r.id === wanted)) open(wanted);
    })();
  }, [loadMine, open]);

  if (clubs === null) return <p style={{ color: 'var(--muted)' }}>{t('common.loading')}</p>;
  if (clubs.length === 0) return <div className="card"><p style={{ margin: 0, color: 'var(--muted)', lineHeight: 1.6 }}>{t('ctc.noClub')}</p></div>;

  const dayText = (iso) => new Date(iso).toLocaleDateString(lang === 'en' ? 'en-GB' : 'fr-FR', { day: 'numeric', month: 'short' });
  const area = { marginTop: 0, resize: 'vertical', lineHeight: 1.5, minWidth: 0, maxWidth: '100%' };
  const back = (
    <button type="button" onClick={() => { setView(''); setErr(''); setMsg(''); }}
      style={{ ...TAP, border: 'none', background: 'transparent', font: 'inherit', fontWeight: 700, color: 'var(--brand-dark)',
        cursor: 'pointer', padding: '0 4px', marginBottom: 8 }}>
      ← {t('ctc.mine')}
    </button>
  );

  async function send() {
    setErr(''); setMsg('');
    if (!subject.trim() || !body.trim()) { setErr(t('ctc.errEmpty')); return; }
    setBusy('send');
    const { data, error } = await supabase.schema('yps').rpc('create_club_request',
      { p_club: clubId, p_subject: subject.trim(), p_body: body.trim() });
    setBusy('');
    if (error) { console.error('create_club_request', error.message); setErr(t(requestError(error))); return; }
    setSubject(''); setBody('');
    await loadMine();
    if (typeof data === 'string') { setView(data); setMsg(t('ctc.sent')); } else { setView(''); setMsg(t('ctc.sent')); }
  }

  async function sendReply(id) {
    const text = reply.trim();
    if (!text) return;
    setErr(''); setMsg(''); setBusy(`r-${id}`);
    const { error } = await supabase.schema('yps').rpc('reply_club_request', { p_request: id, p_body: text });
    setBusy('');
    if (error) { console.error('reply_club_request', error.message); setErr(t(requestError(error))); return; }
    setReply('');
    await loadMine();
    markRead(id);
  }

  async function close(id) {
    setErr(''); setMsg(''); setBusy(`c-${id}`);
    const { error } = await supabase.schema('yps').rpc('close_club_request', { p_request: id });
    setBusy('');
    if (error) { console.error('close_club_request', error.message); setErr(t(requestError(error))); return; }
    await loadMine();
  }

  /* ---- Nouveau message ---- */
  if (view === 'new') return (
    <>
      {back}
      <div className="card" style={{ minWidth: 0 }}>
        <div className="q" style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>{t('ctc.new')}</div>
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
        <button type="button" className="btn" style={TAP} disabled={busy !== ''} onClick={send}>
          {busy === 'send' ? '…' : t('ctc.send')}
        </button>
        {err && <div className="error" role="alert" style={{ marginTop: 12 }}>{err}</div>}
      </div>
    </>
  );

  /* ---- Conversation ---- */
  const current = view ? (mine || []).find((r) => r.id === view) : null;
  if (current) {
    const st = requestStatus(current.status);
    return (
      <>
        {back}
        <div className="card" style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="q" style={{ fontWeight: 700, fontSize: 15, overflowWrap: 'anywhere' }}>{current.subject}</div>
              <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                {[current.club_name, dayText(current.created_at)].filter(Boolean).join(' · ')}
              </div>
            </div>
            <span style={{ flex: '0 0 auto', fontSize: 11.5, fontWeight: 700, padding: '5px 10px', borderRadius: 999,
              background: st.bg, color: st.ink }}>{t(st.key)}</span>
          </div>
          <div style={{ marginTop: 10 }}>
            {(current.messages || []).map((m) => (
              <div key={m.id} style={{ margin: '8px 0', padding: '9px 12px', borderRadius: 14, fontSize: 13.5, lineHeight: 1.5,
                background: m.side === 'club' ? 'var(--peach)' : '#F6F3EC', overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--muted)', marginBottom: 2 }}>
                  {m.side === 'club' ? t('ctc.fromClub') : t('ctc.you')} · {dayText(m.created_at)}
                </div>
                {m.body}
              </div>
            ))}
            {current.status !== 'closed' ? (
              <>
                <textarea className="input" rows={3} value={reply} maxLength={MAX_BODY}
                  placeholder={t('ctc.replyPh')} style={{ ...area, marginTop: 8 }}
                  onChange={(e) => setReply(e.target.value)} />
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" className="btn" style={{ ...TAP, width: 'auto', padding: '9px 16px', fontSize: 13 }}
                    disabled={busy !== ''} onClick={() => sendReply(current.id)}>
                    {busy === `r-${current.id}` ? '…' : t('ctc.reply')}
                  </button>
                  <button type="button" className="btn ghost" style={{ ...TAP, width: 'auto', padding: '9px 16px', fontSize: 13 }}
                    disabled={busy !== ''} onClick={() => close(current.id)}>
                    {busy === `c-${current.id}` ? '…' : t('ctc.close')}
                  </button>
                </div>
              </>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 8 }}>{t('msg.closedNote')}</div>
            )}
            {msg && <div className="pill" style={{ marginTop: 12 }}>{msg}</div>}
            {err && <div className="error" role="alert" style={{ marginTop: 12 }}>{err}</div>}
          </div>
        </div>
      </>
    );
  }

  /* ---- Liste « Mes demandes » ---- */
  return (
    <>
      <button type="button" className="btn" style={{ ...TAP, marginBottom: 16 }} onClick={() => { setView('new'); setErr(''); setMsg(''); }}>
        {t('ctc.new')}
      </button>
      {msg && <div className="pill" style={{ marginBottom: 12 }}>{msg}</div>}
      {loadFailed && <div className="error" role="alert">{t('ctc.loadErr')}</div>}
      <div className="q" style={{ fontWeight: 700, fontSize: 15, margin: '4px 0 10px' }}>{t('ctc.mine')}</div>
      {mine === null && <p style={{ color: 'var(--muted)' }}>{t('common.loading')}</p>}
      {mine && mine.length === 0 && !loadFailed && (
        <div className="card"><p style={{ margin: 0, color: 'var(--muted)', lineHeight: 1.6 }}>{t('ctc.none')}</p></div>
      )}
      {(mine || []).map((r) => {
        const st = requestStatus(r.status);
        return (
          <button key={r.id} type="button" onClick={() => open(r.id)} className="card"
            style={{ ...TAP, width: '100%', display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
              font: 'inherit', color: 'inherit', cursor: 'pointer', minWidth: 0 }}>
            {r.unread && <span role="img" aria-label={t('ctc.unread')} style={{ flex: '0 0 10px', width: 10, height: 10, borderRadius: 999, background: 'var(--brand)' }} />}
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 14, fontWeight: r.unread ? 800 : 700, overflowWrap: 'anywhere' }}>{r.subject}</span>
              <span style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)' }}>
                {[r.club_name, dayText(r.updated_at || r.created_at)].filter(Boolean).join(' · ')}
              </span>
            </span>
            <span style={{ flex: '0 0 auto', fontSize: 11.5, fontWeight: 700, padding: '5px 10px', borderRadius: 999,
              background: st.bg, color: st.ink }}>{t(st.key)}</span>
          </button>
        );
      })}
    </>
  );
}
