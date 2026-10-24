'use client';

import { useRouter } from 'next/navigation';

/** **gras**, *italique* et [[lien vers la politique de confidentialité]] — rien d'autre. */
function inline(text, router) {
  return text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|\[\[[^\]]+\]\])/g).map((part, i) => {
    if (part.startsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('[[')) {
      return <a key={i} href="/confidentialite" onClick={(e) => { e.preventDefault(); router.push('/confidentialite'); }}>{part.slice(2, -2)}</a>;
    }
    if (part.startsWith('*') && part.length > 2) return <em key={i}>{part.slice(1, -1)}</em>;
    return part;
  });
}

/** Page légale publique : titre, date, sections (texte français fourni par l'éditeur). */
export default function LegalPage({ doc }) {
  const router = useRouter();
  return (
    <div className="wrap" style={{ maxWidth: 720 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <a href="/bienvenue" onClick={(e) => { e.preventDefault(); router.back(); }} style={{ fontWeight: 700 }} aria-label="Retour">←</a>
        <div className="q" style={{ fontWeight: 700, fontSize: 18, flex: 1 }}>{doc.title}</div>
      </div>
      <div className="card" style={{ lineHeight: 1.65, fontSize: 14, color: '#3D3A33' }}>
        {doc.updated && <p style={{ marginTop: 0, color: 'var(--muted)', fontSize: 12 }}>{doc.updated}</p>}
        {doc.sections.map((s) => (
          <section key={s.h}>
            <h2 className="q" style={{ fontSize: 16, margin: '22px 0 8px' }}>{s.h}</h2>
            {s.items.map((it, i) => {
              if (it.p) return <p key={i} style={{ margin: '0 0 10px' }}>{inline(it.p, router)}</p>;
              if (it.note) return <p key={i} style={{ margin: '0 0 10px', color: 'var(--muted)' }}>{it.note}</p>;
              if (it.ul) return (
                <ul key={i} style={{ margin: '0 0 10px', paddingLeft: 20 }}>
                  {it.ul.map((li, j) => <li key={j} style={{ marginBottom: 6 }}>{inline(li, router)}</li>)}
                </ul>
              );
              return (
                <div key={i} style={{ overflowX: 'auto', margin: '0 0 12px' }}>
                  <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
                    <thead><tr>{it.table[0].map((c) => (
                      <th key={c} style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '2px solid var(--border)' }}>{c}</th>
                    ))}</tr></thead>
                    <tbody>{it.table.slice(1).map((row, r) => (
                      <tr key={r}>{row.map((c, k) => (
                        <td key={k} style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)', verticalAlign: 'top' }}>{inline(c, router)}</td>
                      ))}</tr>
                    ))}</tbody>
                  </table>
                </div>
              );
            })}
          </section>
        ))}
        <p style={{ marginBottom: 0, marginTop: 22, fontSize: 12, color: 'var(--muted)' }}>
          <a href="/mentions-legales" onClick={(e) => { e.preventDefault(); router.push('/mentions-legales'); }}>Mentions légales</a>
          {' · '}
          <a href="/cgu" onClick={(e) => { e.preventDefault(); router.push('/cgu'); }}>CGU</a>
          {' · '}
          <a href="/confidentialite" onClick={(e) => { e.preventDefault(); router.push('/confidentialite'); }}>Confidentialité</a>
        </p>
      </div>
    </div>
  );
}
