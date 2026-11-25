// The control panel with made-up data (no server): screenshots of the main screens, light and dark.
//   node test/ui/control-shots.mjs [--out dir]
import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.resolve(HERE, '../../site');
const i = process.argv.indexOf('--out');
const OUT = path.resolve(i > 0 ? process.argv[i + 1] : path.join(HERE, 'out-control'));
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));

// a stand-in for the Firebase bundle: signed in, and the "admin" function answers with sample data
const MOCK = `(() => {
  const now = Date.now(), d = 864e5;
  const shot = (() => { const c = document.createElement('canvas'); c.width = 390; c.height = 844; const x = c.getContext('2d'); const g = x.createLinearGradient(0, 0, 0, 844); g.addColorStop(0, '#eef3ff'); g.addColorStop(1, '#f7eefc'); x.fillStyle = g; x.fillRect(0, 0, 390, 844); x.fillStyle = '#1d1d1f'; x.font = 'bold 30px sans-serif'; x.fillText('ACM Docs', 20, 60); x.fillStyle = '#007aff'; x.fillRect(20, 300, 350, 150); x.strokeStyle = '#ff2d55'; x.lineWidth = 5; x.beginPath(); x.ellipse(195, 520, 120, 40, 0, 0, 7); x.stroke(); return c.toDataURL('image/jpeg', .8); })();
  const bugs = [
    { id: 'a'.repeat(32), from: 'U1', handle: 'maria', name: 'Maria Ionescu', cat: 'visual', sub: 'layout', sev: 'medium', text: 'Pe pagina Facturi, butonul „Emite” e tăiat pe jumătate pe iPhone SE, nu se vede textul complet.', meta: { version: '2.6.12', platform: 'ios', model: 'iPhone iOS 26.1', screen: '375×667@2', view: 'invoices', theme: 'dark', lang: 'ro', online: true, errors: [] }, shot: true, status: 'new', at: now - 36e5 },
    { id: 'b'.repeat(32), from: 'U2', handle: 'andrei', name: 'Andrei Pop', cat: 'technical', sub: 'crash', sev: 'high', text: 'Aplicația se închide când deschid un PDF de 80 de pagini și dau zoom repede.', meta: { version: '2.6.12', platform: 'android', model: 'SM-G973F Android 12', screen: '412×869@2.6', view: 'editor', errors: ['2026-11-25T10:01:02Z 2.6.12 RangeError: Maximum call stack size exceeded\\n    at render (pdf.js:812)'] }, shot: true, status: 'new', at: now - 2 * 36e5 },
    { id: 'c'.repeat(32), from: 'U1', handle: 'maria', name: 'Maria Ionescu', cat: 'idea', sub: 'idea', sev: 'low', text: 'Ar fi util să pot duplica o factură veche ca să nu completez iar clientul.', meta: { version: '2.6.12', platform: 'electron', screen: '1366×768@1' }, shot: false, status: 'new', at: now - 5 * 36e5 },
    { id: 'd'.repeat(32), from: 'U3', handle: 'elena', name: 'Elena D.', cat: 'technical', sub: 'sync', sev: 'medium', text: 'Documentul salvat pe telefon apare pe calculator abia după ce repornesc aplicația.', meta: { version: '2.6.11', platform: 'ios' }, shot: false, status: 'new', at: now - 26 * 36e5 },
  ];
  const DATA = {
    whoami: { uid: 'A', email: 'admin@acmcode.ro' },
    overview: { switches: { all: false, off: {} }, byPlan: { basic: 214, personal: 41, pro: 17, family: 4, business: 2 }, accounts: 278, new7: 19, new30: 63, active30: 171, openReports: 2,
      stripe: { active: true, mode: 'test', webhook: true, tax: false }, anomalies: [{ kind: 'cloud-high', uid: 'U9', handle: 'ion', used: 4.6 * 2 ** 30, limit: 5 * 2 ** 30, plan: 'personal' }] },
    bugReports: bugs, testers: [
      { uid: 'U1', handle: 'maria', name: 'Maria Ionescu', active: true, since: now - 12 * d, reports: 9, lastReport: now - 36e5 },
      { uid: 'U2', handle: 'andrei', name: 'Andrei Pop', active: true, since: now - 10 * d, reports: 4, lastReport: now - 2 * 36e5 },
      { uid: 'U3', handle: 'elena', name: 'Elena D.', active: true, since: now - 3 * d, reports: 1, lastReport: now - 26 * 36e5 }],
    bugShot: { shot },
  };
  const user = { email: 'admin@acmcode.ro', uid: 'A' };
  window.__lib = window.__lib || {};
  window.__lib.firebase = {
    initializeApp: () => ({}),
    auth: { initializeAuth: () => ({ currentUser: user, authStateReady: async () => {} }), indexedDBLocalPersistence: 1, browserLocalPersistence: 2, signOut: async () => {} },
    functions: { getFunctions: () => ({}), httpsCallable: () => async (v) => ({ data: v.op === 'bugReports' && v.status && v.status !== 'new' ? [] : DATA[v.op] }) },
  };
})();`;

const server = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  if (u === '/control/fb.js') { r.writeHead(200, { 'Content-Type': 'application/javascript' }); return r.end(MOCK); }
  const p = path.join(SITE, u.endsWith('/') ? u + 'index.html' : u);
  if (!p.startsWith(SITE)) { r.writeHead(403); return r.end(); }
  fs.readFile(p, (e, b) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': p.endsWith('.css') ? 'text/css' : p.endsWith('.js') ? 'application/javascript' : 'text/html' }); r.end(b); });
}).listen(0);
const PORT = server.address().port;
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROME });
let bad = 0;
for (const scheme of ['light', 'dark']) {
  for (const [w, hgt, tag] of [[1440, 900, 'desktop'], [390, 844, 'phone']]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: hgt }, deviceScaleFactor: tag === 'phone' ? 2 : 1, colorScheme: scheme });
    const pg = await ctx.newPage();
    pg.on('pageerror', (e) => { bad++; console.log('page error:', e.message); });
    await pg.goto(`http://127.0.0.1:${PORT}/control/`);
    await pg.waitForSelector('.nav');
    await pg.waitForTimeout(600);
    await pg.screenshot({ path: path.join(OUT, `${scheme}-${tag}-overview.png`) });
    await pg.click('[data-v=testers]');
    await pg.waitForSelector('.bug');
    await pg.waitForTimeout(400);
    await pg.screenshot({ path: path.join(OUT, `${scheme}-${tag}-testers.png`), fullPage: true });
    await pg.click('.bug');
    await pg.waitForSelector('.bug-shot img');
    await pg.waitForTimeout(400);
    await pg.screenshot({ path: path.join(OUT, `${scheme}-${tag}-report.png`) });
    await ctx.close();
  }
}
await browser.close(); server.close();
console.log(bad ? `${bad} page errors` : 'all passed', '→', OUT);
process.exit(bad ? 1 : 0);
