'use client';

import { useRouter } from 'next/navigation';

export default function CGU() {
  const router = useRouter();
  return (
    <div className="wrap" style={{ maxWidth: 720 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <a href="#" onClick={(e) => { e.preventDefault(); router.push('/bienvenue'); }} style={{ fontWeight: 700 }}>←</a>
        <div className="q" style={{ fontWeight: 700, fontSize: 18 }}>Conditions d’utilisation</div>
      </div>
      <div className="card" style={{ lineHeight: 1.6, fontSize: 14, color: '#3D3A33' }}>
        <p style={{ marginTop: 0, color: 'var(--muted)', fontSize: 12 }}>Dernière mise à jour : septembre 2026</p>

        <h3 className="q">1. Objet</h3>
        <p>YouPlaySport est un service en ligne d’accompagnement sportif reliant les clubs et les familles. L’utilisation du Service implique l’acceptation des présentes conditions.</p>

        <h3 className="q">2. Compte</h3>
        <p>Chaque utilisateur crée un compte personnel avec une adresse e-mail valide. Vous êtes responsable de la confidentialité de votre mot de passe et des actions réalisées depuis votre compte.</p>

        <h3 className="q">3. Usage attendu</h3>
        <p>Le Service promeut une approche positive et bienveillante. Tout contenu injurieux, discriminatoire ou portant atteinte aux personnes, en particulier aux mineurs, est interdit et peut entraîner la suspension du compte ou du club.</p>

        <h3 className="q">4. Rôles</h3>
        <p>Les dirigeants administrent leur club, invitent coachs et familles et sont responsables de l’exactitude des informations des licenciés. Les coachs publient les séances ; les parents suivent la pratique de leurs enfants.</p>

        <h3 className="q">5. Abonnement et essai</h3>
        <p>Le club bénéficie d’une période d’essai gratuite, puis d’un forfait selon le nombre de licenciés. Les forfaits sont sans engagement et résiliables à tout moment.</p>

        <h3 className="q">6. Disponibilité</h3>
        <p>Nous nous efforçons d’assurer la disponibilité du Service, sans garantie d’absence totale d’interruption. Des évolutions et maintenances peuvent survenir.</p>

        <h3 className="q">7. Données personnelles</h3>
        <p>Le traitement des données est décrit dans la <a href="#" onClick={(e) => { e.preventDefault(); router.push('/confidentialite'); }}>politique de confidentialité</a>.</p>

        <h3 className="q">8. Contact</h3>
        <p>contact@youplaysport.app</p>
      </div>
    </div>
  );
}
