/** @type {import('next').NextConfig} */
const sha = (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7);
const nextConfig = {
  reactStrictMode: true,
  // Version affichée dans Profil et renvoyée par /api/health (SHA du commit déployé).
  env: { NEXT_PUBLIC_APP_VERSION: sha || 'dev' },
  async headers() {
    return [{ source: '/manifest.json', headers: [{ key: 'Cache-Control', value: 'no-cache, must-revalidate' }] }];
  },
};
module.exports = nextConfig;
