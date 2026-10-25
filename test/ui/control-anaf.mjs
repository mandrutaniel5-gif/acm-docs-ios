// Control panel › ANAF e-Factura, rendered with a stand-in for Firebase (no server reached).
//   node test/ui/control-anaf.mjs [--out dir]
import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.resolve(HERE, '../../site');
const ai = process.argv.indexOf('--out');
const OUT = path.resolve(ai > 0 ? process.argv[ai + 1] : path.join(HERE, 'out-control'));
fs.mkdirSync(OUT, { recursive: true });
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
const FAKE_FB = `window.__lib = { firebase: {
  initializeApp: () => ({}),
  auth: { initializeAuth: () => (window.__auth = { currentUser: null }), inMemoryPersistence: {}, signInWithEmailAndPassword: async (a, e) => { a.currentUser = { email: e }; }, signOut: async (a) => { a.currentUser = null; } },
  functions: { getFunctions: () => ({}), httpsCallable: () => async (d) => { window.__calls.push(d); const r = window.__mock[d.op]; return { data: typeof r === 'function' ? r(d) : r }; } },
} }; window.__calls = [];`;
const server = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  if (u === '/control/fb.js') { r.writeHead(200, { 'Content-Type': 'text/javascript' }); return r.end(FAKE_FB); }
  const p = path.join(SITE, u === '/control/' ? '/control/index.html' : u);
  fs.readFile(p, (e, b) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': p.endsWith('.js') ? 'text/javascript' : p.endsWith('.css') ? 'text/css' : 'text/html' }); r.end(b); });
}).listen(0);
const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });
let failed = 0;
const ok = (c, m) => { console.log(c ? '✓' : '✗', m); if (!c) failed++; };
for (const [w, hgt, tag] of [[1280, 900, 'desktop'], [402, 874, 'phone']]) {
  const pg = await (await browser.newContext({ viewport: { width: w, height: hgt }, deviceScaleFactor: 2 })).newPage();
  const errs = []; pg.on('pageerror', (e) => errs.push(String(e.message)));
  await pg.addInitScript(() => {
    let st = { active: false, env: 'test', clientIdEnd: null, checked: null, setAt: null, callback: 'https://acm-docs-52280.web.app/anaf/callback' };
    window.__mock = { whoami: { ok: true }, overview: {}, anaf: () => st,
      anafSet: (d) => { st = { ...st, active: true, env: d.env, clientIdEnd: '…' + d.clientId.slice(-4), checked: 'ok', setAt: Date.now() }; return { ok: true }; },
      anafEnv: (d) => { st = { ...st, env: d.env }; return { ok: true }; }, anafClear: () => { st = { ...st, active: false, clientIdEnd: null }; return { ok: true }; } };
  });
  await pg.goto(`http://127.0.0.1:${server.address().port}/control/`);
  await pg.fill('input[type=email]', 'admin@acm.ro'); await pg.fill('input[type=password]', 'x'); await pg.click('button[type=submit]');
  await pg.waitForTimeout(400);
  await pg.locator('nav button', { hasText: 'ANAF' }).first().click().catch(async () => { await pg.getByText('ANAF e-Factura').first().click(); });
  await pg.waitForTimeout(500);
  await pg.screenshot({ path: path.join(OUT, `${tag}-1-neconfigurat.png`), fullPage: true });
  ok(await pg.getByText('Neconfigurat').count(), `${tag}: status shows not configured`);
  await pg.fill('input[placeholder="Client ID"]', 'abcdef1234567890'); await pg.fill('input[placeholder="Client Secret"]', 'secret-value');
  await pg.getByText('Salvează și verifică').click(); await pg.waitForTimeout(600);
  await pg.screenshot({ path: path.join(OUT, `${tag}-2-configurat.png`), fullPage: true });
  ok(await pg.getByText('Configurat', { exact: true }).count(), `${tag}: configured after save`);
  ok(await pg.evaluate(() => window.__calls.some((c) => c.op === 'anafSet' && c.clientSecret === 'secret-value')), `${tag}: anafSet sent`);
  ok(await pg.evaluate(() => [...document.querySelectorAll('input')].every((i) => i.value !== 'secret-value')), `${tag}: secret cleared from the form`);
  ok(!errs.length, `${tag}: no page errors ${errs.join('|')}`);
}
await browser.close(); server.close();
console.log(failed ? failed + ' failed' : 'all passed');
process.exit(failed ? 1 : 0);
