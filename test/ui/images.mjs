// Pictures: in a document they move anywhere, resize from the handles, crop (and stay so in the .docx);
// in a PDF and in a presentation they crop.   node test/ui/images.mjs [--out dir] <scan.pdf>
import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../app');
const ai = process.argv.indexOf('--out');
const OUT = path.resolve(ai > 0 ? process.argv[ai + 1] : path.join(HERE, 'out-images'));
const PDF = process.argv.find((a) => a.endsWith('.pdf'));
fs.mkdirSync(OUT, { recursive: true });
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
const MIME = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.wasm': 'application/wasm', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.gz': 'application/gzip' };
const server = http.createServer((q, r) => {
  const p = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(p, (e, b) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); r.end(b); });
}).listen(0);
const bridge = fs.readFileSync(path.join(HERE, 'mock-bridge.js'), 'utf8');
const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });
const pg = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
const errs = []; pg.on('pageerror', (e) => errs.push(String(e.message)));
let failed = 0;
const ok = (c, m) => { console.log(c ? '✓' : '✗', m); if (!c) failed++; };
await pg.addInitScript(({ pdf }) => { window.__ACM_TEST = { platform: 'ios', files: pdf ? { '/docs/scan.pdf': pdf } : {} }; try { localStorage.setItem('acm.lang', 'ro'); localStorage.setItem('acm.lang.chosen', '1'); localStorage.setItem('acm.account.later', '1'); } catch (e) {} }, { pdf: PDF ? fs.readFileSync(PDF).toString('base64') : null });
await pg.addInitScript(bridge);
await pg.goto(`http://127.0.0.1:${server.address().port}/index.html`);
await pg.waitForTimeout(3000);
const picture = () => { const c = document.createElement('canvas'); c.width = 400; c.height = 300; const g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, 400, 300); gr.addColorStop(0, '#ff7a00'); gr.addColorStop(1, '#0057ff'); g.fillStyle = gr; g.fillRect(0, 0, 400, 300); g.fillStyle = '#fff'; g.font = 'bold 60px sans-serif'; g.fillText('ACM', 90, 170); return c.toDataURL('image/png'); };
const cropWithChip = async (chip) => {
  await pg.waitForSelector('.crop-modal', { timeout: 5000 });
  await pg.waitForTimeout(300);
  await pg.locator('.crop-modal .chip', { hasText: chip }).click();
  // pull the left edge in a little more with the mouse
  const h = await pg.locator('.crop-modal .ch.w').boundingBox();
  await pg.mouse.move(h.x + h.width / 2, h.y + h.height / 2); await pg.mouse.down(); await pg.mouse.move(h.x + 40, h.y + h.height / 2, { steps: 5 }); await pg.mouse.up();
  await pg.screenshot({ path: path.join(OUT, `crop-${chip.replace(':', 'x')}.png`) });
  await pg.locator('.crop-modal button', { hasText: 'Decupează' }).last().click();
  await pg.waitForTimeout(600);
};

// ---------------- document
await pg.evaluate(() => Writer.open(null));
await pg.waitForTimeout(800);
await pg.click('#wr-page');
await pg.keyboard.type('Oferta noastră pentru amenajarea biroului. Textul continuă pe mai multe rânduri ca să se vadă cum stă poza peste el.');
await pg.keyboard.press('Enter');
await pg.evaluate((src) => { document.execCommand('insertHTML', false, `<img src="${src}" style="max-width:100%">`); }, await pg.evaluate(picture));
await pg.keyboard.press('Enter');
await pg.keyboard.type('Mai jos, alt paragraf de text.');
await pg.waitForTimeout(300);
let img = pg.locator('#wr-page img').first();
await img.click();
await pg.waitForTimeout(200);
ok(await pg.locator('#wr-imgsel:not(.hidden) .ch').count() === 8, 'document: 8 handles around the selected picture');
let b = await img.boundingBox();
await pg.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await pg.mouse.down(); await pg.mouse.move(b.x + b.width / 2 + 220, b.y + b.height / 2 - 60, { steps: 8 }); await pg.mouse.up();
await pg.waitForTimeout(200);
let b2 = await img.boundingBox();
ok(await img.evaluate((i) => i.classList.contains('free')) && Math.abs(b2.x - b.x - 220) < 6 && Math.abs(b2.y - b.y + 60) < 6, `document: dragged anywhere (moved ${Math.round(b2.x - b.x)}, ${Math.round(b2.y - b.y)})`);
const se = await pg.locator('#wr-imgsel .ch.se').boundingBox();
await pg.mouse.move(se.x + se.width / 2, se.y + se.height / 2); await pg.mouse.down(); await pg.mouse.move(se.x + se.width / 2 - 120, se.y + se.height / 2, { steps: 8 }); await pg.mouse.up();
await pg.waitForTimeout(200);
const b3 = await img.boundingBox();
ok(Math.abs(b3.width - (b2.width - 120)) < 6 && Math.abs(b3.width / b3.height - b2.width / b2.height) < 0.03, `document: corner resize keeps the shape (${Math.round(b2.width)} → ${Math.round(b3.width)} px)`);
await pg.screenshot({ path: path.join(OUT, 'doc-moved.png') });
await pg.locator('#wr-imgbar button', { hasText: 'Decupează' }).click();
await cropWithChip('1:1');
const nat = await img.evaluate((i) => [i.naturalWidth, i.naturalHeight]);
ok(nat[0] < 400 && Math.abs(nat[0] - nat[1]) <= 2, `document: cropped square (${nat.join('×')})`);
await img.click(); await pg.waitForTimeout(200);
await pg.screenshot({ path: path.join(OUT, 'doc-cropped.png') });
const xml = await pg.evaluate(async () => { await Lib.load('docx'); const ab = await Writer._debug().buildDocx(); await Lib.load('jszip'); const z = await Lib.get('jszip').loadAsync(ab); return z.file('word/document.xml').async('string'); });
ok(/<wp:anchor/.test(xml) && /positionH relativeFrom="page"/.test(xml), 'document: the .docx keeps the picture where it was put (floating)');
await pg.evaluate(() => { const ed = Office.active(); if (ed && ed.discard) ed.discard(); });

// ---------------- presentation
await pg.evaluate(() => Slides.open(null));
await pg.waitForTimeout(800);
await pg.evaluate((src) => { const d = Slides._debug(); d.deck.media.t1 = src; d.deck.slides[0].els.push({ id: 'imgT', type: 'image', x: 300, y: 150, w: 400, h: 300, src: 't1', st: {} }); d.goTo(0); }, await pg.evaluate(picture));
await pg.waitForTimeout(400);
const se2 = await pg.locator('.sl .se img').last().boundingBox();
await pg.mouse.click(se2.x + se2.width / 2, se2.y + se2.height / 2);
await pg.waitForTimeout(200);
await pg.locator('button[title="Decupează imaginea"]').first().click();
await cropWithChip('16:9');
const el2 = await pg.evaluate(() => Slides._debug().deck.slides[0].els.find((e) => e.id === 'imgT'));
ok(el2.w < 400 && Math.abs(el2.w / el2.h - 16 / 9) < 0.05, `presentation: cropped 16:9 in place (${el2.w}×${el2.h} at ${el2.x},${el2.y})`);
await pg.screenshot({ path: path.join(OUT, 'slide-cropped.png') });
await pg.evaluate(() => { const ed = Office.active(); if (ed && ed.discard) ed.discard(); });

// ---------------- PDF
if (PDF) {
  await pg.evaluate(() => { const ed = Office.active(); if (ed && ed.discard) ed.discard(); App.openPath('/docs/scan.pdf'); });
  for (let i = 0; i < 20; i++) { const m = pg.locator('#modal-root .modal button', { hasText: 'Nu salva' }); if (await m.count()) await m.click(); if (await pg.evaluate(() => typeof Editor !== 'undefined' && Editor.path === '/docs/scan.pdf')) break; await pg.waitForTimeout(300); }
  await pg.waitForTimeout(800);
  console.log('pdf state', await pg.evaluate(() => JSON.stringify({ path: typeof Editor !== 'undefined' && Editor.path, kinds: Editor.doc ? Editor.items(0).map((i) => i.kind) : null, modal: document.querySelector('#modal-root .modal') && document.querySelector('#modal-root .modal').innerText.slice(0, 200), toasts: [...document.querySelectorAll('#toasts > *')].map((t) => t.innerText).join('|') })));
  // a picture placed on the page (the scan itself is the page's background)
  await pg.evaluate(async (src) => { const im = new Image(); im.src = src; await im.decode(); const c = document.createElement('canvas'); c.width = 400; c.height = 300; c.getContext('2d').drawImage(im, 0, 0); const d = c.getContext('2d').getImageData(0, 0, 400, 300); Editor.pending = { rgba: d.data, width: 400, height: 300 }; Editor.placeImage(0, { l: 0.5, t: 0.55, r: 0.85, b: 0.75 }); }, await pg.evaluate(picture));
  await pg.waitForTimeout(500);
  const before = await pg.evaluate(() => Editor.items(0).find((i) => i.kind === 'image').box);
  await pg.evaluate(() => { const it = Editor.items(0).find((i) => i.kind === 'image'); window.__crop = Editor.cropImage(it); });
  await cropWithChip('4:3');
  await pg.evaluate(() => window.__crop);
  const after = await pg.evaluate(() => Editor.items(0).find((i) => i.kind === 'image').box);
  ok(after.r - after.l < before.r - before.l && after.l > before.l, `PDF: picture cropped in place (${JSON.stringify(after)})`);
  await pg.screenshot({ path: path.join(OUT, 'pdf-cropped.png') });
}
console.log(errs.length ? 'ERRORS ' + errs.join(' | ') : 'no page errors');
console.log(failed ? failed + ' failed' : 'all passed');
await browser.close(); server.close();
