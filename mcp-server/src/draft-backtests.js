import { readFile, writeFile, mkdir, readdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { transform } from 'esbuild';

// Sandbox: LLM-authored backtest drafts may only ever be written to this
// directory, and only as files ending in "_bt.ts" -- kept PHYSICALLY SEPARATE
// from indicator drafts (see draft-indicators.js's _drafts folder) since a
// backtest script is not an Indicator subclass and runs under a different
// loading contract (see demo-ts.html's loadDraftBacktest): it drives
// window.__agentBridge.handleCommand itself (get_chart_context, draw_*)
// rather than implementing calculate()/getRange()/getDescription().
//
// Configurable via BACKTEST_DRAFTS_DIR env var for the same reason
// INDICATORS_DIR is configurable in draft-indicators.js (VPS deployments may
// only ship a subset of the charting_library checkout).
const BACKTEST_DRAFTS_DIR = path.resolve(
    process.env.BACKTEST_DRAFTS_DIR ||
    '/Users/mac/Desktop/MY_PROJECTS/CRYPTOPY_PROJECTS/charting_library/backtest_drafts'
);

function assertDraftName(name) {
    if (typeof name !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(name)) {
        throw new Error('Invalid draft name: only letters, numbers, "_" and "-" are allowed (no paths).');
    }
    if (!name.endsWith('_bt')) {
        throw new Error('Backtest draft names must end with "_bt", e.g. "sp_bobin_test_bt" (file becomes sp_bobin_test_bt.ts).');
    }
}

function draftPath(name) {
    assertDraftName(name);
    const filePath = path.join(BACKTEST_DRAFTS_DIR, `${name}.ts`);
    // Defense in depth: confirm the resolved path is still inside
    // BACKTEST_DRAFTS_DIR even though assertDraftName already blocks path
    // separators.
    if (path.dirname(filePath) !== BACKTEST_DRAFTS_DIR) {
        throw new Error('Resolved draft path escaped the backtest drafts directory.');
    }
    return filePath;
}

export async function writeDraftBacktest({ name, code }) {
    if (typeof code !== 'string' || !code.trim()) {
        throw new Error('code must be a non-empty string');
    }
    await mkdir(BACKTEST_DRAFTS_DIR, { recursive: true });
    const filePath = draftPath(name);
    await writeFile(filePath, code, 'utf-8');
    return { written: true, name, path: filePath };
}

export async function readDraftBacktest({ name }) {
    const filePath = draftPath(name);
    const code = await readFile(filePath, 'utf-8');
    return { name, path: filePath, code };
}

export async function deleteDraftBacktest({ name }) {
    const filePath = draftPath(name);
    try {
        await unlink(filePath);
    } catch (err) {
        if (err.code === 'ENOENT') {
            throw new Error(`Backtest draft "${name}" does not exist.`);
        }
        throw err;
    }
    return { deleted: true, name, path: filePath };
}

export async function listDraftBacktests() {
    await mkdir(BACKTEST_DRAFTS_DIR, { recursive: true });
    const entries = await readdir(BACKTEST_DRAFTS_DIR);
    const drafts = entries
        .filter(f => f.endsWith('_bt.ts'))
        .map(f => f.slice(0, -'.ts'.length));
    return { drafts };
}

/** Compile a backtest draft's TypeScript to plain JS (browser-ready). */
export async function compileDraftBacktest({ name }) {
    const { code: tsCode } = await readDraftBacktest({ name });
    // Backtest scripts naturally want top-level `await window.__agentBridge.
    // handleCommand(...)` calls (see DRAFT_BACKTEST_GUIDE) -- but esbuild's
    // format:'iife' does not allow top-level await (an IIFE is synchronous by
    // definition; verified live: compiling a script with a bare top-level
    // await under format:'iife'/target:'es2020' throws "Top-level await is
    // not available in the configured target environment"). Wrapping HERE,
    // once, server-side, means the LLM authoring a draft never needs to think
    // about this -- it just writes plain top-level await like any async
    // script. The `return` matters: the browser loader awaits this IIFE's
    // promise to know when the backtest run has actually finished.
    const wrapped = `return (async () => {\n${tsCode}\n})();`;
    // NOT format:'iife' -- esbuild's own IIFE wrapping would wrap this as a
    // plain (non-returning) statement, swallowing the `return` above so the
    // caller's `new Function(js)()` could never observe/await the inner
    // promise. Omitting `format` leaves top-level `return`/structure exactly
    // as written (verified: esbuild only strips TS types in that mode, adds
    // no wrapper of its own) -- draft scripts have no import/export anyway,
    // so no module-format handling is needed.
    const result = await transform(wrapped, {
        loader: 'ts',
        target: 'es2020',
    });
    return { name, js: result.code };
}
