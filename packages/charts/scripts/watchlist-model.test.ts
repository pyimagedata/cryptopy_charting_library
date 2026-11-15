// Watchlist list-name compatibility test. Run from packages/charts:  node scripts/run-watchlist-model-test.mjs
// Saved lists named with the legacy Turkish default must still load, must not be duplicated or rewritten,
// and must display in the current UI language; new default lists are stored with the English name.
import assert from 'node:assert/strict';
import { WatchlistModel, KeyValueStore, LISTS_STORAGE, ACTIVE_STORAGE, DEFAULT_LIST_NAME, displayListName } from '../src/gui/watchlist/watchlist_model';
import { setLanguage } from '../src/helpers/translations';

const LEGACY = 'İzleme Listesi';
let passed = 0;
function test(name: string, fn: () => void): void {
    try { fn(); passed++; console.log('ok   - ' + name); } catch (e) { console.log('FAIL - ' + name); console.log(e); process.exitCode = 1; }
}
function memStore(init: Record<string, string> = {}): KeyValueStore & { data: Record<string, string> } {
    const data = { ...init };
    return { data, get: (k) => (k in data ? data[k] : null), set: (k, v) => { data[k] = v; } };
}
const savedLists = () => [{ id: 'l_old', name: LEGACY, items: [{ type: 'symbol', key: 'BINANCE:BTCUSDT' }] }, { id: 'l_mine', name: 'My list', items: [] }];

test('displayListName follows the language for default and legacy names, custom names untouched', () => {
    setLanguage('tr');
    assert.equal(displayListName(DEFAULT_LIST_NAME), 'İzleme listesi');
    assert.equal(displayListName(LEGACY), 'İzleme listesi');
    assert.equal(displayListName('My list'), 'My list');
    setLanguage('en');
    assert.equal(displayListName(DEFAULT_LIST_NAME), 'Watchlist');
    assert.equal(displayListName(LEGACY), 'Watchlist');
    assert.equal(displayListName('My list'), 'My list');
});

test('saved legacy-named list loads once, keeps its id and items, is not duplicated', () => {
    const store = memStore({ [LISTS_STORAGE]: JSON.stringify(savedLists()), [ACTIVE_STORAGE]: 'l_old' });
    const m = new WatchlistModel(store);
    assert.equal(m.lists.length, 2);
    assert.equal(m.lists.filter((l) => l.id === 'l_old').length, 1);
    assert.equal(m.activeId, 'l_old');
    assert.equal(m.lists[0].items.length, 1);
});

test('stored legacy name is not rewritten by load or by unrelated edits (sync-safe)', () => {
    const store = memStore({ [LISTS_STORAGE]: JSON.stringify(savedLists()), [ACTIVE_STORAGE]: 'l_old' });
    const m = new WatchlistModel(store);
    assert.equal(JSON.parse(store.data[LISTS_STORAGE])[0].name, LEGACY);
    m.addSymbol('BINANCE:ETHUSDT');
    const after = JSON.parse(store.data[LISTS_STORAGE]);
    assert.equal(after[0].name, LEGACY);
    assert.equal(after.length, 2);
});

test('fresh model stores the English default name; copy names follow the language', () => {
    setLanguage('tr');
    const store = memStore();
    const m = new WatchlistModel(store);
    assert.equal(JSON.parse(store.data[LISTS_STORAGE])[0].name, DEFAULT_LIST_NAME);
    const id = m.copyList(m.lists[0].id);
    assert.ok(id);
    assert.equal(m.lists[1].name, 'İzleme listesi (kopya)');
    setLanguage('en');
});

console.log(`${passed} passed`);
