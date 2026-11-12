// Bundles scripts/script-alert-logic.test.ts with esbuild (no tsx in this repo) and runs it with node.
//   node scripts/run-script-alert-logic-test.mjs
import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'script-alert-logic-'));
const out = join(dir, 'test.mjs');
await build({
    entryPoints: [join(here, 'script-alert-logic.test.ts')],
    bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'error',
    banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
});
const r = spawnSync(process.execPath, [out], { stdio: 'inherit' });
rmSync(dir, { recursive: true, force: true });
process.exit(r.status ?? 1);
