import { readFile, writeFile, mkdir, readdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { transform } from 'esbuild';

// Sandbox: LLM-authored indicator drafts may only ever be written to this
// directory, and only as files ending in "_dev.ts". This keeps generated
// code physically separate from production indicators (indicators/*.ts) —
// nothing here can overwrite real source without a human copying it over.
//
// Configurable via INDICATORS_DIR env var since this server can now run
// somewhere other than the Mac dev machine (e.g. a VPS deployment) where the
// full charting_library checkout may live at a different path, or only a
// copy of this indicators/ folder may be deployed alongside mcp-server.
const INDICATORS_DIR = path.resolve(
    process.env.INDICATORS_DIR ||
    '/Users/mac/Desktop/MY_PROJECTS/CRYPTOPY_PROJECTS/charting_library/packages/charts/src/indicators'
);
const DRAFTS_DIR = path.join(INDICATORS_DIR, '_drafts');

function assertDraftName(name) {
    if (typeof name !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(name)) {
        throw new Error('Invalid draft name: only letters, numbers, "_" and "-" are allowed (no paths).');
    }
    if (!name.endsWith('_dev')) {
        throw new Error('Draft names must end with "_dev", e.g. "fvg_dev" (file becomes fvg_dev.ts).');
    }
}

function draftPath(name) {
    assertDraftName(name);
    const filePath = path.join(DRAFTS_DIR, `${name}.ts`);
    // Defense in depth: confirm the resolved path is still inside DRAFTS_DIR
    // even though assertDraftName already blocks path separators.
    if (path.dirname(filePath) !== DRAFTS_DIR) {
        throw new Error('Resolved draft path escaped the drafts directory.');
    }
    return filePath;
}

export async function writeDraftIndicator({ name, code }) {
    if (typeof code !== 'string' || !code.trim()) {
        throw new Error('code must be a non-empty string');
    }
    await mkdir(DRAFTS_DIR, { recursive: true });
    const filePath = draftPath(name);
    await writeFile(filePath, code, 'utf-8');
    return { written: true, name, path: filePath };
}

export async function readDraftIndicator({ name }) {
    const filePath = draftPath(name);
    const code = await readFile(filePath, 'utf-8');
    return { name, path: filePath, code };
}

export async function deleteDraftIndicator({ name }) {
    const filePath = draftPath(name);
    try {
        await unlink(filePath);
    } catch (err) {
        if (err.code === 'ENOENT') {
            throw new Error(`Draft "${name}" does not exist.`);
        }
        throw err;
    }
    return { deleted: true, name, path: filePath };
}

export async function listDraftIndicators() {
    await mkdir(DRAFTS_DIR, { recursive: true });
    const entries = await readdir(DRAFTS_DIR);
    const drafts = entries
        .filter(f => f.endsWith('_dev.ts'))
        .map(f => f.slice(0, -'.ts'.length));
    return { drafts };
}

export async function readIndicatorSource({ name }) {
    if (typeof name !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(name)) {
        throw new Error('Invalid indicator source name: only letters, numbers, "_" and "-" are allowed.');
    }
    const filePath = path.join(INDICATORS_DIR, `${name}.ts`);
    if (path.dirname(filePath) !== INDICATORS_DIR) {
        throw new Error('Resolved path escaped the indicators directory.');
    }
    const code = await readFile(filePath, 'utf-8');
    return { name, path: filePath, code };
}

export async function listIndicatorSources() {
    const entries = await readdir(INDICATORS_DIR, { withFileTypes: true });
    const names = entries
        .filter(e => e.isFile() && e.name.endsWith('.ts'))
        .map(e => e.name.slice(0, -'.ts'.length));
    return { indicators: names };
}

/**
 * Copy an existing production indicator's source into the drafts sandbox as a
 * starting point for modification, stripping import/export statements since
 * drafts run as standalone scripts referencing engine classes as globals
 * (see write_draft_indicator's DRAFT_INDICATOR_GUIDE).
 */
export async function copyIndicatorToDraft({ sourceName, draftName }) {
    const { code: sourceCode } = await readIndicatorSource({ name: sourceName });

    const stripped = sourceCode
        // Strip both single-line (`import { x } from 'y';`) and multi-line
        // (`import {\n  x,\n  y,\n} from 'z';`) import statements as whole
        // blocks — a plain line filter only catches the former and leaves
        // dangling specifiers from the latter, producing invalid syntax.
        .replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
        .replace(/^export\s+(abstract\s+)?(class|function|const|interface|type|enum)/gm, '$1$2')
        .replace(/\n{3,}/g, '\n\n')
        .trimStart();

    const footer =
        `\n\n// --- draft loader entry point (added by copy_indicator_to_draft) ---\n` +
        `// The class above still has its original name; point the loader at it here,\n` +
        `// or rename the class and update this line, before calling load_draft_indicator.\n` +
        `// globalThis.__draftIndicatorClass = <ClassName>;\n`;

    const filePath = draftPath(draftName);
    await mkdir(DRAFTS_DIR, { recursive: true });
    await writeFile(filePath, stripped + footer, 'utf-8');

    return {
        copied: true,
        sourceName,
        draftName,
        path: filePath,
        note: 'import/export statements were stripped. The file still needs a trailing `globalThis.__draftIndicatorClass = <ClassName>;` line (a commented placeholder was added) before load_draft_indicator will work — set it via write_draft_indicator.',
    };
}

/** Compile a draft's TypeScript to plain JS (ESM->IIFE-free, browser-ready). */
export async function compileDraftIndicator({ name }) {
    const { code: tsCode } = await readDraftIndicator({ name });
    const result = await transform(tsCode, {
        loader: 'ts',
        format: 'iife',
        target: 'es2020',
        // Draft indicators are plain classes referencing globals (Indicator,
        // OverlayIndicator, ...) already present on the chart page — they are
        // not real ES modules, so import/export statements aren't expected.
    });
    return { name, js: result.code };
}
