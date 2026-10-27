// Light mode (no graphics card): the same screens with and without the glass blur, light and dark.
//   node test/ui/lowfx.mjs [--out dir]
import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../app');
const ai = process.argv.indexOf('--out');
const OUT = path.resolve(ai > 0 ? process.argv[ai + 1] : path.join(HERE, 'out-lowfx'));
fs.mkdirSync(OUT, { recursive: true });
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
const MIME = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.wasm': 'application/wasm', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ttf': 'font/ttf' };
const server = http.createServer((q, r) => {
  const p = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  if (!p.startsWith(ROOT)) { r.writeHead(403); return r.end(); }
  fs.readFile(p, (e, b) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); r.end(b); });
}).listen(0);
const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });
const errs = [];
for (const theme of ['light', 'dark']) for (const low of [false, true]) {
  const pg = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  pg.on('pageerror', (e) => errs.push(String(e.message)));
  await pg.addInitScript(({ theme, low }) => { try { localStorage.setItem('acm.lang', 'ro'); localStorage.setItem('acm.lang.chosen', '1'); localStorage.setItem('acm.account.later', '1'); localStorage.setItem('acm.theme', theme); if (low) localStorage.setItem('acm.lowfx', 'slow'); } catch (e) {} }, { theme, low });
  await pg.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  await pg.waitForTimeout(3500);
  await pg.evaluate((t) => { try { Theme.set(t); } catch (e) {} }, theme);
  const has = await pg.evaluate(() => document.documentElement.classList.contains('lowfx'));
  await pg.waitForTimeout(500);
  await pg.screenshot({ path: path.join(OUT, `${theme}-${low ? 'low' : 'normal'}.png`) });
  console.log(theme, low ? 'low' : 'normal', 'lowfx class:', has);
  await pg.close();
}
console.log(errs.length ? 'ERRORS ' + errs.join(' | ') : 'no errors');
await browser.close(); server.close();
