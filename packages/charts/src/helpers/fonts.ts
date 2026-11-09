// Shared font stacks. DOM CSS uses the host's --rp-font-* variables with the
// legacy stacks as fallback; canvas code must resolve the family at runtime
// (CSS variables are not valid inside ctx.font).

const SANS_FALLBACK = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const MONO_FALLBACK = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

/** CSS value for DOM styles. */
export const FONT_SANS = `var(--rp-font-sans, ${SANS_FALLBACK})`;
export const FONT_MONO = `var(--rp-font-mono, ${MONO_FALLBACK})`;

const VAR_RE = /^var\(\s*(--[\w-]+)\s*(?:,\s*([\s\S]*))?\)$/;
const cache = new Map<string, string>();

function resolveOne(family: string): string {
    const m = VAR_RE.exec(family.trim());
    if (!m) return family;
    let v = '';
    if (typeof document !== 'undefined') {
        try { v = getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim(); } catch { /* ignore */ }
    }
    return v || (m[2] ? m[2].trim() : '');
}

/** Resolve a family string that may be var(--x, fallback) into a plain canvas-safe family list. */
export function resolveFontFamily(family: string): string {
    let r = cache.get(family);
    if (r === undefined) {
        r = resolveOne(family);
        cache.set(family, r);
    }
    return r;
}

/** Canvas-safe sans family (host --rp-font-sans, else legacy stack). */
export function canvasSans(): string { return resolveFontFamily(FONT_SANS); }
/** Canvas-safe mono family. */
export function canvasMono(): string { return resolveFontFamily(FONT_MONO); }

const listeners = new Set<() => void>();
/** Subscribe to "fonts changed" (webfont finished loading). Returns unsubscribe. */
export function onFontsChanged(cb: () => void): () => void {
    listeners.add(cb);
    return () => listeners.delete(cb);
}

function fire(): void {
    cache.clear();
    listeners.forEach(cb => { try { cb(); } catch { /* ignore */ } });
}

if (typeof document !== 'undefined' && (document as any).fonts) {
    const f = (document as any).fonts as FontFaceSet;
    try {
        f.addEventListener('loadingdone', fire);
        f.ready.then(fire).catch(() => { /* ignore */ });
    } catch { /* ignore */ }
}

/** Form controls do not inherit font-family by default (UA stylesheet): make the chart UI follow its container. */
export function ensureFontInheritStyle(): void {
    if (typeof document === 'undefined' || document.getElementById('tv-font-inherit')) return;
    const st = document.createElement('style');
    st.id = 'tv-font-inherit';
    st.textContent = '.tv-chart-container :where(button,input,select,textarea){font-family:inherit}';
    document.head.appendChild(st);
}
