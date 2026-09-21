# Halı Saha Uygulaması — Kurulum Rehberi

Bu rehber, hiç kod bilmesen bile uygulamayı baştan sona kendi başına kurabilmen için yazıldı. Sırayla, atlamadan ilerle. Bir adımda ekranın burada anlatılandan farklı görünürse, o adımda dur ve ekran görüntüsünü paylaş — tahmin yürütüp devam etme.

Rehberde geçen bazı terimler:
- **Panel**: Bir servisin (Supabase, Vercel, Google) ayarlarını yönettiğin web sitesi.
- **Ortam değişkeni (environment variable)**: Uygulamanın çalışması için ihtiyaç duyduğu, koda yazılmayan gizli/ayarlanabilir bilgiler (ör. veritabanı adresi).
- **Repo (repository)**: Kodunun GitHub'da saklandığı klasör.
- **Deploy (dağıtım/yayına alma)**: Uygulamayı internete koyma işlemi.

---

## 1. Neye ihtiyacın var

- Bir **Google hesabı** (Gmail).
- Bir **Supabase** hesabı — ücretsiz, kredi kartı istemez. (Supabase: veritabanını ve girişleri yöneten servis.)
- Bir **Vercel** hesabı — ücretsiz, kredi kartı istemez. (Vercel: uygulamayı internete koyan servis.)
- Bir **GitHub** hesabı — ücretsiz. (GitHub: kodunun saklandığı yer; Vercel oradan okuyacak.)

Hepsine Google hesabınla "Sign in with Google" ile kayıt olabilirsin, ayrı şifre uğraşına girmene gerek yok.

---

## 2. Supabase projesi açma

1. [supabase.com](https://supabase.com) adresine git, Google hesabınla giriş yap.
2. **New Project** (Yeni Proje) düğmesine bas.
3. Bir organizasyon seçmen istenirse varsayılanı bırak.
4. Proje adı: `hali-saha` yazabilirsin (istediğin adı verebilirsin, önemli değil).
5. **Database Password** (Veritabanı Şifresi) alanına güçlü bir şifre gir ve **bir yere not et** (parola yöneticisi, not defteri, fark etmez). Bu şifreyi kaybedersen sıfırlaman gerekir; günlük kullanımda direkt lazım olmaz ama saklamazsan başın ağrıyabilir.
6. **Region** (Bölge): Türkiye'ye en yakın seçeneği seç (genelde `Central EU (Frankfurt)` listede vardır). En yakın bölge uygulamayı biraz daha hızlı yapar.
7. **Create new project** düğmesine bas. Proje birkaç dakika içinde hazırlanır (bekleme ekranı gösterir).

### Üç gizli değeri bulma

Proje hazır olunca sol menüden **Settings** (Ayarlar) → **API** sayfasına git. Burada üç değer göreceksin, üçünü de bir kenara not et (bir sonraki adımda kullanacaksın):

- **Project URL** → `https://xxxxx.supabase.co` şeklinde bir adres.
- **anon public** anahtarı → uzun bir metin (`eyJ...` ile başlar).
- **service_role** anahtarı → yine uzun bir metin, **ama bu GİZLİ**.

> **Uyarı:** `service_role` anahtarı veritabanına tüm kısıtlamaları atlayarak (RLS/güvenlik kuralları dahil) erişebilir. Bunu kimseyle paylaşma, hiçbir yere (mesaj, forum, ekran paylaşımı) yapıştırma. Sadece biraz sonra oluşturacağın `.env.local` dosyasına yazılacak ve o dosya bilgisayarından hiçbir yere gitmeyecek.

---

## 3. `.env.local` dosyasını oluşturma

Proje klasöründe `.env.example` adında bir dosya var — bu, hangi bilgilerin gerektiğini gösteren bir şablon, gerçek değerleri içermiyor.

1. Proje klasöründe `.env.example` dosyasının bir kopyasını oluştur, adını `.env.local` yap.
   - Dosya gezgininde: `.env.example` dosyasına sağ tık → Kopyala → Yapıştır → yeni dosyanın adını `.env.local` yap.
2. `.env.local` dosyasını bir metin editörüyle aç (Not Defteri yeterli) ve içeriğini şu şekilde doldur (sağdaki değerleri 2. adımda not ettiğin kendi değerlerinle değiştir):

   ```
   NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon public anahtarın>
   SUPABASE_SERVICE_ROLE_KEY=<service_role anahtarın>
   ```

3. Kaydet.

> Bu dosya **asla** GitHub'a gönderilmez / paylaşılmaz — proje bunu otomatik olarak dışarıda tutacak şekilde ayarlanmış (`.gitignore` içinde tanımlı). Yine de dikkatli ol: bu dosyayı e-posta, mesaj veya ekran paylaşımıyla kimseyle paylaşma.

---

## 4. Veritabanını kurma

1. Supabase panelinde sol menüden **SQL Editor**'e git.
2. **New query** (Yeni sorgu) düğmesine bas.
3. Bilgisayarındaki proje klasöründe `supabase/kurulum.sql` dosyasını aç, **tüm içeriğini** seç ve kopyala.
4. Supabase'deki boş sorgu alanına yapıştır.
5. Sağ alttaki (veya sağ üstteki) **Run** (Çalıştır) düğmesine bas.
6. Başarılı olursa altta yeşil bir "Success. No rows returned" (Başarılı) mesajı görürsün. Kırmızı bir hata mesajı görürsen, adımı atlamadığından emin ol ve hata metnini bir yere kopyala.

> Bu dosyayı yalnızca **bir kez** çalıştır. Tekrar çalıştırırsan "already exists" (zaten var) hataları alırsın — bu normaldir, veritabanına zarar vermez, sadece dosyayı tekrar çalıştırmana gerek olmadığının işaretidir.

---

## 5. Google ile girişi açma

Bu, rehberin en zahmetli kısmı — dürüst olmak gerekirse birkaç panel arasında gidip gelmen gerekecek. Sabırlı ol, her adımı sırayla yap.

> **Bu adım gözünü korkutuyorsa:** Supabase'de Email (e-posta ile giriş) sağlayıcısı zaten açıktır, bu adımı şimdilik atlayıp uygulamayı e-posta girişiyle deneyebilirsin. Ama şunu bil: uygulamanın giriş ekranı şu an **sadece "Google ile giriş yap" düğmesi** olacak şekilde kodlanmış (bkz. `src/app/login/page.tsx`), yani bu adımı atlarsan giriş ekranı çalışmaz — bu adımı er ya da geç tamamlaman gerekiyor.

### 5a. Google Cloud Console'da OAuth istemcisi oluşturma

1. [console.cloud.google.com](https://console.cloud.google.com) adresine git, Google hesabınla giriş yap.
2. Üstteki proje seçiciden **New Project** (Yeni Proje) oluştur, bir isim ver (ör. `hali-saha`), **Create** de.
3. Sol üstten ☰ menü → **APIs & Services** → **OAuth consent screen**.
4. User Type olarak **External** seç, **Create** de.
5. İstenen alanları doldur: Uygulama adı (`Halı Saha`), kullanıcı destek e-postası (kendi e-postan), geliştirici iletişim e-postası (kendi e-postan). Diğer alanları boş bırakabilirsin. **Save and Continue** ile ilerle (Scopes ve Test users ekranlarında da değişiklik yapmadan **Save and Continue** diyerek geçebilirsin).
6. Sol menüden **Credentials** (Kimlik Bilgileri) sayfasına git.
7. **Create Credentials** → **OAuth client ID** seç.
8. Application type: **Web application** seç.
9. Bir isim ver (ör. `hali-saha-web`).
10. **Authorized redirect URIs** (Yetkili yönlendirme adresleri) bölümüne şunu ekle — burası önemli, Supabase'in sana vereceği adres:
    - Supabase panelinde **Authentication** → **Providers** → **Google** sayfasını aç, orada "Callback URL (for OAuth)" yazan bir adres göreceksin (şuna benzer: `https://xxxxx.supabase.co/auth/v1/callback`). O adresi kopyalayıp buraya yapıştır.
11. **Create** de. Karşına bir **Client ID** ve **Client Secret** çıkacak — ikisini de not et.

### 5b. Supabase'de Google sağlayıcısını açma

1. Supabase panelinde **Authentication** → **Providers** → **Google**'a git.
2. **Enable Sign in with Google** anahtarını aç.
3. 5a adımında aldığın **Client ID** ve **Client Secret** değerlerini ilgili alanlara yapıştır.
4. **Save** de.

---

## 6. Adres ayarları

1. Supabase panelinde **Authentication** → **URL Configuration**'a git.
2. **Site URL** alanına şunu yaz: `http://localhost:3000`
3. **Redirect URLs** listesine şunu ekle: `http://localhost:3000/auth/callback`
4. Kaydet.

(Bu adresler şimdilik bilgisayarında test ederken kullanılacak. Uygulamayı internete koyduğunda — 11. bölüme bak — bu ayarları gerçek adresinle güncelleyeceksin.)

---

## 7. Canlı güncellemeyi açma

Anket ekranında biri girip çıktığında listenin diğer herkesin ekranında otomatik güncellenmesi için:

1. Supabase panelinde **Database** → **Replication**'a git.
2. Tablo listesinde `match_entries` tablosunu bul ve yayına (publication) dahil et — genelde satırın yanındaki anahtarı/kutucuğu açman yeterli.
3. Değişikliği kaydet.

---

## 8. Uygulamayı bilgisayarda çalıştırma

### 8a. Node.js kurulumu (daha önce kurmadıysan)

Aşağıdaki `npm` komutları **Node.js** ile birlikte gelir. Bilgisayarında Node.js yoksa `npm: command not found` (ya da "npm terimi tanınmıyor") hatası alırsın. Kurulumu:

1. [nodejs.org](https://nodejs.org) adresine git.
2. İki indirme düğmesinden **LTS** yazanı seç (LTS = uzun süre desteklenen, kararlı sürüm). Windows'ta `.msi` uzantılı bir kurulum dosyası iner.
3. İnen dosyayı çalıştır, kurulumu varsayılan ayarlarla (hep **Next / İleri**, sonra **Install**) tamamla. Hiçbir kutucuğu değiştirmene gerek yok.
4. **Kurulum bitince açık olan bütün terminal / VS Code pencerelerini kapat ve yeniden aç.** Bu adımı atlarsan `npm` komutu hâlâ bulunamaz — terminal, kurulumdan önceki ayarlarla açılmış durumdadır.
5. Doğrula: terminale sırayla şunları yaz, ikisi de sürüm numarası yazdırmalı:
   ```
   node -v
   npm -v
   ```
   (`v22.11.0` ve `10.9.0` gibi numaralar görürsün; numaraların birebir aynı olması gerekmez.)

### 8b. Çalıştırma

1. Proje klasörünü bir terminalde aç (VS Code kullanıyorsan Terminal menüsünden yeni terminal açabilirsin).
2. Şunu çalıştır:
   ```
   npm install
   ```
   (Bu, uygulamanın ihtiyaç duyduğu paketleri indirir, birkaç dakika sürebilir.)
3. Ardından:
   ```
   npm run dev
   ```
4. Tarayıcında `http://localhost:3000` adresini aç.

---

## 9. Kendini yönetici (admin) yapma

İlk kez Google ile giriş yaptığında hesabın otomatik olarak "onay bekliyor" durumunda açılır (ekranda "Hesabın onay bekliyor" yazısını göreceksin). Kendini onaylayıp yönetici yapman için:

1. Supabase panelinde **Table Editor**'e git, `profiles` tablosunu aç. Kendi satırını (adın/e-postan ile eşleşen) bul ve `id` sütunundaki değeri kopyala (uzun bir kod, `xxxxxxxx-xxxx-...` şeklinde).
2. **SQL Editor**'e git, yeni bir sorgu aç, şunu yapıştır ve `<kendi_id>` yerine kopyaladığın id'yi yaz:
   ```sql
   update profiles set status = 'active', role = 'admin' where id = '<kendi_id>';
   ```
3. **Run** de.
4. Uygulamaya dön, sayfayı yenile (F5) — artık ana sayfayı ve sağ üstte "Admin" bağlantısını görmelisin.

---

## 10. İlk sezonu açma

Sezon açman zorunlu değil (maç oluştururken sezon seçilmezse maç sezonsuz oluşur), ama ileride istatistik ve puanlama özellikleri sezona bağlı çalışacağı için baştan bir sezon açmanı öneririz.

Supabase **SQL Editor**'de:

```sql
insert into seasons (name, starts_on, is_active)
values ('2026 Sezonu', current_date, true);
```

(`'2026 Sezonu'` yerine istediğin bir isim yazabilirsin.)

---

## 11. İnternete yayınlama (Vercel)

Bilgisayarında çalıştığını doğruladıktan sonra, herkesin telefonundan erişebilmesi için internete koyacaksın.

1. Kodunu GitHub'a gönder (proje klasöründe terminalde):
   ```
   git add -A
   git commit -m "İlk yayın"
   git push
   ```
   (Eğer proje henüz bir GitHub deposuna bağlı değilse, önce GitHub'da boş bir depo oluşturup terminalde `git remote add origin <depo-adresi>` ile bağlaman gerekir — bu adımda takılırsan ekran görüntüsünü paylaş.)
2. [vercel.com](https://vercel.com) adresine git, GitHub hesabınla giriş yap.
3. **Add New** → **Project** de, listeden az önce gönderdiğin depoyu seç ve **Import** de.
4. **Environment Variables** (Ortam Değişkenleri) bölümüne, `.env.local` dosyandaki üç satırı tek tek ekle:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
5. **Deploy** düğmesine bas. Birkaç dakika içinde sana `https://<proje-adı>.vercel.app` şeklinde bir adres verecek.
6. **Çok önemli — bunu unutma:** Supabase paneline geri dön, **Authentication** → **URL Configuration**'a git ve 6. bölümde `localhost` ile girdiğin adresleri, Vercel'in verdiği gerçek adresle **güncelle**:
   - Site URL: `https://<proje-adı>.vercel.app`
   - Redirect URLs listesine ekle: `https://<proje-adı>.vercel.app/auth/callback`
   - `localhost` adreslerini de listede bırakabilirsin, bilgisayarında test etmeye devam edersin.

   Bu adımı atlarsan yayındaki uygulamada Google ile giriş çalışmaz (kullanıcı giriş yaptıktan sonra hataya düşer).

---

## 11b. Zamanlanmış işler (hatırlatmalar, takvim, MVP)

Bazı işlerin kimse uygulamayı açmasa bile çalışması gerekir:

- periyodik takvimin yaklaşan haftasını açmak,
- oylama süresi dolan maçın MVP'sini belirlemek,
- maçtan 24 saat sonra ödemesi eksik olanlara hatırlatma yollamak,
- sonucu girilmemiş (askıda kalan) hafta için yöneticileri uyarmak.

Bunların hepsi tek bir adreste toplandı: `/api/cron`. Adresi dışarıdan tetiklenir,
o yüzden paylaşılan bir şifreyle korunur.

**1) Şifreyi üret ve iki yere gir.** Rastgele uzun bir dize üret (ör. bir parola
üreticiden 40 karakter). Bu değeri:
- `.env.local` dosyasına `CRON_SECRET=...` satırı olarak,
- Vercel'de **Settings → Environment Variables** altına `CRON_SECRET` adıyla
gir. İkisi aynı olmalı.

**2) Vercel Cron (ücretsiz planda günde bir kez).** Depoda `vercel.json` hazır:

```json
{ "crons": [{ "path": "/api/cron", "schedule": "0 6 * * *" }] }
```

Vercel, `CRON_SECRET` tanımlıysa isteği kendiliğinden doğru başlıkla gönderir;
başka ayar gerekmez. Hobby (ücretsiz) planda cron **günde bir kez** çalışabilir.

**3) Daha sık çalışsın istersen: GitHub Actions (ücretsiz).** Depoda
`.github/workflows/cron.yml` var; yarım saatte bir aynı adresi çağırır. Çalışması
için GitHub'da **Settings → Secrets and variables → Actions** altına iki değer gir:

| Ad | Değer |
| --- | --- |
| `CRON_URL` | `https://<proje-adı>.vercel.app/api/cron` |
| `CRON_SECRET` | Vercel'e girdiğin şifrenin aynısı |

Bu ikisi tanımlı değilse iş sessizce atlanır, hata vermez.

**4) Üçüncü bir seçenek: Supabase pg_cron.** Supabase'in ücretsiz planı da
`pg_cron` + `pg_net` uzantılarını destekler; istersen zamanlayıcıyı tamamen
veritabanının içinde de kurabilirsin. Yukarıdaki iki yol yettiği için bu depoda
kullanılmadı.

Doğru çalıştığını görmek için (şifreyi kendi değerinle değiştir):

```bash
curl -H "Authorization: Bearer <CRON_SECRET>" https://<proje-adı>.vercel.app/api/cron
```

Şuna benzer bir cevap dönmeli:

```json
{"ranAt":"...","schedule":0,"mvp":0,"reminders":0,"unresolved":0}
```

Sayılar o çağrıda kaç iş yapıldığını söyler. İşler tekrar çalıştırmaya
dayanıklıdır: aynı hatırlatma iki kez gitmez, o yüzden adresi elle çağırman
zararsızdır.

---

## 12. Eksik ikonlar

Uygulamanın "Ana ekrana ekle" özelliği için iki ikon dosyası eksik: `public/icon-192.png` ve `public/icon-512.png`. Bu dosyalar otomatik oluşturulamadı (görsel üretimi bu kurulum sürecinin kapsamı dışında). Uygulama bu ikonlar olmadan da normal şekilde çalışır; sadece telefonda ana ekrana eklediğinde varsayılan/boş bir ikon görebilirsin.

Eklemek istersen: 192x192 ve 512x512 piksel boyutlarında, düz renk üzerine basit bir top/logo görseli hazırlayıp (ör. canva.com veya benzeri bir siteyle) tam olarak bu adlarla `public` klasörüne koyman yeterli:
- `public/icon-192.png`
- `public/icon-512.png`

---

## 13. Çalışıyor mu? Kontrol listesi

Sırayla dene, her adım bir öncekine bağlı:

1. **Giriş**: Uygulamayı aç, "Google ile giriş yap" düğmesine bas, Google hesabınla giriş yap.
2. **Onay bekliyor ekranı**: İlk girişte "Hesabın onay bekliyor" yazısını görmelisin.
3. **Admin onayı**: Admin hesabınla (9. bölümdeki adımı yaptıysan zaten adminsin) `/admin` sayfasına git, bekleyen üye listesinde kendini/diğer kullanıcıyı **Onayla**.
4. **Anket açma**: Admin panelinde "Yeni anket aç" formunu doldurup gönder (tarih, saha adı vb.).
5. **Ankete girme**: Ana sayfada yeni açılan maça tıkla, "ankete gir" düğmesine bas, listeye eklendiğini gör.
6. **Canlı güncelleme**: İkinci bir hesapla (farklı bir tarayıcı ya da gizli sekme ile başka bir Google hesabıyla) giriş yap, o hesap da ankete girsin — ilk ekranın sayfayı yenilemeden otomatik güncellendiğini gör.
7. **Anketten çıkma**: "çık" düğmesine bas, listeden çıktığını gör.
8. **Kadro kesinleştirme**: Admin panelinden ilgili maçın "kadro" sayfasına git (`/poll/<maçId>/squad`), sahada olacak oyuncuları işaretleyip kaydet, maçın durumunun değiştiğini gör.

### Güvenlik kontrolü (elle, iki deney)

Yukarıdaki adımlar uygulamanın **çalıştığını** gösterir; aşağıdaki iki deney veritabanının **kötüye kullanıma kapalı** olduğunu gösterir. Uygulamadaki yetki ve sıra kuralları veritabanında da ayrıca kilitlidir; bu iki deney o kilidin gerçekten takılı olduğunu doğrular. Kurulumdan sonra bir kez yap, beş dakika sürer.

> **Önemli:** Bu iki deneyi **admin olmayan** bir hesapla yap (kontrol listesinin 6. adımındaki ikinci hesap ideal; onay bekleyen bir hesap da olur). Admin hesabıyla yaparsan ikisi de **başarılı olur** — bu bir açık değil, admin'in zaten bu yetkilere sahip olması demektir.

**Hazırlık.** Admin olmayan hesapla uygulamaya giriş yap (`http://localhost:3000`). Sayfa açıkken klavyeden **F12**'ye bas, açılan panelde **Console** (Konsol) sekmesine geç. Tarayıcı "yapıştırmaya izin vermek için `allow pasting` yaz" uyarısı verirse, konsola `allow pasting` yazıp Enter'a bas, sonra devam et.

Önce şu bloğu kopyala, **ilk iki satırdaki değerleri kendi `.env.local` dosyandakilerle değiştir**, konsola yapıştır ve Enter'a bas:

```js
const URL_ = "https://xxxxx.supabase.co";   // NEXT_PUBLIC_SUPABASE_URL
const ANON = "eyJ...";                      // NEXT_PUBLIC_SUPABASE_ANON_KEY

const parcalar = document.cookie.split("; ")
  .map(c => [c.slice(0, c.indexOf("=")), c.slice(c.indexOf("=") + 1)])
  .filter(([ad]) => /^sb-.*-auth-token(\.\d+)?$/.test(ad))
  .sort((a, b) => a[0].localeCompare(b[0]));
if (parcalar.length === 0) throw new Error("Oturum bulunamadi - once uygulamaya giris yap, sonra bu sayfada tekrar dene.");
let ham = parcalar.map(([, d]) => decodeURIComponent(d)).join("");
if (ham.startsWith("base64-")) ham = atob(ham.slice(7).replace(/-/g, "+").replace(/_/g, "/"));
const oturum = JSON.parse(ham);
const TOKEN = oturum.access_token;
const BEN = oturum.user.id;
const BASLIK = { apikey: ANON, Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json", Prefer: "return=representation" };
console.log("Hazir. Kullanici id:", BEN);
```

`Hazir. Kullanici id: ...` yazdıysa hazırlık tamam. (Hata alırsan: giriş yapmış olduğundan ve uygulamanın kendi sayfasında olduğundan emin ol.)

**Deney 1 — Kendini yönetici yapmayı dene. Reddedilmeli.**

```js
fetch(`${URL_}/rest/v1/profiles?id=eq.${BEN}`, {
  method: "PATCH", headers: BASLIK,
  body: JSON.stringify({ role: "admin", status: "active" }),
}).then(r => r.text()).then(t => console.log("SONUC:", t));
```

Beklenen çıktı (birebir aynı olmayabilir; önemli olan bir **hata mesajı** dönmesi):

```
SONUC: {"code":"P0001","details":null,"hint":null,"message":"Rol ve durum degisikligini yalnizca yonetici yapabilir"}
```

Doğrulama: Supabase **Table Editor** → `profiles` tablosunda bu hesabın satırına bak; `role` hâlâ `player`, `status` hâlâ eski değerinde olmalı.

❌ Eğer çıktı `[{"id":...,"role":"admin",...}]` gibi **başarılı** bir sonuçsa, veritabanı koruması yüklenmemiş demektir: 4. bölümdeki `kurulum.sql` adımını tam olarak çalıştırdığından emin ol.

**Deney 2 — Ankete kural dışı, doğrudan girmeyi dene. Reddedilmeli.**

İstersen `MAC` satırına açık bir anketin id'sini yazabilirsin: anket sayfasının adresi `http://localhost:3000/poll/<uzun-kod>` şeklindedir, oradaki uzun kodu kopyala. Elinde yoksa aşağıdaki örnek kodu olduğu gibi bırak — sonuç aynı olmalı.

```js
const MAC = "99999999-9999-9999-9999-999999999999";
fetch(`${URL_}/rest/v1/match_entries`, {
  method: "POST", headers: BASLIK,
  body: JSON.stringify({ match_id: MAC, player_id: BEN }),
}).then(r => r.text()).then(t => console.log("SONUC:", t));
```

Beklenen çıktı:

```
SONUC: {"code":"42501","details":null,"hint":null,"message":"new row violates row-level security policy for table \"match_entries\""}
```

(`42501` = "izin yok". Anket kayıtlarına yalnızca uygulamanın kendi giriş/çıkış işlemi yazabilir; bu yüzden doğrudan yazma denemesi reddedilir. Bu koruma olmasaydı, cezalı bir oyuncu cezasını hiç ödemeden listeye girebilir ya da çıktığı sırayı geri alabilirdi.)

❌ Eğer çıktı `[{"id":...}]` gibi **başarılı** bir sonuçsa, oyuncular ceza kurallarını atlayarak ankete girebiliyor demektir: `kurulum.sql`'i tam olarak çalıştırdığını doğrula.

Deneyler bittiğinde konsolu kapatabilirsin; iki deneme de reddedildiği için veritabanında hiçbir kalıcı iz bırakmazlar.

---

## 14. Sık karşılaşılan hatalar

**"Yetkisiz" hatası**
- Sebep: Hesabın henüz "aktif" durumda değil (onay bekliyor ya da pasif) ya da oturumun düşmüş.
- Çözüm: Admin ile (veya 9. bölümdeki SQL komutuyla) hesabını aktif yap; sayfayı yenile, gerekirse çıkış yapıp tekrar giriş yap.

**"Anket kapalı" hatası**
- Sebep: Girmeye çalıştığın maç `poll_open` durumunda değil — anket henüz açılmamış, ya da zaten kadrosu kesinleştirilmiş (`squad_locked`) ya da iptal edilmiş olabilir.
- Çözüm: Admin panelinden maçın durumunu kontrol et; gerekiyorsa yeni bir anket aç.

**"Ankette açık kayıt yok" hatası**
- Sebep: Anketten çıkmaya çalışıyorsun ama sistemde senin için zaten kapanmış (çıkış zamanı işlenmiş) bir kayıt var — muhtemelen başka bir sekmeden/cihazdan zaten çıkmışsın.
- Çözüm: Sayfayı yenile, güncel durumunu (ankette misin değil misin) kontrol et.

**Giriş sonrası `/login?error=1` adresine dönüyor**
- Sebep: Google ile giriş tamamlanamadı. En sık nedenler: Supabase'deki Redirect URLs listesinde kullandığın adresin (`http://localhost:3000/auth/callback` ya da yayındaki gerçek adresin) eksik olması; Google Cloud Console'daki Authorized redirect URI'nin Supabase'in verdiği callback adresiyle birebir eşleşmemesi; ya da `.env.local` / Vercel'deki ortam değişkenlerinden birinin yanlış kopyalanmış olması (fazladan boşluk, eksik karakter).
- Çözüm: 5. ve 6. (yayında ise 11.) bölümdeki adresleri tekrar kontrol et, birebir eşleştiklerinden emin ol.

**Ana sayfada / anket listesinde hiçbir şey görünmüyor (boş liste)**
- Sebep: Ya gerçekten açık anket/maç yok, ya da 4. bölümdeki `kurulum.sql` çalıştırma adımı eksik/yarım kalmış (tablolar veya güvenlik kuralları oluşmamış olabilir), ya da hesabının durumu aktif değil.
- Çözüm: Supabase **Table Editor**'de `matches` tablosunda satır olup olmadığına bak; yoksa admin panelinden yeni anket aç. Hâlâ sorun varsa `kurulum.sql`'i (SQL Editor'de) tekrar gözden geçir — hata mesajı varsa not al.

**`npm: command not found` / "npm terimi tanınmıyor"**
- Sebep: Node.js kurulu değil, ya da kurulumdan sonra terminal yeniden açılmadı.
- Çözüm: 8a bölümündeki adımlarla Node.js'in LTS sürümünü kur; kurulumdan sonra **bütün terminal / VS Code pencerelerini kapatıp yeniden aç**, sonra `node -v` ile doğrula.

**"Ankete gir" düğmesine basınca ham hata ekranı açılıyor**
- Sebep: `.env.local` dosyasındaki `SUPABASE_SERVICE_ROLE_KEY` değeri boş, eksik ya da yanlış. Ankete giriş/çıkış işlemi bu anahtarla yapılır; anahtar geçersizse işlem daha başlarken hata verir.
- Çözüm: Supabase panelinde **Settings** → **API** sayfasından `service_role` anahtarını yeniden kopyala, `.env.local` dosyasına baştan sona (başında/sonunda boşluk kalmadan) yapıştır ve `npm run dev`'i durdurup (terminalde Ctrl+C) yeniden başlat. Yayındaki uygulamada aynı değerin Vercel'deki ortam değişkenlerinde de doğru olduğunu kontrol et.

**Giriş yapıyor ama sürekli `/login` sayfasına geri dönüyor**
- Sebep: Kullanıcı için `profiles` tablosunda satır oluşmamış. Bu satırı `on_auth_user_created` tetikleyicisi otomatik oluşturur; `kurulum.sql` eksik/yarım çalıştıysa bu tetikleyici yoktur.
- Çözüm: Supabase **Table Editor** → `profiles` tablosunda hesabına ait satır var mı bak. Yoksa 4. bölümdeki `kurulum.sql` dosyasının **tamamının** çalıştığını doğrula (SQL Editor'e baştan sona kopyalandığından emin ol; hata mesajı varsa not al). Kurulumu düzelttikten sonra çıkış yapıp tekrar giriş yap — satır yeni girişte oluşur.

**Liste canlı güncellenmiyor (yenilemeden değişiklik görünmüyor)**
- Sebep: 7. bölümdeki Replication (yayın) ayarı `match_entries` tablosu için açılmamış olabilir.
- Çözüm: Supabase **Database** → **Replication**'a dön, `match_entries` tablosunun yayına dahil olduğunu doğrula.

---

Bir adımda beklenmeyen bir ekran ya da hata görürsen, tahmin ederek ilerlemek yerine o ekranın görüntüsünü paylaş — birlikte çözelim.
