// The real Windows app, end to end: in Word, Excel, PowerPoint and PDF a document is made, edited, saved on
// disk and opened again. Runs in its own folders: nothing touches the real documents.
//   node test/ui/office-flow.mjs [--out dir]
import { _electron as electron } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'acm-office-'));
const DOCS = path.join(DATA, 'documente');
const OUT = path.resolve(arg('out', path.join(DATA, 'out')));
fs.mkdirSync(DOCS, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });
const TEXT = 'Text de test ăîșț';
let failed = 0;
const check = async (name, fn) => { try { await fn(); console.log('✓', name); } catch (e) { failed++; console.log('✗', name, '—', String(e.message || e).split('\n')[0].slice(0, 200)); await page.screenshot({ path: path.join(OUT, 'fail-' + name.split(':')[0] + '.png') }).catch(() => {}); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 20000, what = 'condition') { const end = Date.now() + ms; for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) throw new Error('timed out: ' + what); await sleep(200); } }

const errors = [];
const app = await electron.launch({ args: [ROOT], env: { ...process.env, ACM_USERDATA: DATA } });
const page = await app.firstWindow();
page.on('pageerror', (e) => errors.push(String(e.message || e)));
await until(() => page.evaluate(() => typeof App !== 'undefined' && !document.getElementById('home').classList.contains('hidden')).catch(() => false), 40000, 'home');
await sleep(1200);
await page.evaluate((dir) => {
  document.getElementById('auth')?.remove();
  Plan.allow = async () => true;
  Host.specialDir = async () => dir;
}, DOCS);

const newest = (ext) => fs.readdirSync(DOCS).filter((f) => f.toLowerCase().endsWith(ext)).map((f) => path.join(DOCS, f)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
/** Presses Save; answers the name dialog if there is one; waits for a new file. */
async function save(button, ext) {
  const before = new Set(fs.readdirSync(DOCS));
  await page.click(button);
  return until(async () => {
    const ok = page.locator('#modal-root .modal .btn.primary').last();
    if (await ok.count() && await ok.isVisible().catch(() => false)) await ok.click().catch(() => {});
    const f = fs.readdirSync(DOCS).find((x) => !before.has(x) && x.toLowerCase().endsWith(ext) && !x.endsWith('.tmp-acmdocs'));
    return f ? path.join(DOCS, f) : null;
  }, 30000, 'saved ' + ext);
}
const zipText = async (file, re) => {
  const z = await JSZip.loadAsync(fs.readFileSync(file));
  let all = '';
  for (const n of Object.keys(z.files)) if (re.test(n)) all += await z.file(n).async('string');
  return all;
};
const toHome = () => page.evaluate(() => App.ensureClosed().then(() => App.showHome()));

await check('Word: new, typed, saved, opened again', async () => {
  await page.click('#act-doc');
  await page.waitForSelector('#writer:not(.hidden) #wr-page');
  await page.click('#wr-page');
  await page.keyboard.type(TEXT);
  const file = await save('#wr-save', '.docx');
  assert.ok((await zipText(file, /word\/document\.xml$/)).includes(TEXT), 'text in the .docx');
  await toHome();
  await page.evaluate((p) => App.openPath(p), file);
  await until(async () => (await page.locator('#writer:not(.hidden) #wr-page').innerText().catch(() => '')).includes(TEXT), 20000, 'text after reopening');
  await page.screenshot({ path: path.join(OUT, 'word.png') });
  await toHome();
});

await check('Excel: new, text and formula, saved, opened again', async () => {
  await page.click('#act-sheet');
  await page.waitForSelector('#sheet:not(.hidden) #sh-input');
  await page.fill('#sh-input', TEXT);
  await page.keyboard.press('Enter');
  await page.fill('#sh-input', '=2+3');
  await page.keyboard.press('Enter');
  const file = await save('#sh-save', '.xlsx');
  const xml = await zipText(file, /(sharedStrings|sheet1)\.xml$/);
  assert.ok(xml.includes(TEXT), 'text in the .xlsx');
  assert.ok(xml.includes('2+3'), 'formula in the .xlsx');
  await toHome();
  await page.evaluate((p) => App.openPath(p), file);
  await until(() => page.evaluate((t) => { if (document.getElementById('sheet').classList.contains('hidden')) return false; const d = Sheet._debug(); return JSON.stringify([...d.wb.sheets[0].cells.values()]).includes(t); }, TEXT), 20000, 'text after reopening');
  await page.screenshot({ path: path.join(OUT, 'excel.png') });
  await toHome();
});

await check('PowerPoint: new, title typed, saved, opened again', async () => {
  await page.click('#act-slides');
  await page.waitForSelector('#slides:not(.hidden) #sl-wrap');
  await sleep(800);
  const se = await page.locator('#sl-live .se').first().boundingBox();
  await page.mouse.dblclick(se.x + se.width / 2, se.y + se.height / 2);
  await sleep(400);
  await page.keyboard.type(TEXT);
  await page.mouse.click(5, 300); // outside the slide: the text is kept
  await sleep(300);
  const file = await save('#sl-save', '.pptx');
  assert.ok((await zipText(file, /ppt\/slides\/slide1\.xml$/)).includes(TEXT), 'text in the .pptx');
  await toHome();
  await page.evaluate((p) => App.openPath(p), file);
  await until(() => page.evaluate((t) => !document.getElementById('slides').classList.contains('hidden') && JSON.stringify(Slides._debug().deck.slides[0].els).includes(t), TEXT), 20000, 'text after reopening');
  await page.screenshot({ path: path.join(OUT, 'powerpoint.png') });
  await toHome();
});

await check('PDF: opened, text added, saved as a copy (the original untouched), opened again', async () => {
  const src = path.join(DOCS, 'Contract.pdf');
  fs.copyFileSync(path.join(HERE, 'fixtures/Contract.pdf'), src);
  const original = fs.readFileSync(src);
  await page.evaluate((p) => App.openPath(p), src);
  await page.waitForSelector('#editor:not(.hidden) #pages canvas', { timeout: 20000 });
  await sleep(1000);
  await page.evaluate(() => App.chooseTool('text'));
  const box = await page.locator('#pages canvas').first().boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + 70); // the empty top margin, always on screen
  await sleep(400);
  await page.keyboard.type('Adaugat in PDF');
  // (Save itself keeps what is being typed; Escape would cancel it)
  const file = await save('#btn-save', '.pdf');
  assert.match(path.basename(file), /_editat_1\.pdf$/);
  assert.ok(fs.readFileSync(file).subarray(0, 5).toString() === '%PDF-');
  assert.ok(original.equals(fs.readFileSync(src)), 'the original did not change');
  await page.evaluate(() => App.closeDoc());
  await page.waitForSelector('#home:not(.hidden)', { timeout: 8000 });
  await page.evaluate((p) => App.openPath(p), file);
  await until(() => page.evaluate(() => { try { return !document.getElementById('editor').classList.contains('hidden') && JSON.stringify(Editor.doc.items(0).filter((i) => i.kind === 'text').map((i) => i.text)).includes('Adaugat in PDF'); } catch (e) { return false; } }), 20000, 'text after reopening');
  await page.screenshot({ path: path.join(OUT, 'pdf.png') });
  await page.evaluate(() => App.closeDoc());
});

await check('no script errors in the page', async () => assert.deepEqual(errors, []));
await app.close();
fs.rmSync(DATA, { recursive: true, force: true });
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
