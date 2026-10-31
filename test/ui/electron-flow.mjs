// The real Windows app (Electron, its own folders, nothing shared with an installed copy): first start,
// a company, an invoice made into a PDF, the data kept in files, a restart, the storage move from an older version.
//   node test/ui/electron-flow.mjs [--out dir]
import { _electron as electron } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const OUT = path.resolve(arg('out', fs.mkdtempSync(path.join(os.tmpdir(), 'acm-flow-out-'))));
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'acm-flow-data-'));
const DOCS = path.join(DATA, 'facturi');
fs.mkdirSync(OUT, { recursive: true });
let failed = 0;
const check = async (name, fn) => { try { await fn(); console.log('✓', name); } catch (e) { failed++; console.log('✗', name, '—', String(e.message || e).split('\n')[0]); } };

// (the page keeps its real rules: no script from text, so waiting is done by asking)
async function until(p, fn, ms) { const end = Date.now() + ms; for (;;) { try { if (await p.evaluate(fn)) return; } catch (e) { if (Date.now() > end) throw e; } if (Date.now() > end) throw new Error('timed out: ' + fn); await new Promise((r) => setTimeout(r, 150)); } }
const errors = [];
async function start() {
  const app = await electron.launch({ args: [ROOT], env: { ...process.env, ACM_USERDATA: DATA } });
  const page = await app.firstWindow();
  page.on('pageerror', (e) => errors.push(String(e.message || e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/net::|Failed to load resource|Firebase|firestore|auth\//i.test(m.text())) errors.push(m.text()); });
  await until(page, () => document.getElementById('home') && !document.getElementById('home').classList.contains('hidden') && typeof App !== 'undefined', 40000);
  await page.waitForTimeout(1200);
  // the first-start language and sign-in screens are not what is being tested here
  await page.evaluate(() => { const a = document.getElementById('auth'); if (a) a.remove(); });
  return { app, page };
}

let { app, page } = await start();

await check('the app starts on the home screen, with the first steps and no empty money card', async () => {
  assert.equal(await page.isVisible('#home-money'), false);
  assert.match(await page.textContent('#home-biz'), /3 pași/);
  await page.screenshot({ path: path.join(OUT, '1-home.png') });
});

await check('the form opens without an account', async () => {
  await page.evaluate((folder) => {
    const p = { ...Biz.blankProfile('general'), name: 'Test SRL', legal: 'TEST SOFTWARE SRL', cui: 'RO14255667', address: 'Str. Republicii 10', city: 'Oradea', county: 'Bihor', iban: 'RO49AAAA1B31007593840000', vatPayer: true, vatRate: 21, pricesInclVat: false, folder };
    Biz.save(p); Biz.setActive(p.id);
    App.renderView();
  }, DOCS);
  fs.mkdirSync(DOCS, { recursive: true });
  await page.click('#act-invoice');
  await page.waitForSelector('#invoice:not(.hidden) #inv-form input', { timeout: 8000 });
});

await check('creating asks for the account, and what was typed stays', async () => {
  await page.fill('[data-path="client.name"]', 'Client Firma SRL');
  await page.fill('#inv-form .quick-add input.in:not(.qty):not(.price)', 'Reparație');
  await page.fill('#inv-form .quick-add input.price', '10,05');
  await page.keyboard.press('Enter');
  await page.click('#inv-create');
  await page.waitForSelector('.modal .name-row input', { timeout: 15000 });
  await page.click('.modal .actions .btn.primary');
  await page.waitForSelector('.modal.plan-ask', { timeout: 15000 });
  await page.click('.modal.plan-ask .actions .btn:last-child');
  await until(page, () => !document.querySelector('.modal.plan-ask'), 8000);
  assert.equal(await page.inputValue('[data-path="client.name"]'), 'Client Firma SRL');
  assert.equal(await page.locator('#inv-lines .line').count(), 1);
});

await check('an invoice becomes a PDF on disk, with the same VAT as e-Factura', async () => {
  await page.evaluate(() => { Plan.allow = async () => true; });
  for (let i = 0; i < 9; i++) {
    await page.fill('#inv-form .quick-add input.in:not(.qty):not(.price)', 'Reparație ' + i);
    await page.fill('#inv-form .quick-add input.price', '10,05');
    await page.keyboard.press('Enter');
  }
  await until(page, () => document.querySelectorAll('#inv-lines .line').length === 10, 8000);
  await page.screenshot({ path: path.join(OUT, '2-invoice.png') });
  await page.click('#inv-create');
  await page.waitForSelector('.modal .name-row input', { timeout: 15000 });
  await page.click('.modal .actions .btn.primary');
  await page.waitForSelector('.modal.done', { timeout: 45000 });
  await page.screenshot({ path: path.join(OUT, '3-done.png') });
  const pdfs = fs.readdirSync(DOCS).filter((f) => f.endsWith('.pdf'));
  assert.equal(pdfs.length, 1);
  const size = fs.statSync(path.join(DOCS, pdfs[0])).size;
  assert.ok(size > 5000, 'PDF of ' + size + ' bytes');
  assert.ok(fs.readFileSync(path.join(DOCS, pdfs[0])).subarray(0, 5).toString() === '%PDF-');
  const r = await page.evaluate(() => { const d = Biz.docs()[0]; const b = { ...Biz.get(d.bizId), ...d.data.tax }; const t = Invoice.compute(d.data, b); const x = EFactura.build(d); return { total: d.total, tva: t.tva, xml: x.xml, problems: x.problems }; });
  assert.equal(r.tva, 21.11);
  assert.equal(r.total, 121.61);
  assert.ok(r.xml.includes('>21.11</cbc:TaxAmount>'));
  await page.keyboard.press('Escape');
});

await check('the next invoice takes the next number', async () => {
  const n = await page.evaluate(() => Biz.nextOf(Biz.active(), 'invoice'));
  assert.equal(n, 2);
});

await check('the data lives in files of the private folder, not in the browser storage', async () => {
  const store = path.join(DATA, 'private', 'store');
  assert.ok(fs.existsSync(path.join(store, 'acm.docs.json')));
  assert.ok(fs.existsSync(path.join(store, 'acm.businesses.json')));
  const inBrowser = await page.evaluate(() => { const o = []; for (let i = 0; i < localStorage.length; i++) o.push(localStorage.key(i)); return o; });
  assert.ok(!inBrowser.includes('acm.docs') && !inBrowser.includes('acm.businesses'));
  assert.equal(JSON.parse(JSON.parse(fs.readFileSync(path.join(store, 'acm.docs.json'), 'utf8')).v).length, 1);
});

await check('much more data than the browser storage could hold', async () => {
  const ok = await page.evaluate(() => {
    const docs = Biz.docs();
    const big = 'x'.repeat(3000);
    const extra = Array.from({ length: 4000 }, (_, i) => ({ id: 'old' + i, bizId: docs[0].bizId, type: 'invoice', series: 'OLD', number: i + 1, client: 'C' + i, total: 1, date: '2020-01-01', time: i, path: '', notes: big }));
    localStorage.setItem('acm.docs', JSON.stringify(docs.concat(extra)));
    return Biz.docs().length;
  });
  assert.equal(ok, 4001);
  const onDisk = fs.statSync(path.join(DATA, 'private', 'store', 'acm.docs.json')).size;
  assert.ok(onDisk > 12 * 1048576, onDisk + ' bytes');
});

await check('a dialog keeps Tab inside it and is announced as a dialog', async () => {
  await page.evaluate(() => { App.showHome(); });
  await page.waitForTimeout(300);
  const done = page.evaluate(() => { window.__d = UI.confirm('Titlu de test', 'Text', 'Da', 'Nu'); return true; });
  await done;
  await page.waitForSelector('.modal[role="dialog"]');
  await page.waitForTimeout(150);
  const info = await page.evaluate(() => { const m = document.querySelector('.modal'); return { label: document.getElementById(m.getAttribute('aria-labelledby'))?.textContent, focus: m.contains(document.activeElement) }; });
  assert.equal(info.label, 'Titlu de test');
  assert.ok(info.focus, 'focus on '+await page.evaluate(()=>document.activeElement.tagName+'.'+document.activeElement.className+' modals='+document.querySelectorAll('.modal').length));
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab');
    assert.ok(await page.evaluate(() => document.querySelector('.modal').contains(document.activeElement)), 'tab '+i+' on '+await page.evaluate(()=>document.activeElement.tagName+'.'+document.activeElement.className+' modals='+document.querySelectorAll('.modal').length));
  }
  await page.keyboard.press('Escape');
});

await check('a file opens from the keyboard, in the PDF editor', async () => {
  await page.evaluate(() => App.showView('files'));
  await page.waitForSelector('.fcard', { timeout: 6000 });
  await page.focus('.fcard');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#editor:not(.hidden) #pages canvas, #editor:not(.hidden) #pages .pg', { timeout: 20000 });
  await page.screenshot({ path: path.join(OUT, '5-pdf.png') });
  await page.evaluate(() => App.closeDoc());
  await page.waitForSelector('#home:not(.hidden)', { timeout: 8000 });
});

await check('a copy of the data can be made and read back, and nothing is lost', async () => {
  const r = await page.evaluate(async (dir) => {
    const before = Biz.docs().length;
    const target = Host.join(dir, 'copie.json');
    Host.saveDialog = async () => target;
    Host.openDialog = async () => target;
    await App.exportData();
    const first = Biz.docs()[0].id;
    Biz.removeDoc(first);
    const without = Biz.docs().length;
    await App.importData();
    return { before, without, after: Biz.docs().length, back: Biz.docs().some((d) => d.id === first), target };
  }, DOCS);
  assert.equal(r.without, r.before - 1);
  assert.equal(r.after, r.before);
  assert.ok(r.back);
  assert.equal(JSON.parse(fs.readFileSync(r.target, 'utf8')).app, 'ACM Docs');
});

await page.screenshot({ path: path.join(OUT, '4-files.png') });
// what an older version left: in the browser's storage (direct write, past the routing) and no file
await page.evaluate(() => { localStorage['acm.invoiceClients'] = JSON.stringify([{ name: 'Client vechi', client: {} }]); });
fs.rmSync(path.join(DATA, 'private', 'store', 'acm.invoiceClients.json'), { force: true });
await page.waitForTimeout(800);
await app.close();

// ---------------------------------------------------------------- again, from what is on disk
({ app, page } = await start());
await check('after a restart everything is there', async () => {
  const r = await page.evaluate(() => ({ docs: Biz.docs().length, biz: Biz.active() && Biz.active().name, next: Biz.nextOf(Biz.active(), 'invoice') }));
  assert.equal(r.docs, 4001);
  assert.equal(r.biz, 'Test SRL');
  assert.equal(r.next, 2);
});

await check('data of an older version moves from the browser storage to a file, once and safely', async () => {
  const r = await page.evaluate(() => ({ value: JSON.parse(localStorage.getItem('acm.invoiceClients'))[0].name, left: Object.keys(localStorage).includes('acm.invoiceClients') }));
  assert.equal(r.value, 'Client vechi');
  assert.equal(r.left, false);
  assert.equal(JSON.parse(JSON.parse(fs.readFileSync(path.join(DATA, 'private', 'store', 'acm.invoiceClients.json'), 'utf8')).v)[0].name, 'Client vechi');
});

await check('no script errors in the page', async () => {
  assert.deepEqual(errors, []);
});
await app.close();
fs.rmSync(DATA, { recursive: true, force: true });
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
console.log('screens:', OUT);
process.exit(failed ? 1 : 0);
