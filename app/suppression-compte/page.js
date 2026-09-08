'use client';

import { useRouter } from 'next/navigation';

export default function SuppressionCompte() {
  const router = useRouter();
  const subject = encodeURIComponent('Demande de suppression de compte YouPlaySport');
  const body = encodeURIComponent('Bonjour,\n\nJe souhaite supprimer mon compte YouPlaySport ainsi que les données associées.\n\nAdresse e-mail du compte : \n\nMerci.');
  return (
    <div className="wrap" style={{ maxWidth: 720 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <a href="#" onClick={(e) => { e.preventDefault(); router.push('/bienvenue'); }} style={{ fontWeight: 700 }}>←</a>
        <div className="q" style={{ fontWeight: 700, fontSize: 18 }}>Supprimer mon compte</div>
      </div>
      <div className="card" style={{ lineHeight: 1.6, fontSize: 14, color: '#3D3A33' }}>
        <p style={{ marginTop: 0 }}>Vous pouvez demander la suppression de votre compte et de vos données à tout moment. C’est un droit garanti par le RGPD.</p>

        <h3 className="q">Ce qui est supprimé</h3>
        <p>Votre compte (e-mail, mot de passe, préférences) et les données personnelles rattachées. Pour un dirigeant, la suppression du club entraîne celle de ses équipes, licenciés, séances et convocations.</p>

        <h3 className="q">Délai</h3>
        <p>La suppression est effective sous 30 jours après confirmation, sauf obligation légale de conservation.</p>

        <h3 className="q">Comment faire la demande</h3>
        <p>Envoyez un e-mail depuis l’adresse de votre compte, en précisant qu’il s’agit d’une demande de suppression :</p>
        <a className="btn" style={{ textDecoration: 'none', textAlign: 'center' }}
          href={`mailto:contact@youplaysport.app?subject=${subject}&body=${body}`}>
          Demander la suppression par e-mail
        </a>
        <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 0 }}>
          Vous pouvez aussi demander à votre club de retirer votre licencié : le suivi disparaît alors immédiatement de l’application.
        </p>
      </div>
    </div>
  );
}
