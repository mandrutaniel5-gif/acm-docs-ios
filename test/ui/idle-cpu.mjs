// How much work the page does while nobody touches it (home screen, 6 s), as Chromium reports it.
//   node test/ui/idle-cpu.mjs [view]
import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../app');
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
const MIME = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.wasm': 'application/wasm', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ttf': 'font/ttf' };
const server = http.createServer((q, r) => {
  const p = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(p, (e, b) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); r.end(b); });
}).listen(0);
const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });
const view = process.argv[2] || 'home';
const pg = await (await browser.newContext({ viewport: { width: 1536, height: 864 }, deviceScaleFactor: 1.25 })).newPage();
await pg.addInitScript((auth) => { window.__auth = auth; try { localStorage.setItem('acm.lang', 'ro'); localStorage.setItem('acm.lang.chosen', '1'); if (!window.__auth) localStorage.setItem('acm.account.later', '1'); } catch (e) {} }, view === 'auth');
await pg.goto(`http://127.0.0.1:${server.address().port}/index.html`);
await pg.waitForTimeout(4000);
if (view === 'scroll') {
  // scrolling the invoices list with the wheel: work per second of scrolling
} else if (view !== 'home' && view !== 'auth') await pg.evaluate((v) => App.showView(v), view);
await pg.waitForTimeout(1500);
const cdp = await pg.context().newCDPSession(pg);
await cdp.send('Performance.enable');
const get = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
const a = await get();
if (process.env.NOANIM) await pg.addStyleTag({ content: process.env.NOANIM });
await pg.waitForTimeout(500);
// processor time of the whole browser (page, compositor, GPU stand-in) while idle
const { execSync } = await import('node:child_process');
const cpu = () => execSync("ps -eo comm,time,cputimes 2>/dev/null | awk '/headless_shell|chrome/ {s+=$3} END {print s+0}'").toString().trim();
const ticks = () => Number(execSync("for p in $(pgrep -f headless_shell); do awk '{print $14+$15}' /proc/$p/stat 2>/dev/null; done | awk '{s+=$1} END {print s+0}'").toString().trim());
const t0 = ticks();
await pg.waitForTimeout(6000);
const cpuIdle = (ticks() - t0) / 100;
const frames = 0;
const b = await get();
const d = (k) => (b[k] - a[k]);
console.log(JSON.stringify({ view, browserCpuSecondsIn6s: cpuIdle, cpuTaskSeconds: +d('TaskDuration').toFixed(2), layouts: d('LayoutCount'), styleRecalcs: d('RecalcStyleCount'), frames }));
await browser.close(); server.close();
