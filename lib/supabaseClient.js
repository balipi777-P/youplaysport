import { createClient } from '@supabase/supabase-js';

// URL + clé publique (anon). La clé anon est publique par nature : elle est
// livrée au navigateur et protégée par les règles RLS côté base.
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ctjqozljwiurtjfkazgp.supabase.co';
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'sb_publishable_M6ttXfs_vU5EkUqjtDxlDA_IgxafpuK';

// Le schéma applicatif est "yps" (isolé de Coach Soccer).
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  db: { schema: 'yps' },
  auth: { persistSession: true, autoRefreshToken: true },
});
