/* Icônes au trait (stroke 1.5, currentColor) : une seule famille, SVG inline. */
const PATHS = {
  journal: ['M4 5.5C4 4.7 4.7 4 5.5 4H11v15H5.5C4.7 19 4 18.3 4 17.5v-12z', 'M20 5.5c0-.8-.7-1.5-1.5-1.5H13v15h5.5c.8 0 1.5-.7 1.5-1.5v-12z'],
  user: ['M5 20c0-3.9 3.1-7 7-7s7 3.1 7 7'],
  calendar: ['M4 10h16', 'M8 3.5v4', 'M16 3.5v4'],
  bell: ['M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 1.5h-15L6 16.5z', 'M10 20.5a2 2 0 0 0 4 0'],
  plus: ['M12 5v14', 'M5 12h14'],
  bolt: ['M13 3L5 13.5h6L10 21l8-10.5h-6L13 3z'],
  star: ['M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 17l-5.2 2.7 1-5.9L3.5 9.7l5.9-.8L12 3.5z'],
  groups: ['M3.5 19c0-3 2.5-5.5 5.5-5.5s5.5 2.5 5.5 5.5', 'M16.5 13.8c2.5 0 4.5 1.9 4.5 4.7'],
  session: ['M5 19l.8-3.8L16.5 4.5a1.8 1.8 0 0 1 2.5 0l.5.5a1.8 1.8 0 0 1 0 2.5L8.8 18.2 5 19z', 'M14.5 6.5l3 3'],
  events: ['M4 10v4h3l7 4V6L7 10H4z', 'M17.5 9.5a4 4 0 0 1 0 5'],
  chevron: ['M6 9l6 6 6-6'],
};
/* Formes pleines en plus des tracés (cercles, rectangles). */
const SHAPES = {
  user: <circle cx="12" cy="8" r="3.5" />,
  calendar: <rect x="4" y="5.5" width="16" height="14.5" rx="2.5" />,
  groups: (<><circle cx="9" cy="8.5" r="3" /><circle cx="17" cy="9.5" r="2.3" /></>),
};

export default function Icon({ name, size = 20, strokeWidth = 1.5, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" focusable="false" style={{ flex: '0 0 auto', ...style }}>
      {SHAPES[name]}
      {(PATHS[name] || []).map((d) => <path key={d} d={d} />)}
    </svg>
  );
}
