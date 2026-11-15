// Tests for src/helpers/format.ts. Run: node scripts/run-format-test.mjs
import assert from 'node:assert/strict';
import { groupThousands, formatPrice, formatNumber, formatPercent, formatDate, monthShort } from '../src/helpers/format';
import { setLanguage } from '../src/helpers/translations';
import { localizedEvoError, localizedEvoErrorParts } from '../src/indicators/evo-script-indicator';

let passed = 0;
function test(name: string, fn: () => void): void {
    try { fn(); passed++; console.log('ok   - ' + name); } catch (e) { console.log('FAIL - ' + name); console.log(e); process.exitCode = 1; }
}

test('formatPrice is language independent', () => {
    for (const lang of ['en', 'tr'] as const) {
        setLanguage(lang);
        assert.equal(formatPrice(1234.5, 2), '1,234.50');
        assert.equal(formatPrice(0, 2), '0.00');
        assert.equal(formatPrice(-1234567.891, 2), '-1,234,567.89');
        assert.equal(formatPrice(0.00001234, 6), '0.000012');
        assert.equal(formatPrice(108302.5, 0), '108,303');
        assert.equal(formatPrice(999.5, 3), '999.500');
        assert.equal(formatPrice(-0.001, 2), '0.00');
    }
});

test('formatPrice precision 5 and 8, groupThousands', () => {
    assert.equal(formatPrice(1.10216, 5), '1.10216');
    assert.equal(formatPrice(1234.5, 5), '1,234.50000');
    assert.equal(formatPrice(0.00001234, 8), '0.00001234');
    assert.equal(formatPrice(108302.5, 8), '108,302.50000000');
    assert.equal(groupThousands('108302.54'), '108,302.54');
    assert.equal(groupThousands('-1234567.00001'), '-1,234,567.00001');
    assert.equal(groupThousands('1.10216'), '1.10216');
});

test('formatNumber / formatPercent follow the language', () => {
    setLanguage('en');
    assert.equal(formatNumber(1234567.5, { maxDecimals: 2 }), '1,234,567.5');
    assert.equal(formatPercent(1.256), '1.26%');
    assert.equal(formatPercent(-3, 1), '-3.0%');
    setLanguage('tr');
    assert.equal(formatNumber(1234567.5, { maxDecimals: 2 }), '1.234.567,5');
    assert.equal(formatNumber(1234.5, { minDecimals: 1 }), '1234,5');
    assert.equal(formatNumber(12345.5, { minDecimals: 1 }), '12.345,5');
    assert.equal(formatPercent(1.256), '1,26%');
    assert.equal(formatPercent(-3, 1), '-3,0%');
    assert.equal(formatNumber(0, { minDecimals: 2 }), '0,00');
    assert.equal(formatNumber(5, { signed: true }), '+5');
    assert.equal(formatNumber(-5, { signed: true }), '-5');
    assert.equal(formatNumber(0, { signed: true }), '0');
});

test('formatDate follows the language', () => {
    const d = new Date(Date.UTC(2024, 2, 15, 13, 5));
    setLanguage('tr');
    assert.equal(formatDate(d, { timeZone: 'UTC' }), '15.03.2024');
    assert.equal(formatDate(d, { time: true, timeZone: 'UTC' }), '15.03.2024 13:05');
    setLanguage('en');
    assert.equal(formatDate(d, { timeZone: 'UTC' }), '3/15/24');
    assert.equal(formatDate('nope'), '—');
});

test('month names', () => {
    setLanguage('tr');
    assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((m) => monthShort(m)),
        ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']);
    setLanguage('en');
    assert.equal(monthShort(0), 'Jan');
    assert.equal(monthShort(11), 'Dec');
});

test('evo error label', () => {
    setLanguage('tr');
    assert.equal(localizedEvoError({ message: 'syntax error: Unexpected token' }), 'Derleme hatası: syntax error: Unexpected token');
    assert.equal(localizedEvoError({ message: 'x is not defined', kind: 'runtime' }), 'Çalışma hatası: x is not defined');
    setLanguage('en');
    assert.equal(localizedEvoError({ message: 'boom' }), 'Runtime error: boom');
});

test('evo error uses EvoDiag.summary when provided, falls back otherwise', () => {
    const g = globalThis as unknown as { window?: unknown };
    const prev = g.window;
    try {
        setLanguage('tr');
        const e = { message: 'syntax error: Unexpected token', kind: 'syntax' };
        g.window = { EvoDiag: { summary: (m: string) => (m.includes('Unexpected') ? 'Beklenmeyen simge' : null) } };
        assert.equal(localizedEvoError(e), 'Derleme hatası: Beklenmeyen simge');
        assert.equal(localizedEvoErrorParts(e).detail, 'Derleme hatası: syntax error: Unexpected token');
        assert.equal(localizedEvoError({ message: 'x is not defined' }), 'Çalışma hatası: x is not defined');
        g.window = { EvoDiag: { summary: () => { throw new Error('boom'); } } };
        assert.equal(localizedEvoError(e), 'Derleme hatası: syntax error: Unexpected token');
        g.window = { EvoDiag: {} };
        assert.equal(localizedEvoError(e), 'Derleme hatası: syntax error: Unexpected token');
        g.window = undefined;
        assert.equal(localizedEvoError(e), 'Derleme hatası: syntax error: Unexpected token');
    } finally {
        g.window = prev;
        setLanguage('en');
    }
});

console.log(`${passed} passed`);
