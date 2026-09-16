import type { AnketSatiri } from '@/lib/db/anket';

const MEVKI_KISA: Record<string, string> = {
  kaleci: 'KL',
  defans: 'DF',
  orta_saha: 'OS',
  forvet: 'FV',
};

export function AnketListesi({ satirlar }: { satirlar: AnketSatiri[] }) {
  const kadro = satirlar.filter((s) => s.konum === 'kadro');
  const yedek = satirlar.filter((s) => s.konum === 'yedek');

  return (
    <div className="flex flex-col gap-6">
      <Bolum baslik="Kadro" satirlar={kadro} />
      {yedek.length > 0 && <Bolum baslik="Yedekler" satirlar={yedek} />}
    </div>
  );
}

function Bolum({ baslik, satirlar }: { baslik: string; satirlar: AnketSatiri[] }) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
        {baslik}
      </h2>
      <ol className="divide-y divide-gray-200 rounded-lg border border-gray-200">
        {satirlar.map((s) => (
          <li key={s.oyuncuId} className="flex items-center gap-3 px-3 py-2">
            <span className="w-6 text-right text-sm text-gray-500">{s.sira}</span>
            <span className="flex-1">{s.ad}</span>
            {s.mevki && (
              <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
                {MEVKI_KISA[s.mevki]}
              </span>
            )}
            {s.tip === 'vip' && (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">VIP</span>
            )}
            {s.tip === 'oncelikli' && (
              <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-800">Öncelikli</span>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
