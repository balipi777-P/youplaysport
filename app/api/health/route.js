export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json({ ok: true, version: process.env.NEXT_PUBLIC_APP_VERSION || 'dev' },
    { headers: { 'Cache-Control': 'no-store' } });
}
