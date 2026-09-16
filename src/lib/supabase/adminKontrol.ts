import { redirect } from 'next/navigation';
import { aktifProfil, type Profil } from '@/lib/supabase/server';

/** Admin degilse ana sayfaya yonlendirir. Tum admin sayfa ve action'larinda ilk satir. */
export async function adminGerekli(): Promise<Profil> {
  const profil = await aktifProfil();
  if (!profil || profil.durum !== 'aktif' || profil.rol !== 'admin') redirect('/');
  return profil;
}
