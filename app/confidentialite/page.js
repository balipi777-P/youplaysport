'use client';

import { useRouter } from 'next/navigation';

export default function Confidentialite() {
  const router = useRouter();
  return (
    <div className="wrap" style={{ maxWidth: 720 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <a href="#" onClick={(e) => { e.preventDefault(); router.push('/bienvenue'); }} style={{ fontWeight: 700 }}>←</a>
        <div className="q" style={{ fontWeight: 700, fontSize: 18 }}>Politique de confidentialité</div>
      </div>
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
  );
}
