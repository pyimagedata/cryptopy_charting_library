---
description: PineTS entegrasyonu ile PineScript kodlarını JavaScript'te çalıştırma
---

# PineTS Entegrasyonu (PineScript → JavaScript)

Bu döküman, PineScript kodlarını JavaScript/TypeScript ortamında çalıştırmak için PineTS kütüphanesinin nasıl entegre edileceğini açıklar.

## 🎯 Genel Bakış

**PineTS**, TradingView'ın PineScript dilini JavaScript'e transpile eden ve çalıştıran açık kaynak bir kütüphanedir.

- **GitHub:** https://github.com/QuantForgeOrg/PineTS
- **Uyumluluk:** PineScript v5, v6 (deneysel)
- **Ortam:** Browser + Node.js

## 📦 Kurulum

```bash
npm install @quantforge/pinets
```

## 🔧 Entegrasyon Yöntemleri

### Yöntem 1: Browser'da Çalıştırma (Django Templates)

Django template'inde:

```html
{% load static %}
<!DOCTYPE html>
<html>
<head>
    <title>Chart with PineScript</title>
</head>
<body>
    <div id="chart-container"></div>
    
    <!-- Charting kütüphanesi -->
    <script src="{% static 'js/charts.js' %}"></script>
    
    <!-- PineTS -->
    <script src="https://unpkg.com/@quantforge/pinets@latest/dist/pinets.min.js"></script>
    
    <script>
        // Chart oluştur
        const chart = LightweightCharts.createChart(document.getElementById('chart-container'));
        
        // PineTS ile indikatör çalıştır
        const pineCode = `
            //@version=5
            indicator("My RSI", overlay=false)
            plot(ta.rsi(close, 14))
        `;
        
        // PineTS transpile et ve çalıştır
        const indicator = PineTS.compile(pineCode);
        const results = indicator.calculate(chartData);
        
        // Sonuçları grafiğe çiz
        chart.addLineSeries().setData(results);
    </script>
</body>
</html>
```

### Yöntem 2: Django'dan Veri Gönderme

**Django View:**
```python
import json

def chart_view(request):
    ohlcv_data = get_binance_data()  # Verini çek
    return render(request, 'chart.html', {
        'ohlcv_data': json.dumps(ohlcv_data)
    })
```

**Template:**
```html
<script>
    // Django'dan gelen OHLCV verisi
    const chartData = {{ ohlcv_data|safe }};
    
    // PineTS ile hesapla
    const indicator = PineTS.indicator("RSI", { period: 14 });
    indicator.setData(chartData);
    const rsiValues = indicator.calculate();
</script>
```

### Yöntem 3: Node.js Microservice (Performanslı)

Hesaplamaları server'da yapmak için:

```
Django (Python)  ──HTTP──►  Node.js Service (PineTS)
                              │
                              ▼
                         Hesaplama
                              │
                 ◄────────────┘
                 Sonuçlar (JSON)
```

**Node.js Service Örneği:**
```javascript
const express = require('express');
const PineTS = require('@quantforge/pinets');

const app = express();
app.use(express.json());

app.post('/calculate', (req, res) => {
    const { pineCode, ohlcvData } = req.body;
    
    const indicator = PineTS.compile(pineCode);
    const results = indicator.calculate(ohlcvData);
    
    res.json({ results });
});

app.listen(3001);
```

**Django'dan Çağırma:**
```python
import requests

def calculate_indicator(pine_code, ohlcv_data):
    response = requests.post('http://localhost:3001/calculate', json={
        'pineCode': pine_code,
        'ohlcvData': ohlcv_data
    })
    return response.json()['results']
```

## 📊 Charting Kütüphanesi Entegrasyonu

Mevcut charting kütüphanesine (`charting_library`) entegre etmek için:

```typescript
// chart-widget.ts veya yeni bir dosya

import { PineTS } from '@quantforge/pinets';

class PineScriptIndicator extends OverlayIndicator {
    private _pineCode: string;
    private _compiledIndicator: any;
    
    constructor(pineCode: string) {
        super({ name: 'PineScript Indicator' });
        this._pineCode = pineCode;
        this._compiledIndicator = PineTS.compile(pineCode);
    }
    
    calculate(data: BarData[]): IndicatorData[] {
        // Veriyi PineTS formatına çevir
        const pineData = data.map(bar => ({
            time: bar.time,
            open: bar.open,
            high: bar.high,
            low: bar.low,
            close: bar.close,
            volume: bar.volume
        }));
        
        // PineTS ile hesapla
        return this._compiledIndicator.calculate(pineData);
    }
}

// Kullanım
const rsiIndicator = new PineScriptIndicator(`
    //@version=5
    indicator("RSI", overlay=false)
    plot(ta.rsi(close, 14))
`);

chart.addIndicator(rsiIndicator);
```

## ⚠️ Dikkat Edilecekler

1. **PineTS Tüm Fonksiyonları Desteklemiyor**
   - Eksik fonksiyonlar için hata alabilirsin
   - Alternatif: Eksikleri manuel implement et

2. **Veri Formatı Uyumu**
   - PineTS'in beklediği format ile senin verilerin uyumlu olmalı

3. **Performans**
   - Büyük veri setlerinde client-side hesaplama yavaş olabilir
   - Çözüm: Node.js microservice kullan

## 🔗 Alternatif Kütüphaneler

| Kütüphane | Dil | Özellik |
|-----------|-----|---------|
| **PineTS** | TypeScript | Transpiler + Runtime |
| **pine-transpiler** | JavaScript | Sıfır bağımlılık transpiler |
| **Pynescript** | Python | AST parser |

## 📅 Sonraki Adımlar

- [ ] PineTS'i npm ile projeye ekle
- [ ] `PineScriptIndicator` sınıfını oluştur
- [ ] İndikatör ekleme UI'ına PineScript editörü ekle
- [ ] Popüler PineScript indikatörlerini test et
