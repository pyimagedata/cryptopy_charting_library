// i18n regression test. Run from packages/charts:  node scripts/run-i18n-test.mjs
//  (a) every static t('...') key used in src/ exists in TRANSLATIONS.tr
//  (b) literal labels of settings rows (xRow('key', 'Label'), label: '...') and catalog names/descriptions exist in the table
//  (c) no string literal with Turkish letters in src/gui, src/indicators, src/drawings, src/alerts outside translations.ts
//  (d) tr values must not look like Turkish without diacritics
//  (e) tr values must not contain "indikatör" (terminology: "gösterge")
//  (f) no string literal in src/gui, src/indicators, src/drawings that looks like Turkish without diacritics
// Source scanning is regex based on purpose (no TS parser dependency).

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { TRANSLATIONS } from '../src/helpers/translations';

const SRC = process.env.I18N_SRC_DIR as string;
const TR = TRANSLATIONS.tr;
const failures: string[] = [];
const fail = (rule: string, msg: string) => failures.push(`[${rule}] ${msg}`);

function walk(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) {
            if (name === '_drafts' || name === 'node_modules') continue;
            walk(p, out);
        } else if (p.endsWith('.ts') && !p.endsWith('.d.ts')) out.push(p);
    }
    return out;
}
const files = walk(SRC).filter(f => !f.endsWith(join('helpers', 'translations.ts')));
const rel = (f: string) => relative(SRC, f);

/** Evaluate a quoted JS string literal body (handles \' and \n). */
function unquote(q: string, body: string): string | null {
    try { return new Function(`return ${q}${body}${q}`)() as string; } catch { return null; }
}

/** Strings that never need a table entry: no letters, or acronym-like tokens identical in both languages. */
const UNTRANSLATED_OK = (s: string) => !/[A-Za-z]{2,}/.test(s.replace(/\{[^}]*\}/g, ''));
// Allow-list (b): brand / acronym labels kept in English in both languages.
const LABEL_ALLOW = new Set<string>([
    'RSI', 'MACD', 'ATR', 'ADR', 'POC', 'VAH', 'VAL', 'VWAP', 'EMA', 'SMA', 'WMA', 'HMA', 'BB', 'SAR', 'ADX', 'OBV', 'CCI', 'MFI',
    'Supertrend', 'Ichimoku', 'HalfTrend', 'SMC', 'FVG', 'Fibonacci', 'Classic', 'Camarilla', 'Woodie', 'Open', 'High', 'Low', 'Close',
    'UTC', 'Sydney', 'Tokyo', 'New York', 'Binance', 'Evo Script', 'Script', 'TradingView', 'Heiken Ashi', 'Demark', 'Keltner',
]);
const isAcronymOnly = (s: string) => /^[A-Z0-9][A-Z0-9 .\-+/()%]*$/.test(s);
const okLabel = (s: string) => UNTRANSLATED_OK(s) || isAcronymOnly(s) || LABEL_ALLOW.has(s) || s in TR;

// (a) static t('...') keys
const T_CALL = /(?<![A-Za-z0-9_$.])t\(\s*(['"])((?:\\.|(?!\1)[^\\\n])*)\1\s*[,)]/g;
let tCalls = 0;
for (const f of files) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(T_CALL)) {
        tCalls++;
        const key = unquote(m[1], m[2]);
        if (key == null) continue;
        if (!(key in TR) && !okLabel(key) ) fail('a', `${rel(f)}: t(${JSON.stringify(key)}) has no tr entry`);
    }
}

// (b) settings-row labels and catalog entries
const ROW_CALL = /\b(?:checkbox|color|number|select|lineWidth|slider|levels|lineStyle|text)Row\(\s*(['"])(?:\\.|(?!\1)[^\\\n])*\1\s*,\s*(['"])((?:\\.|(?!\2)[^\\\n])*)\2/g;
const OBJ_LABEL = /(?<![A-Za-z0-9_$])(?:label|title|tooltip|placeholder):\s*(['"])((?:\\.|(?!\1)[^\\\n])*)\1/g;
let rowLabels = 0;
const settingsDirs = ['indicators', 'drawings', join('gui', 'settings_modal'), join('gui', 'indicator_settings')];
for (const f of files) {
    const r = rel(f);
    if (!settingsDirs.some(d => r.startsWith(d))) continue;
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(ROW_CALL)) {
        rowLabels++;
        const s = unquote(m[2], m[3]);
        if (s != null && !okLabel(s)) fail('b', `${r}: row label ${JSON.stringify(s)} has no tr entry`);
    }
    if (!/getSettingsConfig|SettingsConfig|Section/.test(src)) continue;
    for (const m of src.matchAll(OBJ_LABEL)) {
        rowLabels++;
        const s = unquote(m[1], m[2]);
        // wrapped in t() already (t('x')) never reaches here because the literal must directly follow the colon
        if (s != null && !okLabel(s)) fail('b', `${r}: label ${JSON.stringify(s)} has no tr entry`);
    }
}
// catalog: every item is i18n and its name/description exist in the table
{
    const f = join(SRC, 'gui', 'indicator_search', 'indicator_catalog.ts');
    const src = readFileSync(f, 'utf8');
    const itemRe = /\{\s*id:\s*'([^']+)',([\s\S]*?)\n\s*\}/g;
    let items = 0;
    for (const m of src.matchAll(itemRe)) {
        const body = m[2];
        const name = /name:\s*(['"])((?:\\.|(?!\1)[^\\\n])*)\1/.exec(body);
        if (!name) continue;
        items++;
        if (!/i18n:\s*true/.test(body)) fail('b', `catalog item '${m[1]}' is not flagged i18n: true`);
        const nm = unquote(name[1], name[2]);
        if (nm != null && !okLabel(nm)) fail('b', `catalog item '${m[1]}' name ${JSON.stringify(nm)} has no tr entry`);
        const desc = /description:\s*(['"])((?:\\.|(?!\1)[^\\\n])*)\1/.exec(body);
        if (desc) {
            const d = unquote(desc[1], desc[2]);
            if (d != null && !(d in TR)) fail('b', `catalog item '${m[1]}' description has no tr entry: ${JSON.stringify(d.slice(0, 60))}`);
        }
    }
    if (items < 20) fail('b', `catalog scan found only ${items} items (regex out of date?)`);
}

// (c) Turkish letters in string literals outside translations.ts
// Documented allow-list: file path (relative to src) -> reason. Keep empty unless a literal is intentionally Turkish.
const TURKISH_LITERAL_ALLOW: Record<string, string> = {
    // e.g. 'gui/foo.ts': 'matches Turkish exchange labels from the data feed',
    'gui/watchlist/watchlist_spark.ts': 'trPercentSuffix is intentional Turkish vowel-harmony grammar (suffix after a read-aloud percent number)',
};
const TR_LETTERS = /[ğüşıöçĞÜŞİÖÇ]/;
const guiDirs = ['gui', 'indicators', 'drawings', 'alerts'].map(d => d + '/');
for (const f of files) {
    const r = rel(f).split('\\').join('/');
    if (!guiDirs.some(d => r.startsWith(d)) || r in TURKISH_LITERAL_ALLOW) continue;
    const lines = readFileSync(f, 'utf8').split('\n');
    lines.forEach((line, i) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;
        // strip trailing // comments (naive but fine: URLs inside strings are not Turkish)
        const code = line.replace(/\s\/\/.*$/, '');
        if (!TR_LETTERS.test(code)) return;
        if (/(['"`])(?:\\.|(?!\1).)*[ğüşıöçĞÜŞİÖÇ](?:\\.|(?!\1).)*\1/.test(code)) fail('c', `${r}:${i + 1}: Turkish literal: ${trimmed.slice(0, 90)}`);
    });
}

// (f) Turkish written without diacritics inside string literals of the UI code (should be English keys or proper Turkish via t())
// Allow-list: file path (relative to src) -> reason.
const NO_DIACRITIC_LITERAL_ALLOW: Record<string, string> = {};
const NO_DIACRITIC_LITERAL = /(['"`])(?:\\.|(?!\1).)*\b(?:gosterge|degil|icin|cizgi|goster|tabanli|henuz|bolum|su anda|Tahmini|Gecmis)\b(?:\\.|(?!\1).)*\1/;
const fDirs = ['gui', 'indicators', 'drawings'].map(d => d + '/');
for (const f of files) {
    const r = rel(f).split('\\').join('/');
    if (!fDirs.some(d => r.startsWith(d)) || r in NO_DIACRITIC_LITERAL_ALLOW) continue;
    readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;
        const code = line.replace(/\s\/\/.*$/, '');
        if (NO_DIACRITIC_LITERAL.test(code)) fail('f', `${r}:${i + 1}: Turkish without diacritics: ${trimmed.slice(0, 90)}`);
    });
}

// (d) / (e) tr values
const NO_DIACRITICS = /\b(gosterge|degil|icin|cizgi|goster|tabanli|henuz|bolum|su anda|ayarlari|gorunum|secenek|baslik|kalinlik|renk degistir)\b/i;
for (const [k, v] of Object.entries(TR)) {
    if (NO_DIACRITICS.test(v)) fail('d', `tr value looks like Turkish without diacritics: ${JSON.stringify(k)} -> ${JSON.stringify(v.slice(0, 70))}`);
    if (/indikat[oö]r/i.test(v)) fail('e', `tr value uses "indikatör": ${JSON.stringify(k)} -> ${JSON.stringify(v.slice(0, 70))}`);
    if (/İndikatör|Indikator/.test(v)) fail('e', `tr value uses İndikatör: ${JSON.stringify(k)}`);
}

console.log(`i18n scan: ${files.length} files, ${tCalls} t() calls, ${rowLabels} row labels, ${Object.keys(TR).length} tr entries`);
if (failures.length) {
    const byRule: Record<string, number> = {};
    failures.forEach(x => { const r = x[1]; byRule[r] = (byRule[r] || 0) + 1; });
    console.error(failures.join('\n'));
    console.error(`\ni18n test FAILED: ${failures.length} problems`, byRule);
    process.exit(1);
}
console.log('i18n test passed');
