# Halı Saha Sistemi — Tasarım Dokümanı

Tarih: 2026-09-15
Durum: Onaylandı, uygulama planı bekliyor

## 1. Amaç ve Kapsam

Haftalık halı saha maçı oynayan kapalı bir grubun organizasyonunu tek yerde
toplayan web uygulaması. Çözdüğü problemler:

- Kimin oynayacağı WhatsApp mesaj sırasından değil, kurallı bir anket sırasından belli olur.
- Anketten çıkanın yerine yedek otomatik geçer.
- Maç sonuçları puan tablosuna işler, kimse kimin kaç maç oynadığını tartışmaz.
- Kim ödedi, kim ödemedi, kasada ne var — herkese açık.

Kapsam dışı (şimdilik): gol/asist istatistiği, oyuncu güç reytingi, anlık push
bildirimi, saha işletmecisiyle entegrasyon, online ödeme.

## 2. Roller

| Rol | Yetki |
|-----|-------|
| Admin | Her şey: anket açma, VIP/öncelikli atama, ceza/ödül, kadro ve takım düzenleme, skor, ödeme, muhasebe, sezon, üye onayı |
| Oyuncu | Ankete girme/çıkma, listeleri ve tabloları görme, kendi profilini düzenleme |

Birden fazla admin olabilir.

## 3. Üyelik

- Giriş: **Google ile giriş** (Supabase Auth). E-posta/şifre ve SMS yok.
- Yeni kayıt `onay_bekliyor` durumunda oluşur. Admin onaylayana kadar hiçbir
  veri göremez, ankete giremez.
- Durumlar: `onay_bekliyor` → `aktif` → (gerekirse) `pasif`.
- Profil alanları: ad soyad, mevki (Kaleci / Defans / Orta saha / Forvet), avatar.

## 4. Anket ve Sıralama Motoru

### 4.1 Anket açılışı

Admin gün, saat ve sahayı seçerek anketi açar. Anket açılırken şu parametreler
**o maça kopyalanarak sabitlenir** (sonradan ayarlar değişse bile geçmiş maçlar
etkilenmez):

- Kadro boyutu (varsayılan 14, admin değiştirebilir)
- Kişi başı ücret (sabit tutar)
- Serbest çıkış penceresi (varsayılan: maç saatine 20 saat kala kapanır)
- Geç çıkış cezası (varsayılan +8 sn)
- Son ödeme günü

### 4.2 Üç katmanlı sıralama

```
[1] VIP bloğu       Ankete girmez. Admin doğrudan ekler.
                    Slot 1 ve 2 kaleci mevkili oyunculara ayrılmıştır.
                    Sponsor olan oyuncu bir sonraki ankete otomatik VIP gelir.
                    Sıra: admin'in ekleme sırası.

[2] Öncelikliler    Ankete normal girer, zaman sırası kendisini bağlamaz.
                    VIP bloğunun hemen altına oturur.
                    Kendi aralarında ankete giriş sırasına göre dizilir.

[3] Normaller       efektif_zaman = gerçek_giriş + ceza_sn − ödül_sn
                    Alt sınır: anket açılış zamanı (ödül bunun öncesine taşımaz)
                    Eşitlik bozucu: gerçek giriş zamanı
```

İlk N kişi (N = kadro boyutu, varsayılan 14) **asıl kadro**, sonrası **yedek**.
Yedekler de sıralıdır; terfi her zaman yedek listesinin tepesinden yapılır.

Oyuncu anketten çıkıp tekrar girerse **yeni giriş zamanıyla** sıraya girer;
eski sırası korunmaz. (Öncelikli oyuncu tekrar girdiğinde yine öncelikli
katmanına, o katmanın sonuna yerleşir.)

### 4.3 Ceza ve ödül

- Birim: saniye. Ceza `+` (sırayı geriye atar), ödül `−` (öne çeker).
- **Tek kullanımlık**: oyuncunun **katıldığı ilk ankette** uygulanır ve orada
  tükenir. Oyuncu bir sonraki ankete hiç girmezse ceza/ödül düşmez, girdiği
  ilk ankete kadar bekler. Kalıcı ceza istenirse admin tekrar tanımlar.
- Bir oyuncuda aynı anda birden fazla bekleyen ceza/ödül varsa hepsi toplanarak
  tek ofset olarak uygulanır.
- İki kaynağı var:
  - Admin elle tanımlar (sebep notuyla).
  - Geç çıkış otomatik cezası (bkz. 4.4).

### 4.4 Çıkış ve yedek terfisi

| Durum | Sonuç |
|-------|-------|
| Serbest çıkış penceresi içinde çıkış | Cezasız. 1. yedek anında kadroya terfi eder. |
| Pencere kapandıktan sonra çıkış | Çıkış yine mümkün, terfi yine otomatik. Bir sonraki ankete otomatik ceza (varsayılan +8 sn) yazılır. |

Terfi ve liste güncellemeleri tüm açık ekranlara canlı yansır.

### 4.5 Kadroyu kesinleştirme

Anketten çıkmayıp gelmeyen ya da listede olmadığı halde gelen oyuncular
gerçekte oluyor. Bu yüzden maç öncesi ayrı bir adım var:

- Admin fiilen gelenleri işaretler, istediğini ekler/çıkarır.
- **Puanlar ve ödeme satırları bu kesin kadro üzerinden üretilir**, anket
  listesi üzerinden değil.

## 5. Takımlar

- Kesin kadro çıkınca sistem **dengeli bir öneri** üretir: her takıma birer
  kaleci, defans/orta saha/forvet mümkün olduğunca eşit dağıtılır.
- Öneri bağlayıcı değildir. Admin oyuncuyu diğer takıma taşır, kadro dışından
  birini dahil edebilir, "yeniden dağıt" ile başka öneri alır.
- Takımlar: **Siyah** ve **Beyaz**, kadro ikiye bölünür (14 kişide 7-7). Kadro
  boyutu tek sayıysa ya da admin kadro dışından oyuncu eklediyse takımlar eşit
  olmayabilir; sistem buna izin verir, uyarı gösterir.
- Kaydedilene kadar hiçbir şey kesinleşmez.
- Denge yalnızca mevkiye bakar. Oyuncu gücü/reytingi bilinçli olarak kapsam dışı;
  puan tablosu birikince "son N maç galibiyet oranı" ile geliştirilebilir.

## 6. Maç Sonucu ve Puanlama

### 6.1 Puan kuralı

```
Galip takımın oyuncuları  → 3 puan
Beraberlik                → her iki takıma 1 puan
Mağlup takım              → 0 puan
```

Admin skoru girer (örn. `Siyah 6 – 4 Beyaz`), sonuç skordan türetilir.
Puan yalnızca kesin kadrodaki oyunculara işler.

### 6.2 Puanların ne zaman işlendiği

Maç `oynandi` durumuna geçtikten sonra puanlar **hemen işlemez**. İki koşuldan
biri gerçekleşince işler:

1. Kadrodaki herkesin ödemesi tamamlanır, veya
2. Son ödeme günü dolar.

Hangisi önce olursa maç `tamamlandi` durumuna geçer ve puanlar tabloya yazılır.
Son gün dolduğunda ödemeyenler borç defterine yazılır; puanın işlemesi borcu
silmez.

### 6.3 İstatistikler

Oyuncu başına: oynadığı maç, galibiyet, beraberlik, mağlubiyet, toplam puan,
galibiyet yüzdesi. Sıralı genel tablo, tüm üyelere açık.

### 6.4 Elle müdahale

Admin puana ekleme/çıkarma yapabilir ve maç sonucunu düzeltebilir. Her elle
müdahale **sebep notuyla kayda geçer** ve tabloda işaretle görünür.

### 6.5 Sezon

- Puan tablosu sezon bazlıdır. Sezon başlangıç/bitişini **admin belirler**.
- "Yeni sezon başlat" denildiğinde eski tablo arşivlenir, yeni sezon sıfırdan
  başlar. Arşiv sezonlar görüntülenebilir.
- Borç defteri ve kasa sezondan bağımsızdır; sezon değişince sıfırlanmaz.

## 7. Ödeme

- Kesin kadro oluştuğu an, her oyuncu için o maça ait bir ödeme satırı doğar.
  Tutar = maça sabitlenen kişi başı ücret.
- Admin "ödedi" işaretler. Liste tüm üyelere açıktır.
- Son ödeme günü dolunca ödenmemiş satırlar otomatik borç yazılır.
- Sonradan ödeme: admin borcu kapatır.

## 8. Borç ve Alacak Defteri

Oyuncu başına tek bakiye, hareket bazlı:

| Kaynak | Yön |
|--------|-----|
| Ödemeyen oyuncu (otomatik) | Borç |
| Fazla ödeyen oyuncu (admin elle) | Alacak |
| Sonradan tahsilat (admin) | Borcu kapatır |

- Her hareket: tutar, tarih, açıklama, kaynak maç.
- Bakiyeler **ana sayfada herkese açık**.
- Eski borç, sonraki maçın ödeme tutarına **eklenmez** — ayrı defterde takip
  edilir, böylece maç muhasebesi o maçın parası olarak kalır.
- Borçlu oyuncu ankete **girebilir**; adının yanında borç rozeti görünür.

## 9. Muhasebe

Her maç için tek hesap sayfası:

```
GELİR    fiilen tahsil edilen kişi başı ücretler
       + sponsor katkısı
GİDER    saha ücreti
       + ikram ve diğer masraflar (kalem kalem, admin girer)
─────────────────────────────────────────────────────
FARK     o maçın +/− sonucu
KASA     tüm maç farklarının kümülatif toplamı (grup kasası)
```

- Sponsor kaydında sponsorun kim olduğu ve tutarı tutulur.
- **Sponsor oyuncu bir sonraki ankette otomatik VIP** olarak gelir; admin
  isterse VIP'ten çıkarabilir.
- Tüm muhasebe tüm üyelere açıktır.

## 10. Veri Modeli

```
profiles            ad, mevki, rol (admin/oyuncu), durum (onay_bekliyor/aktif/pasif), avatar
seasons             ad, başlangıç, bitiş, aktif mi
matches             tarih-saat, saha, durum, kadro boyutu, kişi başı ücret,
                    çıkış penceresi (saat), geç çıkış cezası (sn), anket açılış,
                    son ödeme günü, siyah skor, beyaz skor, sezon
match_entries       maç + oyuncu, tip (vip/oncelikli/normal), giriş zamanı,
                    uygulanan ofset (sn), efektif zaman, çıkış zamanı, geç çıkış mı
match_squad         kesin kadro: maç + oyuncu + takım (siyah/beyaz)
adjustments         ceza/ödül: oyuncu, saniye, sebep, kaynak maç, kullanıldığı maç
payments            maç + oyuncu + tutar + ödendi mi + ödeme tarihi
ledger              borç/alacak hareketleri: oyuncu, tutar, açıklama, kaynak maç, tarih
expenses            maç masraf kalemleri: kalem adı, tutar
sponsors            maç + sponsor oyuncu + tutar
point_adjustments   elle puan müdahalesi: oyuncu, sezon, puan, sebep, admin, tarih
settings            varsayılanlar: kadro boyutu, kişi başı ücret, çıkış penceresi, geç çıkış cezası
```

**Maç durumları:** `anket_acik` → `kadro_kesin` → `oynandi` → `tamamlandi`

## 11. Teknik Mimari

### 11.1 Yığın

- **Frontend:** Next.js (App Router), React, mobil öncelikli, PWA (telefona ikon).
- **Barındırma:** **Vercel ücretsiz paket.** Cloudflare Pages tercih edilmedi:
  Next.js'in sunucu tarafı özellikleri için ek uyarlama katmanı gerekiyor ve
  kırılgan. Maliyet yine 0 TL.
- **Veritabanı + Auth + Realtime:** Supabase ücretsiz paket (PostgreSQL 500 MB,
  Google OAuth, Realtime, pg_cron).

### 11.2 Sıralama nerede hesaplanır

Sıra hesabı **veritabanındaki tek bir fonksiyonda** yapılır. Tarayıcıda
hesaplanırsa kullanıcılar farklı listeler görür ve "ben 14'tüm" tartışması çıkar.

- Giriş zamanı **sunucu saatiyle** yazılır; telefon saati ileri olan avantaj kazanamaz.
- `(maç, oyuncu)` benzersizlik kısıtı ile aynı kişinin iki kez girmesi engellenir.
- Katman → efektif zaman → kadro/yedek ayrımı hep bu fonksiyondan çıkar.

### 11.3 Canlı güncelleme

Supabase Realtime ile anket listesi açık olan tüm ekranlarda anında güncellenir;
biri çıktığında terfi eden yedek sayfa yenilemeden görünür.

### 11.4 Zamanlanmış iş

"Son ödeme günü dolunca maçı tamamla ve borçları yaz" işi için:

- **Birincil:** Supabase `pg_cron` (ücretsiz pakete dahil), günde bir çalışır.
- **Yedek:** Sayfa her açıldığında süresi geçmiş maçlar kontrol edilip
  tamamlanır. Zamanlayıcı çalışmasa da sistem doğru duruma gelir.

### 11.5 Güvenlik

Supabase Row Level Security (RLS), veritabanı seviyesinde:

- Yalnız `aktif` üyeler veri okuyabilir.
- Oyuncu sadece kendi anket giriş/çıkışını yazabilir.
- Ceza/ödül, puan, ödeme, muhasebe, kadro, takım, sezon yazma yetkisi **yalnız admin**.
- Arayüzde butonu gizlemek yeterli sayılmaz; doğrudan API çağrısı da engellenir.

### 11.6 Bildirim

Ücretsiz pakette güvenilir push bildirimi yok. Bunun yerine: anket açılınca
admin'e hazır metin + link verilir, WhatsApp grubuna yapıştırılır.

## 12. Ekranlar

| Ekran | İçerik |
|-------|--------|
| Ana sayfa | Aktif anket özeti, borç/alacak listesi, grup kasası |
| Anket & kadro | Sıralı liste (mevki rozetleriyle), kadro/yedek ayrımı, gir/çık butonu |
| Takımlar | Siyah/Beyaz kadrolar, mevkiler, düzenleme (admin) |
| Maç sonucu | Skor girişi, sonuç özeti |
| Puan tablosu | Sezon bazlı sıralama: O, G, B, M, P, galibiyet % |
| Muhasebe | Maç bazlı gelir/gider/fark + kümülatif kasa |
| Profil | Ad, mevki, kendi istatistikleri, kendi bakiyesi |
| Admin paneli | Üye onayı, VIP/öncelikli atama, ceza/ödül, ödeme işaretleme, masraf/sponsor girişi, sezon yönetimi, ayarlar |

## 13. Bilinçli Olarak Kapsam Dışı

- Gol/asist istatistiği — halı sahada güvenilir tutulamıyor, tartışma çıkarır.
- Oyuncu güç reytingi — puan tablosu birikince veriye dayalı eklenebilir.
- Anlık push bildirimi — ücretsiz pakette güvenilir değil, grup zaten WhatsApp'ta.
- Online ödeme — nakit akışı zaten elden yürüyor.
- Telefon/SMS ile giriş — Supabase'de ücretli, 0 TL hedefini bozar.
