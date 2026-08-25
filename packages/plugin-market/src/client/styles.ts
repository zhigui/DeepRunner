export const DEEPRUNNER_MARKET_STYLES = String.raw`
.deeprunner-market-trigger { flex: none; display: flex; align-items: center; gap: 8px; width: calc(100% + 4px); height: 34px; margin: 4px -2px; padding: 0 10px 0 8px; box-sizing: border-box; border: none; border-radius: 10px; overflow: hidden; color: var(--dsw-alias-label-primary); background: transparent; cursor: pointer; font-family: inherit; font-size: 14px; line-height: 22px; }
.deeprunner-market-trigger:hover { background: var(--dsw-alias-interactive-bg-hover); }
.deeprunner-market-trigger[data-active="true"] { background: var(--dsw-alias-interactive-bg-active, rgba(74,96,238,.14)); }
.deeprunner-market-trigger[data-wide="false"] { width: 36px; height: 36px; margin: 8px 0 10px; justify-content: center; gap: 0; padding: 0; border-radius: 50%; }
.deeprunner-market-trigger svg { width: 16px; height: 16px; flex: none; }
.deeprunner-market-trigger[data-wide="false"] svg { width: 18px; height: 18px; }
.deeprunner-market-trigger span { overflow: hidden; white-space: nowrap; }
.deeprunner-market-page { position: relative; z-index: 1; display: grid; grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr); min-height: 0; height: 100%; overflow: hidden; color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-base); --drm-accent: #4f63ee; --drm-accent-hover: #4054dc; --drm-accent-soft: rgba(79,99,238,.10); --drm-success: #168653; --drm-success-soft: rgba(22,134,83,.10); --drm-warning: #a15c00; --drm-warning-soft: rgba(178,101,0,.10); --drm-danger: #c4434c; --drm-danger-hover: #ae343e; --drm-danger-soft: rgba(196,67,76,.10); --drm-surface: var(--dsw-alias-bg-layer-1, var(--dsw-alias-bg-base)); --drm-raised: var(--dsw-alias-bg-layer-2, var(--dsw-alias-interactive-bg-hover)); --drm-border: var(--dsw-alias-border-subtle, rgba(98,103,123,.22)); --drm-border-strong: var(--dsw-alias-border-default, rgba(98,103,123,.34)); --dsh-scrollbar-thumb: var(--dsw-alias-scrollbar-bg-l2); --dsh-scrollbar-thumb-hover: var(--dsw-alias-scrollbar-hover-l2); }
.deeprunner-market-page[data-details-open="true"] { grid-template-columns: minmax(0, 1fr) minmax(300px, 38%); }
.deeprunner-market-content { min-width: 0; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
.deeprunner-market-header { flex: none; display: flex; align-items: center; gap: 24px; padding: 20px 28px 14px; }
.deeprunner-market-title { min-width: 190px; }
.deeprunner-market-title h1 { margin: 0; font-size: 24px; line-height: 1.15; letter-spacing: -.025em; font-weight: 700; }
.deeprunner-market-title p { margin: 5px 0 0; font-size: 11px; color: var(--dsw-alias-label-secondary, currentColor); opacity: .74; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.deeprunner-market-searchbox { flex: 1; max-width: 560px; margin-left: auto; display: flex; align-items: center; gap: 10px; height: 38px; padding: 0 13px; box-sizing: border-box; border: 1px solid var(--drm-border); border-radius: 10px; background: var(--drm-surface); transition: border-color .16s ease, box-shadow .16s ease; }
.deeprunner-market-searchbox:focus-within { border-color: var(--drm-accent); box-shadow: 0 0 0 3px var(--drm-accent-soft); }
.deeprunner-market-search-icon { display: inline-flex; color: var(--dsw-alias-label-secondary, currentColor); opacity: .72; }
.deeprunner-market-search { flex: 1; min-width: 0; height: 100%; border: none; outline: none; color: inherit; background: transparent; font: inherit; font-size: 13px; }
.deeprunner-market-search::placeholder { color: var(--dsw-alias-label-secondary, currentColor); opacity: .68; }
body[data-deeprunner-market-open="true"] [role="treeitem"][aria-selected="true"] { background: transparent; }
body[data-deeprunner-market-open="true"] [role="treeitem"][aria-selected="true"]:hover { background: var(--dsw-alias-interactive-bg-hover); }
.deeprunner-market-tabs { flex: none; display: flex; align-items: stretch; gap: 10px; padding: 0 28px; border-bottom: 1px solid var(--drm-border); }
.deeprunner-market-tab { position: relative; padding: 10px 12px 12px; border: none; background: transparent; color: var(--dsw-alias-label-secondary, inherit); cursor: pointer; font: inherit; font-size: 13px; }
.deeprunner-market-tab:hover { color: var(--dsw-alias-label-primary); }
.deeprunner-market-tab[aria-current="true"] { color: var(--drm-accent); font-weight: 650; }
.deeprunner-market-tab[aria-current="true"]:after { content: ""; position: absolute; inset: auto 8px -1px 8px; height: 2px; border-radius: 2px 2px 0 0; background: var(--drm-accent); }
.deeprunner-market-main { position: relative; flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr); }
.deeprunner-market-browser { min-height: 0; overflow-y: auto; padding: 20px 18px 24px 28px; }
.deeprunner-market-page > .deeprunner-market-detail { min-width: 0; border-left: 1px solid var(--drm-border); }
.deeprunner-market-source-warning { margin: 0 0 14px; padding: 10px 12px; border: 1px solid rgba(178,101,0,.18); border-radius: 9px; color: var(--drm-warning); background: var(--drm-warning-soft); font-size: 11px; line-height: 1.5; overflow-wrap: anywhere; }
.deeprunner-market-filterbar { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 18px; }
.deeprunner-market-filters { display: inline-flex; flex-wrap: wrap; gap: 2px; padding: 3px; border: 1px solid var(--drm-border); border-radius: 10px; background: var(--drm-surface); }
.deeprunner-market-filter-actions { flex: none; display: flex; align-items: center; gap: 7px; }
.deeprunner-market-sideload { flex: none; min-height: 36px; padding: 0 12px; display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--drm-border); border-radius: 9px; color: var(--dsw-alias-label-primary); background: var(--drm-surface); cursor: pointer; font: inherit; font-size: 11px; font-weight: 600; }
.deeprunner-market-sideload:hover:not(:disabled) { border-color: rgba(79,99,238,.4); color: var(--drm-accent); background: var(--drm-accent-soft); }
.deeprunner-market-sideload:disabled { cursor: not-allowed; opacity: .5; }
.deeprunner-market-sideload > span { color: var(--drm-accent); font-size: 17px; line-height: 1; }
.deeprunner-market-refresh { flex: none; width: 36px; height: 36px; padding: 0; display: inline-flex; align-items: center; justify-content: center; border: 1px solid var(--drm-border); border-radius: 9px; color: var(--dsw-alias-label-secondary, inherit); background: var(--drm-surface); cursor: pointer; }
.deeprunner-market-refresh:hover:not(:disabled) { border-color: rgba(79,99,238,.4); color: var(--drm-accent); background: var(--drm-accent-soft); }
.deeprunner-market-refresh:disabled { cursor: default; opacity: .5; }
.deeprunner-market-refresh[data-loading="true"] svg { animation: deeprunner-market-spin .72s linear infinite; }
.deeprunner-market-chip { height: 28px; padding: 0 13px; border: 1px solid transparent; border-radius: 7px; color: var(--dsw-alias-label-secondary, inherit); background: transparent; cursor: pointer; font: inherit; font-size: 12px; }
.deeprunner-market-chip:hover { color: var(--dsw-alias-label-primary); background: var(--dsw-alias-interactive-bg-hover); }
.deeprunner-market-chip[aria-pressed="true"] { border-color: rgba(79,99,238,.28); color: var(--drm-accent); background: var(--drm-accent-soft); font-weight: 650; }
.deeprunner-market-list { display: flex; flex-direction: column; overflow: hidden; border: 1px solid var(--drm-border); border-radius: 13px; background: var(--drm-surface); }
.deeprunner-market-row { position: relative; display: flex; align-items: center; gap: 13px; min-height: 76px; padding: 12px 14px; box-sizing: border-box; color: inherit; cursor: pointer; transition: background .14s ease, box-shadow .14s ease; }
.deeprunner-market-row + .deeprunner-market-row { border-top: 1px solid var(--drm-border); }
.deeprunner-market-row:hover { background: var(--dsw-alias-interactive-bg-hover); }
.deeprunner-market-row[data-selected="true"] { z-index: 1; background: var(--drm-accent-soft); box-shadow: inset 3px 0 0 var(--drm-accent); }
.deeprunner-market-icon { flex: none; width: 44px; height: 44px; border-radius: 11px; display: grid; place-items: center; color: #fff; background: var(--drm-accent); box-shadow: 0 5px 13px rgba(32,48,144,.18); font-weight: 700; font-size: 17px; }
.deeprunner-market-icon.large { width: 64px; height: 64px; border-radius: 16px; font-size: 23px; }
.deeprunner-market-row-body { flex: 1; min-width: 0; }
.deeprunner-market-row-head { display: flex; align-items: center; gap: 6px; }
.deeprunner-market-row-head h2 { margin: 0; font-size: 14px; line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 650; }
.deeprunner-market-verified { flex: none; display: inline-flex; color: var(--drm-accent); }
.deeprunner-market-row-publisher { margin-top: 2px; font-size: 11px; color: var(--dsw-alias-label-secondary, inherit); opacity: .78; }
.deeprunner-market-row-summary { margin: 4px 0 0; font-size: 12px; line-height: 1.42; color: var(--dsw-alias-label-secondary, inherit); opacity: .88; display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden; }
.deeprunner-market-row-side { position: relative; z-index: 2; flex: none; display: flex; align-items: center; min-width: 88px; justify-content: flex-end; }
.deeprunner-market-mini { min-height: 29px; padding: 0 13px; display: inline-flex; align-items: center; justify-content: center; gap: 7px; border: 1px solid rgba(79,99,238,.3); border-radius: 8px; color: var(--drm-accent); background: var(--drm-surface); cursor: pointer; font: inherit; font-size: 12px; font-weight: 650; }
.deeprunner-market-mini:hover:not(:disabled) { color: #fff; border-color: var(--drm-accent); background: var(--drm-accent); }
.deeprunner-market-mini.secondary { color: var(--drm-accent); background: var(--drm-accent-soft); }
.deeprunner-market-mini:disabled { cursor: default; opacity: .62; }
.deeprunner-market-mini.is-loading { min-width: 88px; color: var(--dsw-alias-label-secondary, inherit); border-color: var(--drm-border); }
.deeprunner-market-row-status { font-size: 11px; text-align: right; white-space: nowrap; color: var(--drm-success); font-weight: 550; }
.deeprunner-market-row-status[data-tone="warn"] { color: var(--drm-warning); }
.deeprunner-market-count { padding: 14px 3px 2px; font-size: 11px; color: var(--dsw-alias-label-secondary, inherit); opacity: .72; text-align: center; }
.deeprunner-market-empty { min-height: 220px; display: grid; place-items: center; text-align: center; color: var(--dsw-alias-label-secondary, inherit); font-size: 13px; }
.deeprunner-market-detail { position: relative; min-height: 0; height: 100%; overflow-y: auto; padding: 28px 28px 36px; box-sizing: border-box; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); --drm-accent: #4f63ee; --drm-accent-hover: #4054dc; --drm-accent-soft: rgba(79,99,238,.10); --drm-success: #168653; --drm-success-soft: rgba(22,134,83,.10); --drm-warning: #a15c00; --drm-warning-soft: rgba(178,101,0,.10); --drm-danger: #c4434c; --drm-danger-hover: #ae343e; --drm-danger-soft: rgba(196,67,76,.10); --drm-surface: var(--dsw-alias-bg-layer-1, var(--dsw-alias-bg-base)); --drm-raised: var(--dsw-alias-bg-layer-2, var(--dsw-alias-interactive-bg-hover)); --drm-border: var(--dsw-alias-border-subtle, rgba(98,103,123,.22)); --drm-border-strong: var(--dsw-alias-border-default, rgba(98,103,123,.34)); }
.deeprunner-market-detail-close { position: absolute; top: 18px; right: 18px; z-index: 1; width: 30px; height: 30px; padding: 0; border: none; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; color: inherit; background: transparent; cursor: pointer; }
.deeprunner-market-detail-close:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
.deeprunner-market-detail-close:disabled { cursor: not-allowed; opacity: .42; }
.deeprunner-market-detail-empty { min-height: 220px; display: grid; place-items: center; text-align: center; color: var(--dsw-alias-label-secondary, inherit); font-size: 13px; padding: 0 18px; }
.deeprunner-market-detail-top { display: flex; gap: 16px; align-items: flex-start; padding-right: 38px; }
.deeprunner-market-detail h2 { margin: 2px 0 5px; font-size: 22px; line-height: 1.24; letter-spacing: -.02em; }
.deeprunner-market-publisher { font-size: 12px; color: var(--dsw-alias-label-secondary, inherit); opacity: .82; }
.deeprunner-market-detail-badges { margin-top: 8px; display: flex; flex-wrap: wrap; gap: 6px; }
.deeprunner-market-badge { display: inline-flex; align-items: center; min-height: 22px; padding: 0 8px; border-radius: 999px; font-size: 10px; line-height: 1; color: var(--drm-accent); background: var(--drm-accent-soft); }
.deeprunner-market-badge[data-trust="community"] { color: var(--drm-warning); background: var(--drm-warning-soft); }
.deeprunner-market-badge[data-trust="sideloaded"] { color: var(--drm-danger); background: var(--drm-danger-soft); }
.deeprunner-market-badge[data-trust="builtin"] { color: var(--drm-success); background: var(--drm-success-soft); }
.deeprunner-market-actions { margin: 20px 0 18px; padding-bottom: 18px; border-bottom: 1px solid var(--drm-border); }
.deeprunner-market-actions .deeprunner-market-actionbar { gap: 7px; }
.deeprunner-market-actions .deeprunner-market-action { min-height: 30px; padding: 0 11px; border-radius: 8px; font-size: 11px; }
.deeprunner-market-actionbar { display: flex; align-items: center; gap: 9px; flex-wrap: wrap; }
.deeprunner-market-action { min-height: 36px; padding: 0 16px; display: inline-flex; align-items: center; justify-content: center; gap: 8px; box-sizing: border-box; border: 1px solid var(--drm-accent); border-radius: 9px; color: #fff; background: var(--drm-accent); cursor: pointer; font: inherit; font-weight: 650; font-size: 12px; text-decoration: none; transition: background .14s ease, border-color .14s ease, transform .14s ease; }
.deeprunner-market-action:hover:not(:disabled) { border-color: var(--drm-accent-hover); background: var(--drm-accent-hover); transform: translateY(-1px); }
.deeprunner-market-action.secondary { color: var(--drm-accent); border-color: rgba(79,99,238,.28); background: var(--drm-accent-soft); }
.deeprunner-market-action.secondary:hover:not(:disabled) { color: #fff; }
.deeprunner-market-action.quiet { color: var(--dsw-alias-label-primary); border-color: var(--drm-border); background: var(--drm-surface); }
.deeprunner-market-action.quiet:hover:not(:disabled) { border-color: var(--drm-border-strong); background: var(--dsw-alias-interactive-bg-hover); }
.deeprunner-market-action.danger { color: #fff; border-color: var(--drm-danger); background: var(--drm-danger); }
.deeprunner-market-action.danger:hover:not(:disabled) { border-color: var(--drm-danger-hover); background: var(--drm-danger-hover); }
.deeprunner-market-action:disabled { cursor: not-allowed; opacity: .52; transform: none; }
.deeprunner-market-action.restart { flex: none; min-height: 30px; padding: 0 12px; }
.deeprunner-market-loading-ring { width: 12px; height: 12px; flex: none; box-sizing: border-box; border: 1.5px solid currentColor; border-right-color: transparent; border-radius: 50%; animation: deeprunner-market-spin .72s linear infinite; }
@keyframes deeprunner-market-spin { to { transform: rotate(360deg); } }
.deeprunner-market-restart-callout { margin-top: 12px; padding: 10px 11px; display: flex; align-items: center; justify-content: space-between; gap: 12px; border: 1px solid rgba(22,134,83,.18); border-radius: 9px; color: var(--drm-success); background: var(--drm-success-soft); font-size: 11px; line-height: 1.45; }
.deeprunner-market-description { margin: 18px 0; font-size: 13px; line-height: 1.68; color: var(--dsw-alias-label-secondary, inherit); }
.deeprunner-market-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 0; margin: 20px 0; padding: 4px 0; border-top: 1px solid var(--drm-border); border-bottom: 1px solid var(--drm-border); }
.deeprunner-market-meta div { min-width: 0; padding: 12px 10px; }
.deeprunner-market-meta dt { margin-bottom: 5px; font-size: 9px; text-transform: uppercase; letter-spacing: .09em; color: var(--dsw-alias-label-secondary, inherit); opacity: .72; }
.deeprunner-market-meta dd { margin: 0; font-size: 12px; overflow-wrap: anywhere; }
.deeprunner-market-capabilities { display: flex; flex-wrap: wrap; gap: 6px; margin: 14px 0 20px; }
.deeprunner-market-warning { margin: 13px 0; padding: 11px 12px; border: 1px solid rgba(178,101,0,.16); border-radius: 9px; color: var(--drm-warning); background: var(--drm-warning-soft); font-size: 11px; line-height: 1.5; }
.deeprunner-market-error { margin: 12px 0; color: var(--drm-danger); font-size: 12px; line-height: 1.5; overflow-wrap: anywhere; }
.deeprunner-market-error-card { margin: 12px 0 18px; padding: 11px 12px; display: flex; flex-direction: column; gap: 4px; border: 1px solid rgba(196,67,76,.2); border-radius: 9px; color: var(--drm-danger); background: var(--drm-danger-soft); font-size: 11px; line-height: 1.5; }
.deeprunner-market-operation { margin-top: 18px; border: 1px solid var(--drm-border); border-radius: 10px; background: var(--drm-surface); }
.deeprunner-market-operation summary { min-height: 40px; padding: 0 12px; display: flex; align-items: center; gap: 8px; cursor: pointer; list-style: none; }
.deeprunner-market-operation summary::-webkit-details-marker { display: none; }
.deeprunner-market-operation summary strong { font-size: 11px; }
.deeprunner-market-operation-hint { margin-left: auto; color: var(--dsw-alias-label-secondary, inherit); font-size: 10px; opacity: .74; }
.deeprunner-market-operation[open] .deeprunner-market-operation-hint { font-size: 0; }
.deeprunner-market-operation[open] .deeprunner-market-operation-hint:after { content: "Hide details"; font-size: 10px; }
.deeprunner-market-operation-dot { width: 7px; height: 7px; flex: none; border-radius: 50%; background: var(--drm-warning); }
.deeprunner-market-operation-dot[data-state="running"] { background: var(--drm-accent); }
.deeprunner-market-operation-dot[data-state="succeeded"] { background: var(--drm-success); }
.deeprunner-market-operation-dot[data-state="failed"] { background: var(--drm-danger); }
.deeprunner-market-operation-body { padding: 0 12px 12px; border-top: 1px solid var(--drm-border); }
.deeprunner-market-operation-body .deeprunner-market-actionbar { padding-top: 11px; }
.deeprunner-market-log { max-height: 160px; overflow: auto; margin: 10px 0 0; padding: 10px; white-space: pre-wrap; overflow-wrap: anywhere; border-radius: 8px; color: var(--dsw-alias-label-secondary, inherit); background: var(--drm-raised); font: 10px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace; }
.deeprunner-market-no-output { margin: 11px 0 0; color: var(--dsw-alias-label-secondary, inherit); font-size: 11px; }
.deeprunner-market-dialog-backdrop { position: fixed; inset: 0; z-index: 2147483000; display: grid; place-items: center; padding: 24px; box-sizing: border-box; background: rgba(16,20,32,.36); backdrop-filter: blur(3px); }
.deeprunner-market-dialog { width: min(390px, 100%); padding: 22px; box-sizing: border-box; border: 1px solid var(--drm-border); border-radius: 14px; color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-base); box-shadow: 0 18px 52px rgba(16,20,32,.24); }
.deeprunner-market-dialog h2 { margin: 5px 0 9px; font-size: 18px; line-height: 1.3; letter-spacing: -.015em; }
.deeprunner-market-dialog p { margin: 0; color: var(--dsw-alias-label-secondary, inherit); font-size: 12px; line-height: 1.55; overflow-wrap: anywhere; }
.deeprunner-market-dialog-eyebrow { color: var(--drm-accent); font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
.deeprunner-market-dialog-success { color: var(--drm-success); font-size: 11px; font-weight: 650; }
.deeprunner-market-dialog-warning { margin-top: 14px; padding: 10px; border-radius: 8px; color: var(--drm-warning); background: var(--drm-warning-soft); font-size: 11px; line-height: 1.5; }
.deeprunner-market-dialog-actions { margin-top: 20px; display: flex; justify-content: flex-end; gap: 9px; }
.deeprunner-market-manual-dialog { width: min(520px, 100%); }
.deeprunner-market-manual-form { margin-top: 18px; }
.deeprunner-market-manual-form label { display: block; margin-bottom: 7px; color: var(--dsw-alias-label-secondary, inherit); font-size: 10px; font-weight: 650; }
.deeprunner-market-manual-form input { width: 100%; height: 38px; padding: 0 11px; box-sizing: border-box; border: 1px solid var(--drm-border); border-radius: 9px; outline: none; color: inherit; background: var(--drm-surface); font: inherit; font-size: 12px; }
.deeprunner-market-manual-form input:focus { border-color: var(--drm-accent); box-shadow: 0 0 0 3px var(--drm-accent-soft); }
.deeprunner-market-manual-help { margin-top: 7px; color: var(--dsw-alias-label-secondary, inherit); font-size: 10px; line-height: 1.45; opacity: .76; }
.deeprunner-market-manual-loading { min-height: 100px; display: flex; align-items: center; justify-content: center; gap: 9px; color: var(--dsw-alias-label-secondary, inherit); font-size: 12px; }
.deeprunner-market-manual-identity { display: flex; align-items: center; gap: 12px; margin: 16px 0 12px; }
.deeprunner-market-manual-identity strong, .deeprunner-market-manual-identity span { display: block; overflow-wrap: anywhere; }
.deeprunner-market-manual-identity strong { font-size: 13px; }
.deeprunner-market-manual-identity span { margin-top: 4px; color: var(--dsw-alias-label-secondary, inherit); font-size: 11px; }
.deeprunner-market-manual-description { margin: 10px 0; color: var(--dsw-alias-label-secondary, inherit); font-size: 12px; line-height: 1.55; }
.deeprunner-market-manual-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 18px; margin: 16px 0; }
.deeprunner-market-manual-meta dt { margin-bottom: 3px; color: var(--dsw-alias-label-secondary, inherit); font-size: 9px; letter-spacing: .07em; text-transform: uppercase; }
.deeprunner-market-manual-meta dd { margin: 0; font-size: 11px; overflow-wrap: anywhere; }
.deeprunner-market-update-result { margin: 12px 0; padding: 10px 11px; border-radius: 8px; color: var(--drm-accent); background: var(--drm-accent-soft); font-size: 11px; font-weight: 650; }
.deeprunner-market-update-result.is-current { color: var(--drm-success); background: var(--drm-success-soft); }
@media (max-width: 900px) { .deeprunner-market-title { min-width: 120px; } .deeprunner-market-title p { display: none; } }
@media (max-width: 720px) { .deeprunner-market-header { padding-inline: 18px; } .deeprunner-market-tabs { padding-inline: 18px; } .deeprunner-market-browser { padding-inline: 18px; } .deeprunner-market-filterbar { align-items: stretch; flex-direction: column; } .deeprunner-market-filter-actions { align-self: flex-start; } }
@media (prefers-reduced-motion: reduce) { .deeprunner-market-page * { transition: none !important; } .deeprunner-market-loading-ring { animation-duration: 1.5s; } }
`
