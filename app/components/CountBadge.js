/* Pastille rouge avec un chiffre : masquée à 0, « 99+ » au-delà de 99. */
export default function CountBadge({ n, label, style }) {
  const v = Number(n) || 0;
  if (v <= 0) return null;
  return (
    <span aria-label={label} style={{ minWidth: 18, height: 18, borderRadius: 999, background: '#D64545', color: '#fff',
      fontSize: 11, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      padding: '0 5px', lineHeight: 1, ...style }}>
      {v > 99 ? '99+' : v}
    </span>
  );
}
