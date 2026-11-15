// Bundles scripts/i18n.test.ts with esbuild and runs it with node.
//   node scripts/run-i18n-test.mjs
import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'i18n-test-'));
const out = join(dir, 'test.mjs');
await build({
    entryPoints: [join(here, 'i18n.test.ts')],
    bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'error',
    banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
});
const r = spawnSync(process.execPath, [out], { stdio: 'inherit', env: { ...process.env, I18N_SRC_DIR: join(here, '..', 'src') } });
rmSync(dir, { recursive: true, force: true });
process.exit(r.status ?? 1);
