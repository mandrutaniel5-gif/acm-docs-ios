// Document: the marker colors only what it is asked to; typing next to highlighted text stays plain.
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
const pg = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const errs = []; pg.on('pageerror', (e) => errs.push(String(e.message)));
await pg.addInitScript(() => { try { localStorage.setItem('acm.lang', 'ro'); localStorage.setItem('acm.lang.chosen', '1'); localStorage.setItem('acm.account.later', '1'); } catch (e) {} });
await pg.goto(`http://127.0.0.1:${server.address().port}/index.html`);
await pg.waitForTimeout(3000);
await pg.evaluate(() => Writer.open(null));
await pg.waitForTimeout(800);
await pg.click('#wr-page');
await pg.keyboard.type('Primul cuvant important aici');
// select "important" and highlight it
await pg.evaluate(() => {
  const p = document.getElementById('wr-page');
  const w = document.createTreeWalker(p, NodeFilter.SHOW_TEXT); let t; while ((t = w.nextNode())) { const i = t.data.indexOf('important'); if (i >= 0) { const r = document.createRange(); r.setStart(t, i); r.setEnd(t, i + 9); const s = getSelection(); s.removeAllRanges(); s.addRange(r); break; } }
});
await pg.locator('button.ob.color[title*="Evidențiere"]').first().click();
await pg.waitForTimeout(300);
await pg.locator('.cpop .csw[title="#ffff00"], .cpop .csw').first().click();
await pg.waitForTimeout(300);
const marked = await pg.evaluate(() => [...document.querySelectorAll('#wr-page [style*="background"]')].map((n) => n.textContent).join('|'));
// caret right after the highlighted word, then type
await pg.evaluate(() => {
  const mk = [...document.querySelectorAll('#wr-page [style*="background"]')].find((n) => n.textContent.includes('important'));
  const t = mk.lastChild; const r = document.createRange(); r.setStart(t, t.length); r.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(r);
});
await pg.waitForTimeout(250);
await pg.keyboard.type('XYZ');
const after = await pg.evaluate(() => ({ marked: [...document.querySelectorAll('#wr-page [style*="background"]')].map((n) => n.textContent.replace(/​/g, '')).join('|'), text: document.getElementById('wr-page').innerText.replace(/\u200b/g, ''), on: !!document.querySelector('button[title*="Evidențiere"].on') }));
console.log('highlighted after pick:', JSON.stringify(marked));
console.log('after typing next to it:', JSON.stringify(after));
console.log(after.marked === 'important' && /importantXYZ/.test(after.text) && !after.on ? 'OK: typing stays plain, marker not pressed' : 'PROBLEM');
console.log(errs.length ? 'ERRORS ' + errs.join(' | ') : 'no errors');
await browser.close(); server.close();
