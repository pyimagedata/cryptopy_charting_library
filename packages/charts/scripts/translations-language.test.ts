// Guard test: setLanguage notifies onLanguageChange subscribers only on a real change, and getCurrentLanguage
// reflects it (the toolbar switcher reads it). Run from packages/charts:
//   npx esbuild scripts/translations-language.test.ts --bundle --platform=node --format=esm --outfile=<tmp>.mjs && node <tmp>.mjs

import assert from 'node:assert/strict';
import { setLanguage, getCurrentLanguage, onLanguageChange, t } from '../src/helpers/translations';

const seen: string[] = [];
const off = onLanguageChange((l) => seen.push(l));

setLanguage('en');
assert.deepEqual(seen, [], 'same language: no notification');
setLanguage('tr');
assert.equal(getCurrentLanguage(), 'tr');
assert.deepEqual(seen, ['tr']);
setLanguage('tr');
assert.deepEqual(seen, ['tr'], 'repeat: no notification');
assert.equal(t('Watchlist') !== '', true);
setLanguage('en');
assert.deepEqual(seen, ['tr', 'en']);
off();
setLanguage('tr');
assert.deepEqual(seen, ['tr', 'en'], 'unsubscribed');
setLanguage('en');
console.log('translations-language test passed');
