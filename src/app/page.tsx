import { redirect } from 'next/navigation';
import Link from 'next/link';
import { aktifProfil, sunucuIstemcisi } from '@/lib/supabase/server';

export default async function AnaSayfa() {
  const profil = await aktifProfil();
  if (!profil) redirect('/giris');
  if (profil.durum !== 'aktif') redirect('/onay-bekliyor');

  const supabase = await sunucuIstemcisi();
  const { data: maclar } = await supabase
    .from('matches')
    .select('id, mac_zamani, saha, durum')
    .in('durum', ['anket_acik', 'kadro_kesin'])
    .order('mac_zamani', { ascending: true })
    .limit(3);

  return (
    <main className="mx-auto flex max-w-lg flex-col gap-6 p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Halı Saha</h1>
        {profil.rol === 'admin' && (
          <Link href="/admin" className="text-sm text-blue-600 underline">
            Admin
          </Link>
        )}
      </header>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Yaklaşan maçlar
        </h2>
        {(maclar ?? []).length === 0 && <p className="text-gray-500">Açık anket yok.</p>}
        <ul className="flex flex-col gap-2">
          {(maclar ?? []).map((m) => (
            <li key={m.id}>
              <Link
                href={`/anket/${m.id}`}
                className="block rounded-lg border border-gray-200 p-3"
              >
                <div className="font-medium">
                  {new Date(m.mac_zamani as string).toLocaleString('tr-TR')}
                </div>
                <div className="text-sm text-gray-600">{m.saha}</div>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
