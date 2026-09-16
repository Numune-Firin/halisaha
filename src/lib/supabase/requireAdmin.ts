import { redirect } from 'next/navigation';
import { getCurrentProfile, type Profile } from '@/lib/supabase/server';

/** Admin degilse ana sayfaya yonlendirir. Tum admin sayfa ve action'larinda ilk satir. */
export async function requireAdmin(): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (!profile || profile.status !== 'active' || profile.role !== 'admin') redirect('/');
  return profile;
}
