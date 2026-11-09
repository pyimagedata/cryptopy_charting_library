/**
 * Section Renderer
 *
 * Renders a settings section (small uppercase group header + rows) TradingView style:
 * label on the left, control(s) on the right. In the Style tab neighbouring rows are
 * folded into one TV-like row: "<colour> + <line width>" and "<value> + <colour>".
 */

import { SettingsSection, SettingRow } from '../base';
import {
    createNumberInput,
    createColorInput,
    createCheckbox,
    createLineWidthSelect,
    createSliderInput,
    createSelectInput
} from '../components';
import { t } from '../../../helpers/translations';

export interface SectionContext {
    getValue: (key: string) => any;
    setValue: (key: string, value: any) => void;
    rerender: () => void;
    /** Dialog root: carries the theme variables the shared popovers copy */
    host?: HTMLElement | null;
    /** 'style' enables the row folding described above */
    mode?: 'inputs' | 'style';
}

type AnyRow = SettingRow & Record<string, any>;

export function renderSection(section: SettingsSection, context: SectionContext): HTMLElement {
    const container = document.createElement('div');

    if (section.title) {
        const titleEl = document.createElement('div');
        titleEl.className = section.raw ? 'tvs-group tvs-raw' : 'tvs-group';
        // script group names are shown as written: no translation, no locale upper-casing ("Main" stays "Main")
        if (section.raw) titleEl.lang = 'en';
        titleEl.textContent = section.raw ? section.title : t(section.title);
        container.appendChild(titleEl);
    }

    const rows = section.rows as AnyRow[];
    const fold = context.mode === 'style';
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const next = rows[i + 1];
        if (fold && next) {
            if (row.type === 'color' && isWidthRow(next)) {
                container.appendChild(renderColorWidthRow(row, next, context));
                i++;
                continue;
            }
            if (row.type === 'number' && !isWidthRow(row) && next.type === 'color' && colorBelongsToNumber(row, next)) {
                container.appendChild(renderValueColorRow(row, next, context));
                i++;
                continue;
            }
        }
        // inputs sharing an inline id (script `inline=`) go on one row, in declaration order
        if (row.inline) {
            const group: AnyRow[] = [row];
            while (rows[i + 1] && (rows[i + 1] as AnyRow).inline === row.inline) group.push(rows[++i] as AnyRow);
            if (group.length > 1) {
                const wrap = document.createElement('div');
                wrap.className = 'tvs-inline';
                group.forEach((g) => wrap.appendChild(renderRow(g, context)));
                container.appendChild(wrap);
                continue;
            }
        }
        container.appendChild(renderRow(row, context));
    }

    return container;
}

function isWidthRow(row: AnyRow): boolean {
    if (row.type === 'lineWidth') return true;
    return row.type === 'number' && /^(line)?width$/i.test(String(row.key || ''));
}

const stripColor = (label: string) => String(label || '').replace(/\s*colou?r\s*$/i, '').trim();

function colorBelongsToNumber(num: AnyRow, color: AnyRow): boolean {
    const nl = String(num.label || '').trim().toLowerCase();
    const cl = stripColor(color.label as string).toLowerCase();
    if (nl && cl && nl === cl) return true;
    const nk = String(num.key || '').replace(/(level|value)$/i, '').toLowerCase();
    const ck = String(color.key || '').replace(/colou?r$/i, '').toLowerCase();
    return !!nk && nk === ck;
}

function makeRowEl(): HTMLElement {
    const el = document.createElement('div');
    el.className = 'tvs-row';
    return el;
}

function labelEl(text: string, raw = false): HTMLElement {
    const label = document.createElement('label');
    label.className = 'tvs-label';
    label.textContent = text ? (raw ? text : t(text)) : '';
    label.title = label.textContent || '';
    return label;
}

const INFO_SVG = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.2"><circle cx="7" cy="7" r="5.8"/><path d="M7 6.2v3.6" stroke-linecap="round"/><circle cx="7" cy="4.2" r=".6" fill="currentColor" stroke="none"/></svg>`;

/** (i) icon: hover (or focus) shows the input's tooltip */
function infoIcon(text: string, context: SectionContext): HTMLElement {
    const icon = document.createElement('span');
    icon.className = 'tvs-info';
    icon.tabIndex = 0;
    icon.innerHTML = INFO_SVG;
    icon.setAttribute('aria-label', text);
    let tip: HTMLElement | null = null;
    const hide = () => { tip?.remove(); tip = null; };
    const show = () => {
        hide();
        const root = context.host?.parentElement ?? context.host ?? document.body;
        tip = document.createElement('div');
        tip.className = 'tvs-tip';
        tip.textContent = text;
        root.appendChild(tip);
        const r = icon.getBoundingClientRect();
        const w = tip.offsetWidth, h = tip.offsetHeight;
        tip.style.left = `${Math.max(6, Math.min(window.innerWidth - w - 6, r.left + r.width / 2 - w / 2))}px`;
        tip.style.top = `${r.bottom + 6 + h > window.innerHeight ? Math.max(6, r.top - h - 6) : r.bottom + 6}px`;
    };
    icon.addEventListener('mouseenter', show);
    icon.addEventListener('mouseleave', hide);
    icon.addEventListener('focus', show);
    icon.addEventListener('blur', hide);
    return icon;
}

function colorControl(row: AnyRow, context: SectionContext): HTMLElement {
    return createColorInput(
        (context.getValue(row.key) as string) || row.defaultValue || '#2962ff',
        (value) => context.setValue(row.key, value)
    );
}

function widthControl(row: AnyRow, context: SectionContext): HTMLElement {
    return createLineWidthSelect(
        Number(context.getValue(row.key)) || 1,
        { min: row.min || 1, max: row.max || 4 },
        (value) => context.setValue(row.key, value),
        context.rerender,
        context.host ?? null
    );
}

function numberControl(row: AnyRow, context: SectionContext): HTMLElement {
    return createNumberInput(
        context.getValue(row.key) as number,
        { min: row.min, max: row.max, step: row.step },
        (value) => context.setValue(row.key, value)
    );
}

function controls(...els: HTMLElement[]): HTMLElement {
    const c = document.createElement('div');
    c.className = 'tvs-controls';
    els.forEach((e) => c.appendChild(e));
    return c;
}

/** "Line  [swatch] [width]" */
function renderColorWidthRow(color: AnyRow, width: AnyRow, context: SectionContext): HTMLElement {
    const el = makeRowEl();
    el.appendChild(labelEl(stripColor(color.label as string) || 'Line'));
    el.appendChild(controls(colorControl(color, context), widthControl(width, context)));
    return el;
}

/** "Overbought  [70] [swatch]" */
function renderValueColorRow(num: AnyRow, color: AnyRow, context: SectionContext): HTMLElement {
    const el = makeRowEl();
    el.appendChild(labelEl(num.label as string));
    el.appendChild(controls(numberControl(num, context), colorControl(color, context)));
    return el;
}

// --- date-time / session helpers (Evo Script inputs) ---

function tzParts(ms: number, tz: string): number[] {
    const f = new Intl.DateTimeFormat('en-CA', {
        timeZone: tz || undefined, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    const o: Record<string, number> = {};
    for (const p of f.formatToParts(new Date(ms))) if (p.type !== 'literal') o[p.type] = parseInt(p.value, 10);
    return [o.year, o.month, o.day, o.hour, o.minute, o.second];
}

/** "YYYY-MM-DDTHH:mm" wall clock of `ms` in the zone */
function wallString(ms: number, tz: string): string {
    try {
        const [y, mo, d, h, mi] = tzParts(ms, tz);
        const z = (n: number, w = 2) => String(n).padStart(w, '0');
        return `${z(y, 4)}-${z(mo)}-${z(d)}T${z(h)}:${z(mi)}`;
    } catch { return ''; }
}

/** ms for a "YYYY-MM-DDTHH:mm" wall clock in the zone (null when unparsable) */
function wallToMs(v: string, tz: string): number | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(v);
    if (!m) return null;
    const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
    try {
        const off = (t: number) => { const [y, mo, d, h, mi, s] = tzParts(t, tz); return Date.UTC(y, mo - 1, d, h, mi, s) - Math.floor(t / 1000) * 1000; };
        let t = wall - off(wall);
        t = wall - off(t);
        return t;
    } catch { return wall; }
}

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']; // TradingView digits 1..7 = Sunday..Saturday

function sessionControl(value: string, onChange: (v: string) => void): HTMLElement {
    const m = /^(\d{2})(\d{2})-(\d{2})(\d{2})(?::(\d+))?$/.exec(value.trim());
    const state = {
        start: m ? `${m[1]}:${m[2]}` : '09:30',
        end: m ? `${m[3]}:${m[4]}` : '16:00',
        days: new Set<number>(m && m[5] ? [...m[5]].map(Number).filter((n) => n >= 1 && n <= 7) : [1, 2, 3, 4, 5, 6, 7]),
    };
    const wrap = document.createElement('div');
    wrap.className = 'tvs-session';
    const emit = () => {
        const days = [...state.days].sort((a, b) => a - b);
        const base = `${state.start.replace(':', '')}-${state.end.replace(':', '')}`;
        onChange(days.length >= 7 ? base : `${base}:${days.join('')}`);
    };
    const times = document.createElement('div');
    times.className = 'tvs-controls';
    const mk = (get: 'start' | 'end') => {
        const i = document.createElement('input');
        i.type = 'time';
        i.className = 'tvs-input tvs-time';
        i.value = state[get];
        i.addEventListener('change', () => { if (i.value) { state[get] = i.value; emit(); } });
        return i;
    };
    const dash = document.createElement('span');
    dash.textContent = '\u2013';
    times.append(mk('start'), dash, mk('end'));
    const days = document.createElement('div');
    days.className = 'tvs-days';
    WEEKDAYS.forEach((label, k) => {
        const n = k + 1;
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'tvs-day' + (state.days.has(n) ? ' on' : '');
        b.textContent = label;
        b.title = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][k];
        b.addEventListener('click', () => {
            if (state.days.has(n)) { if (state.days.size > 1) state.days.delete(n); } else state.days.add(n);
            b.classList.toggle('on', state.days.has(n));
            emit();
        });
        days.appendChild(b);
    });
    wrap.append(times, days);
    return wrap;
}

function renderRow(row: AnyRow, context: SectionContext): HTMLElement {
    const rowEl = makeRowEl();
    const key = row.key as string | undefined;
    const currentValue = key ? context.getValue(key) : undefined;

    switch (row.type) {
        case 'number': {
            rowEl.appendChild(labelEl(row.label as string, row.raw === true));
            rowEl.appendChild(isWidthRow(row) && context.mode === 'style'
                ? controls(widthControl(row, context))
                : numberControl(row, context));
            break;
        }

        case 'color': {
            rowEl.appendChild(labelEl(row.label as string, row.raw === true));
            rowEl.appendChild(controls(colorControl(row, context)));
            break;
        }

        case 'checkbox': {
            rowEl.appendChild(createCheckbox(
                row.label ? (row.raw ? row.label : t(row.label)) : '',
                (currentValue as boolean) ?? row.defaultValue ?? false,
                (value) => key && context.setValue(key, value)
            ));
            break;
        }

        case 'select': {
            rowEl.appendChild(labelEl(row.label as string, row.raw === true));
            rowEl.appendChild(createSelectInput(
                String(currentValue ?? row.defaultValue ?? ''),
                row.options || [],
                (value) => key && context.setValue(key, value),
                row.raw !== true
            ));
            break;
        }

        case 'lineWidth': {
            rowEl.appendChild(labelEl(row.label as string, row.raw === true));
            rowEl.appendChild(controls(widthControl(row, context)));
            break;
        }

        case 'text': {
            rowEl.appendChild(labelEl(row.label as string, row.raw === true));
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'tvs-input tvs-textinput';
            input.value = String(currentValue ?? row.defaultValue ?? '');
            if (row.placeholder) input.placeholder = String(row.placeholder);
            let timer: ReturnType<typeof setTimeout> | null = null;
            const commit = () => { if (timer) { clearTimeout(timer); timer = null; } if (key) context.setValue(key, input.value); };
            input.addEventListener('input', () => { if (timer) clearTimeout(timer); timer = setTimeout(commit, 300); });
            input.addEventListener('change', commit);
            input.addEventListener('keydown', (e) => { if (e.key === 'Enter') commit(); });
            rowEl.appendChild(input);
            break;
        }

        case 'textarea': {
            if (row.label) rowEl.appendChild(labelEl(row.label as string, row.raw === true));
            const ta = document.createElement('textarea');
            ta.className = 'tvs-input tvs-textarea';
            ta.rows = 3;
            ta.value = String(currentValue ?? row.defaultValue ?? '');
            let timer: ReturnType<typeof setTimeout> | null = null;
            const commit = () => { if (timer) { clearTimeout(timer); timer = null; } if (key) context.setValue(key, ta.value); };
            ta.addEventListener('input', () => { if (timer) clearTimeout(timer); timer = setTimeout(commit, 300); });
            ta.addEventListener('change', commit);
            rowEl.appendChild(ta);
            break;
        }

        case 'datetime': {
            rowEl.appendChild(labelEl(row.label as string, row.raw === true));
            const tz = String(row.tz || '');
            const input = document.createElement('input');
            input.type = 'datetime-local';
            input.className = 'tvs-input tvs-datetime';
            input.step = '60';
            const cur = Number(currentValue ?? row.defaultValue);
            input.value = Number.isFinite(cur) ? wallString(cur, tz) : '';
            input.addEventListener('change', () => {
                const ms = wallToMs(input.value, tz);
                if (key && ms !== null) context.setValue(key, ms);
            });
            const wrap = document.createElement('div');
            wrap.className = 'tvs-controls';
            wrap.appendChild(input);
            if (tz) { const z = document.createElement('span'); z.className = 'tvs-tzlabel'; z.textContent = tz; z.title = tz; wrap.appendChild(z); }
            rowEl.appendChild(wrap);
            break;
        }

        case 'session': {
            rowEl.appendChild(labelEl(row.label as string, row.raw === true));
            rowEl.appendChild(sessionControl(String(currentValue ?? row.defaultValue ?? ''), (v) => key && context.setValue(key, v)));
            break;
        }

        case 'slider': {
            rowEl.appendChild(labelEl(row.label as string, row.raw === true));
            rowEl.appendChild(createSliderInput(
                currentValue as number,
                { min: row.min, max: row.max, step: row.step },
                (value) => key && context.setValue(key, value)
            ));
            break;
        }

        default: {
            rowEl.appendChild(labelEl(row.label as string, row.raw === true));
        }
    }

    if (row.tooltip) {
        const icon = infoIcon(String(row.tooltip), context);
        const first = rowEl.firstElementChild;
        if (row.type === 'checkbox' && first) {
            // checkbox rows have no separate label: keep the icon next to the text
            const box = document.createElement('div');
            box.style.cssText = 'display:flex;align-items:center;gap:6px;min-width:0';
            rowEl.insertBefore(box, first);
            box.appendChild(first);
            box.appendChild(icon);
        } else {
            const lab = rowEl.querySelector('.tvs-label');
            if (lab) lab.appendChild(icon); else rowEl.insertBefore(icon, rowEl.firstChild);
        }
    }
    return rowEl;
}
