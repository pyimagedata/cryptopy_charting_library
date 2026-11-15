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
.tvs-btn-icon { background: none; border: none; cursor: pointer; padding: 4px; display: flex; border-radius: 8px; color: var(--tvs-muted); }
.tvs-btn-icon:hover { background: var(--tvs-hover); color: var(--tvs-text); }
.tvs-tab { background: none; border: none; padding: 10px 0 11px; margin-right: 24px; font: inherit; font-size: ${S.fontSize}px; font-weight: 600; cursor: pointer;
    position: relative; color: var(--tvs-muted); border-bottom: 2px solid transparent; margin-bottom: -1px; }
.tvs-tab:hover { color: var(--tvs-text); }
.tvs-tab.tvs-active { color: var(--tvs-text); border-bottom-color: var(--tvs-text); }
.tvs-group { font-size: ${S.smallFontSize}px; font-weight: 600; color: var(--tvs-muted); text-transform: uppercase; letter-spacing: .4px; margin: 20px 0 10px; }
.tvs-group:first-child { margin-top: 0; }
.tvs-group.tvs-raw { text-transform: none; letter-spacing: 0; }
.tvs-inline { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 16px; margin-bottom: ${S.rowGap - 4}px; }
.tvs-inline > .tvs-row { margin-bottom: 0; flex: 1 1 auto; min-width: 0; display: flex; gap: 8px; }
.tvs-inline .tvs-numwrap { width: 96px; }
.tvs-inline .tvs-select { width: auto; min-width: 110px; }
.tvs-inline .tvs-textinput { width: 120px; }
.tvs-inline > .tvs-row > .tvs-label { flex: 0 1 auto; }
.tvs-info { display: inline-flex; vertical-align: middle; margin-left: 6px; color: var(--tvs-muted); cursor: help; outline: none; }
.tvs-info:hover, .tvs-info:focus { color: var(--tvs-text); }
.tvs-tip { position: fixed; z-index: ${S.zIndex + 5}; max-width: 260px; padding: 7px 9px; border-radius: 8px; background: var(--tvs-bg); color: var(--tvs-text);
    border: 1px solid var(--tvs-border); box-shadow: var(--shadow); font-size: ${S.smallFontSize}px; line-height: 1.4; white-space: pre-wrap; pointer-events: none; }
.tvs-row { display: grid; grid-template-columns: minmax(0, 1fr) ${S.controlColumn}px; align-items: center; gap: 16px; min-height: ${S.controlHeight}px; margin-bottom: ${S.rowGap - 4}px; }
.tvs-row > label, .tvs-row .tvs-label { color: var(--tvs-text); font-size: ${S.fontSize}px; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.tvs-row.tvs-row-wide { grid-template-columns: minmax(0, 1fr); }
.tvs-row.tvs-row-wide > .tvs-label { margin-bottom: 6px; }
.tvs-row.tvs-row-style { grid-template-columns: minmax(0, 1fr) auto; gap: 12px; }
.tvs-row-style .tvs-check { min-width: 0; }
.tvs-row-style .tvs-check > span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tvs-row-style .tvs-controls { justify-content: flex-end; }
.tvs-select.tvs-plotstyle { width: 118px; padding: 0 8px; }
.tvs-controls { display: flex; align-items: center; gap: 8px; min-width: 0; }
.tvs-input { height: ${S.controlHeight}px; border: 1px solid var(--tvs-input-border); border-radius: ${S.controlRadius}px; background: var(--tvs-input-bg);
    color: var(--tvs-text); font: inherit; padding: 0 12px; font-size: ${S.fontSize}px; outline: none; }
.tvs-input:hover { border-color: var(--tvs-muted); }
.tvs-input:focus, .tvs-numwrap:focus-within, .tvs-textinput:focus { border-color: var(--tvs-focus) !important; box-shadow: 0 0 0 3px color-mix(in srgb, var(--tvs-focus) 22%, transparent); }
.tvs-numwrap { display: flex; align-items: stretch; height: ${S.controlHeight}px; width: 100%; border: 1px solid var(--tvs-input-border); border-radius: ${S.controlRadius}px;
    background: var(--tvs-input-bg); overflow: hidden; }
.tvs-textinput { width: 100%; box-sizing: border-box; height: ${S.controlHeight}px; padding: 0 12px; border: 1px solid var(--tvs-input-border); border-radius: ${S.controlRadius}px; background: transparent; color: var(--tvs-text); font: inherit; font-size: ${S.fontSize}px; outline: none; }
.tvs-textarea { width: 100%; box-sizing: border-box; height: auto; min-height: 56px; padding: 6px 10px; resize: vertical; font-family: inherit; }
.tvs-datetime { width: 100%; min-width: 0; box-sizing: border-box; }
.tvs-tzlabel { color: var(--tvs-muted); font-size: ${S.smallFontSize}px; max-width: 90px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tvs-session { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; min-width: 0; }
.tvs-session .tvs-controls { gap: 6px; }
.tvs-time { flex: 1 1 0; min-width: 0; width: auto; padding: 0 8px 0 10px; box-sizing: border-box; }
.tvs-time::-webkit-calendar-picker-indicator, .tvs-datetime::-webkit-calendar-picker-indicator { opacity: .75; cursor: pointer; }
.tvs-time::-webkit-calendar-picker-indicator:hover, .tvs-datetime::-webkit-calendar-picker-indicator:hover { opacity: 1; }
select.tvs-input, select.tvs-input option { background-color: var(--tvs-input-bg); color: var(--tvs-text); }
.tvs-session-dash { color: var(--tvs-muted); }
.tvs-days-toggle { display: inline-flex; align-items: center; gap: 4px; background: none; border: none; padding: 0; margin: 0; cursor: pointer; font: inherit;
    font-size: ${S.smallFontSize}px; color: var(--tvs-muted); border-radius: 4px; }
.tvs-days-toggle:hover { color: var(--tvs-text); }
.tvs-days-toggle:focus-visible { outline: 2px solid var(--tvs-focus); outline-offset: 2px; }
.tvs-days-toggle svg { transition: transform .12s; }
.tvs-days-toggle[aria-expanded="true"] svg { transform: rotate(180deg); }
.tvs-days { display: none; gap: 4px; }
.tvs-days.tvs-open { display: flex; }
.tvs-day { width: 24px; height: 24px; padding: 0; border: 1px solid var(--tvs-input-border); border-radius: 6px; background: transparent; color: var(--tvs-muted); font: inherit; font-size: 11px; cursor: pointer; }
.tvs-day:hover { border-color: var(--tvs-muted); color: var(--tvs-text); }
.tvs-day:focus-visible { outline: 2px solid var(--tvs-focus); outline-offset: 1px; }
.tvs-day.on { background: var(--tvs-hover); border-color: var(--tvs-muted); color: var(--tvs-text); font-weight: 600; }
.tvs-numwrap:hover { border-color: var(--tvs-muted); }
.tvs-numwrap input { font-variant-numeric: tabular-nums; flex: 1 1 auto; min-width: 0; width: 100%; border: none; outline: none; background: transparent; color: var(--tvs-text); font: inherit; padding: 0 0 0 10px;
    -moz-appearance: textfield; }
.tvs-numwrap input::-webkit-outer-spin-button, .tvs-numwrap input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.tvs-steps { display: flex; flex-direction: column; width: 22px; border-left: 1px solid var(--tvs-input-border); }
.tvs-steps button { flex: 1; border: none; background: transparent; color: var(--tvs-muted); cursor: pointer; padding: 0; display: flex; align-items: center; justify-content: center; }
.tvs-steps button:hover { background: var(--tvs-hover); color: var(--tvs-text); }
.tvs-select { width: 100%; min-width: 0; padding-right: 28px; appearance: none; -webkit-appearance: none; cursor: pointer;
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 10 10'><path d='M2 3.5 5 6.5 8 3.5' stroke='%23787B86' stroke-width='1.4' fill='none'/></svg>");
    background-repeat: no-repeat; background-position: right 9px center; }
.tvs-select option { background: var(--tvs-bg); color: var(--tvs-text); }
.tvs-check { color: var(--tvs-text); font-size: ${S.fontSize}px; display: inline-flex; align-items: center; gap: 10px; cursor: pointer; user-select: none; }
.tvs-check input { position: absolute; opacity: 0; width: 0; height: 0; }
.tvs-box { width: ${S.checkbox}px; height: ${S.checkbox}px; flex: 0 0 ${S.checkbox}px; border: 1px solid var(--tvs-checkbox-border); border-radius: 5px; display: flex; align-items: center; justify-content: center; color: var(--tvs-accent-text);
    background: transparent; transition: background .1s, border-color .1s; }
.tvs-box svg { opacity: 0; }
.tvs-check input:checked + .tvs-box { background: var(--tvs-accent); border-color: var(--tvs-accent); }
.tvs-check input:checked + .tvs-box svg { opacity: 1; }
.tvs-check input:focus-visible + .tvs-box { outline: 2px solid var(--tvs-focus); outline-offset: 1px; }
.tvs-check:hover .tvs-box { border-color: var(--tvs-muted); }
.tvs-check input:checked:hover + .tvs-box { border-color: var(--tvs-accent); }
.tvs-swatch { position: relative; width: ${S.controlHeight - 6}px; height: ${S.controlHeight - 6}px; border-radius: ${S.controlRadius}px; border: 1px solid var(--tvs-input-border); cursor: pointer; padding: 0; overflow: hidden;
    background: conic-gradient(#8a8d96 25%, #c9ccd3 0 50%, #8a8d96 0 75%, #c9ccd3 0) 0 0 / 8px 8px; }
.tvs-swatch:hover { border-color: var(--tvs-muted); }
.tvs-swatch > span { position: absolute; inset: 0; }
.tvs-footbtn { height: ${S.controlHeight}px; padding: 0 20px; border-radius: ${S.controlRadius}px; font: inherit; font-size: ${S.fontSize}px; font-weight: 500; cursor: pointer; border: 1px solid var(--tvs-input-border);
    background: transparent; color: var(--tvs-text); }
.tvs-footbtn:hover { background: var(--tvs-hover); }
.tvs-footbtn.tvs-primary { background: var(--tvs-accent); border-color: var(--tvs-accent); color: var(--tvs-accent-text); }
.tvs-footbtn.tvs-primary:hover { background: var(--tvs-accent-hover); border-color: var(--tvs-accent-hover); }
.tvs-menu { position: absolute; bottom: calc(100% + 4px); left: 0; min-width: 200px; background: var(--tvs-bg); border: 1px solid var(--tvs-border);
    border-radius: 10px; box-shadow: var(--shadow); padding: 4px; z-index: 5; }
.tvs-menu button { display: block; width: 100%; text-align: left; background: none; border: none; color: var(--tvs-text); font: inherit; font-size: ${S.fontSize}px; padding: 8px 10px; border-radius: 6px; cursor: pointer; }
.tvs-menu button:hover { background: var(--tvs-hover); }
.tvs-body::-webkit-scrollbar { width: 8px; }
.tvs-body::-webkit-scrollbar-thumb { background: var(--tvs-input-border); border-radius: 4px; }
.tvs-iv-row { display: flex; align-items: center; gap: 10px; min-height: ${S.controlHeight}px; margin-bottom: 8px; }
.tvs-iv-row .tvs-check { width: 120px; }
.tvs-iv-sep { color: var(--tvs-muted); }
.tvs-iv-row .tvs-numwrap { width: 84px; }
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
