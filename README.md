# RING_RP — AI destekli güreş roleplay

Tek dosyalık (`index.html`) mesajlaşma uygulaması. Oyuncular kanallarda, DM'lerde ve maç odalarında karakterleriyle
GTA World tarzı yazar (`/me`, `/do`, `/s`, `/l`, `/b`, `((…))`). Hakem, yorumcular, spiker, röportajcı, GM, seyirci
ve sahipsiz güreşçiler AI tarafından oynanır. Maçlarda sonucu **script + AI (DM)** birlikte belirler.

```
index.html          ← uygulamanın tamamı (GitHub Pages bunu yayınlar)
firestore.rules     ← Firestore güvenlik kuralları
worker/worker.js    ← Cloudflare Worker: Gemini proxy (API key burada saklanır)
worker/wrangler.toml
```

## 1. Cloudflare Worker (AI)

Bu proje için **ayrı bir Gemini API key** aç: https://aistudio.google.com/apikey

**Panelden (en kolay):**
1. Cloudflare → Workers & Pages → Create → Worker → adı `ring-rp-ai` → Deploy.
2. "Edit code" → `worker/worker.js` içeriğini yapıştır → Deploy.
3. Settings → Variables and Secrets:
   - `GEMINI_KEY` → **Secret** olarak yeni key
   - `ALLOWED_ORIGINS` → `https://cesurakincan25-design.github.io` (yerel test için `,http://localhost:5500` ekleyebilirsin)
   - İsteğe bağlı: `DEFAULT_MODEL`, `RATE_PER_MIN` (varsayılan 40), `APP_TOKEN` (secret)
4. `https://ring-rp-ai.KULLANICI.workers.dev/health` → `{"ok":true,"hasKey":true}` görmelisin.

**Terminalden:** `cd worker && npx wrangler deploy && npx wrangler secret put GEMINI_KEY`

Worker; origin kontrolü, IP başına dakikalık sınır, model beyaz listesi ve 64 KB istek sınırı uygular.
Key tarayıcıya hiç gitmez.

## 2. Firebase (canlı senkron)

1. Firebase Console → proje seç (yeni ya da NYC_DB'ninki) → Firestore Database oluşturulu olsun.
2. **Authentication → Sign-in method → Anonymous → Enable.**
3. Firestore → Rules → `firestore.rules` içeriği. NYC_DB projesini paylaşıyorsan sadece `wr_` bloklarını mevcut kurallarına ekle.
4. Project settings → Your apps → Web app → config'i kopyala.

## 3. `index.html` içindeki APP_CONFIG

Dosyanın en başındaki blok:

```js
window.APP_CONFIG = {
  firebase: { apiKey:"…", authDomain:"…", projectId:"…", storageBucket:"…", messagingSenderId:"…", appId:"…" },
  prefix: 'wr_',
  anonAuth: true,
  workerUrl: 'https://ring-rp-ai.KULLANICI.workers.dev',
  appToken: '',
  model: 'gemini-3.6-flash',
};
```

Firebase web config'i gizli değildir (tarayıcıda zaten görünür); güvenliği kurallar + anonim auth sağlar.
`firebase: null` bırakılırsa uygulama **YEREL** modda çalışır (tek tarayıcı, sekmeler arası senkron) — test için ideal.

## Nasıl oynanır — Universe / GM modu

**Yapı:** Evren → Markalar (MAYHEM, SHOWDOWN, RISE…) → Şov şablonları (haftalık TV, aylık PLE, gelişim; tarz: TV / PLE / NXT / Strong Style / Lucha / Hardcore) → Takvim → Şov kartı → Segmentler.

- **GM modu:** Takvimi doldur, şovları aç, kartı elle ya da **AI ile kart kur** (booker; kadro, kemerler ve son sonuçlara bakar).
  Şovu başlat → segmentler sırayla oynanır. Her segmentte istediğin karakterle yazarsın, istemediğini **Hızlı sim** ile geçersin.
  **Kalanı simüle et** tüm şovu bitirir. Markalar & Şovlar sayfasından brand, şov, draft; Kemerler'den şampiyonlar.
- **Süperstar modu:** Sol üstten bir güreşçi seç → sadece onunla yazarsın, maçlarında sıra sana gelince hamle çubuğu açılır.
  Panelde kariyerin (rekor, kemer, popülerlik) ve sıradaki bookinglerin görünür.
- **Maç formatları:** 1v1, 2v2 … 5v5, handikap (1v2, 1v5, 3v5…), Triple Threat, Fatal 4-Way, 6-Pack, takım triple threat,
  Battle Royal, **Royal Rumble (30)** — her şey. Maç kurucuda hazır formatlar + "Taraf ekle / Üye ekle" + "Rastgele doldur".
  Takımlı maçlarda **tag kuralları** (her takımdan bir legal güreşçi, diğerleri apronda, "Tag at" / hot tag) ya da **Tornado** (herkes legal).
  Çok kişili maçta hamle yaparken **hedef rakibi** seçersin; başkaları tuşu / tutuşu bozabilir.
- **Maç türleri:** Standart, No DQ, No Holds Barred, Street Fight, Extreme Rules, Hardcore, Falls Count Anywhere, Submission,
  "I Quit", Last Man Standing, Tables, Ladder, TLC, Money in the Bank, Steel Cage (kafesten kaçış), Hell in a Cell, Iron Man,
  Survivor Series Elimination, Elimination Chamber, Gauntlet, WarGames, Battle Royal, Royal Rumble. Hem serbest maçlarda hem şovlarda
  (şov sayfasında "Maç" butonu); AI booker da bu türleri ve formatları kullanır. Kalabalık maçlarda "Hızlı AI turları" açık gelir.
  Takım kemerleri: takım kazanırsa kemer tüm üyelere geçer.
- **Serbest maçlar:** yan panelde her maçın üstüne gelince **arşive gönder / tamamen sil**; "süpürge" biten maçları topluca arşivler,
  kutu simgesi arşivi açar (geri al / sil). Tamamen silmek odayı, mesajları ve Geçmiş kaydını siler; rekorlar değişmez.
- **Segment tipleri:**
  - *Maç* → canlı motor: can, dayanıklılık, momentum, uzuv hasarı, imza/finisher, pin sayımı (2.9!), submission, DQ, LMS.
    Script zar atar, AI (hakem/DM) emote'u puanlar ve sonucu en fazla ±1-2 kademe kaydırır, yorumcular ve seyirci anlatır.
  - *Konuşma segmentleri* — Ringde promo, Backstage, Röportaj, Kontrat / yüzleşme, **Video paketi**, **Backstage saldırısı**, **Kutlama**,
    **Otorite duyurusu**, **Debut** → text-RP. Oyuncular yazar, sahipsiz karakterleri AI oynar (kimin oynayacağı segment başlarken belirlenir).
    - **Plan:** "Planlanan sonuç / ana an", adım adım "Olay akışı" ve "Planlanan kazanan". AI sahneyi oyuncuları zorlamadan buna yönlendirir,
      adımları işaretler; bitişte planlanan kazanan ilan edilir.
    - **Sıra & süre:** "Sırayla" düzeninde katılımcılar sırayla konuşur (AI kendi sırasını bekler); "Süre" (IC mesaj sayısı) dolunca segment
      kendiliğinden biter ve puanlanır.
    - **Canlı GM araçları** (sağ panel): Yönet (yönetmen notu → AI sahneye koyar), Saldırı, Sürpriz giriş (run-in + müzik), **Maça dönüştür**
      (hemen sıradaki segment olur; saldırıya uğrayan yıpranmış başlar), **Sonraki şova maç** (sözleşme: bir sonraki şovun kartına eklenir).
    - Video paketi kendiliğinden oynar ve puanlanır. AI booker da yeni tipleri ve segment hedeflerini kullanır.
- **Promosyon / markalar / şovlar:** Markalar & Şovlar sayfasında promosyonun adı, kısaltması, **logosu**, rengi, başkanı ve tanıtımı;
  markalara **logo**, slogan, ekrandaki GM ve varsayılan hakem / yorumcu / spiker; şov şablonlarına **logo**, arena ve şova özel ekip.
  Logolar şeffaf PNG ya da normal foto olabilir (direkt link); şeffaf kenarlar otomatik kırpılır. Panelde, takvimde, şov ekranında ve maç kartında görünür.
- **Tema şarkıları (promosyon / marka / şov):** üçünün formunda da YouTube linki + başlangıç saniyesi. **"Şovu başlat"** önce herkeste
  bir **açılış ekranı** açar (logo, şov adı, tarih, arena, kart) ve tema çalar — öncelik: şov teması > marka teması > promosyon teması.
  Başlatan kişi "Başla ▶" deyince şov canlıya geçer. Sağ paneldeki müzik kutusundan bu temalar da elle çalınabilir.
- **Güncelleme kaydı:** her karakterde son 8 güncelleme tutulur (ne zaman, kim, nasıl — elle / AI ile oluşturma / AI güncelleme — ve
  neler değişti, AI neyi bulamadı). Editörün üstünde ve "AI ile Güncelle" ekranında görünür; eksik alanlar (gimmick, statlar, hareket
  tarifleri, ilişki, görsel, tema…) ayrıca listelenir. **"Sadece eksikleri güncelle"** yalnızca eksik bölümleri seçer ve AI'a önce
  onları araması söylenir.
- **Kemerler:** kemer görseli (PNG), kısa ad, renk, marka, seviye (dünya / orta kart / üçüncül / özel), bölüm (açık / erkek / kadın),
  şampiyon, saltanat başlangıcı, savunma sayısı, açıklama, emekliye ayırma, **boşa çıkarma**, ayrıntılı kemer geçmişi.
  Şampiyonu kemer sayfasından ya da güreşçi profilindeki "Şampiyonluk ver"den belirle. Kemer maçında (şov ya da manuel maç) kazanan
  otomatik şampiyon olur, savunmalar sayılır. Şampiyonlar profilde, kadro kartında, VS kartında ve maç panelinde kemerleriyle görünür.
- **Intergender maçlar:** manuel maç kurarken serbest (uyarı gösterilir); AI booker da önerebilir ama her intergender maçı karta
  eklemeden önce sorar. Kemer bölümüne uymayan güreşçiyle AI kemer maçı kurmaz.
- **Puan & reyting:** her maça / segmente yıldız, şova toplam yıldız + izlenme (M). Kemerler el değiştirir (DQ'da değiştirmez), savunmalar sayılır.
- **Kontrol:** her köşe/katılımcı "AI" ya da bir oyuncu. AI güreşçilerin turlarını şovu yürüten (host) cihaz oynatır.
- **Komutlar:** `/me` · `/do` · `/s` bağır · `/l` alçak · `/b` veya `((…))` OOC · `*eylem*` = /me
- **Kadro:** "AI ile Ekle" (tek isim / toplu kadro / metin yapıştır / custom) ya da **"Manuel Ekle"**. Karakteri "oyna" ile sahiplen, GM markasını atar.
  - **AI ile Ekle** yeni alanları da doldurur: roller, cinsiyet, hareket tarifleri, kadrodaki karakterlerle ilişkiler; aramada bulursa
    tema şarkısı ve görseller (açılmayan / geçersiz linkler otomatik elenir). **Linkler** bölümüne kaynak sayfa (Wikipedia, Cagematch…
    — AI sayfayı okur), render / banner / ikon ve YouTube linki yazılabilir; yazılan link AI'ınkinden önceliklidir.
  - **Güncelle / yeniden araştır:** profildeki "AI ile güncelle" ya da kadrodaki "Güncelle". Hangi bölümlerin (temel bilgi, stat,
    move-set, ilişki, görsel, tema) güncelleneceğini seçersin, "son gelişmeler" notu yazabilirsin. Sahip, rekor, marka, mevcut
    ilişkiler ve senin görsellerin korunur. Tek karakterde önce değişiklik listesi gelir; çoklu güncelleme tek tıkla geri alınır.
  - **Editör** (sekmeli form): kimlik (**X / Twitter kullanıcı adı** dahil — @, x.com ya da twitter.com linki yapıştırılabilir), **çoklu rol** (ör. Superstar + GM aynı anda), **cinsiyet**, gimmick/üslup, statlar,
    **move-set** (hareket ekle/çıkar/sırala + her hareket için AI'ın okuyacağı tarif), **ilişkiler**, müzik ve gelişmiş JSON.
  - **Görseller:** ikon, banner ve **PNG render** — imgur vb. direkt resim linki. Render'ın şeffaf kenarları otomatik kırpılır ve oranı korunur;
    ölçek / kaydırma / bakış yönü elle ayarlanır. Render'lar maç öncesi **VS maç kartında** ve maç panelinde görünür.
  - **İlişkiler:** feud, düşman, rakip, müttefik, tag partneri, stable, aşk, eski sevgili, aile, akıl hocası/öğrenci, menajer, ihanet…
    Karşı tarafa otomatik yazılır; AI maç anlatısında, promolarda ve booker'da kullanır.
  - **Tema şarkısı:** YouTube linki (youtube.com, youtu.be, music.youtube.com, shorts) + başlangıç saniyesi. Maç girişinde, maç ve
    promo/segment kazanıldığında odadaki herkeste otomatik çalar; sağ paneldeki ♪ ile elle çalınır. Ayarlar'dan otomatik çalma kapatılabilir.

## AI sağlayıcıları (Ayarlar, cihaza özel)

Cloudflare Worker (varsayılan) · kendi Gemini key'in · lokal Ollama (`OLLAMA_ORIGINS=*` gerekir) · offline şablon.
Birincil hata verirse yedeğe düşer.
