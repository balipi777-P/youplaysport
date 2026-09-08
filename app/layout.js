import './globals.css';
import { LangProvider } from '../lib/i18n';

export const metadata = {
  title: 'YouPlaySport',
  description: 'La journée sportive de votre enfant, au club où vous l’avez inscrit.',
  manifest: '/manifest.json',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#C05B44',
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap"
        />
      </head>
      <body><LangProvider>{children}</LangProvider></body>
    </html>
  );
}
