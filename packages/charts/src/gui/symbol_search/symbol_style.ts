/** Theme tokens + stylesheet for the symbol search dialog (dark / light). */

export type SearchTheme = 'dark' | 'light';

const STYLE_ID = 'tv-symbol-search-styles';

const THEME_VARS: Record<SearchTheme, Record<string, string>> = {
    dark: {
        '--ss-backdrop': 'rgba(0, 0, 0, 0.55)',
        '--ss-bg': '#1E222D',
        '--ss-border': '#2A2E39',
        '--ss-input-border': '#434651',
        '--ss-text': '#D1D4DC',
        '--ss-muted': '#868993',
        '--ss-pill-bg': '#2A2E39',
        '--ss-pill-hover': '#363A45',
        '--ss-inv-bg': '#D1D4DC',
        '--ss-inv-fg': '#131722',
        '--ss-tint-5': 'rgba(209, 212, 220, 0.07)',
        '--ss-tint-10': 'rgba(209, 212, 220, 0.12)',
        '--ss-active-tint': 'rgba(41, 98, 255, 0.18)',
        '--ss-brand': '#5B8CFF',
        '--ss-logo-bg': '#363A45',
        '--ss-menu-bg': '#2A2E39',
        '--ss-shadow': '0 8px 32px rgba(0, 0, 0, 0.6)',
        '--ss-scroll': '#434651',
    },
    light: {
        '--ss-backdrop': 'rgba(19, 23, 34, 0.4)',
        '--ss-bg': '#FFFFFF',
        '--ss-border': '#E0E3EB',
        '--ss-input-border': '#B2B5BE',
        '--ss-text': '#131722',
        '--ss-muted': '#6A6D78',
        '--ss-pill-bg': '#F0F3FA',
        '--ss-pill-hover': '#E0E3EB',
        '--ss-inv-bg': '#131722',
        '--ss-inv-fg': '#FFFFFF',
        '--ss-tint-5': 'rgba(19, 23, 34, 0.05)',
        '--ss-tint-10': 'rgba(19, 23, 34, 0.1)',
        '--ss-active-tint': 'rgba(41, 98, 255, 0.1)',
        '--ss-brand': '#2962FF',
        '--ss-logo-bg': '#E0E3EB',
        '--ss-menu-bg': '#FFFFFF',
        '--ss-shadow': '0 8px 32px rgba(0, 0, 0, 0.2)',
        '--ss-scroll': '#C3C6D0',
    },
};

export function applyThemeVars(el: HTMLElement, theme: SearchTheme): void {
    const vars = THEME_VARS[theme];
    for (const k of Object.keys(vars)) el.style.setProperty(k, vars[k]);
    el.dataset.theme = theme;
}

const CSS = `
.ss-overlay{position:fixed;top:0;left:0;right:0;bottom:0;z-index:10000;display:flex;align-items:center;justify-content:center;background:var(--ss-backdrop);color:var(--ss-text);font-family:-apple-system,BlinkMacSystemFont,'Trebuchet MS',Roboto,Ubuntu,sans-serif;}
.ss-overlay *{box-sizing:border-box;}
.ss-dialog{position:relative;display:flex;flex-direction:column;height:680px;max-height:calc(100vh - 16px);width:100%;min-width:719px;max-width:840px;background:var(--ss-bg);border:1px solid var(--ss-border);border-radius:8px;box-shadow:var(--ss-shadow);overflow:hidden;}
@media (max-width:768px){.ss-dialog{min-width:480px;max-width:640px;height:562px;}}
@media (max-width:519px){.ss-dialog{min-width:380px;max-width:479px;}}
@media (max-width:440px){.ss-dialog{min-width:0;max-width:none;width:100%;height:100%;max-height:none;border-radius:0;border:0;}}
.ss-icon{display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;}
.ss-btn-icon{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border:0;border-radius:6px;background:transparent;color:var(--ss-muted);cursor:pointer;padding:0;flex-shrink:0;}
.ss-btn-icon:hover{background:var(--ss-tint-5);color:var(--ss-text);}
.ss-btn-icon:active{background:var(--ss-tint-10);}
.ss-header{display:flex;align-items:center;gap:8px;height:56px;padding:0 20px;flex-shrink:0;}
.ss-title{flex:1;margin:0;font-size:20px;line-height:28px;font-weight:600;color:var(--ss-text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.ss-back{margin-left:-8px;}
.ss-screen{display:flex;flex-direction:column;flex:1;min-height:0;}
.ss-input-row{padding:16px 20px 4px;flex-shrink:0;}
.ss-input-box{display:flex;align-items:center;height:40px;padding:6px 8px;border:1px solid var(--ss-input-border);border-radius:8px;background:transparent;}
.ss-input-box:focus-within{border-color:var(--ss-brand);box-shadow:0 0 0 1px var(--ss-brand);}
.ss-input-box .ss-icon{color:var(--ss-muted);}
.ss-input{flex:1;min-width:0;height:100%;margin:0 4px;border:0;outline:0;background:transparent;color:var(--ss-text);font:inherit;font-size:16px;line-height:24px;text-transform:uppercase;}
.ss-input.ss-plain{text-transform:none;}
.ss-input::placeholder{color:var(--ss-muted);text-transform:none;}
.ss-input::-webkit-search-cancel-button{display:none;}
.ss-tabs,.ss-filters{position:relative;display:flex;align-items:center;gap:8px;padding:8px 20px;flex-shrink:0;}
.ss-filters{padding:0 20px 8px;}
.ss-tabs{overflow:hidden;}
.ss-tabs.ss-scroll-x,.ss-filters{overflow-x:auto;scrollbar-width:none;}
.ss-tabs.ss-scroll-x::-webkit-scrollbar,.ss-filters::-webkit-scrollbar{display:none;}
.ss-pill{display:inline-flex;align-items:center;gap:6px;flex-shrink:0;height:32px;padding:0 14px;border:1px solid transparent;border-radius:16px;background:var(--ss-pill-bg);color:var(--ss-text);font:inherit;font-size:14px;line-height:20px;font-weight:500;white-space:nowrap;cursor:pointer;}
.ss-pill:hover{background:var(--ss-pill-hover);}
.ss-pill.ss-sm{height:28px;padding:0 10px 0 12px;font-size:13px;}
.ss-pill.is-active,.ss-pill.is-active:hover{background:var(--ss-inv-bg);color:var(--ss-inv-fg);}
.ss-pill .ss-pill-x{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;margin-right:-4px;}
.ss-pill .ss-pill-x:hover{background:rgba(128,128,128,0.3);}
.ss-pill .ss-logo{margin-left:-4px;}
.ss-divider{width:1px;height:20px;background:var(--ss-border);flex-shrink:0;}
.ss-menu{position:absolute;z-index:5;min-width:160px;max-height:320px;overflow-y:auto;padding:6px;border:1px solid var(--ss-border);border-radius:8px;background:var(--ss-menu-bg);box-shadow:var(--ss-shadow);}
.ss-menu-item{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;height:36px;padding:0 10px;border:0;border-radius:6px;background:transparent;color:var(--ss-text);font:inherit;font-size:14px;text-align:left;cursor:pointer;}
.ss-menu-item:hover{background:var(--ss-tint-5);}
.ss-menu-item.is-selected{font-weight:600;}
.ss-feed-wrap{position:relative;display:flex;flex-direction:column;flex:1;min-height:0;margin-top:4px;}
.ss-feed{flex:1;min-height:0;overflow-y:auto;scrollbar-width:thin;scrollbar-color:var(--ss-scroll) transparent;}
.ss-feed::-webkit-scrollbar{width:5px;}
.ss-feed::-webkit-scrollbar-thumb{background:var(--ss-scroll);border-radius:3px;}
.ss-row{position:relative;display:grid;grid-template-columns:auto minmax(64px,1fr) minmax(168px,auto);align-items:center;min-height:56px;padding:8px 20px;cursor:pointer;user-select:none;}
.ss-row::before{content:'';position:absolute;top:0;bottom:0;left:12px;right:12px;border-radius:8px;background:transparent;pointer-events:none;}
.ss-row:hover::before,.ss-row[data-selected="true"]::before{background:var(--ss-tint-5);}
.ss-row:active::before{background:var(--ss-tint-10);}
.ss-row[data-active="true"]::before{background:var(--ss-active-tint);}
.ss-row > *{position:relative;}
.ss-row .ss-logo{margin-right:16px;}
.ss-row-main{min-width:0;display:flex;flex-direction:column;}
.ss-ticker{font-size:16px;line-height:24px;font-weight:500;text-transform:uppercase;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.ss-hl{color:var(--ss-brand);}
.ss-desc{display:flex;align-items:center;gap:8px;min-width:0;font-size:12px;line-height:16px;color:var(--ss-muted);}
.ss-desc-text{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;}
.ss-badge{flex-shrink:0;padding:0 4px;border-radius:4px;background:var(--ss-tint-5);font-size:10px;line-height:14px;letter-spacing:0.3px;text-transform:uppercase;white-space:nowrap;}
.ss-row-right{display:flex;align-items:center;justify-content:flex-end;gap:8px;min-width:0;margin-left:12px;}
.ss-exchange{font-size:14px;line-height:20px;color:var(--ss-muted);text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
@media (max-width:519px){.ss-row{grid-template-columns:auto minmax(64px,1fr) auto;}.ss-exchange{display:none;}}
.ss-logo{position:relative;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;border-radius:50%;overflow:hidden;background:var(--ss-logo-bg);color:var(--ss-text);font-weight:600;line-height:1;text-transform:uppercase;}
.ss-logo img{position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;}
.ss-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:64px 24px;text-align:center;font-size:18px;line-height:26px;color:var(--ss-text);}
.ss-empty-btn{height:36px;padding:0 16px;border:0;border-radius:8px;background:var(--ss-inv-bg);color:var(--ss-inv-fg);font:inherit;font-size:14px;font-weight:600;cursor:pointer;}
.ss-empty-btn:hover{opacity:0.88;}
.ss-loading{position:absolute;top:0;left:0;right:0;bottom:0;z-index:3;display:flex;align-items:center;justify-content:center;background:var(--ss-bg);opacity:0.7;}
.ss-spinner{width:28px;height:28px;border:3px solid var(--ss-tint-10);border-top-color:var(--ss-brand);border-radius:50%;animation:ss-spin 0.8s linear infinite;}
@keyframes ss-spin{to{transform:rotate(360deg);}}
.ss-sentinel{height:1px;}
.ss-src-body{flex:1;min-height:0;overflow-y:auto;padding-bottom:16px;scrollbar-width:thin;scrollbar-color:var(--ss-scroll) transparent;}
.ss-src-body::-webkit-scrollbar{width:5px;}
.ss-src-body::-webkit-scrollbar-thumb{background:var(--ss-scroll);border-radius:3px;}
.ss-src-group{padding:16px 20px 8px;font-size:11px;line-height:16px;font-weight:500;letter-spacing:0.4px;text-transform:uppercase;color:var(--ss-muted);}
.ss-src-grid{display:grid;grid-template-columns:1fr 1fr;gap:4px 8px;padding:0 16px;}
@media (max-width:440px){.ss-src-grid{grid-template-columns:1fr;}}
.ss-src-tile{display:flex;align-items:center;gap:12px;min-width:0;height:46px;padding:0 8px;border:0;border-radius:4px;background:transparent;color:var(--ss-text);font:inherit;text-align:left;cursor:pointer;}
.ss-src-tile:hover{background:var(--ss-tint-5);}
.ss-src-tile:focus-visible{outline:2px solid var(--ss-brand);outline-offset:-2px;}
.ss-src-tile.is-selected,.ss-src-tile.is-selected:hover{background:var(--ss-inv-bg);color:var(--ss-inv-fg);}
.ss-src-text{display:flex;flex-direction:column;min-width:0;}
.ss-src-name{font-size:14px;line-height:18px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.ss-src-desc{font-size:12px;line-height:16px;color:var(--ss-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.ss-src-tile.is-selected .ss-src-desc{color:var(--ss-inv-fg);opacity:0.7;}
.ss-src-tile .ss-globe{color:var(--ss-brand);}
.ss-src-tile.is-selected .ss-globe{color:var(--ss-inv-fg);}
`;

export function ensureStyles(): void {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
}
