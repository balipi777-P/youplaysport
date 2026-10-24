'use client';

/* Dernier filet : remplace tout le layout, donc sans i18n ni styles de l'app. */
export default function GlobalError({ reset }) {
  return (
    <html lang="fr">
      <body style={{ fontFamily: 'system-ui, sans-serif', background: '#FAF3ED', color: '#3D3A33',
        textAlign: 'center', padding: '72px 20px' }}>
        <div style={{ fontSize: 44 }}>🙈</div>
        <h1 style={{ fontSize: 22 }}>Un souci est survenu / Something went wrong</h1>
        <p style={{ fontSize: 14, lineHeight: 1.6 }}>
          Vos données sont en sécurité. Réessayez dans un instant. / Your data is safe. Please try again.
        </p>
        <button type="button" onClick={() => reset()}
          style={{ background: '#C05B44', color: '#fff', border: 'none', borderRadius: 14, padding: '14px 22px',
            fontSize: 16, fontWeight: 700 }}>
          Réessayer / Retry
        </button>
      </body>
    </html>
  );
}
