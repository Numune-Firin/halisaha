import { redirect } from 'next/navigation';
import { aktifProfil } from '@/lib/supabase/server';

export default async function AnaSayfa() {
  const profil = await aktifProfil();

  if (!profil) redirect('/giris');
  if (profil.durum !== 'aktif') redirect('/onay-bekliyor');

  return (
    <main className="p-6">
      <h1 className="text-xl font-semibold">Merhaba {profil.ad}</h1>
    </main>
  );
}
