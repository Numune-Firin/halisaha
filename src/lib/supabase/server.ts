import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createServerSupabase() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Sunucu bileseninden cagrildiginda cerez yazilamaz; middleware tazeler.
          }
        },
      },
    },
  );
}

export type Profile = {
  id: string;
  full_name: string;
  role: 'admin' | 'player';
  status: 'pending' | 'active' | 'inactive';
};

/** Oturum acmis kullanicinin profili. Oturum yoksa null. */
export async function getCurrentProfile(): Promise<Profile | null> {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, role, status')
    .eq('id', user.id)
    .single();

  return (data as Profile) ?? null;
}
