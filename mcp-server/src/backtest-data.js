import { createReadStream } from 'node:fs';
import { open, readFile, writeFile, mkdir, stat, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

// External historical datasets for draft backtests (phase 1: data layer).
//
// A manifest (datasets.json) in BACKTEST_DATA_DIR lists CSV sources. A CSV is
// ingested ONCE (streaming parse, timestamps converted to UTC epoch ms) into
// a columnar Float64 binary cache; later requests read that cache (fast) and
// aggregate to the requested timeframe/range on the fly. The slice is handed
// to the browser as ONE binary buffer (see ChartBridge.call) and exposed to
// the script as globalThis.__backtestData -- see DRAFT_BACKTEST_GUIDE.
//
// The manifest is operator-controlled (no MCP tool writes it); LLM-supplied
// values are only dataset NAMES (validated like draft names) and never paths.

const HERE = path.dirname(fileURLToPath(import.meta.url));

export const BACKTEST_DATA_DIR = path.resolve(
    process.env.BACKTEST_DATA_DIR || path.join(HERE, '..', '..', 'backtest_data')
);
const CACHE_DIR = path.join(BACKTEST_DATA_DIR, 'cache');
const MANIFEST_PATH = path.join(BACKTEST_DATA_DIR, 'datasets.json');

function positiveEnv(name, dflt) {
    const n = Number(process.env[name]);
    return Number.isFinite(n) && n > 0 ? n : dflt;
}

export const MAX_BARS = positiveEnv('BACKTEST_MAX_BARS', 2_000_000);
// load_dataset_to_chart: max candles pushed onto a chart (the browser builds one object per bar).
export const CHART_MAX_BARS = positiveEnv('BACKTEST_CHART_MAX_BARS', 300_000);
// Total bytes of decoded datasets kept in memory (LRU-evicted beyond this).
const MAX_RESIDENT_BYTES = positiveEnv('BACKTEST_MAX_RESIDENT_MB', 1024) * 1024 * 1024;

const CACHE_VERSION = 1;
const FIELDS = ['t', 'o', 'h', 'l', 'c', 'v'];

const MS_MIN = 60_000;
const MS_H = 3_600_000;
const MS_D = 86_400_000;

// UTC-aligned bucket sizes. "1d_ny" is handled separately (17:00 New York).
const TF_MS = {
    '1m': MS_MIN,
    '5m': 5 * MS_MIN,
    '15m': 15 * MS_MIN,
    '30m': 30 * MS_MIN,
    '1h': MS_H,
    '4h': 4 * MS_H,
    '1d': MS_D,
};
export const TIMEFRAMES = [...Object.keys(TF_MS), '1d_ny'];

// ---------------------------------------------------------------------------
// Time zones
// ---------------------------------------------------------------------------
//
// Dataset tz values:
//   "UTC"    timestamps are already UTC.
//   "ny+7"   broker "New York close" clock: America/New_York wall time + 7h
//            (= UTC+2 while US DST is off, UTC+3 while it is on).
//   <IANA>   any IANA zone name, e.g. "Europe/Istanbul".
//   [{tz, until?}, ...]  SEGMENTS for feeds whose clock convention changed:
//            each `until` is an exclusive bound in the file's own local wall
//            time ("2020-03-29T00:00:00"); the last segment has no `until`.
//            The XAU_1m file needs this: "ny+7" until 2020-03-29, then
//            "Europe/Athens" (UTC+2 / UTC+3 on EU DST dates) -- see
//            backtest_data/datasets.json.
//
// Deterministic DST-edge policy (all zones): when a local wall time is
// AMBIGUOUS (clock repeated at fall-back) the FIRST occurrence (pre-transition,
// i.e. earlier UTC instant) is used; when it does NOT EXIST (spring-forward
// gap) the offset in force BEFORE the transition is used (so the time lands
// after the gap). For "ny+7" the policy is applied to the NY wall time
// (local - 7h). In practice the broker switches on Sunday while the market is
// closed, so real data never hits these cases.

function daysFromCivil(y, m, d) {
    y -= m <= 2 ? 1 : 0;
    const era = Math.floor(y / 400);
    const yoe = y - era * 400;
    const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
    const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
    return era * 146097 + doe - 719468;
}

function dayOfWeek(days) { // 0 = Sunday
    return ((days % 7) + 11) % 7; // 1970-01-01 (day 0) was a Thursday (4)
}

function nthSundayDays(y, m, n) { // n-th Sunday of month (n >= 1)
    const first = daysFromCivil(y, m, 1);
    return first + ((7 - dayOfWeek(first)) % 7) + (n - 1) * 7;
}

function lastSundayDays(y, m) {
    const last = daysFromCivil(y, m + 1, 1) - 1;
    return last - dayOfWeek(last);
}

const _usBoundsCache = new Map();
/**
 * US (America/New_York) DST bounds for a year, as epoch-style "wall" ms.
 * 2007+: 2nd Sunday of March -> 1st Sunday of November.
 * Earlier (valid 1987-2006): 1st Sunday of April -> last Sunday of October.
 */
function usDstBounds(y) {
    let b = _usBoundsCache.get(y);
    if (b) return b;
    const startDay = y >= 2007 ? nthSundayDays(y, 3, 2) : nthSundayDays(y, 4, 1);
    const endDay = y >= 2007 ? nthSundayDays(y, 11, 1) : lastSundayDays(y, 10);
    b = {
        // first wall time that exists after the spring-forward gap (03:00)
        startWall: startDay * MS_D + 3 * MS_H,
        // wall 02:00 on the fall-back day (wall 01:00-02:00 occurs twice; first = DST)
        endWall: endDay * MS_D + 2 * MS_H,
        // UTC instants: 02:00 EST = 07:00Z, 02:00 EDT = 06:00Z
        startUtc: startDay * MS_D + 7 * MS_H,
        endUtc: endDay * MS_D + 6 * MS_H,
    };
    _usBoundsCache.set(y, b);
    return b;
}

function yearOfMs(ms) {
    return new Date(ms).getUTCFullYear();
}

// Year lookup is hot (millions of calls during ingest) -- remember the last
// resolved year range so most calls avoid constructing a Date.
let _yLo = 0, _yHi = -1, _yVal = 0;
function usBoundsFor(ms) {
    if (!(ms >= _yLo && ms < _yHi)) {
        _yVal = yearOfMs(ms);
        _yLo = Date.UTC(_yVal, 0, 1) - MS_D; // +/- 1 day margin: DST never occurs near Jan 1
        _yHi = Date.UTC(_yVal + 1, 0, 1) - MS_D;
    }
    return usDstBounds(_yVal);
}

/** New York wall time (as epoch-style ms) -> UTC ms. */
export function nyWallToUtc(wall) {
    const b = usBoundsFor(wall);
    const dst = wall >= b.startWall && wall < b.endWall;
    return wall + (dst ? 4 : 5) * MS_H;
}

/** UTC offset of America/New_York at a UTC instant, in ms (negative). */
export function nyOffsetAtUtc(utc) {
    const b = usBoundsFor(utc);
    return utc >= b.startUtc && utc < b.endUtc ? -4 * MS_H : -5 * MS_H;
}

function makeIanaConverter(tz) {
    const fmt = new Intl.DateTimeFormat('en-US', {
        timeZone: tz, hourCycle: 'h23',
        year: 'numeric', month: 'numeric', day: 'numeric',
        hour: 'numeric', minute: 'numeric', second: 'numeric',
    });
    const cache = new Map(); // 15-min bucket -> offset ms
    const offsetAt = (utc) => {
        const key = Math.floor(utc / (15 * MS_MIN));
        let off = cache.get(key);
        if (off === undefined) {
            const p = {};
            for (const part of fmt.formatToParts(new Date(key * 15 * MS_MIN))) p[part.type] = Number(part.value);
            off = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - key * 15 * MS_MIN;
            cache.set(key, off);
        }
        return off;
    };
    return (local) => {
        const before = offsetAt(local - MS_D);
        const after = offsetAt(local + MS_D);
        const cands = [];
        for (const off of new Set([before, after])) {
            const u = local - off;
            if (offsetAt(u) === off) cands.push(u);
        }
        if (cands.length === 0) return local - before; // gap: pre-transition offset
        return Math.min(...cands);                      // ambiguous: first occurrence
    };
}

function makeSingleTzConverter(tz) {
    if (tz === 'UTC') return (x) => x;
    if (tz === 'ny+7') return (local) => nyWallToUtc(local - 7 * MS_H);
    if (typeof tz !== 'string') throw new Error('tz must be a string.');
    try {
        return makeIanaConverter(tz);
    } catch {
        throw new Error(`Unsupported tz "${tz}": use "UTC", "ny+7" or an IANA zone name like "Europe/Istanbul".`);
    }
}

/** Parse a naive local wall-time string ("2020-03-29T00:00:00") to epoch-style ms. */
function parseWall(str, label) {
    const ms = Date.parse(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(str) ? str : `${str}Z`);
    if (!Number.isFinite(ms)) throw new Error(`${label} "${str}" is not a valid local date-time.`);
    return ms;
}

/**
 * Returns a function local-wall-ms -> UTC ms for a dataset tz spec
 * (string, or an array of {tz, until?} segments -- see above).
 */
export function makeTzConverter(spec) {
    if (!Array.isArray(spec)) return makeSingleTzConverter(spec);
    if (spec.length === 0) throw new Error('tz segments must not be empty.');
    const segs = spec.map((seg, i) => {
        if (!seg || typeof seg !== 'object') throw new Error('tz segment must be an object {tz, until?}.');
        const last = i === spec.length - 1;
        if (last && seg.until !== undefined) throw new Error('The last tz segment must not have "until".');
        if (!last && seg.until === undefined) throw new Error('Every tz segment except the last needs "until".');
        return { until: last ? Infinity : parseWall(seg.until, 'tz segment until'), conv: makeSingleTzConverter(seg.tz) };
    });
    for (let i = 1; i < segs.length; i++) {
        if (!(segs[i].until > segs[i - 1].until)) throw new Error('tz segment "until" values must be strictly ascending.');
    }
    return (local) => {
        for (const sg of segs) if (local < sg.until) return sg.conv(local);
        return segs[segs.length - 1].conv(local);
    };
}

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------

export function assertDatasetName(name) {
    if (typeof name !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(name)) {
        throw new Error('Invalid dataset name: only letters, numbers, "_" and "-" are allowed (no paths).');
    }
}

/** Validate a parsed manifest; returns normalized entries. Exported for tests. */
export function validateManifest(raw) {
    if (!Array.isArray(raw)) throw new Error('datasets.json must be an array of dataset entries.');
    const seen = new Set();
    return raw.map((e, i) => {
        const where = `datasets.json entry #${i}`;
        if (!e || typeof e !== 'object') throw new Error(`${where}: must be an object.`);
        try { assertDatasetName(e.name); } catch (err) { throw new Error(`${where}: ${err.message}`); }
        if (seen.has(e.name)) throw new Error(`${where}: duplicate name "${e.name}".`);
        seen.add(e.name);
        if (typeof e.symbol !== 'string' || !e.symbol) throw new Error(`${where} ("${e.name}"): symbol is required.`);
        if (typeof e.source !== 'string' || !e.source) throw new Error(`${where} ("${e.name}"): source (CSV path) is required.`);
        if (!e.tz || (typeof e.tz !== 'string' && !Array.isArray(e.tz))) throw new Error(`${where} ("${e.name}"): tz is required ("UTC", "ny+7", IANA name, or [{tz, until?}] segments).`);
        try { makeTzConverter(e.tz); } catch (err) { throw new Error(`${where} ("${e.name}"): ${err.message}`); }
        if (e.priceBasis !== undefined && e.priceBasis !== 'mid' && e.priceBasis !== 'bid') throw new Error(`${where} ("${e.name}"): priceBasis must be "mid" or "bid".`);
        const timeframe = e.timeframe ?? '1m';
        if (!TF_MS[timeframe]) throw new Error(`${where} ("${e.name}"): timeframe must be one of ${Object.keys(TF_MS).join(', ')}.`);
        return {
            name: e.name,
            symbol: e.symbol,
            source: path.resolve(BACKTEST_DATA_DIR, e.source),
            tz: e.tz,
            timeframe,
            note: typeof e.note === 'string' ? e.note : '',
            priceBasis: e.priceBasis === undefined ? undefined : e.priceBasis,
        };
    });
}

export async function loadManifest() {
    let text;
    try {
        text = await readFile(MANIFEST_PATH, 'utf-8');
    } catch (err) {
        if (err.code === 'ENOENT') return [];
        throw err;
    }
    let raw;
    try { raw = JSON.parse(text); } catch (err) { throw new Error(`datasets.json is not valid JSON: ${err.message}`); }
    return validateManifest(raw);
}

async function getManifestEntry(name) {
    assertDatasetName(name);
    const entry = (await loadManifest()).find(e => e.name === name);
    if (!entry) throw new Error(`Unknown dataset "${name}". Use list_backtest_datasets to see available datasets.`);
    return entry;
}

// ---------------------------------------------------------------------------
// Ingest (streaming CSV -> columnar Float64 cache)
// ---------------------------------------------------------------------------

function parseDateField(buf, s, e) {
    // YYYY-MM-DD[ T]HH:MM[:SS[.fff]]
    if (e - s < 16) return NaN;
    const d2 = (i) => {
        const a = buf[i] - 48, b = buf[i + 1] - 48;
        return a >= 0 && a <= 9 && b >= 0 && b <= 9 ? a * 10 + b : NaN;
    };
    const hi = d2(s), lo = d2(s + 2);
    const mo = d2(s + 5), da = d2(s + 8), hh = d2(s + 11), mi = d2(s + 14);
    if (buf[s + 4] !== 45 || buf[s + 7] !== 45 || (buf[s + 10] !== 32 && buf[s + 10] !== 84) || buf[s + 13] !== 58) return NaN;
    let ss = 0;
    if (e - s >= 19 && buf[s + 16] === 58) ss = d2(s + 17);
    const y = hi * 100 + lo;
    if (!(y >= 1900 && mo >= 1 && mo <= 12 && da >= 1 && da <= 31 && hh <= 23 && mi <= 59 && ss <= 60)) return NaN;
    return daysFromCivil(y, mo, da) * MS_D + hh * MS_H + mi * MS_MIN + ss * 1000;
}

function parseNumField(buf, s, e) {
    if (e <= s) return NaN;
    let i = s;
    let neg = false;
    if (buf[i] === 45) { neg = true; i++; } else if (buf[i] === 43) i++;
    let int = 0, nd = 0, c;
    while (i < e && (c = buf[i]) >= 48 && c <= 57) { int = int * 10 + (c - 48); i++; nd++; }
    let scale = 1;
    if (i < e && buf[i] === 46) {
        i++;
        while (i < e && (c = buf[i]) >= 48 && c <= 57) { int = int * 10 + (c - 48); scale *= 10; i++; nd++; }
    }
    if (i !== e || nd === 0 || nd > 15) {
        const v = Number(buf.latin1Slice(s, e)); // exponent / long digits / junk
        return v;
    }
    // single exactly-rounded division == correctly rounded decimal parse
    const v = int / scale;
    return neg ? -v : v;
}

function headDigest(buf) {
    return createHash('sha1').update(buf).digest('hex');
}

async function sourceFingerprint(source) {
    const st = await stat(source);
    const fh = await open(source, 'r');
    try {
        const n = Math.min(65536, st.size);
        const head = Buffer.alloc(n), tail = Buffer.alloc(n);
        await fh.read(head, 0, n, 0);
        await fh.read(tail, 0, n, Math.max(0, st.size - n));
        return { size: st.size, mtimeMs: st.mtimeMs, sample: headDigest(Buffer.concat([head, tail])) };
    } finally {
        await fh.close();
    }
}

function qualityFromSeries(t, n, qCounts) {
    // Gap analysis on the final sorted, de-duplicated series.
    const g = { gt1m: 0, gt5m: 0, gt1h: 0, gt1d: 0, maxMs: 0 };
    const biggest = []; // [{ms, afterT}] top 10
    const perYear = {};
    let missingWithinDay = 0; // sum of (dt/1m - 1) over gaps <= 6h (excludes breaks/weekends)
    for (let i = 0; i < n; i++) {
        const y = new Date(t[i]).getUTCFullYear();
        perYear[y] = (perYear[y] || 0) + 1;
        if (i === 0) continue;
        const dt = t[i] - t[i - 1];
        if (dt <= MS_MIN) continue;
        g.gt1m++;
        if (dt > 5 * MS_MIN) g.gt5m++;
        if (dt > MS_H) g.gt1h++;
        if (dt > MS_D) g.gt1d++;
        if (dt <= 6 * MS_H) missingWithinDay += dt / MS_MIN - 1;
        if (dt > g.maxMs) g.maxMs = dt;
        if (biggest.length < 10 || dt > biggest[biggest.length - 1].ms) {
            biggest.push({ ms: dt, afterT: t[i - 1] });
            biggest.sort((a, b) => b.ms - a.ms);
            if (biggest.length > 10) biggest.pop();
        }
    }
    return {
        ...qCounts,
        gaps: {
            ...g,
            maxHours: +(g.maxMs / MS_H).toFixed(2),
            missingMinutesInGapsUpTo6h: missingWithinDay,
            biggest: biggest.map(x => ({
                hours: +(x.ms / MS_H).toFixed(2),
                from: new Date(x.afterT).toISOString(),
                to: new Date(x.afterT + x.ms).toISOString(),
            })),
        },
        barsPerYear: perYear,
    };
}

async function ingest(entry) {
    try {
        return await ingestInner(entry);
    } catch (err) {
        // Full paths / OS details stay server-side; callers only see the dataset name.
        console.error(`[backtest-data] ingest of "${entry.name}" failed (${entry.source}):`, err);
        throw new Error(`Ingest of dataset "${entry.name}" failed: ${err.code === 'ENOENT' ? 'source file not found' : (err.message || 'unknown error').replaceAll(entry.source, '<source>')}. See server log.`);
    }
}

async function ingestInner(entry) {
    const t0 = Date.now();
    const toUtc = makeTzConverter(entry.tz);
    const fp = await sourceFingerprint(entry.source);

    let cap = Math.max(1024, Math.floor(fp.size / 40));
    let arrs = FIELDS.map(() => new Float64Array(cap));
    let n = 0;
    const grow = () => {
        cap = Math.floor(cap * 1.5);
        arrs = arrs.map(a => { const b = new Float64Array(cap); b.set(a.subarray(0, n)); return b; });
    };

    // role per column: 0 t, 1 o, 2 h, 3 l, 4 c, 5 v, -1 ignored
    let roles = null;
    const q = { badRows: 0, badRowSamples: [], nonFinite: 0, hLtL: 0, openOutOfRange: 0, closeOutOfRange: 0, nonPositivePrice: 0, zeroVolume: 0 };
    let carry = null;
    let firstLine = true;
    const vals = new Float64Array(6);

    const handleLine = (buf, s, e) => {
        if (e > s && buf[e - 1] === 13) e--;
        if (e <= s) return;
        if (firstLine) {
            firstLine = false;
            const c0 = buf[s];
            if (!(c0 >= 48 && c0 <= 57)) { // header row
                const names = buf.latin1Slice(s, e).split(',').map(x => x.trim().toLowerCase());
                const roleOf = (nm) => {
                    if (['date', 'time', 'timestamp', 'datetime'].includes(nm)) return 0;
                    if (nm === 'open') return 1;
                    if (nm === 'high') return 2;
                    if (nm === 'low') return 3;
                    if (nm === 'close') return 4;
                    if (nm === 'volume' || nm === 'vol') return 5;
                    return -1;
                };
                roles = names.map(roleOf);
                for (let r = 0; r <= 4; r++) {
                    if (!roles.includes(r)) throw new Error(`CSV header lacks a required column (${['date', 'open', 'high', 'low', 'close'][r]}): "${names.join(',')}"`);
                }
                return;
            }
            roles = [0, 1, 2, 3, 4, 5]; // headerless: Date,O,H,L,C,V
        }
        vals.fill(0);
        vals[5] = roles.includes(5) ? NaN : 0; // no volume column => 0
        let p = s, col = 0, ok = true;
        while (p <= e && col < roles.length) {
            let qq = p;
            while (qq < e && buf[qq] !== 44) qq++;
            const role = roles[col];
            if (role === 0) vals[0] = parseDateField(buf, p, qq);
            else if (role > 0) vals[role] = parseNumField(buf, p, qq);
            p = qq + 1;
            col++;
        }
        if (!Number.isFinite(vals[0])) ok = false;
        if (!ok) {
            q.badRows++;
            if (q.badRowSamples.length < 5) q.badRowSamples.push(buf.latin1Slice(s, Math.min(e, s + 120)));
            return;
        }
        const o = vals[1], h = vals[2], l = vals[3], c = vals[4];
        let v = vals[5];
        if (!(Number.isFinite(o) && Number.isFinite(h) && Number.isFinite(l) && Number.isFinite(c))) {
            // Any missing / non-finite OHLC value: drop the row (counted as badRows).
            q.badRows++;
            if (q.badRowSamples.length < 5) q.badRowSamples.push(buf.latin1Slice(s, Math.min(e, s + 120)));
            return;
        }
        // Volume: a missing column (header without volume) or an empty/invalid
        // cell is stored as 0 (counted in nonFinite); it never drops the row.
        if (!Number.isFinite(v)) { q.nonFinite++; v = 0; }
        if (h < l) q.hLtL++;
        if (o > h || o < l) q.openOutOfRange++;
        if (c > h || c < l) q.closeOutOfRange++;
        if (o <= 0 || h <= 0 || l <= 0 || c <= 0) q.nonPositivePrice++;
        if (v === 0) q.zeroVolume++;
        if (n === cap) grow();
        arrs[0][n] = toUtc(vals[0]);
        arrs[1][n] = o; arrs[2][n] = h; arrs[3][n] = l; arrs[4][n] = c; arrs[5][n] = v;
        n++;
    };

    const feed = (chunk) => {
        let buf = chunk;
        if (carry) { buf = Buffer.concat([carry, chunk]); carry = null; }
        let s = 0;
        for (;;) {
            const nl = buf.indexOf(10, s);
            if (nl === -1) break;
            handleLine(buf, s, nl);
            s = nl + 1;
        }
        if (s < buf.length) carry = Buffer.from(buf.subarray(s));
    };

    for await (const chunk of createReadStream(entry.source, { highWaterMark: 4 * 1024 * 1024 })) feed(chunk);
    if (carry) handleLine(carry, 0, carry.length);
    if (n === 0) throw new Error('no valid rows parsed');

    // Ordering: count, then (if needed) stable sort + de-duplicate (keep LAST row per timestamp).
    let t = arrs[0];
    let outOfOrder = 0, duplicatesInFileOrder = 0;
    for (let i = 1; i < n; i++) {
        if (t[i] < t[i - 1]) outOfOrder++;
        else if (t[i] === t[i - 1]) duplicatesInFileOrder++;
    }
    let duplicates = duplicatesInFileOrder;
    if (outOfOrder > 0 || duplicatesInFileOrder > 0) {
        const idx = new Uint32Array(n);
        for (let i = 0; i < n; i++) idx[i] = i;
        if (outOfOrder > 0) idx.sort((a, b) => (t[a] - t[b]) || (a - b)); // stable by file order
        const keep = [];
        let dupAll = 0;
        for (let k = 0; k < n; k++) {
            if (k + 1 < n && t[idx[k]] === t[idx[k + 1]]) { dupAll++; continue; } // later row wins
            keep.push(idx[k]);
        }
        duplicates = dupAll;
        const m = keep.length;
        arrs = arrs.map(a => { const b = new Float64Array(m); for (let k = 0; k < m; k++) b[k] = a[keep[k]]; return b; });
        n = m;
        t = arrs[0];
    }

    const quality = qualityFromSeries(t, n, { rows: n + duplicates, duplicates, outOfOrder, ...q });

    // Write cache: 6 concatenated Float64 columns (little-endian), then meta.
    await mkdir(CACHE_DIR, { recursive: true });
    const binPath = path.join(CACHE_DIR, `${entry.name}.f64`);
    const tmpPath = `${binPath}.tmp`;
    const fh = await open(tmpPath, 'w');
    try {
        for (const a of arrs) {
            const view = Buffer.from(a.buffer, a.byteOffset, n * 8);
            await fh.write(view, 0, view.length);
        }
    } finally {
        await fh.close();
    }
    await rename(tmpPath, binPath);

    const meta = {
        version: CACHE_VERSION,
        name: entry.name,
        symbol: entry.symbol,
        source: entry.source,
        sourceFingerprint: fp,
        tz: entry.tz,
        timeframe: entry.timeframe,
        count: n,
        fromMs: t[0],
        toMs: t[n - 1],
        from: new Date(t[0]).toISOString(),
        to: new Date(t[n - 1]).toISOString(),
        quality,
        note: entry.note,
        ingestedAt: new Date().toISOString(),
        ingestMs: Date.now() - t0,
    };
    const metaPath = path.join(CACHE_DIR, `${entry.name}.meta.json`);
    await writeFile(`${metaPath}.tmp`, JSON.stringify(meta, null, 2));
    await rename(`${metaPath}.tmp`, metaPath);
    return meta;
}

async function readMeta(entry) {
    try {
        return JSON.parse(await readFile(path.join(CACHE_DIR, `${entry.name}.meta.json`), 'utf-8'));
    } catch (err) {
        if (err.code === 'ENOENT') return null;
        throw err;
    }
}

async function metaIsFresh(entry, meta) {
    if (!meta || meta.version !== CACHE_VERSION) return false;
    if (JSON.stringify(meta.tz) !== JSON.stringify(entry.tz) || meta.timeframe !== entry.timeframe || meta.symbol !== entry.symbol || meta.source !== entry.source) return false;
    let fp;
    try { fp = await sourceFingerprint(entry.source); } catch { return false; }
    const f = meta.sourceFingerprint;
    return !!f && f.size === fp.size && f.mtimeMs === fp.mtimeMs && f.sample === fp.sample;
}

const _inflight = new Map(); // name -> Promise<meta>
/** Ingest (if the cache is missing/stale) and return the dataset meta. */
export async function ensureIngested(name) {
    if (_inflight.has(name)) return _inflight.get(name);
    const entry = await getManifestEntry(name);
    if (_inflight.has(name)) return _inflight.get(name);
    const existing = await readMeta(entry);
    if (await metaIsFresh(entry, existing)) return existing;
    if (_inflight.has(name)) return _inflight.get(name);
    if (!_inflight.has(name)) {
        const p = ingest(entry).finally(() => _inflight.delete(name));
        _inflight.set(name, p);
    }
    return _inflight.get(name);
}

// ---------------------------------------------------------------------------
// Reading the cache (kept in memory for a short idle window)
// ---------------------------------------------------------------------------

const IDLE_MS = 5 * 60_000;
const _loaded = new Map(); // name -> { meta, cols, bytes, timer, lastUsed }  (insertion order = LRU order)
const _loading = new Map(); // name -> Promise<entry>  (de-dupes concurrent loads)

function residentBytes() {
    let n = 0;
    for (const e of _loaded.values()) n += e.bytes;
    return n;
}

function evict(name, entry) {
    if (_loaded.get(name) !== entry) return; // already replaced by a newer entry
    if (entry.timer) clearTimeout(entry.timer);
    _loaded.delete(name);
}

/** Drop least-recently-used datasets (never `keep`) until under the resident budget. */
function enforceBudget(keep) {
    for (const [name, entry] of _loaded) {
        if (residentBytes() <= MAX_RESIDENT_BYTES) break;
        if (name === keep) continue;
        evict(name, entry);
    }
}

function touch(name, entry) {
    _loaded.delete(name); // re-insert => most recently used
    _loaded.set(name, entry);
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = setTimeout(() => evict(name, entry), IDLE_MS);
    entry.timer.unref();
}

async function readColumns(name, meta) {
    const n = meta.count;
    const all = new Float64Array(6 * n);
    const fh = await open(path.join(CACHE_DIR, `${name}.f64`), 'r');
    try {
        const target = Buffer.from(all.buffer);
        let off = 0;
        while (off < target.length) {
            const { bytesRead } = await fh.read(target, off, Math.min(64 * 1024 * 1024, target.length - off), off);
            if (bytesRead === 0) throw new Error(`Cache file for "${name}" is truncated; delete the dataset's cache files on the server to re-ingest.`);
            off += bytesRead;
        }
    } finally {
        await fh.close();
    }
    const cols = {};
    FIELDS.forEach((f, i) => { cols[f] = all.subarray(i * n, (i + 1) * n); });
    return { meta, cols, bytes: all.byteLength, timer: null };
}

async function loadBase(name) {
    const meta = await ensureIngested(name);
    const hit = _loaded.get(name);
    if (hit && hit.meta.ingestedAt === meta.ingestedAt) {
        touch(name, hit);
        return hit;
    }
    const key = `${name}@${meta.ingestedAt}`;
    let p = _loading.get(name);
    if (!p || p.key !== key) {
        p = readColumns(name, meta).then((entry) => {
            const old = _loaded.get(name);
            if (old) evict(name, old);
            _loaded.set(name, entry);
            touch(name, entry);
            enforceBudget(name);
            return entry;
        }).finally(() => { if (_loading.get(name) === p) _loading.delete(name); });
        p.key = key;
        _loading.set(name, p);
    }
    return p;
}

/** Test hook: current in-memory state. */
export function _residentState() {
    return { names: [..._loaded.keys()], bytes: residentBytes(), loading: _loading.size };
}
export function _dropResident() {
    for (const [n, e] of [..._loaded]) evict(n, e);
}

// ---------------------------------------------------------------------------
// Slicing + aggregation
// ---------------------------------------------------------------------------

/**
 * from/to input. Numbers / numeric strings by digit count (sign ignored):
 *   4 digits  -> calendar year (UTC, Jan 1 00:00:00)
 *   10 digits -> epoch SECONDS
 *   12+ digits -> epoch MILLISECONDS
 * any other digit count is ambiguous and rejected. Strings otherwise are
 * ISO-8601 (no zone => UTC).
 */
export function parseTimeInput(v, label) {
    if (v === undefined || v === null || v === '') return null;
    const numeric = (x, text) => {
        if (!Number.isFinite(x) || !Number.isInteger(x)) throw new Error(`${label} ${text} is not an integer timestamp.`);
        const digits = String(Math.abs(x)).length;
        if (digits === 4) return Date.UTC(x, 0, 1);
        if (digits === 10) return x * 1000;
        if (digits >= 12) return x;
        throw new Error(`${label} ${text} is ambiguous (${digits} digits): use a 4-digit year, 10-digit epoch seconds, 12+-digit epoch milliseconds, or an ISO date string like "2020-01-01".`);
    };
    if (typeof v === 'number') return numeric(v, String(v));
    if (typeof v === 'string') {
        const trimmed = v.trim();
        if (/^-?\d+(\.\d+)?$/.test(trimmed)) return numeric(Number(trimmed), `"${v}"`);
        let iso = trimmed.replace(' ', 'T');
        if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) iso += 'T00:00:00Z';
        else if (!/(?:Z|[+-]\d{2}:?\d{2})$/i.test(iso)) iso += 'Z'; // no zone => UTC
        const ms = Date.parse(iso);
        if (!Number.isFinite(ms)) throw new Error(`${label} "${v}" is not a valid ISO date or epoch timestamp.`);
        return ms;
    }
    throw new Error(`${label} must be an ISO string or an epoch timestamp.`);
}

function makeBucketer(tf) {
    if (tf === '1d_ny') {
        // Session day starts 17:00 New York (21:00Z in US summer, 22:00Z in winter);
        // labelled by that start instant (UTC ms).
        return (t) => {
            const wall = t + nyOffsetAtUtc(t);
            const start = Math.floor((wall - 17 * MS_H) / MS_D) * MS_D + 17 * MS_H;
            return nyWallToUtc(start);
        };
    }
    const ms = TF_MS[tf];
    return (t) => t - (((t % ms) + ms) % ms);
}

function lowerBound(arr, x) {
    let lo = 0, hi = arr.length;
    while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (arr[mid] < x) lo = mid + 1; else hi = mid;
    }
    return lo;
}

/**
 * Pure slice/aggregate over columnar base arrays. Bars are labelled by bucket
 * START (open time, UTC ms). Range is [from, to) on the bar's open time; the
 * first/last bars are always COMPLETE buckets (a bucket that starts before
 * `from` is dropped, never truncated). Exported for tests.
 *
 * `keepLast`: instead of throwing when the range has more than `maxBars` buckets,
 * keep only the most recent `maxBars` (res.totalBars = the untrimmed count).
 *
 * Returns { count, buffer: Float64Array(6*count) laid out t,o,h,l,c,v, views }.
 */
export function aggregateSlice(base, { timeframe, from = null, to = null, maxBars = MAX_BARS, baseTimeframe = '1m', keepLast = false }) {
    if (timeframe !== '1d_ny' && !TF_MS[timeframe]) throw new Error(`Unsupported timeframe "${timeframe}". Use one of: ${TIMEFRAMES.join(', ')}.`);
    const baseMs = TF_MS[baseTimeframe];
    if (timeframe !== '1d_ny' && TF_MS[timeframe] < baseMs) throw new Error(`Timeframe "${timeframe}" is finer than the dataset's base timeframe ${baseTimeframe}.`);
    if (timeframe !== '1d_ny' && TF_MS[timeframe] % baseMs !== 0) throw new Error(`Timeframe "${timeframe}" is not a multiple of the base timeframe ${baseTimeframe}.`);
    if (timeframe === '1d_ny' && baseMs > MS_H) throw new Error('Timeframe "1d_ny" needs a dataset with base timeframe <= 1h.');
    if (from !== null && to !== null && to <= from) throw new Error('"to" must be after "from".');

    const { t, o, h, l, c, v } = base;
    const n = t.length;
    const bucket = makeBucketer(timeframe);
    const fromB = from === null ? -Infinity : from;
    const toB = to === null ? Infinity : to;
    const lo = from === null ? 0 : lowerBound(t, bucket(from));

    // pass 1: count buckets (cap check before allocating)
    let count = 0, rowsInRange = 0, prev = NaN;
    for (let i = lo; i < n; i++) {
        const b = bucket(t[i]);
        if (b >= toB) break;
        rowsInRange++;
        if (b !== prev) {
            prev = b;
            if (b >= fromB) count++;
        }
    }
    const totalBars = count;
    let skip = 0;
    if (count > maxBars) {
        if (!keepLast) {
            const err = new Error(
                `Requested slice has ${count.toLocaleString('en-US')} ${timeframe} bars (> max ${maxBars.toLocaleString('en-US')} per load). ` +
                'Use a larger timeframe (e.g. 5m/15m/1h/4h/1d) or a narrower from/to range.'
            );
            err.code = 'SLICE_CAP';
            err.totalBars = count;
            throw err;
        }
        skip = count - maxBars;
        count = maxBars;
    }

    const out = new Float64Array(6 * count);
    const views = {};
    FIELDS.forEach((f, i) => { views[f] = out.subarray(i * count, (i + 1) * count); });
    const { t: ot, o: oo, h: oh, l: ol, c: oc, v: ov } = views;

    // pass 2: fill
    let k = -1, seen = -1;
    prev = NaN;
    for (let i = lo, end = lo + rowsInRange; i < end; i++) {
        const b = bucket(t[i]);
        if (b < fromB) continue;
        if (b !== prev) {
            prev = b;
            seen++;
            if (seen < skip) continue;
            k++;
            ot[k] = b; oo[k] = o[i]; oh[k] = h[i]; ol[k] = l[i]; oc[k] = c[i]; ov[k] = v[i];
        } else if (seen >= skip) {
            if (h[i] > oh[k]) oh[k] = h[i];
            if (l[i] < ol[k]) ol[k] = l[i];
            oc[k] = c[i];
            ov[k] += v[i];
        }
    }
    return { count, buffer: out, views, rowsInRange, totalBars };
}

/**
 * Build the slice sent to the browser for load_draft_backtest.
 * Returns { meta, buffer: Float64Array, fields } where `buffer` holds the six
 * columns back to back in `fields` order, each `meta.count` long.
 */
export async function buildBacktestSlice({ dataset, timeframe, from, to, maxBars = MAX_BARS, keepLast = false }) {
    const tf = timeframe || '1h';
    const fromMs = parseTimeInput(from, 'from');
    const toMs = parseTimeInput(to, 'to');
    const { meta, cols } = await loadBase(dataset);
    // priceBasis comes from the manifest (not the ingest cache) so editing it needs no re-ingest.
    const manifestEntry = (await loadManifest()).find((e) => e.name === dataset);
    const res = aggregateSlice(cols, { timeframe: tf, from: fromMs, to: toMs, maxBars, baseTimeframe: meta.timeframe, keepLast });
    if (res.count === 0) {
        throw new Error(
            `No bars in the requested range for dataset "${dataset}" (${tf}). Available data: ${meta.from} to ${meta.to} (UTC). ` +
            'Remember from is inclusive, to is exclusive.'
        );
    }
    const first = res.count ? res.views.t[0] : null;
    const last = res.count ? res.views.t[res.count - 1] : null;
    return {
        meta: {
            dataset,
            symbol: meta.symbol,
            priceBasis: (manifestEntry && manifestEntry.priceBasis) || 'mid',
            timeframe: tf,
            from: fromMs ?? meta.fromMs,
            to: toMs ?? meta.toMs + 1,
            count: res.count,
            tz: 'UTC',
            firstT: first,
            lastT: last,
        },
        buffer: res.buffer,
        fields: FIELDS,
        totalBars: res.totalBars,
        truncated: res.totalBars > res.count,
    };
}

/**
 * Slice for load_dataset_to_chart. Display cap = CHART_MAX_BARS. No `from`: an
 * over-cap range keeps the most recent bars (truncated=true). Explicit `from`:
 * an over-cap range is an error (the caller asked for exactly that range).
 */
export async function buildChartSlice({ dataset, timeframe, from, to, chartMaxBars = CHART_MAX_BARS }) {
    const explicitFrom = parseTimeInput(from, 'from') !== null;
    try {
        return await buildBacktestSlice({ dataset, timeframe, from, to, maxBars: chartMaxBars, keepLast: !explicitFrom });
    } catch (e) {
        if (e && e.code === 'SLICE_CAP') {
            throw new Error(
                `Requested range has ${e.totalBars.toLocaleString('en-US')} ${timeframe || '1h'} bars, over the chart display cap of ` +
                `${chartMaxBars.toLocaleString('en-US')} (BACKTEST_CHART_MAX_BARS). Use a higher timeframe (e.g. 5m/15m/1h/4h/1d) or a narrower from/to range.`
            );
        }
        throw e;
    }
}

/** Manifest + (optionally ingested) metadata for list_backtest_datasets. */
export async function listBacktestDatasets({ ingest: doIngest = false } = {}) {
    const entries = await loadManifest();
    const out = [];
    for (const e of entries) {
        let meta = await readMeta(e);
        let status = (await metaIsFresh(e, meta)) ? 'ready' : 'not_ingested';
        if (status !== 'ready' && _inflight.has(e.name)) {
            status = 'ingesting';
        } else if (status !== 'ready' && doIngest) {
            // Never block the listing on a long ingest: start it, wait briefly, else report `ingesting`.
            const p = ensureIngested(e.name);
            p.catch(() => {}); // failures surface on the next explicit use
            const done = await Promise.race([p.then((m) => m), new Promise((r) => setTimeout(() => r(null), 3000))]);
            if (done) { meta = done; status = 'ready'; } else status = 'ingesting';
        }
        const info = { name: e.name, symbol: e.symbol, tz: e.tz, timeframe: e.timeframe, note: e.note, priceBasis: e.priceBasis || 'mid', status };
        if (status === 'ready') {
            const qu = meta.quality;
            Object.assign(info, {
                from: meta.from,
                to: meta.to,
                bars: meta.count,
                timesAreUtcMs: true,
                quality: {
                    sourceRows: qu.rows,
                    duplicateTimestamps: qu.duplicates,
                    outOfOrderRows: qu.outOfOrder,
                    badRows: qu.badRows,
                    ohlcViolations: { highBelowLow: qu.hLtL, openOutsideRange: qu.openOutOfRange, closeOutsideRange: qu.closeOutOfRange },
                    zeroVolumeBars: qu.zeroVolume,
                    gaps: { over5m: qu.gaps.gt5m, over1h: qu.gaps.gt1h, over1d: qu.gaps.gt1d, maxHours: qu.gaps.maxHours },
                    barsPerYear: qu.barsPerYear,
                },
            });
        } else {
            info.hint = status === 'ingesting' ? 'Ingest in progress; call again in a few seconds for range/quality.' : 'Not ingested yet: the first load_draft_backtest using it will ingest (can take ~1 min for large CSVs). Call list_backtest_datasets with ingest=true to ingest now and see range/quality.';
        }
        out.push(info);
    }
    return { maxBarsPerLoad: MAX_BARS, timeframes: TIMEFRAMES, datasets: out };
}
