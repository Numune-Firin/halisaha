import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function sunucuIstemcisi() {
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

export type Profil = {
  id: string;
  ad: string;
  rol: 'admin' | 'oyuncu';
  durum: 'onay_bekliyor' | 'aktif' | 'pasif';
};

/** Oturum acmis kullanicinin profili. Oturum yoksa null. */
export async function aktifProfil(): Promise<Profil | null> {
  const supabase = await sunucuIstemcisi();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('profiles')
    .select('id, ad, rol, durum')
    .eq('id', user.id)
    .single();

  return (data as Profil) ?? null;
}
