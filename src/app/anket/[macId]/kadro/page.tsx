import { notFound } from 'next/navigation';
import { adminGerekli } from '@/lib/supabase/adminKontrol';
import { sunucuIstemcisi } from '@/lib/supabase/server';
import { anketiGetir } from '@/lib/db/anket';
import { kadroyuKesinlestir } from './actions';

export default async function KadroSayfasi({
  params,
}: {
  params: Promise<{ macId: string }>;
}) {
  const { macId } = await params;
  await adminGerekli();

  const veri = await anketiGetir(macId);
  if (!veri) notFound();

  const supabase = await sunucuIstemcisi();
  const { data: tumUyeler } = await supabase
    .from('profiles')
    .select('id, ad')
    .eq('durum', 'aktif')
    .order('ad');

  const kadrodakiler = new Set(
    veri.satirlar.filter((s) => s.konum === 'kadro').map((s) => s.oyuncuId),
  );

  async function kaydet(formData: FormData) {
    'use server';
    const secilenler = formData.getAll('oyuncu') as string[];
    await kadroyuKesinlestir(macId, secilenler);
  }

  return (
    <main className="mx-auto flex max-w-lg flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">Kadroyu kesinleştir</h1>
      <p className="text-sm text-gray-600">
        Sahada fiilen olan oyuncuları işaretle. Puanlar ve ödemeler bu liste üzerinden işler.
      </p>

      <form action={kaydet} className="flex flex-col gap-2">
        {(tumUyeler ?? []).map((u) => (
          <label key={u.id} className="flex items-center gap-2">
            <input
              type="checkbox"
              name="oyuncu"
              value={u.id}
              defaultChecked={kadrodakiler.has(u.id)}
            />
            <span>{u.ad}</span>
          </label>
        ))}
        <button className="mt-4 rounded bg-black px-4 py-2 text-white">
          Kadroyu kesinleştir
        </button>
      </form>
    </main>
  );
}
