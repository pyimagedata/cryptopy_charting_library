// Guard test: the legend must not rebuild its rows (destroying the hovered buttons) when only the
// number of crosshair values changes. Minimal fake DOM, no runner needed. Run from packages/charts:
//   npx esbuild scripts/indicator-legend.test.ts --bundle --platform=node --format=esm --outfile=<tmp>.mjs && node <tmp>.mjs

import assert from 'node:assert/strict';

class FakeEl {
    children: FakeEl[] = [];
    parent: FakeEl | null = null;
    style: any = { setProperty() {} };
    dataset: Record<string, string> = {};
    className = '';
    title = '';
    textContent = '';
    type = '';
    id = '';
    constructor(public tag: string) {}
    set innerHTML(_v: string) { this.children.forEach((c) => (c.parent = null)); this.children = []; }
    get innerHTML(): string { return ''; }
    appendChild(c: FakeEl): FakeEl { c.parent = this; this.children.push(c); return c; }
    remove(): void { if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this); this.parent = null; }
    addEventListener(): void {}
    setAttribute(): void {}
    getBoundingClientRect(): any { return {}; }
}
(globalThis as any).document = {
    getElementById: () => null,
    createElement: (tag: string) => new FakeEl(tag),
    head: new FakeEl('head'),
};
(globalThis as any).localStorage = { getItem: () => null, setItem() {} };

const { IndicatorLegendList } = await import('../src/gui/indicator_legend/indicator-legend');

let nPlots = 0;
const ind: any = {
    id: 'a', visible: true, hiddenByInterval: false, options: {}, name: 'Sessions',
    getLegendInfo: () => ({ title: 'Sessions', params: ['D'], plots: Array.from({ length: nPlots }, () => ({ color: '#fff', value: 1, text: '1' })) }),
};
const list = new IndicatorLegendList(() => {}, { collapsible: true, chartKey: 't' });
list.update([ind], 0, 'dark');
const row = list.element.children[0];
const btns = row.children.find((c) => c.className === 'tvl-btns')!;
const values = row.children.find((c) => c.className === 'tvl-values')!;
// CSS contract (fake DOM has no layout): idle = no space, hover / focus / open menu = shown
const css: string = (globalThis as any).document.head.children.map((c: any) => c.textContent).join('');
assert.match(css, /\.tvl-btns \{ display: none;/, 'buttons take no space when idle');
assert.match(css, /\.tvl-row:hover \.tvl-btns[^{]*\{ display: inline-flex; \}/, 'hover shows the buttons');
const order = row.children.map((c) => c.className);
assert.ok(order.indexOf('tvl-btns') < order.indexOf('tvl-values'), 'buttons must precede the values');
for (const n of [0, 2, 0, 1, 3, 0]) {
    nPlots = n;
    list.update([ind], 1, 'dark');
    assert.equal(list.element.children[0], row, 'row element must be reused');
    assert.equal(row.children.find((c) => c.className === 'tvl-btns'), btns, 'buttons must survive');
    assert.equal(values.children.length, n, 'value spans follow the plot count');
}
console.log('indicator-legend: ok');
