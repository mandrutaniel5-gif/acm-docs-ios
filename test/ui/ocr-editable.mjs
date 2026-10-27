// "Make text editable" on a scanned page: renders the page before and after, and lists what was written.
//   node test/ui/ocr-editable.mjs <scan.pdf> [--out dir]
import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../app');
const ai = process.argv.indexOf('--out');
const OUT = path.resolve(ai > 0 ? process.argv[ai + 1] : path.join(HERE, 'out-ocr'));
const PDF = path.resolve(process.argv[2]);
fs.mkdirSync(OUT, { recursive: true });
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
const MIME = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.wasm': 'application/wasm', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.json': 'application/json', '.gz': 'application/gzip' };
const server = http.createServer((q, r) => {
  const p = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  if (!p.startsWith(ROOT)) { r.writeHead(403); return r.end(); }
  fs.readFile(p, (e, b) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); r.end(b); });
}).listen(0);
const bridge = fs.readFileSync(path.join(HERE, 'mock-bridge.js'), 'utf8');
const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });
const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 }, bypassCSP: true });
const pg = await ctx.newPage();
const errs = []; pg.on('pageerror', (e) => errs.push(String(e.message)));
pg.on('console', (m) => { if (m.type() === 'error' && !/firestore|TUNNEL/i.test(m.text())) errs.push(m.text()); });
const FONTS = { 'liberation sans': 'LiberationSans-Regular.ttf', 'liberation sans bold': 'LiberationSans-Bold.ttf', 'liberation sans italic': 'LiberationSans-Italic.ttf', 'liberation sans bold italic': 'LiberationSans-BoldItalic.ttf' };
const fontFiles = {}, fontList = [];
for (const [name, f] of Object.entries(FONTS)) { const p = '/usr/share/fonts/truetype/liberation/' + f; if (fs.existsSync(p)) { fontFiles['/fonts/' + f] = fs.readFileSync(p).toString('base64'); fontList.push({ name, path: '/fonts/' + f }); } }
await pg.addInitScript(({ pdf, fontFiles, fontList }) => {
  window.__ACM_TEST = { platform: 'ios', files: { '/docs/scan.pdf': pdf, ...fontFiles }, fonts: fontList };
  try { localStorage.setItem('acm.lang', 'ro'); localStorage.setItem('acm.lang.chosen', '1'); localStorage.setItem('acm.account.later', '1'); } catch (e) {}
}, { pdf: fs.readFileSync(PDF).toString('base64'), fontFiles, fontList });
await pg.addInitScript(bridge);
await pg.goto(`http://127.0.0.1:${server.address().port}/index.html`);
await pg.waitForTimeout(2500);
await pg.evaluate(() => { App.openPath('/docs/scan.pdf'); });
await pg.waitForFunction(() => typeof Editor !== 'undefined' && Editor.doc && Editor.sizes && Editor.sizes.length, null, { timeout: 30000 });
await pg.waitForTimeout(1500);
const render = async (name) => {
  const b64 = await pg.evaluate(() => {
    const { w: wPt, h: hPt } = Editor.sizes[0]; const s = 1400 / wPt;
    const r = Editor.doc.render(0, Math.round(wPt * s), Math.round(hPt * s));
    const c = document.createElement('canvas'); c.width = r.width; c.height = r.height;
    c.getContext('2d').putImageData(new ImageData(r.data, r.width, r.height), 0, 0);
    return c.toDataURL('image/png').split(',')[1];
  });
  fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(b64, 'base64'));
};
await render('before');
const t0 = Date.now();
await pg.waitForFunction(() => ImageText.state(0) === 'done', null, { timeout: 300000 });
console.log('read in', ((Date.now() - t0) / 1000).toFixed(1), 's');
await render('after-read');
const items = await pg.evaluate(() => Editor.items(0).filter((i) => i.scan).map((i) => i.text));
fs.writeFileSync(path.join(OUT, 'lines.txt'), items.join('\n'));
console.log('scan lines', items.length);
const same = await pg.evaluate(() => true);
// edit one line, as a person does: double-click, change the text, click outside
const target = process.env.EDIT_FROM || 'Motiv';
const ok = await pg.evaluate(({ target, to }) => {
  const it = Editor.items(0).find((i) => i.scan && i.text.includes(target));
  if (!it) return 'no line with ' + target;
  Pages.beginEdit(it);
  const box = document.querySelector('.text-edit');
  if (!box) return 'no editor';
  box.textContent = it.text.replace(target, to);
  box.dispatchEvent(new Event('input'));
  window.__editItem = it;
  return 'open';
}, { target, to: process.env.EDIT_TO || 'Motivul' });
await pg.waitForTimeout(400);
await pg.evaluate(() => { const b = document.querySelector('.text-edit'); b.scrollIntoView({ block: 'center' }); });
await pg.waitForTimeout(400);
await pg.screenshot({ path: path.join(OUT, 'editing.png') });
const ok2 = await pg.evaluate(() => {
  const it = window.__editItem; const box = document.querySelector('.text-edit');
  Pages.closeEditor(true);
  return 'edited: ' + it.text + ' -> ' + box.textContent;
}, { target, to: process.env.EDIT_TO || 'Motivul' });
console.log(ok, ok2);
await pg.waitForTimeout(2500);
await render('after-edit');
const toasts = await pg.evaluate(() => [...document.querySelectorAll('#toasts > *, #modal-root .modal')].map((t) => t.innerText.trim().slice(0, 200)).join(' | '));
console.log('toasts:', toasts);
console.log(errs.length ? 'ERRORS ' + errs.slice(0, 3).join(' | ') : 'no errors');
await browser.close(); server.close();
