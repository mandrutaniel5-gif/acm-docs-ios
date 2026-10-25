// e-Factura screens (iPhone layout, mock bridge): list chips, details, settings row, company and client
// fields, the warning before creating, the connection dialog.  node test/ui/efactura-ui.mjs [--out dir] [--dark]
import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../app');
const ai = process.argv.indexOf('--out');
const OUT = path.resolve(ai > 0 ? process.argv[ai + 1] : path.join(HERE, 'out-ef'));
const DARK = process.argv.includes('--dark');
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
fs.mkdirSync(OUT, { recursive: true });
const MIME = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.wasm': 'application/wasm', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.json': 'application/json' };
const server = http.createServer((q, r) => {
  const p = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  if (!p.startsWith(ROOT)) { r.writeHead(403); return r.end(); }
  fs.readFile(p, (e, b) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); r.end(b); });
}).listen(0);
const bridge = fs.readFileSync(path.join(HERE, 'mock-bridge.js'), 'utf8');
const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });
const ctx = await browser.newContext({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, bypassCSP: true, colorScheme: DARK ? 'dark' : 'light' });
const pg = await ctx.newPage();
const errors = [];
pg.on('pageerror', (e) => errors.push(String(e.message || e).split('\n')[0]));
await pg.addInitScript(({ dark }) => {
  window.__ACM_TEST = { platform: 'ios', files: {} };
  try { localStorage.setItem('acm.lang', 'ro'); localStorage.setItem('acm.lang.chosen', '1'); localStorage.setItem('acm.account.later', '1'); if (dark) localStorage.setItem('acm.theme', 'dark'); } catch (e) {}
  document.addEventListener('DOMContentLoaded', () => document.documentElement.classList.add('ios-glass'));
}, { dark: DARK });
await pg.addInitScript(bridge);
await pg.goto(`http://127.0.0.1:${server.address().port}/index.html`);
await pg.waitForTimeout(2500);
if (DARK) await pg.evaluate(() => Theme.set('dark'));
let n = 0;
const shot = async (name) => { await pg.waitForTimeout(500); await pg.screenshot({ path: path.join(OUT, `${String(++n).padStart(2, '0')}-${name}.png`) }); console.log('•', name); };
const closeAll = async () => { for (let i = 0; i < 4 && (await pg.locator('#modal-root .backdrop').count()); i++) { await pg.evaluate(() => UI.back()); await pg.waitForTimeout(300); } };

await pg.evaluate(() => {
  const u = { uid: 'ME', displayName: 'Ana Popescu', email: 'ana@exemplu.ro', emailVerified: true, providerData: [{ providerId: 'password' }] };
  Account.current = () => u; Account.needsVerification = () => false; Account.wordsSaved = () => true;
  Account.call = async (name) => (name === 'anafInfo' ? { ready: true, env: 'test' } : name === 'anafStart' ? { url: 'https://logincert.anaf.ro/x', state: 'a'.repeat(48), env: 'test' } : { ready: false });
  const b = Biz.save({ ...Biz.blankProfile('general'), name: 'Atelier Popescu', legal: 'ATELIER POPESCU SRL', cui: 'RO14255667', regcom: 'J05/123/2026', address: 'Str. Republicii nr. 10', city: 'Oradea', county: 'Bihor', vatPayer: true });
  const mk = (n, client, total, st, extra = {}) => { const id = Biz.addDoc({ bizId: b.id, type: 'invoice', series: 'FCT', number: n, client, total, currency: 'RON', date: new Date(Date.now() - (8 - n) * 864e5).toISOString().slice(0, 10), path: '', paid: true, data: { client: { name: client }, lines: [] } }); if (st) Biz.updateDoc(id, { efactura: { status: st, ...extra } }); };
  mk(1, 'Construct Bihor SRL', 4130.5, 'ok', { index: '5012345678', env: 'test' });
  mk(2, 'Ion Ionescu', 350, 'sent', { index: '5012345679', env: 'test', sentAt: Date.now() });
  mk(3, 'Mobila Nord SRL', 1890, 'rejected', { msg: ['E: validari globale  eroare: [BR-RO-110] Codul subdiviziunii țării pentru cumpărător trebuie să fie de forma RO-XX'] });
  mk(4, 'Maria Pop', 120, 'incomplete', { msg: ['Completează adresa clientului (stradă, număr).', 'Alege județul clientului.'] });
  mk(5, 'Lemn Prod SRL', 980, 'queued');
});
await pg.evaluate(() => App.showView('invoices')); await pg.waitForTimeout(600);
await pg.evaluate(() => { const r = document.querySelector('#inv-list-root .ef-chip'); r && r.closest('.list-card, .row').scrollIntoView({ block: 'start' }); window.scrollBy(0, -120); });
await shot('lista-facturi');
await pg.evaluate(() => { const d = Biz.docs().find((x) => x.number === 3); EFactura.details(d); }); await shot('detalii-respinsa'); await closeAll();
await pg.evaluate(() => App.showView('settings')); await pg.waitForTimeout(400);
await pg.evaluate(() => { const r = [...document.querySelectorAll('.srow')].find((x) => /e-Factura/.test(x.innerText)); r && r.scrollIntoView({ block: 'center' }); });
await shot('setari-neconectat');
await pg.evaluate(() => { const r = [...document.querySelectorAll('.srow')].find((x) => /e-Factura/.test(x.innerText)); r.click(); }); await pg.waitForTimeout(600); await shot('conectare-dialog'); await closeAll();
await pg.evaluate(() => Host.secureSet('acm.anaf', new TextEncoder().encode(JSON.stringify({ access: 'x', refresh: 'y', expiresIn: 7776000, at: Date.now(), env: 'test' })), { quiet: true }));
await pg.evaluate(() => App.renderView()); await pg.waitForTimeout(600);
await pg.evaluate(() => { const r = [...document.querySelectorAll('.srow')].find((x) => /e-Factura/.test(x.innerText)); r && r.scrollIntoView({ block: 'center' }); });
await shot('setari-conectat');
await pg.evaluate(() => { Invoice.openSettings(Biz.active().id); }); await pg.waitForTimeout(500);
await pg.evaluate(() => { const l = [...document.querySelectorAll('#modal-root .fld-l')].find((x) => /Județ/.test(x.innerText)); l && l.scrollIntoView({ block: 'center' }); });
await shot('date-firma-judet'); await closeAll();
await pg.evaluate(() => { Invoice.open(); }); await pg.waitForTimeout(800);
await pg.evaluate(() => { const l = [...document.querySelectorAll('#inv-form .fld-l')].find((x) => /Localitate/.test(x.innerText)); l && l.scrollIntoView({ block: 'center' }); });
await shot('factura-client');
const v = await pg.evaluate(() => {
  const inp = document.querySelector('#inv-form [data-path="client.name"]'); inp.value = 'Mobila Nord SRL'; inp.dispatchEvent(new Event('input'));
  const q = document.querySelector('#inv-form .quick-add input'); return !!q;
});
await pg.evaluate(() => { const i = document.querySelectorAll('#inv-form .quick-add input'); i[0].value = 'Montaj mobilier'; i[2].value = '500'; const b = document.querySelector('#inv-form .quick-add button'); b && b.click(); });
await pg.waitForTimeout(300);
await pg.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /Creează/.test(x.innerText) && x.offsetParent); b && b.click(); });
await pg.waitForTimeout(900); await shot('avertizare-spv');
console.log(errors.length ? 'ERRORS: ' + errors.join(' | ') : 'no page errors', v);
await browser.close(); server.close();
