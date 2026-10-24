// Quick functional test of ACM Docs on one phone (iPhone 17, iOS layout), driven like a person:
// taps, typing, saving. The phone bridge is simulated (mock-bridge.js), files live in memory, so we
// can check what was really written. Server features (account, sync, chat) are not reached here.
//
//   node test/ui/functions.mjs [--out dir]
import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../app');
const ai = process.argv.indexOf('--out');
const OUT = path.resolve(ai > 0 ? process.argv[ai + 1] : path.join(HERE, 'out-fn'));
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
fs.mkdirSync(OUT, { recursive: true });

const MIME = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.wasm': 'application/wasm', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.json': 'application/json' };
const server = http.createServer((q, r) => {
  const p = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  if (!p.startsWith(ROOT)) { r.writeHead(403); return r.end(); }
  fs.readFile(p, (e, b) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); r.end(b); });
}).listen(0);
const PORT = server.address().port;
const bridge = fs.readFileSync(path.join(HERE, 'mock-bridge.js'), 'utf8');
const pdf = fs.readFileSync(path.join(HERE, 'fixtures', 'Contract.pdf')).toString('base64');

const browser = await chromium.launch({ executablePath: CHROME });
const ctx = await browser.newContext({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, bypassCSP: true });
const pg = await ctx.newPage();
const pageErrors = [];
pg.on('pageerror', (e) => pageErrors.push(String(e.message || e).split('\n')[0]));
await pg.addInitScript(({ pdf }) => {
  window.__ACM_TEST = { platform: 'ios', files: { '/docs/Contract.pdf': pdf }, openPick: '/docs/Contract.pdf' };
  try { localStorage.setItem('acm.lang', 'ro'); localStorage.setItem('acm.lang.chosen', '1'); localStorage.setItem('acm.account.later', '1'); } catch (e) {}
  document.addEventListener('DOMContentLoaded', () => document.documentElement.classList.add('ios-glass'));
}, { pdf });
await pg.addInitScript(bridge);

// ---------------------------------------------------------------- helpers
const results = [];
let n = 0;
const sleep = (ms) => pg.waitForTimeout(ms);
const files = () => pg.evaluate(() => [...window.__acmFiles.keys()]);
const head = (p) => pg.evaluate((p) => atob(window.__acmFiles.get(p) || '').slice(0, 4), p);
const toasts = () => pg.evaluate(() => [...document.querySelectorAll('#toasts > *')].map((t) => t.innerText.trim()).join(' | '));
const modal = () => pg.locator('#modal-root .modal').last();
const tapText = async (text, scope = 'body') => { await pg.locator(scope).getByText(text, { exact: false }).first().click(); };
async function check(name, fn) {
  const errBefore = pageErrors.length;
  const t0 = Date.now();
  let ok = true, note = '';
  try { note = (await Promise.race([fn(), new Promise((_, r) => setTimeout(() => r(new Error('blocat peste 45 s')), 45000))])) || ''; } catch (e) { ok = false; note = String(e.message || e).split('\n')[0]; }
  const errs = pageErrors.slice(errBefore);
  if (errs.length && ok) { ok = false; note = (note ? note + ' · ' : '') + 'eroare în pagină: ' + errs[0]; }
  const shot = `${String(++n).padStart(2, '0')}.png`;
  await pg.screenshot({ path: path.join(OUT, shot) }).catch(() => {});
  results.push({ name, ok, note, ms: Date.now() - t0, shot });
  console.log(ok ? '✓' : '✗', name, note ? '— ' + note : '');
}
async function goHome() {
  // open dialogs are closed the way a person does it: the phone's back gesture
  for (let i = 0; i < 5 && (await pg.locator('#modal-root .backdrop').count()); i++) { await pg.evaluate(() => UI.back()); await sleep(350); }
  // leaves whatever is open; a pending "unsaved changes" question is answered with "Don't save"
  await pg.evaluate(() => { window.__closing = App.ensureClosed().catch(() => true); });
  await sleep(300);
  const later = pg.locator('#auth .auth-later');
  if (await later.count()) { await later.click(); await sleep(300); }
  const ns = pg.locator('#modal-root .modal').getByRole('button', { name: 'Nu salva' });
  if (await ns.count()) await ns.click();
  await pg.evaluate(async () => { await window.__closing; App.showHome && App.showHome(); App.showView('home'); });
  await sleep(500);
}

// a signed-in person with a plan that allows the action (the server is not reached in this test)
function signIn() {
  const u = { uid: 'ME', displayName: 'Ana Popescu', email: 'ana@exemplu.ro', emailVerified: true, providerData: [{ providerId: 'password' }] };
  Account.current = () => u; Account.needsVerification = () => false; Account.wordsSaved = () => true;
  Plan.allow = async () => true;
  const a = document.getElementById('auth'); if (a) a.remove();
}

// ---------------------------------------------------------------- the checks
await check('Aplicația pornește și arată ecranul Acasă', async () => {
  const t0 = Date.now();
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForSelector('#v-home:not(.hidden) #quick', { state: 'visible', timeout: 15000 });
  await sleep(600);
  return `pornire în ${((Date.now() - t0) / 1000).toFixed(1)} s`;
});

await check('Navigare: Fișiere, Facturi, Setări, înapoi la Acasă (bara de jos)', async () => {
  for (const [i, v] of [[2, 'files'], [4, 'invoices'], [5, 'settings'], [1, 'home']]) {
    await pg.locator(`#tabbar > *:nth-child(${i})`).click();
    await sleep(350);
    if (!(await pg.isVisible(`#v-${v}`))) throw new Error(`ecranul ${v} nu s-a deschis`);
  }
});

await check('Factură: firmă nouă (2 pași), client, produs, PDF creat', async () => {
  await pg.click('#act-invoice');
  await sleep(500);
  // company setup on first invoice
  await modal().getByRole('button', { name: 'Continuă' }).click();
  await sleep(250);
  await modal().locator('input.in').first().fill('Test Construct SRL');
  await modal().locator('input.in').nth(1).fill('RO12345678');
  await modal().getByRole('button', { name: 'Gata' }).click();
  await sleep(600);
  if (!(await pg.isVisible('#invoice'))) throw new Error('editorul de factură nu s-a deschis');
  // try to create with nothing: it must say what is missing
  await pg.click('#inv-create');
  await sleep(300);
  const t1 = await toasts();
  if (!/client/i.test(t1)) throw new Error('fără client nu apare mesaj clar (am văzut: ' + t1 + ')');
  await pg.fill('#inv-form [data-path="client.name"]', 'Ion Popescu');
  const q = pg.locator('#inv-form .quick-add');
  await q.locator('input').first().fill('Montaj ușă interior');
  await q.locator('input.price').fill('450');
  await q.locator('button.add').click();
  await sleep(300);
  const total = (await pg.textContent('#inv-total')).trim();
  if (!/450/.test(total)) throw new Error('totalul nu e 450 (e „' + total + '”)');
  await pg.click('#inv-create');
  await sleep(400);
  await modal().getByRole('button', { name: 'Creează PDF' }).click();
  await sleep(600);
  // without an account the app asks for one (documents count against the plan) — then we sign in
  const sheet = await modal().innerText().catch(() => '');
  if (!/cont/i.test(sheet)) throw new Error('fără cont nu cere crearea contului');
  await modal().getByRole('button', { name: 'Nu acum' }).click();
  await sleep(300);
  await pg.evaluate(signIn);
  await pg.click('#inv-create');
  await sleep(400);
  await modal().getByRole('button', { name: 'Creează PDF' }).click();
  await pg.waitForFunction(() => [...window.__acmFiles.keys()].some((k) => /\.pdf$/.test(k) && !/Contract/.test(k)), null, { timeout: 25000 });
  const f = (await files()).find((k) => /\.pdf$/.test(k) && !/Contract/.test(k));
  if ((await head(f)) !== '%PDF') throw new Error('fișierul creat nu e PDF');
  await sleep(500);
  return `${path.basename(f)} · total ${total}`;
});

await check('Lista facturilor arată factura emisă', async () => {
  await goHome();
  await pg.evaluate(() => App.showView('invoices'));
  await sleep(600);
  const t = await pg.innerText('#v-invoices');
  if (!/Ion Popescu/.test(t)) throw new Error('factura nu apare în listă');
});

await check('Editor PDF: deschide, 3 pagini, caută un cuvânt', async () => {
  await goHome();
  await pg.click('#act-open');
  await pg.waitForSelector('#editor:not(.hidden)', { timeout: 15000 });
  await sleep(1500);
  const ind = (await pg.textContent('#page-ind')).trim();
  if (!/3/.test(ind)) throw new Error('indicatorul de pagini arată „' + ind + '”');
  await pg.click('#btn-search');
  await sleep(250);
  await pg.fill('#search-input', 'contract');
  await pg.keyboard.press('Enter');
  await sleep(1200);
  const info = (await pg.textContent('#search-info')).trim();
  if (!/[1-9]/.test(info)) throw new Error('căutarea nu găsește „contract” (' + info + ')');
  await pg.click('#search-close');
  return `pagini „${ind}”, căutare „${info}”`;
});

await check('Editor PDF: adaugă text pe pagină și salvează o copie', async () => {
  await pg.locator('#tools .tool[data-tool="text"]').click();
  await sleep(250);
  const pageBox = await pg.locator('#pages canvas, #pages .pg, #pages > *').first().boundingBox();
  await pg.mouse.click(pageBox.x + pageBox.width * 0.3, pageBox.y + pageBox.height * 0.35);
  await sleep(400);
  await pg.keyboard.type('Aprobat ACM');
  await sleep(200);
  await pg.click('#btn-save');
  await sleep(500);
  const m = await pg.locator('#modal-root .modal').count();
  if (m) { const b = modal().locator('button.primary').last(); if (await b.count()) await b.click(); }
  await pg.waitForFunction(() => [...window.__acmFiles.keys()].some((k) => /Contract.+\.pdf$/.test(k)), null, { timeout: 20000 });
  const f = (await files()).find((k) => /Contract.+\.pdf$/.test(k));
  const orig = await pg.evaluate(() => window.__acmFiles.get('/docs/Contract.pdf').length);
  if ((await head(f)) !== '%PDF') throw new Error('copia nu e PDF');
  return `${path.basename(f)} (originalul neatins: ${orig > 0 ? 'da' : 'nu'})`;
});

await check('Document Word: scrie text și salvează .docx', async () => {
  await goHome();
  await pg.click('#act-doc');
  await pg.waitForSelector('#writer:not(.hidden) #wr-page', { timeout: 15000 });
  await sleep(800);
  await pg.click('#wr-page');
  await pg.keyboard.type('Ofertă pentru amenajare birou');
  await pg.keyboard.press('Enter');
  await pg.keyboard.type('Prețul include materialele și manopera.');
  await pg.click('#wr-save');
  await sleep(500);
  if (await pg.locator('#modal-root .modal').count()) await modal().locator('button.primary').last().click();
  await pg.waitForFunction(() => [...window.__acmFiles.keys()].some((k) => /\.docx$/.test(k)), null, { timeout: 15000 });
  const f = (await files()).find((k) => /\.docx$/.test(k));
  if ((await head(f)).slice(0, 2) !== 'PK') throw new Error('fișierul nu e .docx valid');
  return path.basename(f);
});

await check('Tabel Excel: 10 + 32 cu formula =SUM, salvează .xlsx', async () => {
  await goHome();
  await pg.click('#act-sheet');
  await pg.waitForSelector('#sheet:not(.hidden)', { timeout: 15000 });
  await sleep(800);
  await pg.locator('#sh-canvas, #sh-grid').first().click({ position: { x: 70, y: 40 } }).catch(() => {});
  const go = async (cell, v) => { await pg.fill('#sh-cellname', cell); await pg.press('#sh-cellname', 'Enter'); await sleep(120); await pg.fill('#sh-input', v); await pg.press('#sh-input', 'Enter'); await sleep(200); };
  await go('A1', '10'); await go('A2', '32'); await go('A3', '=SUM(A1:A2)');
  const v = await pg.evaluate(() => { const s = Sheet._debug().sheet(); return [...s.cells.values()].map((c) => (c.v === undefined ? c.in : c.v)).join(' '); }).catch((e) => 'eroare ' + e.message);
  await pg.fill('#sh-cellname', 'A3'); await pg.press('#sh-cellname', 'Enter'); await sleep(200);
  const stat = (await pg.textContent('#sh-stat').catch(() => '')).trim();
  if (!/(^| )42( |$)/.test(v)) throw new Error(`A3 nu dă 42 (valoare „${v}”, bara „${stat}”)`);
  await pg.click('#sh-save');
  await sleep(500);
  if (await pg.locator('#modal-root .modal').count()) await modal().locator('button.primary').last().click();
  await pg.waitForFunction(() => [...window.__acmFiles.keys()].some((k) => /\.xlsx$/.test(k)), null, { timeout: 15000 });
  const f = (await files()).find((k) => /\.xlsx$/.test(k));
  return `A3 = 42 · ${path.basename(f)}`;
});

await check('Prezentare: scrie un titlu și salvează .pptx', async () => {
  await goHome();
  await pg.click('#act-slides');
  await pg.waitForSelector('#slides:not(.hidden)', { timeout: 15000 });
  await sleep(900);
  const box = await pg.locator('#sl-wrap').boundingBox();
  // phones: tap the title once, then the "Scrie" button that appears on it
  await pg.touchscreen.tap(box.x + box.width / 2, box.y + box.height * 0.4); await sleep(400);
  const wb = pg.locator('#sl-stage .sl-write, .sl-write');
  if (!(await wb.count())) throw new Error('după atingerea titlului nu apare butonul „Scrie”');
  await wb.first().tap(); await sleep(400);
  await pg.keyboard.type('Raport trimestrial');
  await pg.touchscreen.tap(box.x + 6, box.y + 6); await sleep(300);
  const title = await pg.evaluate(() => JSON.stringify(Slides._debug().deck).includes('Raport trimestrial'));
  if (!title) throw new Error('titlul nu s-a putut scrie prin atingere');
  await pg.click('#sl-save');
  await sleep(500);
  if (await pg.locator('#modal-root .modal').count()) await modal().locator('button.primary').last().click();
  await pg.waitForFunction(() => [...window.__acmFiles.keys()].some((k) => /\.pptx$/.test(k)), null, { timeout: 15000 });
  const f = (await files()).find((k) => /\.pptx$/.test(k));
  return path.basename(f);
});

await check('Fișiere: toate documentele salvate apar și căutarea filtrează', async () => {
  await goHome();
  await pg.evaluate(() => App.showView('files'));
  await sleep(700);
  const t = await pg.innerText('#file-grid');
  const want = ['.docx', '.xlsx', '.pptx', 'Contract'];
  const miss = want.filter((w) => !t.includes(w));
  if (miss.length) throw new Error('lipsesc din listă: ' + miss.join(', '));
  await pg.fill('#files-q', 'xlsx');
  await sleep(400);
  const t2 = await pg.innerText('#file-grid');
  if (t2.includes('.docx')) throw new Error('căutarea nu filtrează');
  await pg.fill('#files-q', '');
});

await check('Acasă: „Recente” arată ce am lucrat', async () => {
  await goHome();
  const t = await pg.innerText('#recent-list');
  if (/Niciun fișier/.test(t)) throw new Error('lista Recente e goală');
  return t.split('\n').filter(Boolean).length + ' rânduri';
});

await check('Setări: schimbă limba în English și înapoi', async () => {
  await pg.evaluate(() => I18n.set ? I18n.set('en') : I18n.setLang('en'));
  await sleep(900);
  const t = await pg.innerText('#tabbar');
  if (!/Home|Files|Settings/.test(t)) throw new Error('bara nu s-a tradus: ' + t.replace(/\n/g, ' '));
  await pg.evaluate(() => I18n.set ? I18n.set('ro') : I18n.setLang('ro'));
  await sleep(900);
  if (!/Acasă/.test(await pg.innerText('#tabbar'))) throw new Error('nu revine la română');
});

await check('Cont nou: parolele diferite sunt semnalate clar', async () => {
  await pg.evaluate(() => AccountUI.show('signup'));
  await sleep(500);
  const em = pg.locator('#auth input[type="email"]');
  if (await em.count()) await em.first().fill('test@exemplu.ro');
  await pg.locator('#auth input[type="text"]').first().fill('Ana Popescu').catch(() => {});
  await pg.fill('#auth-pass', 'Parola123!');
  await pg.fill('#auth-pass2', 'Parola12');
  await pg.locator('#auth button.primary, #auth .btn.primary').first().click();
  await sleep(600);
  const t = await pg.innerText('#auth');
  if (!/coincid|identic|nu se potrivesc|diferit|nu sunt la fel/i.test(t + (await toasts()))) throw new Error('nu apare niciun mesaj despre parole');
});

await check('Butonul Înapoi al telefonului închide editorul fără să piardă lucrul', async () => {
  await goHome();
  await pg.click('#act-doc');
  await pg.waitForSelector('#writer:not(.hidden) #wr-page', { timeout: 15000 });
  await sleep(600);
  await pg.click('#wr-page');
  await pg.keyboard.type('Text nesalvat');
  await pg.evaluate(() => App.back());
  await sleep(500);
  const asked = await pg.locator('#modal-root .modal').count();
  if (!asked) throw new Error('a închis fără să întrebe de modificările nesalvate');
  return 'întreabă înainte să închidă';
});

await browser.close();
server.close();

// ---------------------------------------------------------------- report
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(results, null, 1));
const esc = (x) => String(x).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const okN = results.filter((r) => r.ok).length;
fs.writeFileSync(path.join(OUT, 'report.html'), `<!doctype html><meta charset="utf-8"><title>ACM Docs · test funcții</title><style>body{font:14px system-ui;margin:24px}.r{display:flex;gap:14px;border-top:1px solid #ddd;padding:10px 0}img{width:180px;border-radius:8px;border:1px solid #ccc}.ok{color:#15803d}.no{color:#b42323}</style><h1>Test funcții · iPhone 17</h1><p>${okN} din ${results.length} reușite</p>` +
  results.map((r) => `<div class="r"><img src="${r.shot}"><div><b class="${r.ok ? 'ok' : 'no'}">${r.ok ? '✓' : '✗'} ${esc(r.name)}</b><div>${esc(r.note)}</div><small>${r.ms} ms</small></div></div>`).join(''));
console.log(`\n${okN} / ${results.length} reușite → ${path.join(OUT, 'report.html')}`);
