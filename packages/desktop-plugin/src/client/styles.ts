/** Minimal outer-document styles; native window chrome remains Host-owned. */
export const DEEPRUNNER_CHROME_STYLES = `
html, body, #root { width: 100%; height: 100%; }
body { margin: 0; overflow: hidden; }
body > #root { box-sizing: border-box; overflow: hidden; }
`
