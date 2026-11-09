/**
 * Stylesheet of the indicator settings dialog (injected once into <head>).
 * All colours come from the `--tvs-*` variables set on the dialog root.
 */

import { TV_SIZES } from './constants';

const STYLE_ID = 'tvs-indicator-settings-styles';

const S = TV_SIZES;

export const TVS_CSS = `
.tvs-root, .tvs-root * { box-sizing: border-box; }
.tvs-root { font-family: ${S.fontFamily}; font-size: ${S.fontSize}px; color: var(--tvs-text); }
.tvs-btn-icon { background: none; border: none; cursor: pointer; padding: 4px; display: flex; border-radius: 4px; color: var(--tvs-muted); }
.tvs-btn-icon:hover { background: var(--tvs-hover); color: var(--tvs-text); }
.tvs-tab { background: none; border: none; padding: 10px 0 11px; margin-right: 20px; font: inherit; font-weight: 500; cursor: pointer;
    position: relative; color: var(--tvs-muted); border-bottom: 2px solid transparent; margin-bottom: -1px; }
.tvs-tab:hover { color: var(--tvs-text); }
.tvs-tab.tvs-active { color: var(--tvs-text); border-bottom-color: var(--tvs-accent); }
.tvs-group { font-size: ${S.smallFontSize}px; font-weight: 600; color: var(--tvs-muted); text-transform: uppercase; letter-spacing: .4px; margin: 14px 0 8px; }
.tvs-group:first-child { margin-top: 0; }
.tvs-group.tvs-raw { text-transform: none; letter-spacing: 0; }
.tvs-inline { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 16px; margin-bottom: ${S.rowGap - 4}px; }
.tvs-inline > .tvs-row { margin-bottom: 0; flex: 1 1 auto; min-width: 0; }
.tvs-inline > .tvs-row > .tvs-label { flex: 0 1 auto; }
.tvs-info { display: inline-flex; vertical-align: middle; margin-left: 6px; color: var(--tvs-muted); cursor: help; outline: none; }
.tvs-info:hover, .tvs-info:focus { color: var(--tvs-text); }
.tvs-tip { position: fixed; z-index: ${S.zIndex + 5}; max-width: 260px; padding: 7px 9px; border-radius: 4px; background: var(--tvs-bg); color: var(--tvs-text);
    border: 1px solid var(--tvs-border); box-shadow: var(--shadow); font-size: ${S.smallFontSize}px; line-height: 1.4; white-space: pre-wrap; pointer-events: none; }
.tvs-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: ${S.controlHeight}px; margin-bottom: ${S.rowGap - 4}px; }
.tvs-row > label, .tvs-row .tvs-label { color: var(--tvs-text); flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.tvs-controls { display: flex; align-items: center; gap: 8px; flex: 0 0 auto; }
.tvs-input { height: ${S.controlHeight}px; border: 1px solid var(--tvs-input-border); border-radius: ${S.controlRadius}px; background: var(--tvs-input-bg);
    color: var(--tvs-text); font: inherit; padding: 0 10px; outline: none; }
.tvs-input:hover { border-color: var(--tvs-muted); }
.tvs-input:focus, .tvs-numwrap:focus-within { border-color: var(--tvs-accent) !important; }
.tvs-numwrap { display: flex; align-items: stretch; height: ${S.controlHeight}px; width: 96px; border: 1px solid var(--tvs-input-border); border-radius: ${S.controlRadius}px;
    background: var(--tvs-input-bg); overflow: hidden; }
.tvs-textinput { width: 180px; box-sizing: border-box; height: ${S.controlHeight}px; padding: 0 10px; border: 1px solid var(--tvs-input-border); border-radius: ${S.controlRadius}px; background: transparent; color: var(--tvs-text); font: inherit; outline: none; }
.tvs-textarea { width: 220px; box-sizing: border-box; height: auto; min-height: 56px; padding: 6px 10px; resize: vertical; font-family: inherit; }
.tvs-datetime { width: 190px; box-sizing: border-box; color-scheme: light dark; }
.tvs-tzlabel { color: var(--tvs-muted); font-size: ${S.smallFontSize}px; max-width: 90px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tvs-session { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; flex: 0 0 auto; }
.tvs-time { width: 100px; box-sizing: border-box; color-scheme: light dark; }
.tvs-days { display: flex; gap: 4px; }
.tvs-day { width: 24px; height: 24px; padding: 0; border: 1px solid var(--tvs-input-border); border-radius: 12px; background: transparent; color: var(--tvs-muted); font: inherit; font-size: ${S.smallFontSize}px; cursor: pointer; }
.tvs-day:hover { border-color: var(--tvs-muted); }
.tvs-day.on { background: var(--tvs-accent); border-color: var(--tvs-accent); color: #fff; }
.tvs-numwrap:hover { border-color: var(--tvs-muted); }
.tvs-numwrap input { font-variant-numeric: tabular-nums; flex: 1 1 auto; min-width: 0; width: 100%; border: none; outline: none; background: transparent; color: var(--tvs-text); font: inherit; padding: 0 0 0 10px;
    -moz-appearance: textfield; }
.tvs-numwrap input::-webkit-outer-spin-button, .tvs-numwrap input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.tvs-steps { display: flex; flex-direction: column; width: 20px; border-left: 1px solid var(--tvs-input-border); }
.tvs-steps button { flex: 1; border: none; background: transparent; color: var(--tvs-muted); cursor: pointer; padding: 0; display: flex; align-items: center; justify-content: center; }
.tvs-steps button:hover { background: var(--tvs-hover); color: var(--tvs-text); }
.tvs-select { min-width: 120px; padding-right: 26px; appearance: none; -webkit-appearance: none; cursor: pointer;
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 10 10'><path d='M2 3.5 5 6.5 8 3.5' stroke='%23787B86' stroke-width='1.4' fill='none'/></svg>");
    background-repeat: no-repeat; background-position: right 9px center; }
.tvs-select option { background: var(--tvs-bg); color: var(--tvs-text); }
.tvs-check { color: var(--tvs-text); display: inline-flex; align-items: center; gap: 10px; cursor: pointer; user-select: none; }
.tvs-check input { position: absolute; opacity: 0; width: 0; height: 0; }
.tvs-box { width: ${S.checkbox}px; height: ${S.checkbox}px; flex: 0 0 ${S.checkbox}px; border: 1px solid var(--tvs-checkbox-border); border-radius: 4px; display: flex; align-items: center; justify-content: center;
    background: transparent; transition: background .1s, border-color .1s; }
.tvs-box svg { opacity: 0; }
.tvs-check input:checked + .tvs-box { background: var(--tvs-accent); border-color: var(--tvs-accent); }
.tvs-check input:checked + .tvs-box svg { opacity: 1; }
.tvs-check input:focus-visible + .tvs-box { outline: 2px solid var(--tvs-accent); outline-offset: 1px; }
.tvs-check:hover .tvs-box { border-color: var(--tvs-accent); }
.tvs-swatch { position: relative; width: ${S.controlHeight - 4}px; height: ${S.controlHeight - 4}px; border-radius: ${S.controlRadius}px; border: 1px solid var(--tvs-input-border); cursor: pointer; padding: 0; overflow: hidden;
    background: conic-gradient(#8a8d96 25%, #c9ccd3 0 50%, #8a8d96 0 75%, #c9ccd3 0) 0 0 / 8px 8px; }
.tvs-swatch:hover { border-color: var(--tvs-muted); }
.tvs-swatch > span { position: absolute; inset: 0; }
.tvs-footbtn { height: ${S.controlHeight}px; padding: 0 18px; border-radius: ${S.controlRadius}px; font: inherit; font-weight: 500; cursor: pointer; border: 1px solid var(--tvs-input-border);
    background: transparent; color: var(--tvs-text); }
.tvs-footbtn:hover { background: var(--tvs-hover); }
.tvs-footbtn.tvs-primary { background: var(--tvs-accent); border-color: var(--tvs-accent); color: var(--tvs-accent-text); }
.tvs-footbtn.tvs-primary:hover { background: var(--tvs-accent-hover); border-color: var(--tvs-accent-hover); }
.tvs-menu { position: absolute; bottom: calc(100% + 4px); left: 0; min-width: 200px; background: var(--tvs-bg); border: 1px solid var(--tvs-border);
    border-radius: 6px; box-shadow: var(--shadow); padding: 4px; z-index: 5; }
.tvs-menu button { display: block; width: 100%; text-align: left; background: none; border: none; color: var(--tvs-text); font: inherit; padding: 8px 10px; border-radius: 4px; cursor: pointer; }
.tvs-menu button:hover { background: var(--tvs-hover); }
.tvs-body::-webkit-scrollbar { width: 8px; }
.tvs-body::-webkit-scrollbar-thumb { background: var(--tvs-input-border); border-radius: 4px; }
.tvs-iv-row { display: flex; align-items: center; gap: 10px; min-height: ${S.controlHeight}px; margin-bottom: 8px; }
.tvs-iv-row .tvs-check { width: 120px; }
.tvs-iv-sep { color: var(--tvs-muted); }
.tvs-iv-row .tvs-numwrap { width: 80px; }
.tvs-disabled { opacity: .45; pointer-events: none; }
`;

export function ensureSettingsStyles(): void {
    if (typeof document === 'undefined') return;
    if (document.getElementById(STYLE_ID)) return;
    const el = document.createElement('style');
    el.id = STYLE_ID;
    el.textContent = TVS_CSS;
    document.head.appendChild(el);
}
