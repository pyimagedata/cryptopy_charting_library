# TradingView Benzeri Özellik Önerileri

Bu dosya, mevcut charting library için TradingView benzeri eklenebilecek özellikleri öncelik sırasına göre toplar.

## Öncelik Sırası

1. Compare / Add Symbol
2. Indicator Templates
3. Measure + Magnet + Snap to Indicators
4. Fixed Range Volume Profile
5. Multi-Chart Layout + Sync
6. Alerts

## 1. Compare / Add Symbol

Aynı grafikte birden fazla sembol göstermek ve istenirse bunları `Indexed to 100` mantığıyla kıyaslamak.

Neden önemli:
- Kullanıcı faydası çok yüksek
- Mevcut chart altyapısına doğal oturur
- TradingView’de çok kullanılan temel özelliklerden biri

Kapsam:
- Ana sembole ek sembol ekleme
- Overlay line olarak gösterme
- Normalize / indexed karşılaştırma seçeneği
- Sağ eksende ayrı değer veya ortak normalize eksen

Kaynaklar:
- https://www.tradingview.com/support/solutions/43000543053-how-to-use-the-compare-tool/
- https://www.tradingview.com/support/solutions/43000477709-when-comparing-symbols-i-only-see-detached-lines-on-the-chart/

## 2. Indicator Templates

Birden fazla indikatörü tek şablon olarak kaydetme ve tekrar uygulama.

Neden önemli:
- Mevcut indicator manager yapısına uygun
- Kullanıcı tekrar tekrar aynı kurulumları oluşturmak zorunda kalmaz
- Teknik olarak orta zorlukta, faydası yüksek

Bu özellik ne demek:
- Kullanıcı grafiğe birden fazla indikatör ekler
- Bu kombinasyonu bir isimle kaydeder
- Daha sonra başka sembolde veya başka chartta tek tıkla aynı kurulum geri yüklenir

Örnek:
- `EMA 20`
- `EMA 50`
- `RSI 14`
- `MACD`
- `Ichimoku`

Bu set `Trend Setup` diye kaydedilebilir.

Kaydedilecek bilgiler:
- hangi indikatörlerin açık olduğu
- period değerleri
- renkler
- çizgi kalınlıkları
- görünürlük ayarları
- panel / overlay yerleşimi

Kapsam:
- Mevcut indicator setini template olarak kaydetme
- Template listeleme
- Template uygulama
- Template silme / yeniden adlandırma

Kaynak:
- https://www.tradingview.com/support/solutions/43000543048-what-are-indicator-templates/

## 3. Measure + Magnet + Snap to Indicators

Çizim araçlarını daha kullanışlı hale getiren yardımcı etkileşimler.

Neden önemli:
- Çizim sistemi zaten var
- Kullanıcı deneyimi belirgin şekilde iyileşir
- TradingView hissine yaklaşan önemli detaylar

Kapsam:
- Measure tool
- Magnet
- Strong / Weak magnet
- Snap to price bars
- Snap to indicator values
- Keep drawing mode
- Lock / hide drawings

Kaynaklar:
- https://www.tradingview.com/support/solutions/43000703396-drawing-tools-available-on-tradingview/
- https://www.tradingview.com/blog/en/magnet-snaps-to-indicators-instantly-50979/

## 4. Fixed Range Volume Profile

Kullanıcının seçtiği fiyat-zaman aralığı için hacim profili çizmek.

Neden önemli:
- Profesyonel kullanım değeri yüksek
- Swing / profile çalışmalarına çok uygun
- Overlay ve drawing altyapısına oturur

Bu özellik ne demek:
- Kullanıcı grafikte iki nokta seçer
- Seçilen aralıktaki tüm mumlar alınır
- Hacim zamana göre değil, fiyat seviyelerine göre dağıtılır
- Sonuç yatay hacim profili olarak çizilir

Normal volume ile farkı:
- Normal volume: bu mumda ne kadar hacim oldu
- Volume profile: bu fiyat seviyelerinde ne kadar hacim birikti

Genelde çıkan seviyeler:
- `POC`: en çok hacim olan fiyat seviyesi
- `VAH`: value area high
- `VAL`: value area low

Ne işe yarar:
- destek / direnç bölgelerini görmek
- kabul gören fiyat alanını bulmak
- breakout sonrası retest bölgesini anlamak
- konsolidasyonun yoğunlaştığı seviyeleri görmek

Kapsam:
- Fixed Range Volume Profile
- İleride Visible Range Volume Profile
- PoC, VAH, VAL çizgileri
- Profil renk ve kutu ayarları

Kaynaklar:
- https://www.tradingview.com/support/solutions/43000502040-volume-profile/
- https://www.tradingview.com/support/solutions/43000707985-fixed-range-volume-profile/

## 5. Multi-Chart Layout + Sync

Aynı ekranda birden fazla chart açmak ve bunları senkronize etmek.

Neden önemli:
- Güçlü ama daha maliyetli özellik
- UI ve state yönetimini büyütür
- Daha sonra yapılması daha doğru

Kapsam:
- 2 / 4 / 6 / 8 chart layout
- Symbol sync
- Crosshair sync
- Interval sync
- Date range sync
- Drawing sync

Kaynaklar:
- https://www.tradingview.com/support/solutions/43000629990-how-to-enable-the-multi-chart-mode/
- https://www.tradingview.com/support/solutions/43000629992-how-to-sync-the-charts-of-my-layout/
- https://www.tradingview.com/support/solutions/43000670346-how-to-synchronize-the-date-range-on-multichart/

## 6. Alerts

Fiyat, indikatör, çizim ve pattern temelli alarmlar.

Neden önemli:
- Ürün değeri yüksek
- Ama backend, saklama ve bildirim tarafı da ister
- En çok mimari karar gerektiren başlıklardan biri

Kapsam:
- Price alert
- Indicator crossing alert
- Drawing alert
- Pattern alert
- Watchlist alert

Kaynaklar:
- https://www.tradingview.com/support/solutions/43000763315-getting-started-with-technical-alerts/
- https://www.tradingview.com/support/solutions/43000520149-creating-and-managing-alerts/
- https://www.tradingview.com/support/solutions/43000739708-watchlist-alerts-your-trading-edge/

## Kolay / Orta / Zor

### Kolay
- Indicator Templates
- Measure tool
- Basic Magnet

### Orta
- Compare / Add Symbol
- Snap to Indicators
- Fixed Range Volume Profile

### Zor
- Multi-Chart Layout + Sync
- Alerts

## Önerilen Yol Haritası

### Aşama 1
- Compare / Add Symbol
- Indicator Templates

### Aşama 2
- Measure tool
- Magnet / Snap

### Aşama 3
- Fixed Range Volume Profile

### Aşama 4
- Multi-chart layout

### Aşama 5
- Alerts

## Not

Buradan ilerlerken en mantıklı yaklaşım:
- önce hızlı değer üreten özellikleri almak
- sonra drawing ve volume profile tarafını güçlendirmek
- en sonda çoklu layout ve alert gibi daha geniş mimari işleri ele almak
