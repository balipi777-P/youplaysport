'use client';

import { useRouter } from 'next/navigation';
import { useT, LangToggle } from '../../lib/i18n';

const COPY = {
  fr: {
    tagline: 'La journée sportive de votre enfant, au même endroit.',
    heroTitle: 'Le lien positif entre le club et les familles',
    heroSub: 'YouPlaySport rassemble séances, présences, compétences et convocations dans une seule app claire, bienveillante et multisport. Que du positif.',
    ctaCreate: 'Créer mon club',
    ctaJoin: 'Rejoindre un club',
    login: 'Se connecter',
    featuresTitle: 'Tout ce qui compte, au même endroit',
    features: [
      { icon: '📓', t: 'Journal de la journée', d: 'Après chaque séance, la famille voit le thème, les axes travaillés et un mot du coach.' },
      { icon: '🌟', t: 'Carnet de compétences', d: 'Les progrès de l’enfant, validés par le coach, rangés par axe — que du positif.' },
      { icon: '✅', t: 'Présences', d: 'Le coach pointe présents, retards et absents en un geste ; les familles suivent.' },
      { icon: '📣', t: 'Convocations', d: 'Matchs, tournois, sorties : les familles répondent présent ou absent en un clic.' },
      { icon: '📆', t: 'Calendrier', d: 'Un mois d’un coup d’œil : présences et événements réunis pour chaque enfant.' },
      { icon: '🏆', t: 'Multisport', d: 'Football, basket, judo, danse… 6 axes universels adaptés à tous les sports.' },
    ],
    forWhoTitle: 'Pensé pour chacun',
    forWho: [
      { r: 'Dirigeants', d: 'Créez le club, ses équipes et invitez coachs et familles avec un simple code.' },
      { r: 'Coachs', d: 'Publiez une séance en 2 minutes, valorisez chaque enfant.' },
      { r: 'Parents', d: 'Suivez la pratique de vos enfants, même avec plusieurs enfants dans le club.' },
    ],
    pricingTitle: 'Des forfaits simples',
    pricingSub: '14 jours d’essai gratuit. Sans engagement. Données hébergées en Europe (RGPD).',
    perMonth: '/ mois',
    upTo: 'jusqu’à {n} licenciés',
    choose: 'Commencer l’essai',
    rgpd: 'Vos données et celles de vos enfants sont hébergées en Europe et protégées conformément au RGPD.',
    footerPrivacy: 'Confidentialité',
    footerTerms: 'Conditions d’utilisation',
    footerDelete: 'Supprimer mon compte',
  },
  en: {
    tagline: 'Your child’s sports day, all in one place.',
    heroTitle: 'The positive link between the club and families',
    heroSub: 'YouPlaySport brings sessions, attendance, skills and call-ups together in one clear, caring, multi-sport app. Only positive.',
    ctaCreate: 'Create my club',
    ctaJoin: 'Join a club',
    login: 'Sign in',
    featuresTitle: 'Everything that matters, in one place',
    features: [
      { icon: '📓', t: 'Daily journal', d: 'After each session, families see the theme, the areas worked on and a word from the coach.' },
      { icon: '🌟', t: 'Skills logbook', d: 'The child’s progress, validated by the coach, sorted by area — only positive.' },
      { icon: '✅', t: 'Attendance', d: 'The coach marks present, late and absent in one tap; families follow along.' },
      { icon: '📣', t: 'Call-ups', d: 'Matches, tournaments, outings: families reply present or absent in one click.' },
      { icon: '📆', t: 'Calendar', d: 'A month at a glance: attendance and events together for each child.' },
      { icon: '🏆', t: 'Multi-sport', d: 'Football, basketball, judo, dance… 6 universal areas fit every sport.' },
    ],
    forWhoTitle: 'Made for everyone',
    forWho: [
      { r: 'Directors', d: 'Create the club, its teams, and invite coaches and families with a simple code.' },
      { r: 'Coaches', d: 'Publish a session in 2 minutes, celebrate every child.' },
      { r: 'Parents', d: 'Follow your children’s activity, even with several children in the club.' },
    ],
    pricingTitle: 'Simple plans',
    pricingSub: '14-day free trial. No commitment. Data hosted in Europe (GDPR).',
    perMonth: '/ month',
    upTo: 'up to {n} members',
    choose: 'Start the trial',
    rgpd: 'Your data and your children’s data are hosted in Europe and protected in accordance with GDPR.',
    footerPrivacy: 'Privacy',
    footerTerms: 'Terms of use',
    footerDelete: 'Delete my account',
  },
};

const PLANS = [
  { key: 'petit', name: 'Petit club', price: 29, max: 60 },
  { key: 'club', name: 'Club', price: 49, max: 150, featured: true },
  { key: 'club_plus', name: 'Club +', price: 89, max: 400 },
  { key: 'grand', name: 'Grand Club', price: 149, max: 2000 },
];

export default function Bienvenue() {
  const router = useRouter();
  const { lang } = useT();
  const c = COPY[lang] || COPY.fr;

  return (
    <div>
      <div className="wrap" style={{ maxWidth: 900 }}>
        {/* En-tête */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 30 }}>
          <div className="brand">
            <div className="logo">Y</div>
            <div className="q" style={{ fontWeight: 700, fontSize: 18 }}>
              You<span style={{ color: 'var(--brand)' }}>Play</span>Sport
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <LangToggle />
            <a href="#" onClick={(e) => { e.preventDefault(); router.push('/login'); }} style={{ fontSize: 13, fontWeight: 700 }}>{c.login}</a>
          </div>
        </div>

        {/* Hero */}
        <div style={{ textAlign: 'center', padding: '10px 0 30px' }}>
          <div className="pill" style={{ marginBottom: 14 }}>⚽ 🏀 🥋 💃 · Multisport</div>
          <h1 className="q" style={{ fontSize: 34, lineHeight: 1.15, letterSpacing: '-0.6px', margin: '0 0 14px' }}>{c.heroTitle}</h1>
          <p style={{ fontSize: 16, color: '#5A554B', lineHeight: 1.55, maxWidth: 620, margin: '0 auto 22px' }}>{c.heroSub}</p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="btn" style={{ width: 'auto', padding: '14px 22px' }} onClick={() => router.push('/login')}>{c.ctaCreate}</button>
            <button className="btn ghost" style={{ width: 'auto', padding: '14px 22px' }} onClick={() => router.push('/login')}>{c.ctaJoin}</button>
          </div>
        </div>

        {/* Fonctionnalités */}
        <h2 className="q" style={{ fontSize: 22, textAlign: 'center', margin: '20px 0 18px' }}>{c.featuresTitle}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginBottom: 34 }}>
          {c.features.map((f, i) => (
            <div key={i} className="card" style={{ marginBottom: 0 }}>
              <div style={{ fontSize: 26, marginBottom: 6 }}>{f.icon}</div>
              <div className="q" style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>{f.t}</div>
              <div style={{ fontSize: 13, color: '#5A554B', lineHeight: 1.5 }}>{f.d}</div>
            </div>
          ))}
        </div>

        {/* Pour qui */}
        <h2 className="q" style={{ fontSize: 22, textAlign: 'center', margin: '10px 0 18px' }}>{c.forWhoTitle}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginBottom: 34 }}>
          {c.forWho.map((f, i) => (
            <div key={i} className="card" style={{ marginBottom: 0, background: 'var(--peach)', border: 'none' }}>
              <div className="q" style={{ fontWeight: 800, fontSize: 16, color: '#5F2A1C', marginBottom: 4 }}>{f.r}</div>
              <div style={{ fontSize: 13, color: '#7A4030', lineHeight: 1.5 }}>{f.d}</div>
            </div>
          ))}
        </div>

        {/* Tarifs */}
        <h2 className="q" style={{ fontSize: 22, textAlign: 'center', margin: '10px 0 6px' }}>{c.pricingTitle}</h2>
        <p style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center', margin: '0 0 18px' }}>{c.pricingSub}</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 30 }}>
          {PLANS.map((p) => (
            <div key={p.key} className="card" style={{
              marginBottom: 0, textAlign: 'center',
              border: p.featured ? '2px solid var(--brand)' : '1px solid var(--border)',
            }}>
              <div className="q" style={{ fontWeight: 800, fontSize: 17 }}>{p.name}</div>
              <div style={{ margin: '8px 0 2px' }}>
                <span className="q" style={{ fontSize: 30, fontWeight: 800, color: 'var(--brand-dark)' }}>{p.price} €</span>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}> {c.perMonth}</span>
              </div>
              <div style={{ fontSize: 12, color: '#5A554B', marginBottom: 12 }}>{c.upTo.replace('{n}', p.max)}</div>
              <button className={p.featured ? 'btn' : 'btn ghost'} style={{ marginBottom: 0 }} onClick={() => router.push('/login')}>{c.choose}</button>
            </div>
          ))}
        </div>

        {/* RGPD */}
        <div className="card" style={{ background: '#F4F6F2', border: '1px solid #E3EADD', textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: '#3E5A3E', lineHeight: 1.5 }}>🇪🇺 {c.rgpd}</div>
        </div>

        {/* Footer */}
        <div style={{ borderTop: '1px solid var(--border)', marginTop: 20, paddingTop: 18, display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center', fontSize: 13 }}>
          <a href="#" onClick={(e) => { e.preventDefault(); router.push('/confidentialite'); }}>{c.footerPrivacy}</a>
          <a href="#" onClick={(e) => { e.preventDefault(); router.push('/cgu'); }}>{c.footerTerms}</a>
          <a href="#" onClick={(e) => { e.preventDefault(); router.push('/suppression-compte'); }}>{c.footerDelete}</a>
        </div>
        <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 12, margin: '14px 0 0' }}>
          © {new Date().getFullYear()} YouPlaySport · {c.tagline}
        </div>
      </div>
    </div>
  );
}
