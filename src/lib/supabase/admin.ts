import 'server-only';
import { createClient } from '@supabase/supabase-js';

/**
 * RLS'i atlayan yonetici istemcisi. YALNIZ server action ve route handler
 * icinden cagrilir; hicbir istemci bilesenine import edilmez.
 * Kimlik dogrulamasi cagiran tarafin sorumlulugundadir.
 */
export function createServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
