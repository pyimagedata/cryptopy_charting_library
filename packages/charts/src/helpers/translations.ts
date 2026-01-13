export type LanguageCode = 'en' | 'tr';

const TRANSLATIONS: Record<LanguageCode, Record<string, string>> = {
    'en': {
        // English is default, keys act as fallback
    },
    'tr': {
        // UI Status
        'Loading...': 'Yükleniyor...',
        'Connecting...': 'Bağlanıyor...',

        // Toolbar & Tooltip
        'Reset chart view': 'Görünümü Sıfırla',
        'Copy price': 'Fiyatı Kopyala',
        'Take a snapshot': 'Ekran Görüntüsü Al',
        'Fullscreen': 'Tam Ekran',
        'Settings...': 'Ayarlar...',
        'Indicators': 'Göstergeler',
        'Symbol': 'Sembol',
        'Search': 'Ara',
        'Search for symbol...': 'Sembol ara...',
        'No symbols found': 'Sembol bulunamadı',
        'No symbols match your search': 'Aramanızla eşleşen sembol bulunamadı',

        // Chart Types
        'Candlestick': 'Mum',
        'Line': 'Çizgi',
        'Area': 'Alan',
        'Heiken Ashi': 'Heiken Ashi',

        // Technical Rating
        'Strong Buy': 'Güçlü Al',
        'Buy': 'Al',
        'Neutral': 'Nötr',
        'Sell': 'Sat',
        'Strong Sell': 'Güçlü Sat',
        'Technical': 'Teknik',
        'MA Rating': 'HO Puanı',

        // Orderbook
        'Real-time Data': 'Canlı Veri',

        // Drawing Tools
        'Cursor': 'İmleç',
        'Crosshair': 'Artı',
        'Trend Line': 'Trend Çizgisi',
        'Ray': 'Işın',
        'Info Line': 'Bilgi Çizgisi',
        'Extended Line': 'Uzatılmış Çizgi',
        'Trend Angle': 'Trend Açısı',
        'Horizontal Line': 'Yatay Çizgi',
        'Horizontal Ray': 'Yatay Işın',
        'Vertical Line': 'Dikey Çizgi',
        'Cross Line': 'Kesişim Çizgisi',
        'Channels': 'Kanallar',
        'Parallel Channel': 'Paralel Kanal',
        'Regression Trend': 'Regresyon Trendi',
        'Fibonacci': 'Fibonacci',
        'Fib Retracement': 'Fib Düzeltmesi',
        'Fib Extension': 'Fib Uzatması',
        'Fib Channel': 'Fib Kanalı',
        'Shapes': 'Şekiller',
        'Brush': 'Fırça',
        'Highlighter': 'Vurgulayıcı',
        'Arrow': 'Ok',
        'Arrow Marker': 'Ok İşareti',
        'Arrow Marked Up': 'Yukarı Ok',
        'Arrow Marked Down': 'Aşağı Ok',
        'Rectangle': 'Dikdörtgen',
        'Rotated Rectangle': 'Dönük Dikdörtgen',
        'Ellipse': 'Elips',
        'Triangle': 'Üçgen',
        'Arc': 'Yay',
        'Path': 'Yol',
        'Circle': 'Daire',
        'Polyline': 'Çoklu Çizgi',
        'Curve': 'Eğri',
        'Patterns': 'Formasyonlar',
        'XABCD Pattern': 'XABCD Formasyonu',
        'Elliott Impulse Wave (12345)': 'Elliott İtki Dalgası',
        'Elliot Correction Wave (ABC)': 'Elliott Düzeltme Dalgası',
        'Three Drives Pattern': 'Üçlü Sürüş Formasyonu',
        'Head & Shoulders': 'Omuz Baş Omuz',
        'ABCD Pattern': 'ABCD Formasyonu',
        'Triangle Pattern': 'Üçgen Formasyonu',
        'Projection': 'Projeksiyon',
        'Long Position': 'Alış Pozisyonu',
        'Short Position': 'Satış Pozisyonu',
        'Price Range': 'Fiyat Aralığı',
        'Date Range': 'Tarih Aralığı',
        'Date and Price Range': 'Tarih ve Fiyat Aralığı',
        'Annotation': 'Not',
        'Text': 'Metin',
        'Callout': 'Çağrı Balonu',
        'Price Label': 'Fiyat Etiketi',
        'Flag Marked': 'Bayrak',
        'Emotion': 'Duygu',
        'Magnet': 'Mıknatıs',
        'Weak Magnet': 'Zayıf Mıknatıs',
        'Strong Magnet': 'Güçlü Mıknatıs',
        'Lock Drawings': 'Çizimleri Kilitle',
        'Hide Drawings': 'Çizimleri Gizle',
        'Delete All': 'Hepsini Sil',
        'Toggle Orderbook Depth (DOM)': 'Derinlik Tablosunu Göster/Gizle (DOM)',

        // Timeframes
        '1m': '1d',
        '3m': '3d',
        '5m': '5d',
        '15m': '15d',
        '30m': '30d',
        '1h': '1s',
        '2h': '2s',
        '4h': '4s',
        'D': 'G',
        'W': 'H',
        'M': 'A',

        // Symbol Search
        'Symbol Search': 'Sembol Ara',
        'Symbol, ISIN, or CUSIP': 'Sembol, ISIN veya CUSIP',
        'All': 'Tümü',
        'Stocks': 'Hisseler',
        'Funds': 'Fonlar',
        'Futures': 'Vadeli İşlemler',
        'Forex': 'Döviz',
        'Crypto': 'Kripto',
        'Indices': 'Endeksler',
        'Bonds': 'Tahviller',
        'Economy': 'Ekonomi',
        'Options': 'Opsiyonlar',
        'Exchange:': 'Borsa:',
        'All Exchanges': 'Tüm Borsalar',
        'Fetching symbols from all exchanges': 'Tüm borsalardan semboller getiriliyor',
    }
};

let currentLang: LanguageCode = 'en';

export function setLanguage(lang: LanguageCode) {
    // Dynamic validation based on available translations
    if (TRANSLATIONS[lang]) {
        currentLang = lang;
    } else {
        console.warn(`Language ${lang} not supported, falling back to English`);
        currentLang = 'en';
    }
}

export function t(key: string): string {
    if (currentLang === 'en') return key;
    const dict = TRANSLATIONS[currentLang];
    return dict?.[key] || key;
}

export function getCurrentLanguage(): LanguageCode {
    return currentLang;
}
