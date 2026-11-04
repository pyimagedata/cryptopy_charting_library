// Example: Donchian 20/10 breakout with ATR stop on XAU 1h, full history.
// Load with: load_draft_backtest { name: "example_xau_donchian_bt", dataset: "XAU_1m", timeframe: "1h" }
const D = bt.data();
const atr = bt.atr(D, 14);
const upper = bt.shift(bt.highest(D.h, 20), 1);   // channel of the PREVIOUS 20 bars (excludes bar i)
const lower = bt.shift(bt.lowest(D.l, 10), 1);
const upper10 = bt.shift(bt.highest(D.h, 10), 1);
const lower20 = bt.shift(bt.lowest(D.l, 20), 1);

const result = bt.run({
    data: D,
    capital: 10000,                                  // XAU contractSize defaults to 100 oz per lot
    costs: { spread: 0.3, commissionPerLot: 3.5, slippage: 0 },
    sizing: { mode: 'riskPct', riskPct: 1 },
    maxLots: 20,
    onBar(ctx, i) {
        if (Number.isNaN(upper[i]) || !(atr[i] > 0)) return;
        const pos = ctx.position;
        const c = D.c[i];
        if (!pos) {
            if (c > upper[i]) ctx.buy({ slDist: 2 * atr[i], tag: 'break-up' });
            else if (c < lower20[i]) ctx.sell({ slDist: 2 * atr[i], tag: 'break-dn' });
        } else if (pos.side === 'long' && c < lower[i]) ctx.close('exit-long');
        else if (pos.side === 'short' && c > upper10[i]) ctx.close('exit-short');
    },
});

(globalThis as any).__draftBacktestResult = result;
