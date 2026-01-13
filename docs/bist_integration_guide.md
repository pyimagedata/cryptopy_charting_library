# BIST Data Integration Guide (Backend API)

This document outlines the API contract required for the **Charting Library** to display BIST (Borsa İstanbul) stock data. The frontend `BistDataProvider` expects a REST API to fetch historical and "real-time" (delayed polling) market data.

## 1. Base URL config

By default, the library connects to:
`http://localhost:8000/api/v1/market`

You can configure this by passing the `baseUrl` to the provider constructor or via global config.

---

## 2. API Endpoints

The Backend must implement the following **GET** endpoints:

### A. Historical Data (K-Lines)

Returns a list of OHLCV candles for the initial chart load.

**Endpoint:** `GET /history`

**Parameters:**
| Parameter | Type | Required | Description | Example |
| :--- | :--- | :--- | :--- | :--- |
| `symbol` | string | Yes | Ticker symbol | `THYAO` |
| `interval` | string | Yes | Timeframe interval | `15m`, `1h`, `1d` |
| `limit` | number | No | Max number of candles (Default: 200) | `500` |
| `from` | number | No | Start timestamp (Unix ms) | `1704067200000` |
| `to` | number | No | End timestamp (Unix ms) | `1704153600000` |

**Response Format (JSON Array):**
```json
[
  {
    "time": 1704067200000,  // Unix Timestamp in MILLISECONDS (number)
    "open": 280.50,         // Number
    "high": 285.00,
    "low": 279.00,
    "close": 282.25,
    "volume": 150000        // Number
  },
  ...
]
```

### B. Latest Candle (Polling)

Returns the *single most recent* candle. The frontend polls this every 1 minute to update the chart in "real-time" (incorporating the 15-min delay logic if handled by backend).

**Endpoint:** `GET /last-candle`

**Parameters:**
| Parameter | Type | Required | Description | Example |
| :--- | :--- | :--- | :--- | :--- |
| `symbol` | string | Yes | Ticker symbol | `THYAO` |
| `interval` | string | Yes | Timeframe interval | `15m` |

**Response Format (JSON Object):**
```json
{
  "time": 1704153900000,
  "open": 282.25,
  "high": 283.00,
  "low": 282.00,
  "close": 282.75,
  "volume": 5000
}
```

---

## 3. Implementation Notes

### Timestamp Handling
*   **Critical:** The `time` field MUST be a Unix Timestamp in **milliseconds**.
*   If your database stores seconds, multiply by 1000 before sending.
*   Timestamps should be UTC.

### Interval Mapping
The frontend sends standard TradingView-style interval strings:
*   `1m`, `5m`, `15m`, `30m`
*   `1h`, `2h`, `4h`
*   `1d`, `1w`, `1M`

Ensure your backend can parse these strings or map them to your internal enum (e.g., `15m` -> `15`).

### 15-Minute Delay Logic
Since BIST data is usually delayed:
*   **Option A (Backend Handles Delay):** The `/last-candle` endpoint should return the candle from **15 minutes ago**. The frontend just displays what it gets. (Recommended)
*   **Option B (Frontend Handles Delay):** The backend sends real-time data, but marks it as "delayed" in a metadata field (not currently implemented in the provider).

### CORS
Since the Charting Library runs in the browser, your API must support **CORS** (Cross-Origin Resource Sharing) if hosted on a different domain/port.

```http
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, OPTIONS
```

---

## 4. Error Handling

If data is unavailable or symbol is invalid, return standard HTTP error codes:
*   `404 Not Found`: Symbol does not exist.
*   `400 Bad Request`: Missing parameters.
*   `500 Internal Server Error`: Upstream data provider failure.

The frontend provider logs errors to the console properly but does not crash the app.
