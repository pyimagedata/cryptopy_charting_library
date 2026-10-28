/**
 * Number Input Component (TradingView style: 32px, stepper buttons on the right).
 * Typing applies after a short debounce so live apply does not recalculate per key.
 */

const UP = `<svg width="8" height="5" viewBox="0 0 8 5"><path d="M1 4.2 4 1.2 7 4.2" stroke="currentColor" stroke-width="1.3" fill="none"/></svg>`;
const DOWN = `<svg width="8" height="5" viewBox="0 0 8 5"><path d="M1 .8 4 3.8 7 .8" stroke="currentColor" stroke-width="1.3" fill="none"/></svg>`;

function decimals(step: number): number {
    const s = String(step);
    const i = s.indexOf('.');
    return i < 0 ? 0 : s.length - i - 1;
}

export function createNumberInput(
    value: number,
    options: { min?: number; max?: number; step?: number },
    onChange: (value: number) => void
): HTMLElement {
    const step = options.step && options.step > 0 ? options.step : 1;
    const wrap = document.createElement('div');
    wrap.className = 'tvs-numwrap';

    const input = document.createElement('input');
    input.type = 'number';
    input.value = String(value ?? 0);
    if (options.min !== undefined) input.min = String(options.min);
    if (options.max !== undefined) input.max = String(options.max);
    input.step = String(step);

    let timer: ReturnType<typeof setTimeout> | null = null;
    const clamp = (n: number) => {
        if (options.min !== undefined && n < options.min) n = options.min;
        if (options.max !== undefined && n > options.max) n = options.max;
        return n;
    };
    const commit = () => {
        if (timer) { clearTimeout(timer); timer = null; }
        const n = parseFloat(input.value);
        if (!isFinite(n)) return;
        onChange(clamp(n));
    };
    input.addEventListener('input', () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(commit, 300);
    });
    input.addEventListener('change', () => {
        const n = parseFloat(input.value);
        if (isFinite(n)) input.value = String(clamp(n));
        commit();
    });
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { commit(); }
    });

    const bump = (dir: 1 | -1) => {
        const cur = parseFloat(input.value);
        const base = isFinite(cur) ? cur : 0;
        const next = clamp(Number((base + dir * step).toFixed(Math.max(decimals(step), 6))));
        input.value = String(next);
        commit();
    };

    const steps = document.createElement('div');
    steps.className = 'tvs-steps';
    const up = document.createElement('button');
    up.type = 'button'; up.tabIndex = -1; up.innerHTML = UP;
    up.addEventListener('click', () => bump(1));
    const down = document.createElement('button');
    down.type = 'button'; down.tabIndex = -1; down.innerHTML = DOWN;
    down.addEventListener('click', () => bump(-1));
    steps.appendChild(up);
    steps.appendChild(down);

    wrap.appendChild(input);
    wrap.appendChild(steps);
    return wrap;
}
