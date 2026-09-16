import { adminGerekli } from '@/lib/supabase/adminKontrol';
import { sunucuIstemcisi } from '@/lib/supabase/server';
import { uyeyiOnayla, anketAc } from './actions';

export default async function AdminSayfasi() {
  await adminGerekli();
  const supabase = await sunucuIstemcisi();

  const { data: bekleyenler } = await supabase
    .from('profiles')
    .select('id, ad')
    .eq('durum', 'onay_bekliyor');

  const { data: maclar } = await supabase
    .from('matches')
    .select('id, mac_zamani, saha, durum')
    .order('mac_zamani', { ascending: false })
    .limit(10);

  return (
    <main className="mx-auto flex max-w-lg flex-col gap-8 p-4">
      <section>
        <h2 className="mb-2 font-semibold">Onay bekleyen üyeler</h2>
        {(bekleyenler ?? []).length === 0 && (
          <p className="text-gray-500">Bekleyen üye yok.</p>
        )}
        <ul className="flex flex-col gap-2">
          {(bekleyenler ?? []).map((u) => (
            <li key={u.id} className="flex items-center justify-between">
              <span>{u.ad}</span>
              <form action={uyeyiOnayla.bind(null, u.id)}>
                <button className="rounded bg-green-600 px-3 py-1 text-sm text-white">
                  Onayla
                </button>
              </form>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-2 font-semibold">Yeni anket aç</h2>
        <form action={anketAc} className="flex flex-col gap-2">
          <input type="datetime-local" name="macZamani" required className="rounded border p-2" />
          <input type="text" name="saha" placeholder="Saha adı" className="rounded border p-2" />
          <input type="number" name="kadroBoyutu" defaultValue={14} className="rounded border p-2" />
          <input type="number" name="kisiBasiUcret" placeholder="Kişi başı ücret" className="rounded border p-2" />
          <input type="number" name="cikisPenceresi" defaultValue={20} className="rounded border p-2" />
          <input type="number" name="gecCikisCezasi" defaultValue={8} className="rounded border p-2" />
          <input type="date" name="sonOdemeGunu" className="rounded border p-2" />
          <button className="rounded bg-black px-4 py-2 text-white">Anketi aç</button>
        </form>
      </section>

      <section>
        <h2 className="mb-2 font-semibold">Maçlar</h2>
        <ul className="flex flex-col gap-1">
          {(maclar ?? []).map((m) => (
            <li key={m.id}>
              <a className="text-blue-600 underline" href={`/anket/${m.id}`}>
                {new Date(m.mac_zamani as string).toLocaleString('tr-TR')} — {m.saha} ({m.durum})
              </a>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
