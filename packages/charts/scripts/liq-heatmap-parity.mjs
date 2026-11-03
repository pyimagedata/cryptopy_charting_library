// Parity test: TS model (liq-heatmap-model.ts + sliceInputs) vs the Python server model.
//   node scripts/liq-heatmap-parity.mjs --fetch   # (re)create fixtures/liq-raw.json from Binance (BTCUSDT, fixed past window)
//   node scripts/liq-heatmap-parity.mjs           # compute expected with Python, compare, print summary
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const fx = join(here, 'fixtures');
const PY = process.env.LIQ_PY || '/Users/mac/Desktop/MY_PROJECTS/AI_CHARTS/EvoTrdading/backend/venv/bin/python';
const LIQ_PY = process.env.LIQ_MODEL_PY || '/Users/mac/Desktop/MY_PROJECTS/AI_CHARTS/EvoTrdading/backend/indicators/liqheatmap.py';
const BAR = 300000, STEP = 300000;

async function getJson(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
    return r.json();
}

async function makeFixture() {
    mkdirSync(fx, { recursive: true });
    const sym = 'BTCUSDT';
    const end = Math.floor((Date.now() - 24 * 3600e3) / BAR) * BAR; // fixed once, saved in the fixture
    const from = end - 7 * 86400e3 - 2 * 3600e3;
    const to = end + 2 * 3600e3; // a few bars past `end` to exercise the end filters
    const kt = [], kh = [], kl = [], kc = [];
    for (let cur = from; cur < to;) {
        const rows = await getJson(`https://fapi.binance.com/fapi/v1/klines?symbol=${sym}&interval=5m&limit=1500&startTime=${cur}&endTime=${to}`);
        for (const r of rows) { kt.push(+r[0]); kh.push(+r[2]); kl.push(+r[3]); kc.push(+r[4]); }
        if (rows.length < 1500) break;
        cur = +rows[rows.length - 1][0] + BAR;
    }
    const m = new Map();
    for (let cur = from + STEP; cur <= to + STEP;) {
        const we = Math.min(to + STEP, cur + 500 * STEP - 1);
        const rows = await getJson(`https://fapi.binance.com/futures/data/openInterestHist?symbol=${sym}&period=5m&limit=500&startTime=${cur}&endTime=${we}`);
        for (const d of rows) m.set(+d.timestamp - STEP, +d.sumOpenInterestValue);
        cur = we + 1;
    }
    const oe = [...m.entries()].sort((a, b) => a[0] - b[0]);
    writeFileSync(join(fx, 'liq-raw.json'), JSON.stringify({ symbol: sym, end, kt, kh, kl, kc, ot: oe.map(x => x[0]), ov: oe.map(x => x[1]) }));
    console.log(`fixture: ${kt.length} klines, ${oe.length} OI rows, end=${new Date(end).toISOString()}`);
}

async function bundle() {
    const out = join(process.env.LIQ_TMP || join(root, 'node_modules', '.cache'), 'liq-parity-bundle.mjs');
    mkdirSync(dirname(out), { recursive: true });
    await build({
        stdin: {
            contents: `export * from './src/indicators/liq-heatmap-model.ts'; export { sliceInputs, effectiveStart } from './src/indicators/liq-heatmap-binance.ts';`,
            resolveDir: root, loader: 'ts',
        },
        bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error',
    });
    return out;
}

if (process.argv.includes('--fetch') || !existsSync(join(fx, 'liq-raw.json'))) await makeFixture();
if (process.argv.includes('--fetch')) { /* fall through and also run the comparison */ }

execFileSync(PY, ['-I', join(here, 'liq_heatmap_expected.py'), LIQ_PY, fx], { stdio: 'inherit' });
const M = await import(pathToFileURL(await bundle()).href);
const raw = JSON.parse(readFileSync(join(fx, 'liq-raw.json'), 'utf8'));
const exp = JSON.parse(readFileSync(join(fx, 'liq-expected.json'), 'utf8'));
const rawF = {
    kt: Float64Array.from(raw.kt), kh: Float64Array.from(raw.kh), kl: Float64Array.from(raw.kl), kc: Float64Array.from(raw.kc),
    ot: Float64Array.from(raw.ot), ov: Float64Array.from(raw.ov), covStart: 0, covEnd: 0,
};

let allOk = true;
const fail = (m) => { allOk = false; console.log('  FAIL:', m); };

// nice_bin_size
let niceBad = 0;
for (const [p, v] of exp.nice) if (M.niceBinSize(p) !== v) { niceBad++; fail(`niceBinSize(${p}) = ${M.niceBinSize(p)} vs ${v}`); }
console.log(`niceBinSize: ${exp.nice.length - niceBad}/${exp.nice.length} exact`);

for (const [period, e] of Object.entries(exp.payloads)) {
    const end = exp.end, start = e.start;
    const t0 = performance.now();
    const inputs = M.sliceInputs(rawF, start, end, false);
    const a = M.buildHeatmapPayload(inputs, period, start, end, false, 'BTCUSDT');
    const ms = performance.now() - t0;
    console.log(`[${period}] bars=${inputs.t.length} bins py=${e.bins.length} ts=${a.bins.length} compute=${ms.toFixed(1)}ms`);
    let ok = true;
    const bad = (m) => { ok = false; fail(`${period}: ${m}`); };
    if (a.bin_size !== e.bin_size) bad(`bin_size ${a.bin_size} vs ${e.bin_size}`);
    const rel = Math.abs(a.scale - e.scale) / e.scale;
    if (!(rel <= 1e-9)) bad(`scale rel diff ${rel}`);
    for (const k of ['start', 'end', 'bucket_sec', 'oi_last_time', 'price_min', 'price_max']) if (a[k] !== e[k]) bad(`${k} ${a[k]} vs ${e[k]}`);
    if (a.bins.length !== e.bins.length) bad('bin count');
    let runsTot = 0, qDiff = 0, qBig = 0, tDiff = 0, runCountDiff = 0;
    const n = Math.min(a.bins.length, e.bins.length);
    for (let i = 0; i < n; i++) {
        const x = a.bins[i], y = e.bins[i];
        if (x.p !== y.p || x.side !== y.side) { bad(`bin ${i}: ${x.p}/${x.side} vs ${y.p}/${y.side}`); break; }
        if (x.runs.length !== y.runs.length) { runCountDiff++; runsTot += y.runs.length; continue; }
        for (let k = 0; k < y.runs.length; k++) {
            runsTot++;
            if (x.runs[k][0] !== y.runs[k][0] || x.runs[k][1] !== y.runs[k][1]) tDiff++;
            const d = Math.abs(x.runs[k][2] - y.runs[k][2]);
            if (d > 0) qDiff++;
            if (d > 1) qBig++;
        }
    }
    if (tDiff) bad(`${tDiff} runs with t0/t1 mismatch`);
    if (runCountDiff) bad(`${runCountDiff} bins with different run counts`);
    if (qBig) bad(`${qBig} runs with |dq|>1`);
    if (qDiff / Math.max(runsTot, 1) >= 0.001) bad(`q mismatch rate ${(100 * qDiff / runsTot).toFixed(3)}% >= 0.1%`);
    console.log(`   runs=${runsTot} q!=: ${qDiff} (${(100 * qDiff / Math.max(runsTot, 1)).toFixed(4)}%) |dq|>1: ${qBig} t-mismatch: ${tDiff} scale relDiff=${rel.toExponential(2)} => ${ok ? 'OK' : 'FAIL'}`);
}
console.log(allOk ? 'PARITY: PASS' : 'PARITY: FAIL');
process.exit(allOk ? 0 : 1);
