// Usage: node src/backtest-data-cli.js [datasetName ...]
// Pre-ingests datasets from BACKTEST_DATA_DIR/datasets.json (all when no name
// is given) so the first load_draft_backtest does not pay the CSV parse cost.
import { loadManifest, ensureIngested } from './backtest-data.js';

const names = process.argv.slice(2);
const targets = names.length ? names : (await loadManifest()).map(e => e.name);
for (const name of targets) {
    const t0 = Date.now();
    const meta = await ensureIngested(name);
    console.log(`${name}: ${meta.count} bars ${meta.from} -> ${meta.to} (${Date.now() - t0} ms)`);
}
