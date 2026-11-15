// Pure parts of the Evo Script Style tab. Run from packages/charts:
//   npx esbuild scripts/evo-script-style.test.ts --bundle --platform=node --format=esm --outfile=<tmp>.mjs && node <tmp>.mjs

import assert from 'node:assert/strict';
import { normalizeEvoOutput } from '../src/indicators/evo-script-core';
import {
    evoStyleItems, resolveEvoStyle, setEvoOverride, pruneEvoStyles, applyEvoStyles, sanitizeEvoStyles, evoBaseTitle,
} from '../src/indicators/evo-script-style';

const N = 4;
const arr = (v: number) => new Array(N).fill(v);
function out(plots: Array<[string, any]>, extra: any = {}) {
    const p: any = {}, po: any = {};
    for (const [t, o] of plots) { p[t] = arr(1); po[t] = o; }
    return normalizeEvoOutput({ meta: { title: 'x', overlay: true }, plots: p, plotOpts: po, ...extra });
}

// declaration order (integer-like titles must not be reordered by the JS object)
{
    const keys = ['Basis', '20', '50', 'A', '10', '20#7'];
    const o = normalizeEvoOutput({
        meta: { title: 'x' }, plots: Object.fromEntries(keys.map((k) => [k, arr(1)])), plotOpts: {}, plotOrder: keys,
        shapes: { S2: arr(1), '5': arr(1) }, shapeOpts: {}, shapeOrder: ['S2', '5'],
    });
    assert.deepEqual(o.plots.map((p) => p.title), keys);
    assert.deepEqual(evoStyleItems(o).filter((i) => i.kind === 'plot').map((i) => i.label), ['Basis', '20', '50', 'A', '10', '20 (2)']);
    assert.deepEqual(o.shapes.map((s) => s.title), ['S2', '5']);
    // no order list: falls back to the object's key order
    const f = normalizeEvoOutput({ meta: { title: 'x' }, plots: { b: arr(1), a: arr(1) }, plotOpts: {} });
    assert.deepEqual(f.plots.map((p) => p.title), ['b', 'a']);
}

// base titles / labels
assert.equal(evoBaseTitle('plot', 'plot7'), '');
assert.equal(evoBaseTitle('plot', 'M20#12'), 'M20');
assert.equal(evoBaseTitle('plot', 'Basis'), 'Basis');

const o1 = out([
    ['Basis', { color: '#872323', display: 'none' }],
    ['M20', { color: '#ff0000', linewidth: 2, display: 'none' }],
    ['M50', { color: '#ffa500', linewidth: 2 }],
    ['M20#9', { color: '#00ffff', display: 'none' }],
    ['plot11', { color: '#ffffff' }],
    ['plot12', { color: '#ffffff' }],
]);
const it1 = evoStyleItems(o1);
assert.deepEqual(it1.map((i) => i.label), ['Basis', 'M20', 'M50', 'M20 (2)', 'Plot', 'Plot 2']);
assert.deepEqual(it1.map((i) => i.defaults.visible), [false, false, true, false, true, true]);
assert.equal(new Set(it1.map((i) => i.id)).size, it1.length);

// override only stores differences; reset by equal-to-default
let st = setEvoOverride({}, it1[1], { ...resolveEvoStyle(it1[1], undefined), visible: true });
assert.deepEqual({ ...st }, { [it1[1].id]: { visible: true } });
st = setEvoOverride(st, it1[1], resolveEvoStyle(it1[1], undefined));
assert.deepEqual({ ...st }, {});

// apply: visibility via display, colour / width / style
st = setEvoOverride({}, it1[1], { visible: true, color: '#123456', width: 4, style: 'histogram' });
st = setEvoOverride(st, it1[2], { visible: false });
const a = applyEvoStyles(o1, st);
assert.equal(a.plots[1].display, 'all');
assert.equal(a.plots[1].color, '#123456');
assert.equal(a.plots[1].linewidth, 4);
assert.equal(a.plots[1].style, 'histogram');
assert.equal(a.plots[2].display, 'none');
assert.equal(a.plots[0].display, 'none'); // untouched
assert.equal(o1.plots[1].display, 'none'); // source output not mutated
assert.equal(applyEvoStyles(o1, {}), o1); // nothing to change -> same object

// per-bar colours: override replaces every non-na bar, na stays na
const o2 = normalizeEvoOutput({
    meta: { title: 'x' }, plots: { A: arr(1) }, plotOpts: { A: { color: '#111111' } },
    colorTable: ['#00ff00', '#ff0000'], plotColors: { A: [0, 1, 0xFFFF, 1] },
});
const it2 = evoStyleItems(o2);
assert.equal(it2[0].defaults.color, '#00ff00'); // first colour the script paints
const b = applyEvoStyles(o2, setEvoOverride({}, it2[0], { color: '#abcdef' }));
const colors = b.plots[0].colors!;
assert.equal(colors[2], 0xFFFF);
assert.equal(b.colorTable[colors[0]], '#abcdef');
assert.equal(colors[0], colors[1]);
assert.equal(o2.colorTable.length, 2); // original table untouched

// after a recompile: same (title, ordinal) keeps the override, vanished rows are dropped
const keep = setEvoOverride(setEvoOverride({}, it1[3], { color: '#010101' }), it1[2], { width: 3 });
const o3 = out([['M50', { color: '#ffa500', linewidth: 2 }], ['New', {}], ['M20', {}], ['M20#77', {}]]);
const it3 = evoStyleItems(o3);
const pr = pruneEvoStyles(keep, it3);
assert.deepEqual(Object.keys(pr).sort(), [it1[2].id, it1[3].id].sort()); // 'M50' #1 and 'M20' #2 still exist
const o4 = out([['M50', {}]]);
assert.deepEqual(Object.keys(pruneEvoStyles(keep, evoStyleItems(o4))), [it1[2].id]);

// hline / fill / bgcolor / barcolor
const o5 = normalizeEvoOutput({
    meta: { title: 'x' }, plots: { A: arr(1), B: arr(2) }, plotOpts: { A: { display: 'none' }, B: { display: 'none' } },
    hlines: [{ price: 30, title: '', color: '#888888', linestyle: 'dashed', linewidth: 1 }, { price: 70, title: 'OB', color: '#ff0000', linestyle: 'solid', linewidth: 2 }],
    fills: [{ a: 'A', b: 'B', title: 'Band', color: '#0000ff33' }],
    bgcolors: [{ title: 'bgcolor3', opts: { display: 'none' }, runs: [{ from: 0, to: 1, color: '#ff000033' }] }, { title: 'Hi', runs: [{ from: 2, to: 3, color: '#00ff0033' }] }],
    barColors: [0, 0, 0xFFFF, 0], colorTable: ['#fff'], barColorOpts: { display: 'none' },
});
const it5 = evoStyleItems(o5);
assert.deepEqual(it5.map((i) => i.label), ['A', 'B', 'Hline', 'OB', 'Band', 'Background', 'Hi', 'Bar color']);
const base5 = applyEvoStyles(o5, {});
assert.equal(base5.bgcolors.length, 1); // display none bgcolor dropped
assert.equal(base5.barColors, undefined); // display none barcolor dropped
const on = applyEvoStyles(o5, setEvoOverride(setEvoOverride({}, it5[5], { visible: true }), it5[7], { visible: true }));
assert.equal(on.bgcolors.length, 2);
assert.ok(on.barColors);
const hl = applyEvoStyles(o5, setEvoOverride({}, it5[3], { color: '#00ff00', width: 3, style: 'dotted', visible: false }));
assert.deepEqual([hl.hlines[1].color, hl.hlines[1].linewidth, hl.hlines[1].linestyle, hl.hlines[1].display], ['#00ff00', 3, 'dotted', 'none']);
const fl = applyEvoStyles(o5, setEvoOverride({}, it5[4], { color: '#123456', visible: false }));
assert.deepEqual([fl.fills[0].color, fl.fills[0].display], ['#123456', 'none']);

// untrusted input
const san = sanitizeEvoStyles({ 'p:A:1': { visible: false, color: 5, width: 99, junk: 1 }, bad: 3, 'p:B:1': { color: '#fff', width: 2.4 } });
assert.deepEqual({ ...san }, { 'p:A:1': { visible: false }, 'p:B:1': { color: '#fff', width: 2 } });

console.log('evo-script-style tests passed');
