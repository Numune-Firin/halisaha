# Halı Saha Sistemi — Plan 1: Üyelik ve Anket Motoru

> **Adlandirma notu:** Bu belge yazildigi gunku Turkce kod adlandirmasini anlatir. Tanimlayicilar sonradan Ingilizce'ye cevrildi; guncel karsiliklar icin `docs/superpowers/adlandirma-sozlugu.md` dosyasina bak.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Onaylı üyelerin ankete girip çıkabildiği, sıralamanın kurallı ve tek merkezden hesaplandığı, admin'in anket açıp kadroyu kesinleştirebildiği çalışır bir uygulama.

**Architecture:** Next.js App Router üzerinde sunucu tarafı render. Sıralama, çıkış penceresi ve ceza/ödül kuralları **saf TypeScript fonksiyonları** olarak `src/lib/poll/` altında yaşar ve yalnız sunucuda çalışır — tarayıcı hiçbir sıralama hesabı yapmaz, sunucudan gelen listeyi gösterir. PostgreSQL veri bütünlüğünden (benzersizlik kısıtları, sunucu saatli zaman damgası) ve yetkilendirmeden (RLS) sorumludur. Realtime olayı geldiğinde tarayıcı listeyi yeniden hesaplamaz, sunucudan yeniden ister.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS v4, Supabase (PostgreSQL + Auth + Realtime), `@supabase/ssr`, Vitest, Vercel.

**Spec:** `docs/superpowers/specs/2026-09-15-hali-saha-sistemi-design.md`

## Spec'ten Bilinçli Sapmalar

Bu plan spec'in 11.2 ve 11.4 maddelerinden ayrılıyor. Gerekçe her ikisinde de aynı: **kuralları test edilebilir tutmak.**

1. **Sıralama PostgreSQL fonksiyonu yerine sunucu tarafı TypeScript fonksiyonu.** Spec'in kaygısı "hesap tarayıcıda yapılmasın, herkes aynı listeyi görsün" idi; sunucu tarafı TypeScript bunu birebir karşılıyor. PostgreSQL fonksiyonunu test etmek yerel Supabase + Docker + pgTAP kurulumu gerektiriyor; TypeScript fonksiyonu Vitest ile saniyeler içinde ve kurulumsuz test ediliyor. Sistemin en kritik kuralı bu, en iyi test edilen parça olmalı.
2. **`pg_cron` yerine Vercel Cron.** Aynı gerekçe: zamanlanmış iş bir route handler'ı çağırır, mantık test edilebilir TypeScript'te kalır. Vercel ücretsiz paketi günde bir cron veriyor, ihtiyaç tam olarak bu. (Bu madde Plan 3'te hayata geçer, burada yalnız mimari kararı kayda geçiyor.)

**Değişmeyen:** Sıralama tek merkezden hesaplanır, tarayıcı asla hesaplamaz, giriş zamanı sunucu saatiyle yazılır. Spec'in amacı korunuyor, aracı değişiyor.

## Spec Muğlaklığı — Alınan Karar

Spec, ceza/ödül ofsetinin yalnız "normal" katmanda mı yoksa "öncelikli" katmanda da mı işlediğini söylemiyor. **Karar: ofset her katmanda aynı şekilde işler, ama katman atlatmaz.** Yani cezalı bir öncelikli oyuncu diğer önceliklilerin arkasına düşer, normallerin arasına karışmaz. Tek ve tahmin edilebilir kural. VIP katmanı istisnadır: VIP'in zaman sırası yoktur, admin'in verdiği sıra geçerlidir.

## Global Constraints

Her görevin gereksinimleri aşağıdakileri kapsar:

- **Sıralama tarayıcıda hesaplanmaz.** `src/lib/poll/` altındaki modüller yalnız sunucu bileşenlerinden ve server action'lardan çağrılır.
- **Giriş zamanı sunucu saatiyle yazılır.** `match_entries.giris_zamani` istemciden gelen değeri kabul etmez; veritabanı tetikleyicisi her zaman `now()` yazar.
- **Kadro boyutu varsayılan 14**, admin değiştirebilir; kadro/yedek sınırı bu sayıdır.
- **Serbest çıkış penceresi maç saatinden geriye sayar** (varsayılan 20 saat).
- **Geç çıkış cezası varsayılan +8 sn**, oyuncunun katıldığı ilk ankette uygulanır ve orada tükenir.
- **Ödül alt sınırı anket açılış zamanıdır**; efektif zaman bunun öncesine geçemez.
- **Eşitlik bozucu her zaman gerçek giriş zamanıdır.**
- **Yetki veritabanı seviyesinde uygulanır.** Her tabloda RLS açık; arayüzde buton gizlemek yeterli sayılmaz.
- **Sadece `durum = 'aktif'` üyeler veri okuyabilir.**
- **Sıralama katmanları:** `vip` → `oncelikli` → `normal`. Ofset katman atlatmaz.
- **Zaman birimi:** saf fonksiyonlarda epoch milisaniye (`number`). Veritabanında `timestamptz`.
- **Dil:** arayüz metinleri ve veritabanı sütun adları Türkçe, kod tanımlayıcıları Türkçe (aksansız: `oncelikli`, `cikis`, `sira`).

---

## Dosya Yapısı

| Dosya | Sorumluluk |
|-------|-----------|
| `src/lib/poll/types.ts` | Sıralama alan adı tipleri — başka hiçbir şey |
| `src/lib/poll/sirala.ts` | Anket sıralaması, kadro/yedek ayrımı. Saf fonksiyon |
| `src/lib/poll/cikis.ts` | Çıkış penceresi değerlendirmesi ve geç çıkış cezası. Saf fonksiyon |
| `src/lib/poll/ofset.ts` | Bekleyen ceza/ödüllerin toplanması ve tüketilmesi. Saf fonksiyon |
| `src/lib/supabase/server.ts` | Sunucu tarafı Supabase istemcisi (çerez tabanlı oturum) |
| `src/lib/supabase/client.ts` | Tarayıcı tarafı Supabase istemcisi (yalnız Realtime aboneliği için) |
| `src/lib/db/anket.ts` | Anket verisi okuma/yazma. Saf fonksiyonları çağıran tek yer |
| `src/app/(app)/page.tsx` | Ana sayfa — aktif anket özeti |
| `src/app/(app)/anket/[macId]/page.tsx` | Anket listesi ekranı |
| `src/app/(app)/admin/page.tsx` | Admin paneli |
| `src/app/giris/page.tsx` | Google ile giriş |
| `src/app/onay-bekliyor/page.tsx` | Onay bekleyen üye ekranı |
| `supabase/migrations/0001_sema.sql` | Tablolar, tipler, kısıtlar, tetikleyiciler |
| `supabase/migrations/0002_rls.sql` | RLS politikaları ve yetki yardımcı fonksiyonları |

---

## Task 1: Proje iskeleti ve test altyapısı

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`
- Create: `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`
- Test: `src/lib/saglik.test.ts`

**Interfaces:**
- Consumes: yok (ilk görev)
- Produces: `npm test` (Vitest), `npm run dev` (Next.js), `npm run build` komutları

- [ ] **Step 1: Next.js projesini mevcut klasöre kur**

```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --no-turbopack
```

Kurulum "klasör boş değil" uyarısı verirse devam et; mevcut `docs/`, `.gitignore` ve PDF dosyaları korunur. Kurulum sonrası `.gitignore` dosyasının içeriğini kontrol et: `create-next-app` üzerine yazmış olabilir. Yazdıysa `.env`, `*.pdf` ve `docker-compose.yml` satırlarını geri ekle.

- [ ] **Step 2: Vitest'i kur**

```bash
npm install -D vitest
```

- [ ] **Step 3: Vitest yapılandırmasını yaz**

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
});
```

- [ ] **Step 4: `package.json`'a test betiğini ekle**

`scripts` bölümüne ekle:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 5: Test altyapısının çalıştığını doğrulayan bir test yaz**

`src/lib/saglik.test.ts`:

```ts
import { describe, it, expect } from 'vitest';

describe('test altyapisi', () => {
  it('calisiyor', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 6: Testi çalıştır**

Run: `npm test`
Expected: PASS — 1 test geçti

- [ ] **Step 7: Derlemenin çalıştığını doğrula**

Run: `npm run build`
Expected: Başarılı derleme, hata yok

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: Next.js + TypeScript + Tailwind + Vitest iskeleti"
```

---

## Task 2: Veritabanı şeması

**Files:**
- Create: `supabase/migrations/0001_sema.sql`
- Create: `.env.example`
- Modify: `.gitignore` (gerekiyorsa `.env.local` satırı)

**Interfaces:**
- Consumes: yok
- Produces: `profiles`, `seasons`, `matches`, `match_entries`, `adjustments`, `settings` tabloları; `mevki_t`, `rol_t`, `uye_durum_t`, `mac_durum_t`, `giris_tipi_t` enum tipleri

- [ ] **Step 1: Supabase projesini oluştur**

[supabase.com](https://supabase.com) üzerinde ücretsiz bir proje aç. Proje ayarlarından şu üç değeri al: Project URL, `anon` key, `service_role` key.

- [ ] **Step 2: Ortam değişkeni şablonunu yaz**

`.env.example`:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

Gerçek değerleri `.env.local` dosyasına yaz. `.env.local` commit edilmez — `.gitignore`'da `.env.*` kuralı bunu zaten kapsıyor.

- [ ] **Step 3: Şema migration'ını yaz**

`supabase/migrations/0001_sema.sql`:

```sql
-- Enum tipleri
create type mevki_t      as enum ('kaleci','defans','orta_saha','forvet');
create type rol_t        as enum ('admin','oyuncu');
create type uye_durum_t  as enum ('onay_bekliyor','aktif','pasif');
create type mac_durum_t  as enum ('anket_acik','kadro_kesin','oynandi','tamamlandi');
create type giris_tipi_t as enum ('vip','oncelikli','normal');

-- Uyeler
create table profiles (
  id         uuid primary key references auth.users on delete cascade,
  ad         text not null default '',
  mevki      mevki_t,
  rol        rol_t not null default 'oyuncu',
  durum      uye_durum_t not null default 'onay_bekliyor',
  avatar_url text,
  created_at timestamptz not null default now()
);

-- Sezonlar
create table seasons (
  id         uuid primary key default gen_random_uuid(),
  ad         text not null,
  baslangic  date not null,
  bitis      date,
  aktif      boolean not null default true,
  created_at timestamptz not null default now()
);
-- Ayni anda yalnizca bir aktif sezon olabilir
create unique index seasons_tek_aktif on seasons (aktif) where aktif;

-- Maclar
create table matches (
  id                  uuid primary key default gen_random_uuid(),
  sezon_id            uuid references seasons(id) on delete set null,
  mac_zamani          timestamptz not null,
  saha                text not null default '',
  durum               mac_durum_t not null default 'anket_acik',
  kadro_boyutu        int not null default 14 check (kadro_boyutu between 2 and 40),
  kisi_basi_ucret     numeric(10,2) not null default 0 check (kisi_basi_ucret >= 0),
  cikis_penceresi_saat int not null default 20 check (cikis_penceresi_saat >= 0),
  gec_cikis_cezasi_sn int not null default 8 check (gec_cikis_cezasi_sn >= 0),
  anket_acilis        timestamptz not null default now(),
  son_odeme_gunu      date,
  siyah_skor          int check (siyah_skor >= 0),
  beyaz_skor          int check (beyaz_skor >= 0),
  created_at          timestamptz not null default now()
);

-- Ankete giris kayitlari (VIP dahil)
create table match_entries (
  id            uuid primary key default gen_random_uuid(),
  mac_id        uuid not null references matches(id) on delete cascade,
  oyuncu_id     uuid not null references profiles(id) on delete cascade,
  tip           giris_tipi_t not null default 'normal',
  giris_zamani  timestamptz not null default now(),
  ofset_sn      int not null default 0,
  vip_sira      int,
  cikis_zamani  timestamptz,
  gec_cikis     boolean not null default false,
  unique (mac_id, oyuncu_id)
);
create index match_entries_mac_idx on match_entries (mac_id);

-- Giris zamani her zaman sunucu saatiyle yazilir; istemciden gelen deger yok sayilir
create or replace function match_entries_giris_zamani_zorla()
returns trigger language plpgsql as $$
begin
  new.giris_zamani := now();
  return new;
end;
$$;

create trigger match_entries_giris_zamani_trg
  before insert on match_entries
  for each row execute function match_entries_giris_zamani_zorla();

-- Ceza / odul kayitlari. saniye > 0 ceza, < 0 odul
create table adjustments (
  id                  uuid primary key default gen_random_uuid(),
  oyuncu_id           uuid not null references profiles(id) on delete cascade,
  saniye              int not null check (saniye <> 0),
  sebep               text not null default '',
  kaynak_mac_id       uuid references matches(id) on delete set null,
  kullanildigi_mac_id uuid references matches(id) on delete set null,
  created_at          timestamptz not null default now()
);
create index adjustments_bekleyen_idx
  on adjustments (oyuncu_id) where kullanildigi_mac_id is null;

-- Varsayilan ayarlar (tek satir)
create table settings (
  id                   boolean primary key default true check (id),
  kadro_boyutu         int not null default 14,
  kisi_basi_ucret      numeric(10,2) not null default 0,
  cikis_penceresi_saat int not null default 20,
  gec_cikis_cezasi_sn  int not null default 8
);
insert into settings default values;
```

- [ ] **Step 4: Migration'ı Supabase'de çalıştır**

Supabase panelinde SQL Editor'ü aç, dosyanın tamamını yapıştır ve çalıştır.

- [ ] **Step 5: Şemanın doğru kurulduğunu doğrula**

SQL Editor'de çalıştır:

```sql
select table_name from information_schema.tables
where table_schema = 'public' order by table_name;
```

Expected: `adjustments`, `match_entries`, `matches`, `profiles`, `seasons`, `settings` — altı tablo.

- [ ] **Step 6: Giriş zamanı tetikleyicisini doğrula**

SQL Editor'de çalıştır — geçmiş bir tarih göndermeyi dene:

```sql
insert into seasons (ad, baslangic) values ('Test', current_date) returning id;
-- Donen sezon id'si ile:
insert into matches (mac_zamani, sezon_id) values (now() + interval '2 days', '<sezon_id>') returning id;
-- Donen mac id'si ve kendi auth kullanicisi olmadigi icin once bir profil gerekiyor;
-- bu adimda yalnizca tetikleyicinin varligini dogrula:
select tgname from pg_trigger where tgname = 'match_entries_giris_zamani_trg';
```

Expected: `match_entries_giris_zamani_trg` satırı döner.

- [ ] **Step 7: Test verisini temizle**

```sql
delete from matches where saha = '';
delete from seasons where ad = 'Test';
```

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/0001_sema.sql .env.example
git commit -m "feat: veritabani semasi - uyeler, maclar, anket girisleri, ceza/odul"
```

---

## Task 3: RLS politikaları ve profil oluşturma

**Files:**
- Create: `supabase/migrations/0002_rls.sql`

**Interfaces:**
- Consumes: Task 2'deki tablolar
- Produces: `public.is_aktif_uye()`, `public.is_admin()` SQL fonksiyonları; tüm tablolarda açık RLS

- [ ] **Step 1: RLS migration'ını yaz**

`supabase/migrations/0002_rls.sql`:

```sql
-- Yetki yardimcilari. security definer: RLS dongusune girmeden profiles'i okur.
create or replace function public.is_aktif_uye() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and durum = 'aktif'
  );
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and durum = 'aktif' and rol = 'admin'
  );
$$;

-- Yeni auth kullanicisi icin otomatik profil. Varsayilan durum: onay_bekliyor
create or replace function public.yeni_kullanici_profili()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, ad, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger yeni_kullanici_profili_trg
  after insert on auth.users
  for each row execute function public.yeni_kullanici_profili();

-- RLS'i her tabloda ac
alter table profiles      enable row level security;
alter table seasons       enable row level security;
alter table matches       enable row level security;
alter table match_entries enable row level security;
alter table adjustments   enable row level security;
alter table settings      enable row level security;

-- profiles: aktif uyeler herkesi gorur; herkes kendi satirini gorur (onay bekleyen dahil)
create policy profiles_select on profiles for select
  using (is_aktif_uye() or id = auth.uid());

-- Oyuncu yalniz kendi ad/mevki/avatar alanini degistirebilir.
-- Rol ve durum degisikligi ayri politikayla yalnizca admin'e acik.
create policy profiles_update_kendi on profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

create policy profiles_update_admin on profiles for update
  using (is_admin()) with check (is_admin());

-- seasons / matches / settings: aktif uyeler okur, admin yazar
create policy seasons_select on seasons for select using (is_aktif_uye());
create policy seasons_all    on seasons for all    using (is_admin()) with check (is_admin());

create policy matches_select on matches for select using (is_aktif_uye());
create policy matches_all    on matches for all    using (is_admin()) with check (is_admin());

create policy settings_select on settings for select using (is_aktif_uye());
create policy settings_all    on settings for all    using (is_admin()) with check (is_admin());

-- match_entries: aktif uyeler okur.
-- Oyuncu yalnizca kendi adina ve yalnizca 'normal' tipte giris yapabilir.
-- 'vip' ve 'oncelikli' tipleri, vip_sira ve ofset_sn yalnizca admin tarafindan yazilir.
create policy match_entries_select on match_entries for select
  using (is_aktif_uye());

create policy match_entries_insert_kendi on match_entries for insert
  with check (
    oyuncu_id = auth.uid()
    and is_aktif_uye()
    and tip = 'normal'
    and vip_sira is null
    and ofset_sn = 0
    and exists (
      select 1 from matches m
      where m.id = mac_id and m.durum = 'anket_acik'
    )
  );

create policy match_entries_update_kendi on match_entries for update
  using (oyuncu_id = auth.uid() and is_aktif_uye())
  with check (oyuncu_id = auth.uid());

create policy match_entries_all_admin on match_entries for all
  using (is_admin()) with check (is_admin());

-- adjustments: aktif uyeler okur (seffaflik), yalnizca admin yazar
create policy adjustments_select on adjustments for select using (is_aktif_uye());
create policy adjustments_all    on adjustments for all    using (is_admin()) with check (is_admin());
```

**Not — bilinen sınır:** `match_entries_update_kendi` politikası oyuncunun kendi satırında `ofset_sn` alanını değiştirmesini engellemez; PostgreSQL politikaları sütun bazlı kısıt koyamaz. Bu açık Task 8'de, çıkış işlemini tek bir server action üzerinden yaptırarak ve `ofset_sn` değişimini veritabanı tetikleyicisiyle reddederek kapatılacak.

- [ ] **Step 2: Migration'ı Supabase'de çalıştır**

SQL Editor'de dosyanın tamamını çalıştır.

- [ ] **Step 3: RLS'in açık olduğunu doğrula**

```sql
select tablename, rowsecurity from pg_tables
where schemaname = 'public' order by tablename;
```

Expected: Altı tablonun tamamında `rowsecurity = true`.

- [ ] **Step 4: Anonim erişimin kapalı olduğunu doğrula**

Terminalden (`<URL>` ve `<ANON_KEY>` yerine kendi değerlerin):

```bash
curl -s "<URL>/rest/v1/profiles?select=*" -H "apikey: <ANON_KEY>"
```

Expected: `[]` — boş dizi. Veri sızmıyor. (Hata mesajı değil boş dizi dönmesi normaldir; RLS eşleşen satır bulamadığı için hiçbir şey döndürmez.)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0002_rls.sql
git commit -m "feat: RLS politikalari ve otomatik profil olusturma"
```

---

## Task 4: Sıralama motoru

Sistemin kalbi. En yoğun test edilen parça burası.

**Files:**
- Create: `src/lib/poll/types.ts`
- Create: `src/lib/poll/sirala.ts`
- Test: `src/lib/poll/sirala.test.ts`

**Interfaces:**
- Consumes: yok (saf fonksiyon)
- Produces:
  - `type Mevki = 'kaleci' | 'defans' | 'orta_saha' | 'forvet'`
  - `type GirisTipi = 'vip' | 'oncelikli' | 'normal'`
  - `interface AnketGirisi { oyuncuId: string; tip: GirisTipi; girisZamani: number; ofsetSn: number; vipSira: number | null; cikisZamani: number | null }`
  - `interface SiraliOyuncu { oyuncuId: string; tip: GirisTipi; sira: number; konum: 'kadro' | 'yedek'; efektifZaman: number }`
  - `function anketiSirala(params: { girisler: AnketGirisi[]; anketAcilis: number; kadroBoyutu: number }): SiraliOyuncu[]`

- [ ] **Step 1: Tipleri yaz**

`src/lib/poll/types.ts`:

```ts
export type Mevki = 'kaleci' | 'defans' | 'orta_saha' | 'forvet';

export type GirisTipi = 'vip' | 'oncelikli' | 'normal';

/** Bir oyuncunun tek bir maca ait anket giris kaydi. Zamanlar epoch milisaniye. */
export interface AnketGirisi {
  oyuncuId: string;
  tip: GirisTipi;
  /** Sunucu saatiyle yazilan gercek giris zamani */
  girisZamani: number;
  /** Uygulanan toplam ofset. Pozitif ceza, negatif odul. */
  ofsetSn: number;
  /** Yalnizca tip === 'vip' icin dolu: admin'in verdigi sira */
  vipSira: number | null;
  /** Dolu ise oyuncu anketten cikmistir, listede yer almaz */
  cikisZamani: number | null;
}

export interface SiraliOyuncu {
  oyuncuId: string;
  tip: GirisTipi;
  /** 1'den baslar */
  sira: number;
  konum: 'kadro' | 'yedek';
  efektifZaman: number;
}
```

- [ ] **Step 2: Başarısız testleri yaz**

`src/lib/poll/sirala.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { anketiSirala } from './sirala';
import type { AnketGirisi } from './types';

const ACILIS = 1_000_000_000_000; // sabit anket acilis zamani
const SN = 1000;

function giris(over: Partial<AnketGirisi> & { oyuncuId: string }): AnketGirisi {
  return {
    tip: 'normal',
    girisZamani: ACILIS,
    ofsetSn: 0,
    vipSira: null,
    cikisZamani: null,
    ...over,
  };
}

function sirala(girisler: AnketGirisi[], kadroBoyutu = 14) {
  return anketiSirala({ girisler, anketAcilis: ACILIS, kadroBoyutu });
}

describe('anketiSirala', () => {
  it('bos listede bos dizi doner', () => {
    expect(sirala([])).toEqual([]);
  });

  it('normal oyunculari giris sirasina gore dizer', () => {
    const sonuc = sirala([
      giris({ oyuncuId: 'c', girisZamani: ACILIS + 30 * SN }),
      giris({ oyuncuId: 'a', girisZamani: ACILIS + 10 * SN }),
      giris({ oyuncuId: 'b', girisZamani: ACILIS + 20 * SN }),
    ]);
    expect(sonuc.map((o) => o.oyuncuId)).toEqual(['a', 'b', 'c']);
    expect(sonuc.map((o) => o.sira)).toEqual([1, 2, 3]);
  });

  it('ceza oyuncuyu geriye atar', () => {
    // a once girdi ama +10sn cezali; b 6 saniye sonra girdi, cezasiz.
    // a'nin efektif zamani ACILIS+20sn, b'ninki ACILIS+16sn -> b one gecer.
    const sonuc = sirala([
      giris({ oyuncuId: 'a', girisZamani: ACILIS + 10 * SN, ofsetSn: 10 }),
      giris({ oyuncuId: 'b', girisZamani: ACILIS + 16 * SN }),
    ]);
    expect(sonuc.map((o) => o.oyuncuId)).toEqual(['b', 'a']);
  });

  it('odul oyuncuyu one ceker', () => {
    const sonuc = sirala([
      giris({ oyuncuId: 'a', girisZamani: ACILIS + 30 * SN }),
      giris({ oyuncuId: 'b', girisZamani: ACILIS + 40 * SN, ofsetSn: -20 }),
    ]);
    expect(sonuc.map((o) => o.oyuncuId)).toEqual(['b', 'a']);
  });

  it('odul efektif zamani anket acilisinin oncesine tasimaz', () => {
    const sonuc = sirala([
      giris({ oyuncuId: 'a', girisZamani: ACILIS + 5 * SN, ofsetSn: -600 }),
    ]);
    expect(sonuc[0].efektifZaman).toBe(ACILIS);
  });

  it('alt sinira dayanan iki oyuncuyu gercek giris zamani ayirir', () => {
    const sonuc = sirala([
      giris({ oyuncuId: 'gec', girisZamani: ACILIS + 9 * SN, ofsetSn: -600 }),
      giris({ oyuncuId: 'erken', girisZamani: ACILIS + 3 * SN, ofsetSn: -600 }),
    ]);
    expect(sonuc.map((o) => o.oyuncuId)).toEqual(['erken', 'gec']);
  });

  it('VIP oyunculari her zaman en uste, vipSira duzeninde koyar', () => {
    const sonuc = sirala([
      giris({ oyuncuId: 'normal', girisZamani: ACILIS + SN }),
      giris({ oyuncuId: 'vip2', tip: 'vip', vipSira: 2 }),
      giris({ oyuncuId: 'vip1', tip: 'vip', vipSira: 1 }),
    ]);
    expect(sonuc.map((o) => o.oyuncuId)).toEqual(['vip1', 'vip2', 'normal']);
  });

  it('oncelikliyi VIP altina, normallerin ustune koyar', () => {
    const sonuc = sirala([
      giris({ oyuncuId: 'normal', girisZamani: ACILIS + SN }),
      giris({ oyuncuId: 'oncelikli', tip: 'oncelikli', girisZamani: ACILIS + 500 * SN }),
      giris({ oyuncuId: 'vip', tip: 'vip', vipSira: 1 }),
    ]);
    expect(sonuc.map((o) => o.oyuncuId)).toEqual(['vip', 'oncelikli', 'normal']);
  });

  it('oncelikliler kendi aralarinda efektif zamana gore dizilir, katman atlamaz', () => {
    // o1 once girdi ama agir cezali; o2 sonra girdi, cezasiz.
    // Kendi aralarinda o2 one gecer ama ikisi de normalin ustunde kalir.
    const sonuc = sirala([
      giris({ oyuncuId: 'normal', girisZamani: ACILIS + SN }),
      giris({ oyuncuId: 'o1', tip: 'oncelikli', girisZamani: ACILIS + 10 * SN, ofsetSn: 100 }),
      giris({ oyuncuId: 'o2', tip: 'oncelikli', girisZamani: ACILIS + 20 * SN }),
    ]);
    expect(sonuc.map((o) => o.oyuncuId)).toEqual(['o2', 'o1', 'normal']);
  });

  it('kadro boyutundan sonrasini yedek isaretler', () => {
    const girisler = Array.from({ length: 16 }, (_, i) =>
      giris({ oyuncuId: `o${i}`, girisZamani: ACILIS + i * SN }),
    );
    const sonuc = sirala(girisler, 14);
    expect(sonuc.filter((o) => o.konum === 'kadro')).toHaveLength(14);
    expect(sonuc.filter((o) => o.konum === 'yedek')).toHaveLength(2);
    expect(sonuc[13].konum).toBe('kadro');
    expect(sonuc[14].konum).toBe('yedek');
  });

  it('kadro boyutu degisince kadro/yedek siniri da degisir', () => {
    const girisler = Array.from({ length: 18 }, (_, i) =>
      giris({ oyuncuId: `o${i}`, girisZamani: ACILIS + i * SN }),
    );
    const sonuc = sirala(girisler, 16);
    expect(sonuc.filter((o) => o.konum === 'kadro')).toHaveLength(16);
  });

  it('cikan oyuncuyu listeden dusurur ve yedek terfi eder', () => {
    const girisler = Array.from({ length: 15 }, (_, i) =>
      giris({ oyuncuId: `o${i}`, girisZamani: ACILIS + i * SN }),
    );
    girisler[0].cikisZamani = ACILIS + 999 * SN;

    const sonuc = sirala(girisler, 14);
    expect(sonuc).toHaveLength(14);
    expect(sonuc.map((o) => o.oyuncuId)).not.toContain('o0');
    // 15. sirada yedek olan o14 artik kadroda
    expect(sonuc.find((o) => o.oyuncuId === 'o14')?.konum).toBe('kadro');
  });

  it('girdi dizisini degistirmez', () => {
    const girisler = [
      giris({ oyuncuId: 'b', girisZamani: ACILIS + 20 * SN }),
      giris({ oyuncuId: 'a', girisZamani: ACILIS + 10 * SN }),
    ];
    const kopya = JSON.parse(JSON.stringify(girisler));
    sirala(girisler);
    expect(girisler).toEqual(kopya);
  });
});
```

- [ ] **Step 3: Testleri çalıştır, başarısız olduklarını gör**

Run: `npm test -- src/lib/poll/sirala.test.ts`
Expected: FAIL — `Failed to resolve import "./sirala"`

- [ ] **Step 4: Sıralama motorunu yaz**

`src/lib/poll/sirala.ts`:

```ts
import type { AnketGirisi, SiraliOyuncu } from './types';

/** Katman sirasi: kucuk sayi once gelir. Ofset bu sirayi degistiremez. */
const KATMAN_SIRASI = { vip: 0, oncelikli: 1, normal: 2 } as const;

/**
 * Anket listesini sistemin tek dogru sirasina gore dizer.
 *
 * Katmanlar: VIP -> Oncelikli -> Normal. Ofset katman atlatmaz.
 * VIP katmani admin'in verdigi vipSira duzenindedir.
 * Diger katmanlarda: efektifZaman = girisZamani + ofsetSn, alt sinir anketAcilis.
 * Esitlik bozucu her zaman gercek giris zamanidir.
 *
 * Cikmis oyuncular (cikisZamani dolu) listede yer almaz.
 */
export function anketiSirala({
  girisler,
  anketAcilis,
  kadroBoyutu,
}: {
  girisler: AnketGirisi[];
  anketAcilis: number;
  kadroBoyutu: number;
}): SiraliOyuncu[] {
  const aktif = girisler.filter((g) => g.cikisZamani === null);

  const hesaplanmis = aktif.map((g) => ({
    giris: g,
    efektifZaman: Math.max(anketAcilis, g.girisZamani + g.ofsetSn * 1000),
  }));

  hesaplanmis.sort((a, b) => {
    const katmanFarki = KATMAN_SIRASI[a.giris.tip] - KATMAN_SIRASI[b.giris.tip];
    if (katmanFarki !== 0) return katmanFarki;

    if (a.giris.tip === 'vip') {
      return (a.giris.vipSira ?? Number.MAX_SAFE_INTEGER)
           - (b.giris.vipSira ?? Number.MAX_SAFE_INTEGER);
    }

    const zamanFarki = a.efektifZaman - b.efektifZaman;
    if (zamanFarki !== 0) return zamanFarki;

    return a.giris.girisZamani - b.giris.girisZamani;
  });

  return hesaplanmis.map((h, i) => ({
    oyuncuId: h.giris.oyuncuId,
    tip: h.giris.tip,
    sira: i + 1,
    konum: i < kadroBoyutu ? 'kadro' : 'yedek',
    efektifZaman: h.efektifZaman,
  }));
}
```

- [ ] **Step 5: Testleri çalıştır, geçtiklerini gör**

Run: `npm test -- src/lib/poll/sirala.test.ts`
Expected: PASS — 13 test geçti

- [ ] **Step 6: Commit**

```bash
git add src/lib/poll/types.ts src/lib/poll/sirala.ts src/lib/poll/sirala.test.ts
git commit -m "feat: anket siralama motoru - katmanlar, ofset, kadro/yedek ayrimi"
```

---

## Task 5: Çıkış penceresi ve geç çıkış cezası

**Files:**
- Create: `src/lib/poll/cikis.ts`
- Test: `src/lib/poll/cikis.test.ts`

**Interfaces:**
- Consumes: yok (saf fonksiyon)
- Produces: `function cikisiDegerlendir(params: { simdi: number; macZamani: number; cikisPenceresiSaat: number; gecCikisCezasiSn: number }): { gecCikis: boolean; cezaSn: number }`

- [ ] **Step 1: Başarısız testleri yaz**

`src/lib/poll/cikis.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { cikisiDegerlendir } from './cikis';

const SAAT = 60 * 60 * 1000;
const MAC = 1_000_000_000_000;

describe('cikisiDegerlendir', () => {
  it('pencere icinde cikista ceza yazmaz', () => {
    const sonuc = cikisiDegerlendir({
      simdi: MAC - 30 * SAAT,
      macZamani: MAC,
      cikisPenceresiSaat: 20,
      gecCikisCezasiSn: 8,
    });
    expect(sonuc).toEqual({ gecCikis: false, cezaSn: 0 });
  });

  it('pencere kapandiktan sonra cikista ceza yazar', () => {
    const sonuc = cikisiDegerlendir({
      simdi: MAC - 5 * SAAT,
      macZamani: MAC,
      cikisPenceresiSaat: 20,
      gecCikisCezasiSn: 8,
    });
    expect(sonuc).toEqual({ gecCikis: true, cezaSn: 8 });
  });

  it('tam sinir aninda cikis gec sayilir', () => {
    const sonuc = cikisiDegerlendir({
      simdi: MAC - 20 * SAAT,
      macZamani: MAC,
      cikisPenceresiSaat: 20,
      gecCikisCezasiSn: 8,
    });
    expect(sonuc.gecCikis).toBe(true);
  });

  it('mac saatinden sonraki cikis da gec sayilir', () => {
    const sonuc = cikisiDegerlendir({
      simdi: MAC + SAAT,
      macZamani: MAC,
      cikisPenceresiSaat: 20,
      gecCikisCezasiSn: 8,
    });
    expect(sonuc.gecCikis).toBe(true);
  });

  it('ceza sifir tanimlandiysa gec cikista da ceza yazmaz', () => {
    const sonuc = cikisiDegerlendir({
      simdi: MAC - SAAT,
      macZamani: MAC,
      cikisPenceresiSaat: 20,
      gecCikisCezasiSn: 0,
    });
    expect(sonuc).toEqual({ gecCikis: true, cezaSn: 0 });
  });

  it('pencere sifir saat ise yalnizca mac saatinden sonrasi gec sayilir', () => {
    const erken = cikisiDegerlendir({
      simdi: MAC - SAAT,
      macZamani: MAC,
      cikisPenceresiSaat: 0,
      gecCikisCezasiSn: 8,
    });
    expect(erken.gecCikis).toBe(false);
  });
});
```

- [ ] **Step 2: Testleri çalıştır, başarısız olduklarını gör**

Run: `npm test -- src/lib/poll/cikis.test.ts`
Expected: FAIL — `Failed to resolve import "./cikis"`

- [ ] **Step 3: Uygulamayı yaz**

`src/lib/poll/cikis.ts`:

```ts
const SAAT_MS = 60 * 60 * 1000;

/**
 * Bir cikisin serbest pencere icinde mi yoksa gec mi oldugunu belirler.
 * Pencere mac saatinden geriye sayar: mac saatine `cikisPenceresiSaat` kala kapanir.
 * Sinir aninda yapilan cikis gec sayilir.
 */
export function cikisiDegerlendir({
  simdi,
  macZamani,
  cikisPenceresiSaat,
  gecCikisCezasiSn,
}: {
  simdi: number;
  macZamani: number;
  cikisPenceresiSaat: number;
  gecCikisCezasiSn: number;
}): { gecCikis: boolean; cezaSn: number } {
  const pencereKapanis = macZamani - cikisPenceresiSaat * SAAT_MS;
  const gecCikis = simdi >= pencereKapanis;

  return { gecCikis, cezaSn: gecCikis ? gecCikisCezasiSn : 0 };
}
```

- [ ] **Step 4: Testleri çalıştır, geçtiklerini gör**

Run: `npm test -- src/lib/poll/cikis.test.ts`
Expected: PASS — 6 test geçti

- [ ] **Step 5: Commit**

```bash
git add src/lib/poll/cikis.ts src/lib/poll/cikis.test.ts
git commit -m "feat: cikis penceresi ve gec cikis cezasi kurali"
```

---

## Task 6: Bekleyen ceza/ödüllerin toplanması

Spec kuralı: ceza/ödül oyuncunun **katıldığı ilk ankette** uygulanır ve orada tükenir; girmezse bekler. Birden fazla bekleyen varsa toplanır.

**Files:**
- Create: `src/lib/poll/ofset.ts`
- Test: `src/lib/poll/ofset.test.ts`

**Interfaces:**
- Consumes: yok (saf fonksiyon)
- Produces:
  - `interface BekleyenOfset { id: string; oyuncuId: string; saniye: number }`
  - `function toplamOfset(bekleyenler: BekleyenOfset[]): number`
  - `function tuketilecekIdler(bekleyenler: BekleyenOfset[]): string[]`

- [ ] **Step 1: Başarısız testleri yaz**

`src/lib/poll/ofset.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { toplamOfset, tuketilecekIdler } from './ofset';
import type { BekleyenOfset } from './ofset';

const of = (id: string, saniye: number): BekleyenOfset => ({
  id,
  oyuncuId: 'oyuncu-1',
  saniye,
});

describe('toplamOfset', () => {
  it('bekleyen yoksa sifir doner', () => {
    expect(toplamOfset([])).toBe(0);
  });

  it('tek cezayi aynen doner', () => {
    expect(toplamOfset([of('a', 8)])).toBe(8);
  });

  it('birden fazla cezayi toplar', () => {
    expect(toplamOfset([of('a', 8), of('b', 10)])).toBe(18);
  });

  it('ceza ve odulu birbirine mahsup eder', () => {
    expect(toplamOfset([of('a', 8), of('b', -10)])).toBe(-2);
  });

  it('tam mahsupta sifir doner', () => {
    expect(toplamOfset([of('a', 10), of('b', -10)])).toBe(0);
  });
});

describe('tuketilecekIdler', () => {
  it('bekleyen yoksa bos dizi doner', () => {
    expect(tuketilecekIdler([])).toEqual([]);
  });

  it('net ofset sifir olsa bile tum bekleyenleri tuketir', () => {
    // Ceza ve odul birbirini goturse de ikisi de kullanilmis sayilir,
    // bir sonraki ankete devretmez.
    expect(tuketilecekIdler([of('a', 10), of('b', -10)])).toEqual(['a', 'b']);
  });

  it('bekleyen tum kayitlarin kimliklerini doner', () => {
    expect(tuketilecekIdler([of('a', 8), of('b', -3), of('c', 5)]))
      .toEqual(['a', 'b', 'c']);
  });
});
```

- [ ] **Step 2: Testleri çalıştır, başarısız olduklarını gör**

Run: `npm test -- src/lib/poll/ofset.test.ts`
Expected: FAIL — `Failed to resolve import "./ofset"`

- [ ] **Step 3: Uygulamayı yaz**

`src/lib/poll/ofset.ts`:

```ts
/** Henuz hicbir ankette kullanilmamis ceza/odul kaydi. Pozitif ceza, negatif odul. */
export interface BekleyenOfset {
  id: string;
  oyuncuId: string;
  saniye: number;
}

/** Bekleyen tum ceza ve odulleri tek bir ofset degerine indirger. */
export function toplamOfset(bekleyenler: BekleyenOfset[]): number {
  return bekleyenler.reduce((toplam, o) => toplam + o.saniye, 0);
}

/**
 * Ankete girisle birlikte tuketilecek kayitlarin id'leri.
 * Net ofset sifir cikmis olsa bile tum kayitlar tuketilir; devretmezler.
 */
export function tuketilecekIdler(bekleyenler: BekleyenOfset[]): string[] {
  return bekleyenler.map((o) => o.id);
}
```

- [ ] **Step 4: Testleri çalıştır, geçtiklerini gör**

Run: `npm test -- src/lib/poll/ofset.test.ts`
Expected: PASS — 8 test geçti

- [ ] **Step 5: Commit**

```bash
git add src/lib/poll/ofset.ts src/lib/poll/ofset.test.ts
git commit -m "feat: bekleyen ceza/odul toplama ve tuketme kurali"
```

---

## Task 7: Google ile giriş ve onay akışı

**Files:**
- Create: `src/lib/supabase/server.ts`, `src/lib/supabase/client.ts`, `src/lib/supabase/middleware.ts`
- Create: `src/middleware.ts`
- Create: `src/app/giris/page.tsx`, `src/app/auth/callback/route.ts`, `src/app/onay-bekliyor/page.tsx`
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: Task 3'ten `profiles` tablosu ve otomatik profil tetikleyicisi
- Produces:
  - `async function sunucuIstemcisi(): Promise<SupabaseClient>` — `src/lib/supabase/server.ts`
  - `function tarayiciIstemcisi(): SupabaseClient` — `src/lib/supabase/client.ts`
  - `async function aktifProfil(): Promise<{ id: string; ad: string; rol: 'admin'|'oyuncu'; durum: 'onay_bekliyor'|'aktif'|'pasif' } | null>` — `src/lib/supabase/server.ts`

- [ ] **Step 1: Supabase paketlerini kur**

```bash
npm install @supabase/supabase-js @supabase/ssr
```

- [ ] **Step 2: Supabase panelinde Google sağlayıcısını aç**

Authentication → Providers → Google'ı etkinleştir. Google Cloud Console'da OAuth istemcisi oluştur, yönlendirme adresi olarak Supabase'in verdiği callback URL'sini gir. Client ID ve Secret'ı Supabase'e yapıştır.

Authentication → URL Configuration → Site URL: geliştirme için `http://localhost:3000`, Redirect URLs listesine `http://localhost:3000/auth/callback` ekle.

- [ ] **Step 3: Sunucu istemcisini yaz**

`src/lib/supabase/server.ts`:

```ts
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
```

- [ ] **Step 4: Tarayıcı istemcisini yaz**

`src/lib/supabase/client.ts`:

```ts
import { createBrowserClient } from '@supabase/ssr';

/** Yalnizca Realtime aboneligi ve giris akisi icin. Siralama hesabi yapmaz. */
export function tarayiciIstemcisi() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
```

- [ ] **Step 5: Oturum tazeleyen middleware'i yaz**

`src/lib/supabase/middleware.ts`:

```ts
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function oturumuTazele(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  await supabase.auth.getUser();
  return response;
}
```

`src/middleware.ts`:

```ts
import type { NextRequest } from 'next/server';
import { oturumuTazele } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  return oturumuTazele(request);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|webp)$).*)'],
};
```

- [ ] **Step 6: Giriş sayfasını ve callback'i yaz**

`src/app/giris/page.tsx`:

```tsx
'use client';

import { tarayiciIstemcisi } from '@/lib/supabase/client';

export default function GirisSayfasi() {
  async function googleIleGir() {
    const supabase = tarayiciIstemcisi();
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 p-6">
      <h1 className="text-2xl font-semibold">Halı Saha</h1>
      <button
        onClick={googleIleGir}
        className="rounded-lg bg-black px-6 py-3 text-white"
      >
        Google ile giriş yap
      </button>
    </main>
  );
}
```

`src/app/auth/callback/route.ts`:

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { sunucuIstemcisi } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');

  if (code) {
    const supabase = await sunucuIstemcisi();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}/`);
  }

  return NextResponse.redirect(`${origin}/giris?hata=1`);
}
```

- [ ] **Step 7: Onay bekliyor sayfasını yaz**

`src/app/onay-bekliyor/page.tsx`:

```tsx
export default function OnayBekliyor() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-semibold">Hesabın onay bekliyor</h1>
      <p className="text-gray-600">
        Yöneticiler seni onayladıktan sonra ankete girebilirsin.
      </p>
    </main>
  );
}
```

- [ ] **Step 8: Ana sayfayı yönlendirme yapacak şekilde yaz**

`src/app/page.tsx`:

```tsx
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
```

- [ ] **Step 9: Akışı elle doğrula**

Run: `npm run dev`

Sırayla doğrula:
1. `http://localhost:3000` → `/giris` sayfasına yönlendiriyor
2. Google ile giriş → geri dönüyor, `/onay-bekliyor` sayfasına düşüyor
3. Supabase panelinde `profiles` tablosunda yeni satır var, `durum = 'onay_bekliyor'`
4. SQL Editor'de kendini admin yap:
   ```sql
   update profiles set durum = 'aktif', rol = 'admin' where id = '<kendi_id>';
   ```
5. Sayfayı yenile → "Merhaba <ad>" görünüyor

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: Google ile giris, oturum yonetimi ve uye onay akisi"
```

---

## Task 8: Anket ekranı — giriş, çıkış, sıralı liste

**Files:**
- Create: `src/lib/db/anket.ts`
- Create: `src/app/anket/[macId]/page.tsx`
- Create: `src/app/anket/[macId]/actions.ts`
- Create: `src/app/anket/[macId]/AnketListesi.tsx`
- Create: `supabase/migrations/0003_ofset_koruma.sql`
- Create: `supabase/migrations/0004_rpc.sql`

**Interfaces:**
- Consumes: `anketiSirala` (Task 4), `cikisiDegerlendir` (Task 5), `toplamOfset` / `tuketilecekIdler` (Task 6), `sunucuIstemcisi` / `aktifProfil` (Task 7)
- Produces:
  - `interface AnketSatiri { oyuncuId: string; ad: string; mevki: Mevki | null; tip: GirisTipi; sira: number; konum: 'kadro' | 'yedek' }`
  - `async function anketiGetir(macId: string): Promise<{ mac: MacOzet; satirlar: AnketSatiri[] } | null>` — `src/lib/db/anket.ts`
  - `async function anketeGir(macId: string): Promise<void>` — server action
  - `async function anketenCik(macId: string): Promise<void>` — server action
  - SQL: `public.ankete_gir(p_mac_id uuid, p_ofset int)`, `public.anketten_cik(p_mac_id uuid, p_oyuncu_id uuid, p_gec_cikis boolean, p_ceza_sn int)`

- [ ] **Step 1: Ofset korumasını veritabanına ekle**

Task 3'te açık bırakılan sınırı kapatıyoruz: oyuncu kendi satırını güncellerken `ofset_sn`, `tip` ve `vip_sira` alanlarını değiştiremez.

`supabase/migrations/0003_ofset_koruma.sql`:

```sql
-- Oyuncu kendi anket satirini guncellerken yalnizca cikis_zamani alanini degistirebilir.
-- Admin (service_role veya rol='admin') bu kisitin disindadir.
create or replace function match_entries_oyuncu_korumasi()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Sistem RPC'leri (ankete_gir, anketten_cik) islem basinda app.sistem_islemi
  -- bayragini set eder ve bu kisittan muaf tutulur. Bayrak islem sonunda duser.
  if public.is_admin()
     or coalesce(current_setting('app.sistem_islemi', true), '0') = '1' then
    return new;
  end if;

  if new.tip <> old.tip
     or new.ofset_sn <> old.ofset_sn
     or new.vip_sira is distinct from old.vip_sira
     or new.giris_zamani <> old.giris_zamani
     or new.oyuncu_id <> old.oyuncu_id
     or new.mac_id <> old.mac_id then
    raise exception 'Bu alanlari yalnizca yonetici degistirebilir';
  end if;

  return new;
end;
$$;

create trigger match_entries_oyuncu_korumasi_trg
  before update on match_entries
  for each row execute function match_entries_oyuncu_korumasi();
```

SQL Editor'de çalıştır.

- [ ] **Step 2: Veri katmanını yaz**

`src/lib/db/anket.ts`:

```ts
import { sunucuIstemcisi } from '@/lib/supabase/server';
import { anketiSirala } from '@/lib/poll/sirala';
import type { AnketGirisi, GirisTipi, Mevki } from '@/lib/poll/types';

export interface MacOzet {
  id: string;
  macZamani: string;
  saha: string;
  durum: 'anket_acik' | 'kadro_kesin' | 'oynandi' | 'tamamlandi';
  kadroBoyutu: number;
  anketAcilis: string;
  cikisPenceresiSaat: number;
  gecCikisCezasiSn: number;
}

export interface AnketSatiri {
  oyuncuId: string;
  ad: string;
  mevki: Mevki | null;
  tip: GirisTipi;
  sira: number;
  konum: 'kadro' | 'yedek';
}

/** Bir macin anket listesini sunucuda hesaplayip sirali dondurur. */
export async function anketiGetir(
  macId: string,
): Promise<{ mac: MacOzet; satirlar: AnketSatiri[] } | null> {
  const supabase = await sunucuIstemcisi();

  const { data: macRow } = await supabase
    .from('matches')
    .select('id, mac_zamani, saha, durum, kadro_boyutu, anket_acilis, cikis_penceresi_saat, gec_cikis_cezasi_sn')
    .eq('id', macId)
    .single();

  if (!macRow) return null;

  const { data: girisRows } = await supabase
    .from('match_entries')
    .select('oyuncu_id, tip, giris_zamani, ofset_sn, vip_sira, cikis_zamani, profiles(ad, mevki)')
    .eq('mac_id', macId);

  const rows = girisRows ?? [];

  const girisler: AnketGirisi[] = rows.map((r) => ({
    oyuncuId: r.oyuncu_id as string,
    tip: r.tip as GirisTipi,
    girisZamani: new Date(r.giris_zamani as string).getTime(),
    ofsetSn: r.ofset_sn as number,
    vipSira: r.vip_sira as number | null,
    cikisZamani: r.cikis_zamani ? new Date(r.cikis_zamani as string).getTime() : null,
  }));

  const sirali = anketiSirala({
    girisler,
    anketAcilis: new Date(macRow.anket_acilis as string).getTime(),
    kadroBoyutu: macRow.kadro_boyutu as number,
  });

  const profilAd = new Map<string, { ad: string; mevki: Mevki | null }>(
    rows.map((r) => {
      const p = r.profiles as unknown as { ad: string; mevki: Mevki | null };
      return [r.oyuncu_id as string, { ad: p?.ad ?? '', mevki: p?.mevki ?? null }];
    }),
  );

  return {
    mac: {
      id: macRow.id as string,
      macZamani: macRow.mac_zamani as string,
      saha: macRow.saha as string,
      durum: macRow.durum as MacOzet['durum'],
      kadroBoyutu: macRow.kadro_boyutu as number,
      anketAcilis: macRow.anket_acilis as string,
      cikisPenceresiSaat: macRow.cikis_penceresi_saat as number,
      gecCikisCezasiSn: macRow.gec_cikis_cezasi_sn as number,
    },
    satirlar: sirali.map((s) => ({
      oyuncuId: s.oyuncuId,
      ad: profilAd.get(s.oyuncuId)?.ad ?? '',
      mevki: profilAd.get(s.oyuncuId)?.mevki ?? null,
      tip: s.tip,
      sira: s.sira,
      konum: s.konum,
    })),
  };
}
```

- [ ] **Step 3: Server action'ları yaz**

`src/app/anket/[macId]/actions.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { sunucuIstemcisi, aktifProfil } from '@/lib/supabase/server';
import { cikisiDegerlendir } from '@/lib/poll/cikis';
import { toplamOfset, tuketilecekIdler } from '@/lib/poll/ofset';

/**
 * Ankete giris. Bekleyen ceza/odulleri toplayip ofset olarak yazar ve tuketir.
 * Giris zamanini veritabani tetikleyicisi sunucu saatiyle yazar.
 */
export async function anketeGir(macId: string) {
  const profil = await aktifProfil();
  if (!profil || profil.durum !== 'aktif') throw new Error('Yetkisiz');

  const supabase = await sunucuIstemcisi();

  const { data: bekleyenRows } = await supabase
    .from('adjustments')
    .select('id, oyuncu_id, saniye')
    .eq('oyuncu_id', profil.id)
    .is('kullanildigi_mac_id', null);

  const bekleyenler = (bekleyenRows ?? []).map((r) => ({
    id: r.id as string,
    oyuncuId: r.oyuncu_id as string,
    saniye: r.saniye as number,
  }));

  // Giris tek bir RPC ile yapilir: hem ilk giris hem de cikip tekrar girme
  // ayni yoldan gecer, ofset tek islemde yazilir.
  const { error } = await supabase.rpc('ankete_gir', {
    p_mac_id: macId,
    p_ofset: toplamOfset(bekleyenler),
  });
  if (error) throw new Error(error.message);

  const tuketilecek = tuketilecekIdler(bekleyenler);
  if (tuketilecek.length > 0) {
    await supabase
      .from('adjustments')
      .update({ kullanildigi_mac_id: macId })
      .in('id', tuketilecek);
  }

  revalidatePath(`/anket/${macId}`);
}

/** Anketten cikis. Pencere disindaysa bir sonraki ankete ceza yazar. */
export async function anketenCik(macId: string) {
  const profil = await aktifProfil();
  if (!profil || profil.durum !== 'aktif') throw new Error('Yetkisiz');

  const supabase = await sunucuIstemcisi();

  const { data: mac } = await supabase
    .from('matches')
    .select('mac_zamani, cikis_penceresi_saat, gec_cikis_cezasi_sn')
    .eq('id', macId)
    .single();
  if (!mac) throw new Error('Maç bulunamadı');

  const { gecCikis, cezaSn } = cikisiDegerlendir({
    simdi: Date.now(),
    macZamani: new Date(mac.mac_zamani as string).getTime(),
    cikisPenceresiSaat: mac.cikis_penceresi_saat as number,
    gecCikisCezasiSn: mac.gec_cikis_cezasi_sn as number,
  });

  await supabase.rpc('anketten_cik', {
    p_mac_id: macId,
    p_oyuncu_id: profil.id,
    p_gec_cikis: gecCikis,
    p_ceza_sn: cezaSn,
  });

  revalidatePath(`/anket/${macId}`);
}
```

- [ ] **Step 4: Action'ların ihtiyaç duyduğu RPC'leri yaz**

`supabase/migrations/0004_rpc.sql`:

```sql
-- Ankete giris. Ilk giris ve cikip tekrar girme ayni yoldan gecer.
-- Tekrar giriste giris zamani sifirlanir (yeni sira), tip korunur:
-- oncelikli oyuncu tekrar girdiginde yine oncelikli katmaninda kalir.
create or replace function public.ankete_gir(p_mac_id uuid, p_ofset int)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_oyuncu uuid := auth.uid();
begin
  if v_oyuncu is null or not public.is_aktif_uye() then
    raise exception 'Yetkisiz';
  end if;

  if not exists (
    select 1 from matches where id = p_mac_id and durum = 'anket_acik'
  ) then
    raise exception 'Anket kapali';
  end if;

  perform set_config('app.sistem_islemi', '1', true);

  insert into match_entries (mac_id, oyuncu_id, tip, ofset_sn)
  values (p_mac_id, v_oyuncu, 'normal', p_ofset)
  on conflict (mac_id, oyuncu_id) do update
     set cikis_zamani = null,
         gec_cikis    = false,
         giris_zamani = now(),
         ofset_sn     = p_ofset;
end;
$$;

-- Cikis ve gec cikis cezasini tek islemde yazar.
create or replace function public.anketten_cik(
  p_mac_id uuid, p_oyuncu_id uuid, p_gec_cikis boolean, p_ceza_sn int
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_oyuncu_id <> auth.uid() and not public.is_admin() then
    raise exception 'Yetkisiz';
  end if;

  update match_entries
     set cikis_zamani = now(), gec_cikis = p_gec_cikis
   where mac_id = p_mac_id and oyuncu_id = p_oyuncu_id and cikis_zamani is null;

  if p_gec_cikis and p_ceza_sn > 0 then
    insert into adjustments (oyuncu_id, saniye, sebep, kaynak_mac_id)
    values (p_oyuncu_id, p_ceza_sn, 'Geç çıkış', p_mac_id);
  end if;
end;
$$;

revoke all on function public.ankete_gir(uuid, int) from public;
revoke all on function public.anketten_cik(uuid, uuid, boolean, int) from public;
grant execute on function public.ankete_gir(uuid, int) to authenticated;
grant execute on function public.anketten_cik(uuid, uuid, boolean, int) to authenticated;
```

SQL Editor'de çalıştır.

- [ ] **Step 5: Liste bileşenini ve sayfayı yaz**

`src/app/anket/[macId]/AnketListesi.tsx`:

```tsx
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
```

`src/app/anket/[macId]/page.tsx`:

```tsx
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
```

- [ ] **Step 6: Derlemenin ve testlerin geçtiğini doğrula**

Run: `npm test && npm run build`
Expected: Tüm testler PASS, derleme başarılı

- [ ] **Step 7: Akışı elle doğrula**

SQL Editor'de bir sezon ve anket oluştur:

```sql
insert into seasons (ad, baslangic) values ('2026 Güz', current_date);
insert into matches (mac_zamani, saha, sezon_id, kisi_basi_ucret, son_odeme_gunu)
select now() + interval '3 days', 'Yeşil Vadi', id, 250, current_date + 5
from seasons where aktif returning id;
```

`npm run dev` ile `http://localhost:3000/anket/<mac_id>` adresine git ve doğrula:
1. "Ankete gir" → adın 1. sırada, Kadro bölümünde görünüyor
2. "Anketten çık" → liste boşalıyor
3. SQL Editor'de `select * from match_entries;` → `cikis_zamani` dolu, `gec_cikis` durumu doğru
4. **Tekrar "Ankete gir"** → hata vermeden yeniden listeye giriyor (benzersizlik kısıtına takılmıyor), `select giris_zamani, cikis_zamani from match_entries;` → `cikis_zamani` boş, `giris_zamani` tazelenmiş
5. Maç saatini yaklaştırıp geç çıkışı dene:
   ```sql
   update matches set mac_zamani = now() + interval '2 hours' where id = '<mac_id>';
   ```
   Tekrar gir ve çık → `select * from adjustments;` ile +8 sn ceza kaydı oluştuğunu gör

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: anket ekrani - giris, cikis, sunucu tarafi sirali liste"
```

---

## Task 9: Canlı güncelleme

**Files:**
- Create: `src/app/anket/[macId]/CanliYenile.tsx`
- Modify: `src/app/anket/[macId]/page.tsx`
- Modify: Supabase panelinde Realtime yayını

**Interfaces:**
- Consumes: `tarayiciIstemcisi` (Task 7)
- Produces: `function CanliYenile({ macId }: { macId: string }): JSX.Element` — görünmez bileşen, `match_entries` değişince `router.refresh()` çağırır

- [ ] **Step 1: Realtime yayınını aç**

Supabase paneli → Database → Replication → `match_entries` tablosunu yayına ekle.

- [ ] **Step 2: Yenileme bileşenini yaz**

`src/app/anket/[macId]/CanliYenile.tsx`:

```tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { tarayiciIstemcisi } from '@/lib/supabase/client';

/**
 * match_entries tablosunda bu maca ait bir degisiklik oldugunda sayfayi tazeler.
 * Siralamayi yeniden hesaplamaz; sunucudan yeni listeyi ister.
 */
export function CanliYenile({ macId }: { macId: string }) {
  const router = useRouter();

  useEffect(() => {
    const supabase = tarayiciIstemcisi();

    const kanal = supabase
      .channel(`anket-${macId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'match_entries', filter: `mac_id=eq.${macId}` },
        () => router.refresh(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(kanal);
    };
  }, [macId, router]);

  return null;
}
```

- [ ] **Step 3: Bileşeni anket sayfasına ekle**

`src/app/anket/[macId]/page.tsx` içinde `AnketListesi` satırının hemen üstüne ekle:

```tsx
<CanliYenile macId={macId} />
```

Dosyanın üstüne import ekle:

```tsx
import { CanliYenile } from './CanliYenile';
```

- [ ] **Step 4: Canlı güncellemeyi elle doğrula**

İki farklı tarayıcı penceresinde (biri normal, biri gizli) farklı hesaplarla aynı ankete gir. Birinci pencerede "Ankete gir" → ikinci penceredeki liste sayfa yenilemeden güncelleniyor.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: Realtime ile canli anket listesi"
```

---

## Task 10: Admin paneli

**Files:**
- Create: `src/app/admin/page.tsx`
- Create: `src/app/admin/actions.ts`
- Create: `src/lib/supabase/adminKontrol.ts`

**Interfaces:**
- Consumes: `aktifProfil` / `sunucuIstemcisi` (Task 7)
- Produces:
  - `async function adminGerekli(): Promise<Profil>` — admin değilse `/` adresine yönlendirir
  - Server action'lar: `uyeyiOnayla(oyuncuId)`, `anketAc(form)`, `vipEkle(macId, oyuncuId)`, `oncelikliYap(macId, oyuncuId)`, `cezaVer(oyuncuId, saniye, sebep)`

- [ ] **Step 1: Admin kontrol yardımcısını yaz**

`src/lib/supabase/adminKontrol.ts`:

```ts
import { redirect } from 'next/navigation';
import { aktifProfil, type Profil } from '@/lib/supabase/server';

/** Admin degilse ana sayfaya yonlendirir. Tum admin sayfa ve action'larinda ilk satir. */
export async function adminGerekli(): Promise<Profil> {
  const profil = await aktifProfil();
  if (!profil || profil.durum !== 'aktif' || profil.rol !== 'admin') redirect('/');
  return profil;
}
```

- [ ] **Step 2: Admin action'larını yaz**

`src/app/admin/actions.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { sunucuIstemcisi } from '@/lib/supabase/server';
import { adminGerekli } from '@/lib/supabase/adminKontrol';

export async function uyeyiOnayla(oyuncuId: string) {
  await adminGerekli();
  const supabase = await sunucuIstemcisi();
  await supabase.from('profiles').update({ durum: 'aktif' }).eq('id', oyuncuId);
  revalidatePath('/admin');
}

export async function anketAc(formData: FormData) {
  await adminGerekli();
  const supabase = await sunucuIstemcisi();

  const { data: ayar } = await supabase.from('settings').select('*').single();
  const { data: sezon } = await supabase.from('seasons').select('id').eq('aktif', true).single();

  await supabase.from('matches').insert({
    mac_zamani: formData.get('macZamani') as string,
    saha: (formData.get('saha') as string) ?? '',
    sezon_id: sezon?.id ?? null,
    kadro_boyutu: Number(formData.get('kadroBoyutu') ?? ayar?.kadro_boyutu ?? 14),
    kisi_basi_ucret: Number(formData.get('kisiBasiUcret') ?? ayar?.kisi_basi_ucret ?? 0),
    cikis_penceresi_saat: Number(formData.get('cikisPenceresi') ?? ayar?.cikis_penceresi_saat ?? 20),
    gec_cikis_cezasi_sn: Number(formData.get('gecCikisCezasi') ?? ayar?.gec_cikis_cezasi_sn ?? 8),
    son_odeme_gunu: (formData.get('sonOdemeGunu') as string) || null,
  });

  revalidatePath('/admin');
}

/** VIP olarak dogrudan kadroya ekler. vipSira mevcut VIP sayisinin bir fazlasidir. */
export async function vipEkle(macId: string, oyuncuId: string) {
  await adminGerekli();
  const supabase = await sunucuIstemcisi();

  const { count } = await supabase
    .from('match_entries')
    .select('id', { count: 'exact', head: true })
    .eq('mac_id', macId)
    .eq('tip', 'vip');

  await supabase.from('match_entries').upsert(
    { mac_id: macId, oyuncu_id: oyuncuId, tip: 'vip', vip_sira: (count ?? 0) + 1, cikis_zamani: null },
    { onConflict: 'mac_id,oyuncu_id' },
  );

  revalidatePath(`/anket/${macId}`);
  revalidatePath('/admin');
}

/** Ankete girmis bir oyuncuyu oncelikli katmanina tasir. */
export async function oncelikliYap(macId: string, oyuncuId: string) {
  await adminGerekli();
  const supabase = await sunucuIstemcisi();
  await supabase
    .from('match_entries')
    .update({ tip: 'oncelikli' })
    .eq('mac_id', macId)
    .eq('oyuncu_id', oyuncuId);
  revalidatePath(`/anket/${macId}`);
}

/** Pozitif saniye ceza, negatif odul. Oyuncunun katildigi ilk ankette uygulanir. */
export async function cezaVer(oyuncuId: string, saniye: number, sebep: string) {
  await adminGerekli();
  if (saniye === 0) throw new Error('Sıfır ceza yazılamaz');
  const supabase = await sunucuIstemcisi();
  await supabase.from('adjustments').insert({ oyuncu_id: oyuncuId, saniye, sebep });
  revalidatePath('/admin');
}
```

- [ ] **Step 3: Admin sayfasını yaz**

`src/app/admin/page.tsx`:

```tsx
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
```

- [ ] **Step 4: Yetki kontrolünü elle doğrula**

1. Admin hesabıyla `/admin` → sayfa açılıyor
2. SQL Editor'de kendini oyuncu yap: `update profiles set rol = 'oyuncu' where id = '<id>';`
3. `/admin` → ana sayfaya yönlendiriyor
4. Kendini tekrar admin yap

- [ ] **Step 5: Testlerin ve derlemenin geçtiğini doğrula**

Run: `npm test && npm run build`
Expected: Tüm testler PASS, derleme başarılı

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: admin paneli - uye onayi, anket acma, ceza/odul, VIP atama"
```

---

## Task 11: Kadroyu kesinleştirme

**Files:**
- Create: `src/app/anket/[macId]/kadro/page.tsx`
- Create: `src/app/anket/[macId]/kadro/actions.ts`
- Create: `supabase/migrations/0005_match_squad.sql`

**Interfaces:**
- Consumes: `anketiGetir` (Task 8), `adminGerekli` (Task 10)
- Produces:
  - `match_squad` tablosu
  - `async function kadroyuKesinlestir(macId: string, oyuncuIdler: string[]): Promise<void>` — server action

- [ ] **Step 1: Kesin kadro tablosunu yaz**

`supabase/migrations/0005_match_squad.sql`:

```sql
create type takim_t as enum ('siyah','beyaz');

create table match_squad (
  id        uuid primary key default gen_random_uuid(),
  mac_id    uuid not null references matches(id) on delete cascade,
  oyuncu_id uuid not null references profiles(id) on delete cascade,
  takim     takim_t,
  unique (mac_id, oyuncu_id)
);
create index match_squad_mac_idx on match_squad (mac_id);

alter table match_squad enable row level security;
create policy match_squad_select on match_squad for select using (is_aktif_uye());
create policy match_squad_all    on match_squad for all    using (is_admin()) with check (is_admin());
```

SQL Editor'de çalıştır.

- [ ] **Step 2: Kesinleştirme action'ını yaz**

`src/app/anket/[macId]/kadro/actions.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { sunucuIstemcisi } from '@/lib/supabase/server';
import { adminGerekli } from '@/lib/supabase/adminKontrol';

/**
 * Sahada fiilen olan oyuncularla kesin kadroyu yazar ve maci kadro_kesin durumuna gecirir.
 * Anket listesinde olmayan oyuncular da eklenebilir.
 */
export async function kadroyuKesinlestir(macId: string, oyuncuIdler: string[]) {
  await adminGerekli();
  const supabase = await sunucuIstemcisi();

  await supabase.from('match_squad').delete().eq('mac_id', macId);

  if (oyuncuIdler.length > 0) {
    await supabase.from('match_squad').insert(
      oyuncuIdler.map((oyuncuId) => ({ mac_id: macId, oyuncu_id: oyuncuId })),
    );
  }

  await supabase.from('matches').update({ durum: 'kadro_kesin' }).eq('id', macId);

  revalidatePath(`/anket/${macId}`);
  revalidatePath(`/anket/${macId}/kadro`);
}
```

- [ ] **Step 3: Kesinleştirme ekranını yaz**

`src/app/anket/[macId]/kadro/page.tsx`:

```tsx
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
```

- [ ] **Step 4: Akışı elle doğrula**

`/anket/<macId>/kadro` adresine git:
1. Anket kadrosundaki oyuncular önceden işaretli geliyor
2. Bir oyuncunun işaretini kaldır, listede olmayan birini işaretle, kaydet
3. SQL Editor'de `select * from match_squad;` → seçimlerin doğru yazıldığını gör
4. `select durum from matches where id = '<macId>';` → `kadro_kesin`

- [ ] **Step 5: Testlerin ve derlemenin geçtiğini doğrula**

Run: `npm test && npm run build`
Expected: Tüm testler PASS, derleme başarılı

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: kadroyu kesinlestirme ekrani ve match_squad tablosu"
```

---

## Task 12: Ana sayfa, PWA ve Vercel dağıtımı

**Files:**
- Modify: `src/app/page.tsx`
- Create: `public/manifest.json`
- Modify: `src/app/layout.tsx`

**Interfaces:**
- Consumes: `aktifProfil` (Task 7), `anketiGetir` (Task 8)
- Produces: yayında çalışan uygulama

- [ ] **Step 1: Ana sayfayı aktif anketi gösterecek şekilde yaz**

`src/app/page.tsx`:

```tsx
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
```

- [ ] **Step 2: PWA manifest'ini yaz**

`public/manifest.json`:

```json
{
  "name": "Halı Saha",
  "short_name": "Halı Saha",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#111111",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

`public/icon-192.png` ve `public/icon-512.png` dosyalarını ekle (düz renk üzerine top ikonu yeterli).

- [ ] **Step 3: Manifest'i layout'a bağla**

`src/app/layout.tsx` içindeki `metadata` nesnesini şununla değiştir:

```tsx
export const metadata = {
  title: 'Halı Saha',
  description: 'Haftalık halı saha organizasyonu',
  manifest: '/manifest.json',
};

export const viewport = {
  themeColor: '#111111',
  width: 'device-width',
  initialScale: 1,
};
```

- [ ] **Step 4: Vercel'e dağıt**

```bash
gh repo create hali-saha --private --source=. --push
```

[vercel.com](https://vercel.com) üzerinde bu depoyu içe aktar. Environment Variables bölümüne `.env.local` içindeki üç değişkeni ekle. Dağıtımı başlat.

- [ ] **Step 5: Supabase yönlendirme adreslerini güncelle**

Supabase paneli → Authentication → URL Configuration:
- Site URL: Vercel'in verdiği adres (`https://<proje>.vercel.app`)
- Redirect URLs listesine `https://<proje>.vercel.app/auth/callback` ekle

- [ ] **Step 6: Yayındaki uygulamayı doğrula**

1. Vercel adresine telefondan gir → Google ile giriş çalışıyor
2. Onay bekleyen olarak düşüyor, admin hesabından onayla
3. Ankete gir → liste güncelleniyor
4. "Ana ekrana ekle" → uygulama ikon olarak ekleniyor

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: ana sayfa, PWA manifesti ve Vercel dagitimi"
```

---

## Plan 1 Tamamlandığında Elde Edilen

Çalışan bir uygulama: onaylı üyeler Google ile giriyor, anket açılıyor, oyuncular giriyor ve çıkıyor, sıralama kurallı ve tek merkezden hesaplanıyor, ceza/ödül işliyor, yedek terfisi otomatik, admin VIP/öncelikli atıyor ve kadroyu kesinleştiriyor, liste canlı güncelleniyor, telefonda uygulama gibi çalışıyor.

## Sonraki Planlar

- **Plan 2 — Takımlar ve Puanlama:** siyah/beyaz dengeli dağıtım önerisi, skor girişi, puan hesabı, sezon yönetimi, istatistik tablosu, elle puan müdahalesi ve kaydı.
- **Plan 3 — Ödeme ve Muhasebe:** ödeme listesi, son ödeme günü ve Vercel Cron ile otomatik tamamlama, borç/alacak defteri, maç bazlı gelir/gider, sponsor ve otomatik VIP, kümülatif kasa.
