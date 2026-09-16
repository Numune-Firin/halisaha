import { createBrowserClient } from '@supabase/ssr';

/** Yalnizca Realtime aboneligi ve giris akisi icin. Siralama hesabi yapmaz. */
export function createBrowserSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
