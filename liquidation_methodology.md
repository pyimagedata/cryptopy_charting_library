# 📊 Proje Araştırma Raporu: Liquidation Heatmap Hesaplama Metodolojisi

Bu rapor, CoinGlass ve benzeri platformların "Liquidation Heatmap" verilerini nasıl hesapladığına dair teknik detayları, matematiksel formülleri ve açık kaynaklı GitHub projelerinden elde edilen bulguları içermektedir.

---

## 1. Temel Mantık: Likidasyon Fiyatı Hesaplama

Likidasyon haritasının temel taşı, her bir pozisyonun patlama noktasını (Liquidation Price) doğru tahmin etmektir.

### 🧮 İzole Marjin (Isolated Margin) Formülü
İzole marjin kullanan bir pozisyon için likidasyon fiyatı şu formülle hesaplanır:

**Long Pozisyonlar için:**
$$Liq \ Price = Entry \ Price \times (1 - \frac{1}{Leverage} + Maintenance \ Margin \ Ratio)$$

**Short Pozisyonlar için:**
$$Liq \ Price = Entry \ Price \times (1 + \frac{1}{Leverage} - Maintenance \ Margin \ Ratio)$$

*   **Maintenance Margin Ratio (MMR):** Genellikle %0.4 ile %1 arasındadır (Binance'ta BTC için %0.4'tür).

---

## 2. CoinGlass Metodolojisi: Veri Aggregasyonu

CoinGlass doğrudan borsa veritabanına erişemez. Bu yüzden şu "tahminleme" yöntemini kullanır:

### 📡 Veri Kaynakları
1.  **Open Interest (OI):** Toplam açık pozisyon büyüklüğü.
2.  **Long/Short Ratio:** Traderların yüzde kaçının alımda, yüzde kaçının satımda olduğu.
3.  **Volume Profile:** Hacmin hangi fiyat seviyelerinde yoğunlaştığı.

### 📉 Hesaplama Adımları
1.  **Giriş Fiyatı Tahmini:** Son 24-48 saatteki yüksek hacimli fiyat seviyeleri (Volume Clusters) potansiyel "Entry Price" kabul edilir.
2.  **Kaldıraç Dağılımı:** Piyasadaki popüler kaldıraç oranları (10x, 25x, 50x, 100x) bu giriş fiyatlarına uygulanır.
3.  **Hacim Ağırlıklandırma:** Toplam Open Interest, Long/Short oranına göre bu kaldıraç seviyelerine dağıtılır.
    *   *Örnek:* Eğer OI $1B$ ise ve Long/Short %60/%40 ise, $600M$ long pozisyonlar için kaldıraç katmanlarına bölünür.

---

## 3. Glassnode "Proksy" Metodolojisi: On-Chain Şeffaflık

Glassnode, merkezi borsa verilerinin kısıtlılığını aşmak için **Hyperliquid** (on-chain DEX) verilerini "proksy" (vekil) olarak kullanır.

### 🔬 Teknik Detaylar
1.  **Hyperliquid Entegrasyonu:** On-chain olduğu için her cüzdanın gerçek giriş fiyatı ve kaldıracı bilinir. En büyük 1.000 pozisyonun verisi, tüm piyasanın %90'lık riskini yansıtan bir örneklem olarak kullanılır.
2.  **LPOC (Leverage Position Openings & Closures):** Fiyat ve Open Interest (OI) arasındaki korelasyona dayalı bir modeldir.
    *   **Fiyat ⬆️ + OI ⬆️ = Yeni Longlar:** Haritanın alt kısmına (yeşil bölge) likidite eklenir.
    *   **Fiyat ⬇️ + OI ⬆️ = Yeni Shortlar:** Haritanın üst kısmına (kırmızı bölge) likidite eklenir.
    *   **Fiyat ⬆️ + OI ⬇️ = Short Closures:** Üstteki kırmızı barlar küçültülür.
3.  **Liquidation Walls:** "Cumulative Depth" mantığıyla çalışır. Her fiyat basamağı, o seviyeye kadar patlayacak toplam BTC miktarını birikir (step-wise).
4.  **Z-Score Normalization:** Veriyi son 90 günlük ortalamaya göre normalize ederek "anomali" bölgelerini parlak renkle gösterir.

---

## 4. Hyperliquid API: Kamu Erişimi ve Veri Çekme

Hyperliquid, merkezi olmayan yapısı gereği herkese açık **Info API** ve **WebSocket** servisleri sunar. Bu verilere kimlik doğrulaması olmadan erişilebilir.

### 📡 Önemli Endpoint'ler
*   **Info API (REST):** `https://api.hyperliquid.xyz/info`
    *   `type: "metaAndAssetCtxs"`: Her asset için anlık **Open Interest**, Mark Price ve Funding oranlarını verir.
*   **WebSocket Feed:** `wss://api.hyperliquid.xyz/ws`
    *   `{"method": "subscribe", "subscription": {"type": "l2Book", "coin": "BTC"}}`: L2 derinlik verisi.
    *   `{"method": "subscribe", "subscription": {"type": "liquidations"}}`: **Gerçek zamanlı likidasyon akışı** (fiyat, miktar ve yön bazında event-level detay).

### 💡 Uygulama Stratejisi
*   Binance'tan gelen geniş orderbook verisi ile Hyperliquid'den gelen şeffaf likidasyon verilerini birleştirerek "Hibrit" bir harita oluşturulur.
*   Merkezi olmayan (DEX) balinalarının hareketleri, merkezi borsa (CEX) hareketleri için bir öncü gösterge (leading indicator) olarak kullanılır.

---

---

## 5. Endüstri Standartları ve Rakip Analizi

Piyasadaki önde gelen platformlar, likidasyon verisini işlemek için farklı "gizli teknikler" kullanmaktadır:

### 👑 The Kingfisher (Z-Score & Engineered Liquidity)
*   **Z-Score Normalization:** Likidasyon yoğunluğunu sadece hacimle değil, istatistiksel sapma (Z-Score) ile ölçer. Bu, "anormal" derecede büyük kümeleri tespit etmeyi sağlar.
*   **Leverage Mix:** Scalper (yüksek kaldıraç) ve Swing (düşük kaldıraç) kümelerini birbirinden ayıran filtreler sunar.

### 🏛️ Hyblock Capital (Institutional Grade)
*   **Trade-Size Bucketing:** Likidasyonları emir büyüklüğüne göre (örn. >10M$) gruplandırır.
*   **CVD Entegrasyonu:** Fiyat hareketinin likidasyon kaynaklı (zorunlu) mu yoksa agresif alım/satım (isteyerek) mi olduğunu CVD ile doğrular.

### 📈 Trading Different & CoinAnk
*   **Statistical Pressure Zones:** K-Means ve Clustering algoritmaları kullanarak fiyatın "mıknatıs" gibi çekileceği basınç bölgelerini hesaplar.
*   **Aggregated Global Map:** Sadece tek borsa değil, tüm büyük borsaların (Binance, OKX, Bybit) toplam likiditesini tek haritada birleştirir.

---

## 6. GitHub Projeleri ve Algoritmalar

GitHub üzerindeki gelişmiş projelerde kullanılan algoritmalar şunlardır:

### ⚛️ fractal-based / pivot algorithms
Birçok açık kaynaklı Liquidation Heatmap projesi şu yöntemi kullanır:
*   **Pivot High/Low Tespiti:** Grafik üzerindeki önemli dönüş noktalarını bulur.
*   **Stop-Loss Clustering:** Teknik analiz gereği büyük stopların (ve dolayısıyla likidasyonların) bu pivotların hemen altında (long'lar için) veya hemen üstünde (short'lar için) biriktiğini varsayar.
*   **ATR Scaling:** Likidasyon bölgesinin yüksekliğini piyasa volatilitesine (ATR) göre ayarlar.

### 🛠️ Önemli GitHub Kaynakları
1.  **aoki-h-jp/py-liquidation-map:** "Execution data" üzerinden gerçek gerçekleşen likidasyonları takip ederek bir ısı haritası oluşturur.
2.  **Elenchev/order-book-heatmap:** Resting limit order (pasif bekleyen emirler) ile anlık market emirlerini çarpıştırarak gelecekteki likidasyon riskini bulur.
3.  **flowsurface-rs:** Rust dilinde yüksek performanslı "Historical DOM" (Geçmiş derinlik verisi) tutarak likidite heatmap'i çizer.

---

## 7. Uygulama İçin Gerekli Formüller (Cheat Sheet)

| Veri Tipi | Formül / Yöntem | Notlar |
| :--- | :--- | :--- |
| **Liq. Distance (%)** | $100 / Leverage$ | 100x = %1, 50x = %2 mesafe |
| **Volume Intensity** | $Volume \times Range$ | Isı haritasındaki parlaklık |
| **Heatmap Bucket** | $\sum (OI \times Leverage_{factor})$ | Her fiyat adımı için toplam risk |

---

## 8. Sonuç ve Öneri

---

## 9. Proje Uygulama Planı (Roadmap)

1.  **Binance Futures Veri Servisi:** `forceOrder` (anlık) ve `openInterestHist` (tarihsel) verilerini çeken bağımsız bir servis.
2.  **Likidasyon Motoru (Engine):** 
    *   OI değişimlerine göre LPOC (Glassnode) mantığını uygula.
    *   Bu veriyi 25x, 50x, 100x kaldıraç bantlarına dağıt.
3.  **Visualization (Rendering):**
    *   Fiyatın arkasına (background) yarı-şeffaf ısı haritası ekle.
    *   Hafıza (decay) sistemi ile eski likidasyonları yavaşça sil.


CoinGlass verisinin aynısını üretmek için **sadece orderbook yeterli değildir**. Gerçekçi bir harita için şunları birleştirmeliyiz:
1.  **Anlık Orderbook:** Gelecekteki dirençleri gösterir.
2.  **Open Interest + Long/Short Ratio:** Pozisyonların nerede biriktiğini gösterir.
3.  **Standard Leverage Levels:** Likidasyonun hangi fiyat bantlarında (±%1, ±%2 vb.) patlayacağını belirler.
4.  **Hyperliquid Proxy Data:** On-chain balinaların hareketlerini CEX'ler için öncü gösterge olarak kullanır.

---

## 10. Uygulama: Veri Akışı ve Tahminleme Algoritması

CoinGlass benzeri bir motoru sıfırdan kurmak için kullanılacak teknik yol haritası:

### 📡 1. Veri Toplama Katmanı (Data Streamer)
*   **Binance WebSocket (`!forceOrder@arr`):** Tüm piyasadaki anlık likidasyon emirlerini yakalar.
*   **Binance REST (`openInterestHist`):** Her 5 dakikada bir OI değişimlerini kontrol eder.
*   **Hyperliquid WebSocket (`liquidations`):** DEX balinalarının şeffaf girişlerini takip eder.

### 🧮 2. Tahminleme Motoru (Estimation Engine)
Borsaların gizlediği verileri şu mantıkla simüle edeceğiz:
1.  **Sentetik Giriş Fiyatı:** OI'nin arttığı andaki fiyatı "Average Entry Price" kabul et.
2.  **Yön Tayini (LPOC):** 
    *   Fiyat ⬆️ + OI ⬆️ = **Long Birikimi**.
    *   Fiyat ⬇️ + OI ⬆️ = **Short Birikimi**.
3.  **Kaldıraç Dağılımı (Assumption):** Toplam hacmi istatistiksel ağırlıklara böl:
    *   %20 -> 100x (Entry ± %0.8)
    *   %50 -> 50x (Entry ± %1.8)
    *   %30 -> 25x (Entry ± %3.8)

### 💾 3. Durum Yönetimi ve Hafıza (Persistence)
*   **Price Binning:** Fiyatı $100'lık kutucuklara böl. Her likidasyon tahminini ilgili kutucuğun kümülatif değerine ekle.
*   **Decay (Sönümlenme):** Fiyat bir bölgeden geçtiğinde oradaki likiditeyi "0"la. Zaman geçtikçe eski barların parlaklığını (alpha) azalt.

---

## 11. AI Modelleri ve İleri Analiz Teknikleri

Likidasyon haritasını sadece görsel bir araç olmaktan çıkarıp "tahminleyici" bir modele dönüştürmek için kullanılabilecek AI teknikleri:

### 🤖 1. Time-Series Forecasting (Zaman Serisi Tahmini)
*   **LSTM & Transformers:** Fiyat hareketleri, OI ve Funding Rate arasındaki karmaşık ilişkileri öğrenerek, fiyatın hangi likidite kümesine yöneleceğini (Magnet Zone) önceden tahmin eder.
*   **Proximity Analysis:** Fiyatın kümülatif likidite duvarlarına olan "çekim gücünü" (attraction force) hesaplar.

### ⚛️ 2. Clustering (Otomatik Kümeleme)
*   **DBSCAN:** Milyonlarca küçük likidasyon verisini otomatik olarak anlamlı "Balina Bölgelerine" (Whale Clusters) dönüştürür.
*   **K-Means:** Likidite yoğunluğunu "Düşük", "Orta", "Kritik" olarak sınıflandırır.

### 🚨 3. Cascade Risk Prediction (Zincirleme Risk Analizi)
*   **XGBoost / LightGBM:** Bir likidasyon başladığında, bunun bir "liquidation cascade" (zincirleme patlama) silsilesine dönüşme olasılığını % olarak hesaplar.
*   **Inputlar:** Orderbook derinliği, anlık volatilite ve kümülatif likidasyon yoğunluğu.

---

*Bu dosya araştırma sonuçlarımızın teknik özetidir.*

