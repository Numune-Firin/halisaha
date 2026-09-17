-- ORNEK (DEMO) VERIYI SILER — supabase/demo_seed.sql'in yazdigi her seyi kaldirir.
--
-- Maclar "Demo Saha" sahasindan, aday oyuncular isim listesinden bulunur.
-- Mac silinince anket girisleri ve kadro satirlari cascade ile gider.
-- Sezon silinmez: demo disinda da kullaniliyor olabilir.

delete from matches where venue = 'Demo Saha';

-- Aday oyuncu yalnizca hicbir maca bagli kalmadiysa silinir: ayni isimli
-- gercek bir oyuncu varsa ve mac gecmisi varsa dokunulmaz.
delete from guest_players g
 where not exists (select 1 from match_entries e where e.guest_id = g.id)
   and not exists (select 1 from match_squad  s where s.guest_id = g.id)
   and g.full_name = any (array[
   'Ahmet Yılmaz','Mehmet Demir','Mustafa Kaya','Ali Çelik',
   'Hüseyin Şahin','İbrahim Yıldız','Osman Aydın','Emre Öztürk',
   'Burak Arslan','Kerem Doğan','Serkan Koç','Tolga Kurt','Onur Şen',
   'Barış Aksoy','Cem Polat','Uğur Taş'
 ]);

select 'Demo veri silindi' as sonuc,
       (select count(*) from matches where venue = 'Demo Saha') as kalan_demo_mac;
