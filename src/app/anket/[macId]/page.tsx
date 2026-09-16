import { redirect, notFound } from 'next/navigation';
import { aktifProfil } from '@/lib/supabase/server';
import { anketiGetir } from '@/lib/db/anket';
import { AnketListesi } from './AnketListesi';
import { anketeGir, anketenCik } from './actions';

export default async function AnketSayfasi({
  params,
}: {
  params: Promise<{ macId: string }>;
}) {
  const { macId } = await params;

  const profil = await aktifProfil();
  if (!profil) redirect('/giris');
  if (profil.durum !== 'aktif') redirect('/onay-bekliyor');

  const veri = await anketiGetir(macId);
  if (!veri) notFound();

  const kendisiListede = veri.satirlar.some((s) => s.oyuncuId === profil.id);

  return (
    <main className="mx-auto flex max-w-lg flex-col gap-6 p-4">
      <header>
        <h1 className="text-xl font-semibold">
          {new Date(veri.mac.macZamani).toLocaleString('tr-TR')}
        </h1>
        <p className="text-gray-600">{veri.mac.saha}</p>
      </header>

      <AnketListesi satirlar={veri.satirlar} />

      {veri.mac.durum === 'anket_acik' && (
        <form
          action={async () => {
            'use server';
            if (kendisiListede) await anketenCik(macId);
            else await anketeGir(macId);
          }}
        >
          <button
            type="submit"
            className={`w-full rounded-lg px-6 py-3 text-white ${
              kendisiListede ? 'bg-red-600' : 'bg-green-600'
            }`}
          >
            {kendisiListede ? 'Anketten çık' : 'Ankete gir'}
          </button>
        </form>
      )}
    </main>
  );
}
