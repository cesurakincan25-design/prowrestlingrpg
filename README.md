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
- **Segment tipleri:**
  - *Maç* → canlı motor: can, dayanıklılık, momentum, uzuv hasarı, imza/finisher, pin sayımı (2.9!), submission, DQ, LMS.
    Script zar atar, AI (hakem/DM) emote'u puanlar ve sonucu en fazla ±1-2 kademe kaydırır, yorumcular ve seyirci anlatır.
  - *Promo / Backstage / Röportaj / Kontrat* → text-RP. Oyuncular yazar, sahipsiz karakterleri AI oynar; GM "Segmenti bitir" deyince AI puanlar.
- **Puan & reyting:** her maça / segmente yıldız, şova toplam yıldız + izlenme (M). Kemerler el değiştirir (DQ'da değiştirmez), savunmalar sayılır.
- **Kontrol:** her köşe/katılımcı "AI" ya da bir oyuncu. AI güreşçilerin turlarını şovu yürüten (host) cihaz oynatır.
- **Komutlar:** `/me` · `/do` · `/s` bağır · `/l` alçak · `/b` veya `((…))` OOC · `*eylem*` = /me
- **Kadro:** "AI ile Ekle" (tek isim / toplu kadro / metin yapıştır / custom), karakteri "oyna" ile sahiplen, GM markasını atar.

## AI sağlayıcıları (Ayarlar, cihaza özel)

Cloudflare Worker (varsayılan) · kendi Gemini key'in · lokal Ollama (`OLLAMA_ORIGINS=*` gerekir) · offline şablon.
Birincil hata verirse yedeğe düşer.
