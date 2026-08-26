class KzProbeIndicator extends OverlayIndicator {
    private _diag: string[] = [];

    constructor(options: any = {}) {
        super({ ...options, name: 'KZ Probe' });
        this._diag = [];
    }

    calculate(sourceData: any[]): void {
        (this as any)._sourceData = sourceData;
        (this as any)._data = sourceData.map((b: any) => ({ time: b.time, value: NaN }));
        const d: string[] = [];
        const n = sourceData ? sourceData.length : -1;
        d.push('bars=' + n);
        if (!n) { this._diag = d; return; }

        const t0 = sourceData[0].time;
        const tN = sourceData[n - 1].time;
        d.push('t0=' + t0);
        d.push('tN=' + tN);
        d.push('typeof t=' + typeof tN);
        d.push('deltaT=' + (sourceData[1].time - sourceData[0].time));

        // as-ms interpretation
        const fmt = new Intl.DateTimeFormat('en-GB', {
            timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit',
            day: '2-digit', month: '2-digit', hour12: false,
        });
        d.push('asMS_last=' + fmt.format(new Date(tN)));
        d.push('asSEC_last=' + fmt.format(new Date(tN * 1000)));

        // minute-of-day histogram over last 300 bars, ms interpretation
        const hf = new Intl.DateTimeFormat('en-GB', {
            timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false,
        });
        const start = Math.max(0, n - 300);
        let inAsia = 0, inLdn = 0, inNy = 0, inLc = 0;
        for (let i = start; i < n; i++) {
            const parts = hf.formatToParts(new Date(sourceData[i].time));
            let h = 0, m = 0;
            for (const p of parts) {
                if (p.type === 'hour') h = parseInt(p.value, 10);
                else if (p.type === 'minute') m = parseInt(p.value, 10);
            }
            if (h === 24) h = 0;
            const mod = h * 60 + m;
            if (mod >= 1200 && mod < 1440) inAsia++;
            if (mod >= 120 && mod < 300) inLdn++;
            if (mod >= 420 && mod < 600) inNy++;
            if (mod >= 600 && mod < 720) inLc++;
        }
        d.push('last300 inZone: AS=' + inAsia + ' LDN=' + inLdn + ' NY=' + inNy + ' LC=' + inLc);
        this._diag = d;
    }

    getRange(): any {
        return { min: 0, max: 100 };
    }

    getDescription(): string {
        return 'KZ Probe';
    }

    drawOverlay(ctx: any, timeScale: any, priceScale: any, hpr: number, vpr: number, visibleRange?: any): void {
        const src = (this as any)._sourceData;
        const lines = this._diag.slice();
        lines.unshift('--- KZ PROBE ---');
        lines.push('drawOverlay CALLED');
        lines.push('canvas=' + ctx.canvas.width + 'x' + ctx.canvas.height + ' hpr=' + hpr + ' vpr=' + vpr);
        lines.push('barSpacing=' + (timeScale.barSpacing));
        if (visibleRange) lines.push('visRange=' + Math.floor(visibleRange.from) + '..' + Math.ceil(visibleRange.to));
        else lines.push('visRange=NULL');
        if (src && src.length) {
            const li = src.length - 1;
            lines.push('idxToCoord(0)=' + Math.round(timeScale.indexToCoordinate(0)));
            lines.push('idxToCoord(last)=' + Math.round(timeScale.indexToCoordinate(li)));
            lines.push('priceToCoord(last close)=' + Math.round(priceScale.priceToCoordinate(src[li].close)));
        }

        ctx.save();
        ctx.font = 'bold ' + (13 * hpr) + 'px monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        const pad = 8 * hpr;
        let w = 0;
        for (const l of lines) w = Math.max(w, ctx.measureText(l).width);
        const lh = 17 * vpr;
        ctx.fillStyle = 'rgba(0,0,0,0.82)';
        ctx.fillRect(pad, pad, w + pad * 2, lines.length * lh + pad * 2);
        ctx.fillStyle = '#22ff88';
        for (let i = 0; i < lines.length; i++) {
            ctx.fillText(lines[i], pad * 2, pad * 2 + i * lh);
        }
        ctx.restore();
    }
}

globalThis.__draftIndicatorClass = KzProbeIndicator;
