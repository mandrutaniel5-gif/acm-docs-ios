// The invoice screen with its preview, on a laptop and on a phone.  node test/ui/inv-preview.mjs [--out dir]
import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../app');
const ai = process.argv.indexOf('--out');
const OUT = path.resolve(ai > 0 ? process.argv[ai + 1] : path.join(HERE, 'out-invpv'));
fs.mkdirSync(OUT, { recursive: true });
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
const MIME = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.wasm': 'application/wasm', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ttf': 'font/ttf' };
const server = http.createServer((q, r) => {
  const p = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(p, (e, b) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); r.end(b); });
}).listen(0);
const bridge = fs.readFileSync(path.join(HERE, 'mock-bridge.js'), 'utf8');
const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });
for (const [name, vp, phone] of [['laptop', { width: 1536, height: 864 }, false], ['phone', { width: 402, height: 874 }, true]]) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: phone ? 2 : 1.25, isMobile: phone, hasTouch: phone });
  const pg = await ctx.newPage();
  const errs = []; pg.on('pageerror', (e) => errs.push(String(e.message)));
  if (phone) await pg.addInitScript(() => { window.__ACM_TEST = { platform: 'ios', files: {} }; });
  await pg.addInitScript(() => { try { localStorage.setItem('acm.lang', 'ro'); localStorage.setItem('acm.lang.chosen', '1'); localStorage.setItem('acm.account.later', '1'); } catch (e) {} });
  if (phone) await pg.addInitScript(bridge);
  await pg.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  await pg.waitForTimeout(3000);
  await pg.evaluate(() => {
    const u = { uid: 'ME', displayName: 'Ana', email: 'a@b.ro', emailVerified: true, providerData: [{ providerId: 'password' }] };
    Account.current = () => u; Account.needsVerification = () => false; Plan.allow = async () => true;
    Biz.save({ ...Biz.blankProfile('general'), name: 'Atelier Popescu', legal: 'ATELIER POPESCU SRL', cui: 'RO14255667', regcom: 'J05/123/2026', address: 'Str. Republicii nr. 10', city: 'Oradea', county: 'Bihor', vatPayer: true, iban: 'RO49AAAA1B31007593840000', bank: 'Banca Transilvania' });
    Invoice.open();
  });
  await pg.waitForTimeout(1200);
  await pg.evaluate(() => {
    const n = document.querySelector('#inv-form [data-path="client.name"]'); n.value = 'Construct Bihor SRL'; n.dispatchEvent(new Event('input'));
    const q = document.querySelectorAll('#inv-form .quick-add input');
    for (const [d, p] of [['Reparație instalație sanitară', '450'], ['Robinet baterie', '189,90']]) { q[0].value = d; q[2].value = p; document.querySelector('#inv-form .quick-add button').click(); }
  });
  await pg.waitForTimeout(800);
  if (phone) { await pg.evaluate(() => document.getElementById('inv-pv-btn').click()); await pg.waitForTimeout(900); }
  await pg.screenshot({ path: path.join(OUT, `${name}.png`) });
  // zoom in twice with the + button, then back to the whole page
  await pg.evaluate(() => { const b = document.querySelectorAll('#inv-zoom .ib'); b[1].click(); b[1].click(); });
  await pg.waitForTimeout(300);
  await pg.screenshot({ path: path.join(OUT, `${name}-zoom.png`) });
  console.log(name, 'zoom', await pg.evaluate(() => document.getElementById('inv-zoom-val').textContent));
  console.log(name, errs.length ? errs.join(' | ') : 'ok');
  await ctx.close();
}
await browser.close(); server.close();
