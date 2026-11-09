import test from 'node:test';
import assert from 'node:assert/strict';
import { registerEvoTools, EVO_GUIDE } from '../src/evo-tools.js';

const NAMES = ['evo_list_scripts', 'evo_read_script', 'evo_compile', 'evo_add_script', 'evo_update_script',
    'evo_remove_script', 'evo_get_output', 'evo_get_strategy_report', 'evo_set_params', 'evo_open_strategy_tester'];

function setup(callImpl) {
    const tools = {};
    const server = { registerTool: (name, def, handler) => { tools[name] = { def, handler }; } };
    const calls = [];
    const bridge = { call: async (tool, args, timeout) => { calls.push({ tool, args, timeout }); return callImpl(tool, args); } };
    registerEvoTools(server, bridge);
    return { tools, calls };
}

test('registers all evo tools with descriptions', () => {
    const { tools } = setup(() => ({}));
    assert.deepEqual(Object.keys(tools).sort(), [...NAMES].sort());
    for (const n of NAMES) assert.ok(tools[n].def.description.length > 20, n);
    assert.match(EVO_GUIDE, /bt` engine|`bt`/);
});

test('each tool forwards to the same-named bridge command', async () => {
    const { tools, calls } = setup((t) => ({ ok: true, t }));
    for (const n of NAMES.filter((x) => x !== 'evo_set_params')) await tools[n].handler({ chartId: 'c1' });
    assert.deepEqual(calls.map((c) => c.tool), NAMES.filter((x) => x !== 'evo_set_params'));
});

test('evo_set_params attaches fresh output for indicators only', async () => {
    let r = setup((t) => (t === 'evo_set_params' ? { status: 'ok', chartId: 'c1', isIndicator: true } : { plots: [] }));
    const out = JSON.parse((await r.tools.evo_set_params.handler({ chartId: 'c1', inputs: { len: 5 } })).content[0].text);
    assert.deepEqual(out.output, { plots: [] });
    r = setup(() => ({ status: 'ok', chartId: 'c1' }));
    await r.tools.evo_set_params.handler({ chartId: 'c1', inputs: { len: 5 } });
    assert.equal(r.calls.length, 1);
});
