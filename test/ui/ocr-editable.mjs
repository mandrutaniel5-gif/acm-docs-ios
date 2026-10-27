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
const tOpen = Date.now();
let sawBar = '';
while (Date.now() - tOpen < 180000) {
  const st = await pg.evaluate(() => ({ busy: !document.getElementById('busy').classList.contains('hidden'), label: document.getElementById('busy-label').textContent, shown: !document.getElementById('editor').classList.contains('hidden') }));
  if (st.busy && st.label) { if (!sawBar) await pg.screenshot({ path: path.join(OUT, 'loading.png') }); sawBar = st.label; }
  if (st.shown && !st.busy) break;
  await pg.waitForTimeout(200);
}
console.log('loading bar seen:', JSON.stringify(sawBar), 'opened in', ((Date.now() - tOpen) / 1000).toFixed(1), 's');
await pg.waitForTimeout(800);
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
// opened = ready: the text was read under the loading bar, before the page showed
console.log('ready at open:', await pg.evaluate(() => ImageText.state(0)));
const items = await pg.evaluate(() => Editor.items(0).filter((i) => i.scan).map((i) => i.text));
fs.writeFileSync(path.join(OUT, 'lines.txt'), items.join('\n'));
console.log('scan lines', items.length);
const editLine = async (tag, from, to) => {
  const r = await pg.evaluate(({ from, to }) => {
    const it = Editor.items(0).find((i) => i.scan && i.text.includes(from));
    if (!it) return 'no line with ' + from;
    Pages.beginEdit(it);
    const box = document.querySelector('.text-edit');
    if (!box) return 'no editor';
    box.textContent = it.text.replace(from, to);
    box.dispatchEvent(new Event('input'));
    Pages.closeEditor(true);
    return 'edited: ' + it.text + ' -> ' + box.textContent;
  }, { from, to });
  console.log(tag, r);
  await pg.waitForTimeout(2500);
};
await editLine('plain scan', 'activ rămas', 'activ rămas (lichidator ACM)');
await render('after-edit');
console.log('search "lichidator":', await pg.evaluate(() => Editor.doc.search('lichidator').length + ' in PDF text'));

// A PDF as the scanner makes it: the picture plus invisible words (the scanner's hidden text)
const b64 = await pg.evaluate(async () => {
  const src = Editor.doc;
  const img = src.images(0)[0];
  const px = src.imagePixels(0, img.obj);
  const c = document.createElement('canvas'); c.width = px.width; c.height = px.height;
  c.getContext('2d').putImageData(new ImageData(px.rgba, px.width, px.height), 0, 0);
  const jpeg = new Uint8Array(await (await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9))).arrayBuffer());
  const d = PDF.Doc.fromJpegs([{ jpeg, ptW: 595.28, ptH: 841.89 }]);
  const dbg = window.__ocrDebug;
  const words = [];
  for (const par of dbg.res.paragraphs) for (const l of par.lines) for (const w of l.words) words.push({ text: w.text, l: w.bbox.x0 / dbg.scale / px.width, r: w.bbox.x1 / dbg.scale / px.width, base: w.bbox.y1 / dbg.scale / px.height, size: 9 });
  const f = SystemFonts.findTrueType('Arial', false, false, 'ăâîșț');
  d.writeHiddenText(0, words, f.key, f.bytes);
  const bytes = d.save(); d.close();
  let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
});
await pg.evaluate((b) => { window.__acmFiles.set('/docs/scanner.pdf', b); }, b64);
await pg.evaluate(() => { Editor.dirty = false; });
// as the scanner does: it hands over what it read, so the PDF opens without reading again
await pg.evaluate(() => {
  const d = window.__ocrDebug; const img = Editor.doc.images(0)[0]; const px = Editor.doc.imagePixels(0, img.obj);
  const lines = d.res.paragraphs.flatMap((p) => p.lines);
  ImageText.fromScanner('/docs/scanner.pdf', [{ W: px.width * d.scale, H: px.height * d.scale, lines }]);
});
const t2 = Date.now();
await pg.evaluate(() => App.openPath('/docs/scanner.pdf'));
console.log('scanner PDF opened in', ((Date.now() - t2) / 1000).toFixed(1), 's');
console.log('scanner PDF: scanned pages', await pg.evaluate(() => JSON.stringify(ImageText.scannedPages())), 'ready:', await pg.evaluate(() => ImageText.state(0)));
const hiddenBefore = await pg.evaluate(() => Editor.doc.search('voința').length);
await editLine('scanner pdf', 'voința profesionistului', 'voința asociatului');
console.log('hidden "voința" before/after edit:', hiddenBefore, await pg.evaluate(() => Editor.doc.search('profesionistului').length));
await render('scanner-after-edit');
const toasts = await pg.evaluate(() => [...document.querySelectorAll('#toasts > *, #modal-root .modal')].map((t) => t.innerText.trim().slice(0, 200)).join(' | '));
console.log('toasts:', toasts);
console.log(errs.length ? 'ERRORS ' + errs.slice(0, 3).join(' | ') : 'no errors');
await browser.close(); server.close();
