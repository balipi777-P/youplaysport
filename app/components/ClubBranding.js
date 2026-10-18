'use client';
/* Couleurs + logo du club : champs partagés par l'écran de bienvenue du
   fondateur et la section « Branding » de la console. */
import { useEffect, useState } from 'react';

/** URL locale d'un fichier choisi, révoquée dès qu'elle ne sert plus. */
function useObjectUrl(file) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!file) { setUrl(''); return undefined; }
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return url;
}
import { supabase } from '../../lib/supabaseClient';
import { useT } from '../../lib/i18n';
import Icon from './Icon';

export const DEFAULT_ACCENT = '#C05B44';
export const DEFAULT_SECONDARY = '#F5E7E1';
const PRESETS = ['#C05B44', '#2F6FED', '#1F9D6B', '#E8A317', '#7B4BC4', '#D6336C', '#1C1A17'];
const LOGO_MAX = 2 * 1024 * 1024;

export const isHex = (c) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);

/** Version plus sombre d'une couleur #rrggbb (pour --brand-dark). */
export function darken(hex, k = 0.78) {
  if (!isHex(hex)) return hex;
  const n = (i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * k).toString(16).padStart(2, '0');
  return `#${n(1)}${n(3)}${n(5)}`;
}

export function initialsOf(name) {
  return (name || '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
}

/**
 * Enregistre couleurs + logo. L'upload du logo est facultatif : s'il échoue
 * (bucket ou droits manquants), le reste est enregistré et logoFailed vaut true.
 */
export async function saveClubBranding({ clubId, accent, secondary, file, currentLogo }) {
  let logo = currentLogo || null;
  let logoFailed = false;
  if (file) {
    try {
      const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
      const path = `${clubId}/logo-${Date.now()}.${ext}`;
      const up = await supabase.storage.from('brand').upload(path, file, { upsert: true, contentType: file.type });
      if (up.error) throw up.error;
      logo = supabase.storage.from('brand').getPublicUrl(path).data.publicUrl;
    } catch (e) { console.error('logo upload', e); logoFailed = true; }
  }
  const { error } = await supabase.schema('yps').rpc('update_club_branding', {
    p_club: clubId, p_accent: accent, p_secondary: secondary, p_logo_url: logo,
  });
  if (error) throw error;
  return { logo_url: logo, logoFailed };
}

/** Message amical pour une erreur de la RPC. */
export function brandingError(e, t) {
  return `${(e && e.message) || ''}`.includes('not_authorized') ? t('brand.notAuthorized') : t('club.errGeneric');
}

function ColorPick({ label, value, onChange }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div className="label" style={{ marginBottom: 8 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {PRESETS.map((c) => (
          <button key={c} type="button" onClick={() => onChange(c)} aria-label={c}
            style={{ width: 34, height: 34, borderRadius: '50%', background: c, cursor: 'pointer', padding: 0,
              border: value.toLowerCase() === c.toLowerCase() ? '3px solid var(--ink)' : '2px solid #fff',
              boxShadow: '0 0 0 1px var(--border)' }} />
        ))}
        <label style={{ position: 'relative', width: 34, height: 34, borderRadius: '50%', overflow: 'hidden',
          boxShadow: '0 0 0 1px var(--border)', cursor: 'pointer', background: value, display: 'inline-block' }}>
          <input type="color" value={value} onChange={(e) => onChange(e.target.value)}
            style={{ position: 'absolute', inset: -8, width: 60, height: 60, opacity: 0, cursor: 'pointer' }} />
        </label>
      </div>
    </div>
  );
}

/** Aperçu : logo (ou initiales) sur la couleur principale, bouton et pastille. */
export function BrandPreview({ name, accent, secondary, logoUrl }) {
  const { t } = useT();
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 18, padding: 14, background: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <span className="q" style={{ width: 48, height: 48, flex: '0 0 48px', borderRadius: 16, color: '#fff',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 16,
          background: accent, backgroundImage: logoUrl ? `url(${logoUrl})` : 'none',
          backgroundSize: 'cover', backgroundPosition: 'center' }}>
          {logoUrl ? '' : initialsOf(name)}
        </span>
        <span className="q" style={{ fontWeight: 700, fontSize: 16 }}>{name}</span>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ background: accent, color: '#fff', borderRadius: 12, padding: '9px 14px', fontWeight: 700, fontSize: 13 }}>
          {t('brand.previewBtn')}
        </span>
        <span style={{ background: secondary, color: darken(accent), borderRadius: 20, padding: '6px 12px', fontWeight: 700, fontSize: 12 }}>
          {t('brand.previewChip')}
        </span>
      </div>
    </div>
  );
}

/** Sélecteur de logo : aperçu local, taille bornée, jamais bloquant. */
export function LogoPicker({ file, onFile, currentLogo }) {
  const { t } = useT();
  const [preview, setPreview] = useState('');
  const [warn, setWarn] = useState('');
  useEffect(() => {
    if (!file) { setPreview(''); return undefined; }
    const u = URL.createObjectURL(file);
    setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  function pick(e) {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    if (!f.type.startsWith('image/')) { setWarn(t('brand.logoNotImage')); return; }
    if (f.size > LOGO_MAX) { setWarn(t('brand.logoTooBig')); return; }
    setWarn(''); onFile(f);
  }
  const shown = preview || currentLogo;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ width: 62, height: 62, borderRadius: 20, border: '1px dashed var(--border)', background: '#fff',
          backgroundImage: shown ? `url(${shown})` : 'none', backgroundSize: 'cover', backgroundPosition: 'center',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>
          {!shown && <Icon name="plus" size={22} />}
        </span>
        <label className="btn ghost" style={{ width: 'auto', padding: '11px 16px', cursor: 'pointer', display: 'inline-block' }}>
          {shown ? t('brand.logoChange') : t('brand.logoPick')}
          <input type="file" accept="image/*" onChange={pick} style={{ display: 'none' }} />
        </label>
        {file && (
          <button type="button" onClick={() => onFile(null)}
            style={{ border: 'none', background: 'transparent', color: 'var(--muted)', fontFamily: 'inherit',
              fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>{t('brand.logoRemove')}</button>
        )}
      </div>
      {warn && <div style={{ fontSize: 12.5, color: 'var(--brand-dark)', marginTop: 8 }}>{warn}</div>}
    </div>
  );
}

/** Section « Branding » de la console : couleurs + logo modifiables. */
export function BrandingEditor({ club, onSaved, colorsOnly = false, bare = false }) {
  const { t } = useT();
  const [accent, setAccent] = useState(isHex(club.accent_color) ? club.accent_color : DEFAULT_ACCENT);
  const [secondary, setSecondary] = useState(isHex(club.secondary_color) ? club.secondary_color : DEFAULT_SECONDARY);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [bad, setBad] = useState('');
  const fileUrl = useObjectUrl(file);

  async function save() {
    setBusy(true); setMsg(''); setBad('');
    try {
      const r = await saveClubBranding({ clubId: club.id, accent, secondary, file, currentLogo: club.logo_url });
      onSaved({ accent_color: accent, secondary_color: secondary, logo_url: r.logo_url });
      setFile(null);
      if (r.logoFailed) setBad(t('brand.logoUnavailable'));
      else setMsg(t('brand.saved'));
    } catch (e) { setBad(brandingError(e, t)); } finally { setBusy(false); }
  }

  return (
    <div className={bare ? undefined : 'card'}>
      <ColorPick label={t('brand.primary')} value={accent} onChange={setAccent} />
      <ColorPick label={t('brand.secondary')} value={secondary} onChange={setSecondary} />
      {!colorsOnly && (
        <>
          <div className="label" style={{ marginBottom: 8 }}>{t('adm.brandingLogo')}</div>
          <div style={{ marginBottom: 16 }}><LogoPicker file={file} onFile={setFile} currentLogo={club.logo_url} /></div>
        </>
      )}
      <BrandPreview name={club.name} accent={accent} secondary={secondary}
        logoUrl={fileUrl || club.logo_url} />
      <button type="button" className="btn" style={{ marginTop: 14 }} disabled={busy} onClick={save}>
        {busy ? '…' : t('brand.save')}
      </button>
      {msg && <div style={{ fontSize: 13, color: 'var(--brand-dark)', fontWeight: 700, marginTop: 10 }}>{msg}</div>}
      {bad && <div className="error" style={{ marginTop: 10 }}>{bad}</div>}
    </div>
  );
}

/** Écran de bienvenue du fondateur : sports → couleurs → logo → « C'est parti ». */
export function ClubWelcome({ club, sports, onDone, onSkip }) {
  const { t, lang } = useT();
  const [step, setStep] = useState(0);
  const [picked, setPicked] = useState([]);
  const [accent, setAccent] = useState(isHex(club.accent_color) ? club.accent_color : DEFAULT_ACCENT);
  const [secondary, setSecondary] = useState(isHex(club.secondary_color) ? club.secondary_color : DEFAULT_SECONDARY);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const fileUrl = useObjectUrl(file);
  const sportName = (s) => (lang === 'en' ? s?.name_en || s?.name_fr : s?.name_fr) || '';
  const toggle = (id) => setPicked((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));

  async function finish() {
    setBusy(true); setErr('');
    try {
      const r = await saveClubBranding({ clubId: club.id, accent, secondary, file, currentLogo: club.logo_url });
      const rows = sports.filter((s) => picked.includes(s.id))
        .map((s) => ({ club_id: club.id, sport_id: s.id, name: sportName(s) }));
      const { error } = await supabase.from('teams').insert(rows);
      if (error) throw error;
      await onDone({ accent_color: accent, secondary_color: secondary, logo_url: r.logo_url });
    } catch (e) { setErr(brandingError(e, t)); setBusy(false); }
  }

  const titles = ['brand.stepSports', 'brand.stepColors', 'brand.stepLogo'];
  return (
    <div className="wrap" style={{ paddingTop: 28 }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
        {titles.map((k, i) => (
          <span key={k} style={{ flex: 1, height: 5, borderRadius: 3, background: i <= step ? 'var(--brand)' : 'var(--border)' }} />
        ))}
      </div>
      <div className="label" style={{ marginBottom: 6 }}>{t('brand.welcome', { name: club.name })}</div>
      <h1 className="q" style={{ fontSize: 24, margin: '0 0 6px', letterSpacing: '-0.5px' }}>{t(titles[step])}</h1>
      <p style={{ margin: '0 0 16px', fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.55 }}>{t(`${titles[step]}Hint`)}</p>

      {step === 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
          {sports.map((s) => {
            const on = picked.includes(s.id);
            return (
              <button key={s.id} type="button" onClick={() => toggle(s.id)} aria-pressed={on}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 12px', borderRadius: 16, cursor: 'pointer',
                  fontFamily: 'inherit', fontWeight: 700, fontSize: 14, textAlign: 'left',
                  border: on ? '2px solid var(--brand)' : '2px solid var(--border)',
                  background: on ? 'var(--peach)' : '#fff', color: 'var(--ink)' }}>
                <span style={{ fontSize: 22 }}>{s.icon}</span>
                <span style={{ flex: 1, minWidth: 0 }}>{sportName(s)}</span>
              </button>
            );
          })}
        </div>
      )}

      {step === 1 && (
        <div className="card">
          <ColorPick label={t('brand.primary')} value={accent} onChange={setAccent} />
          <ColorPick label={t('brand.secondary')} value={secondary} onChange={setSecondary} />
          <BrandPreview name={club.name} accent={accent} secondary={secondary} logoUrl="" />
        </div>
      )}

      {step === 2 && (
        <div className="card">
          <LogoPicker file={file} onFile={setFile} currentLogo="" />
          <div style={{ marginTop: 16 }}>
            <BrandPreview name={club.name} accent={accent} secondary={secondary}
              logoUrl={fileUrl} />
          </div>
        </div>
      )}

      {err && <div className="error" style={{ marginTop: 12 }}>{err}</div>}

      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
        {step > 0 && (
          <button type="button" className="btn ghost" style={{ width: 'auto', padding: '14px 18px' }} disabled={busy}
            onClick={() => setStep(step - 1)}>{t('brand.back')}</button>
        )}
        {step < 2 ? (
          <button type="button" className="btn" disabled={step === 0 && picked.length === 0}
            style={{ flex: 1, opacity: step === 0 && picked.length === 0 ? 0.5 : 1 }}
            onClick={() => setStep(step + 1)}>{t('brand.next')}</button>
        ) : (
          <button type="button" className="btn" style={{ flex: 1 }} disabled={busy} onClick={finish}>
            {busy ? '…' : file ? t('brand.go') : t('brand.goNoLogo')}
          </button>
        )}
      </div>
      <button type="button" onClick={onSkip} disabled={busy}
        style={{ display: 'block', margin: '18px auto 0', border: 'none', background: 'transparent', color: 'var(--muted)',
          fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>{t('brand.skipAll')}</button>
    </div>
  );
}
