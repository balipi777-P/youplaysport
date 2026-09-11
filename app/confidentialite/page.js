'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useT, LangToggle } from '../../lib/i18n';

const BLOCKS = ['b1', 'b2', 'b3', 'b4', 'b5'];

export default function Confidentialite() {
  const router = useRouter();
  const { t } = useT();
  const [notice, setNotice] = useState('');

  useEffect(() => { document.title = `${t('priv.tab')} · YouPlaySport`; }, [t]);

  /* Boutons encore visuels : le traitement réel viendra avec le câblage. */
  function comingSoon() { setNotice(t('priv.soon')); }

  return (
    <div className="pub">
      <style>{`
        .pub { max-width: 1100px; margin: 0 auto; padding: 20px 16px 48px; }
        .pub-cols { display: grid; grid-template-columns: 1fr; gap: 22px; align-items: start; }
        @media (min-width: 820px) { .pub-cols { grid-template-columns: 2fr 1fr; gap: 30px; } }
      `}</style>

      {/* En-tête public : marque + langue. */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <a href="#" onClick={(e) => { e.preventDefault(); router.push('/bienvenue'); }}
          className="brand" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className="logo">Y</div>
          <div className="q" style={{ fontWeight: 700, fontSize: 18 }}>
            You<span style={{ color: 'var(--brand)' }}>Play</span>Sport
          </div>
        </a>
        <LangToggle />
      </div>

      <div className="pub-cols">
        {/* Colonne large : les engagements, en clair. */}
        <div>
          <h1 className="q" style={{ fontSize: 28, letterSpacing: '-0.6px', margin: '0 0 22px' }}>
            {t('priv.title')}
          </h1>
          {BLOCKS.map((b) => (
            <div key={b} style={{ marginBottom: 22 }}>
              <div className="q" style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>{t(`priv.${b}.t`)}</div>
              <p style={{ fontSize: 14, color: '#5A554B', lineHeight: 1.6, margin: 0 }}>{t(`priv.${b}.d`)}</p>
            </div>
          ))}
        </div>

        {/* Colonne étroite : les deux actions sur ses propres données. */}
        <div>
          <h2 className="q" style={{ fontSize: 18, margin: '0 0 14px' }}>{t('priv.aside')}</h2>

          <div className="card">
            <div className="q" style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>{t('priv.export.t')}</div>
            <p style={{ fontSize: 13, color: '#5A554B', lineHeight: 1.55, margin: '0 0 14px' }}>{t('priv.export.d')}</p>
            <button type="button" className="btn" onClick={comingSoon}>{t('priv.export.cta')}</button>
          </div>

          <div className="card">
            <div className="q" style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>{t('priv.delete.t')}</div>
            <p style={{ fontSize: 13, color: '#5A554B', lineHeight: 1.55, margin: '0 0 14px' }}>{t('priv.delete.d')}</p>
            <button type="button" className="btn" onClick={comingSoon}
              style={{ background: 'transparent', color: '#C0392B', border: '1.5px solid #C0392B' }}>
              {t('priv.delete.cta')}
            </button>
          </div>

          {notice && <div className="pill">{notice}</div>}
        </div>
      </div>

      {/* Mention légale complète, conservée telle quelle : c'est elle que visent
          le pied de page du site et les fiches de magasin d'applications. */}
      <div style={{ borderTop: '1px solid var(--border)', marginTop: 34, paddingTop: 26 }}>
        <h2 className="q" style={{ fontSize: 20, margin: '0 0 12px' }}>{t('priv.policyTitle')}</h2>
        <div className="card" style={{ lineHeight: 1.6, fontSize: 14, color: '#3D3A33' }}>
          <p style={{ marginTop: 0, color: 'var(--muted)', fontSize: 12 }}>Dernière mise à jour : septembre 2026</p>

          <h3 className="q">1. Responsable du traitement</h3>
          <p>YouPlaySport (le « Service ») permet aux clubs sportifs de partager avec les familles le suivi de la pratique de leurs enfants. Le club auprès duquel vous êtes inscrit est responsable des données de ses licenciés ; YouPlaySport agit comme sous-traitant technique.</p>

          <h3 className="q">2. Données collectées</h3>
          <p>Compte : adresse e-mail, mot de passe (chiffré), langue préférée. Licenciés : prénom, nom, équipe, présences, compétences validées, convocations et réponses. Aucune donnée sensible (santé, origine, etc.) n’est demandée.</p>

          <h3 className="q">3. Finalités</h3>
          <p>Les données servent uniquement à faire fonctionner le suivi sportif : afficher la journée sportive, le carnet de compétences, le calendrier et les convocations, et gérer l’accès au club. Aucune donnée n’est vendue ni utilisée à des fins publicitaires.</p>

          <h3 className="q">4. Base légale et consentement</h3>
          <p>Pour un enfant mineur, le profil n’est créé qu’avec le consentement du parent ou du représentant légal, recueilli lors du rattachement. Ce consentement peut être retiré à tout moment.</p>

          <h3 className="q">5. Hébergement</h3>
          <p>Les données sont hébergées dans l’Union européenne (région Paris, France) et traitées conformément au Règlement général sur la protection des données (RGPD).</p>

          <h3 className="q">6. Durée de conservation</h3>
          <p>Les données sont conservées tant que le compte ou le rattachement au club est actif. À la suppression du compte ou du licencié, elles sont effacées sous 30 jours (hors obligations légales).</p>

          <h3 className="q">7. Vos droits</h3>
          <p>Vous disposez d’un droit d’accès, de rectification, d’effacement, de limitation et de portabilité de vos données. Vous pouvez les exercer auprès de votre club ou en écrivant à l’adresse de contact ci-dessous.</p>

          <h3 className="q">8. Cookies et stockage local</h3>
          <p>Le Service n’utilise pas de cookies publicitaires. Un stockage local (navigateur) mémorise seulement votre langue et l’enfant sélectionné, pour votre confort.</p>

          <h3 className="q">9. Contact</h3>
          <p>Pour toute question relative à vos données : contact@youplaysport.app.</p>

          <p style={{ marginBottom: 0 }}>
            <a href="#" onClick={(e) => { e.preventDefault(); router.push('/suppression-compte'); }}>Supprimer mon compte →</a>
          </p>
        </div>
      </div>
    </div>
  );
}
