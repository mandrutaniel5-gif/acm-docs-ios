// Without internet: scans, documents and invoices go ahead within the month's limit of the plan, counted on the
// device, and are counted on the server once the internet is back.   node test/ui/offline-plan.mjs
import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../app');
const CHROME = process.env.CHROME || (process.platform === 'win32' && fs.existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe') ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined);
const MIME = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.wasm': 'application/wasm', '.png': 'image/png', '.woff2': 'font/woff2' };
const server = http.createServer((q, r) => {
  const p = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(p, (e, b) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); r.end(b); });
}).listen(0);
const browser = await chromium.launch({ executablePath: CHROME });
const page = await (await browser.newContext({ bypassCSP: true })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.addInitScript(() => { window.__ACM_TEST = { platform: 'android', files: {} }; localStorage.setItem('acm.lang', 'ro'); localStorage.setItem('acm.lang.chosen', '1'); });
await page.addInitScript(fs.readFileSync(path.join(HERE, 'mock-bridge.js'), 'utf8'));
await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
await page.waitForTimeout(2500);
let failed = 0;
const check = async (name, fn) => { try { await fn(); console.log('✓', name); } catch (e) { failed++; console.log('✗', name, '—', String(e.message || e).split('\n')[0]); } };

// a signed-in account on the Basic plan (3 scans a month), and no internet
await page.evaluate(() => {
  document.getElementById('auth')?.remove();
  const u = { uid: 'U1', email: 'a@b.ro', emailVerified: true };
  Account.current = () => u; Account.needsVerification = () => false;
  Devices.myDevice = () => 'd1';
  window.__net = false; window.__calls = [];
  Devices.ensure = async () => (window.__net ? 'ok' : 'offline');
  Account.call = async (name, data) => { if (!window.__net) throw new Error('offline'); window.__calls.push([name, data]); if (name === 'planStatus') return { plan: 'basic', month: new Date().toISOString().slice(0, 7), usage: { scans: { used: 2, limit: 3 } }, plans: null, token: JSON.parse(localStorage.getItem('acm.plan.tok.U1')) }; return { ok: true, used: 1, limit: 3, token: JSON.parse(localStorage.getItem('acm.plan.tok.U1')) }; };
});

await check('without internet and without a recent server token: nothing goes ahead (blocking the server gives nothing)', async () => {
  const p = page.evaluate(() => Plan.allow('scans', 'no-token'));
  await page.waitForSelector('.modal', { timeout: 5000 });
  assert.match(await page.textContent('.modal'), /internet/);
  await page.click('.modal .actions .btn:last-child');
  assert.equal(await p, false);
});
// the server's signed note of the last contact (the app checks its signature; here that check is stood in for)
await page.evaluate(() => {
  const body = btoa(JSON.stringify({ v: 1, u: 'U1', d: 'd1', p: 'basic', e: Date.now() + 864e5, i: Date.now() }));
  localStorage.setItem('acm.plan.tok.U1', JSON.stringify(body + '.c2lnbg=='));
  window.__lib.acmcrypto = { ...window.__lib.acmcrypto, verifyEd: () => true };
});
await check('without internet: the month\'s scans go ahead', async () => {
  const r = await page.evaluate(async () => [await Plan.allow('scans', 'scan-1'), await Plan.allow('scans', 'scan-2'), await Plan.allow('scans', 'scan-3')]);
  assert.deepEqual(r, [true, true, true]);
});
await check('the same document again: not counted twice', async () => {
  assert.equal(await page.evaluate(() => Plan.allow('scans', 'scan-1')), true);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('acm.plan.pending.U1')).length), 3);
});
await check('past the plan\'s limit: stopped, with the limit screen (no "you need internet" dead end)', async () => {
  const p = page.evaluate(() => Plan.allow('scans', 'scan-4'));
  await page.waitForSelector('.modal.plan-ask', { timeout: 5000 });
  assert.match(await page.textContent('.modal.plan-ask'), /limita lunii/);
  await page.click('.modal.plan-ask .actions .btn:last-child');
  assert.equal(await p, false);
});
await check('other kinds of actions keep their own limit', async () => {
  assert.equal(await page.evaluate(() => Plan.allow('invoices', 'inv-1')), true);
});
await check('internet back: what was done is counted on the server, once each', async () => {
  await page.evaluate(async () => { window.__net = true; await Plan.flush(); });
  const calls = await page.evaluate(() => window.__calls.filter((c) => c[0] === 'useQuota').map((c) => c[1].action));
  assert.deepEqual(calls.sort(), ['invoices', 'scans', 'scans', 'scans']);
  assert.equal(await page.evaluate(() => localStorage.getItem('acm.plan.pending.U1')), null);
});
await check('a status known from the server counts: 2 used of 3 leaves one action offline', async () => {
  await page.evaluate(async () => { await Plan.refresh(); window.__net = false; localStorage.removeItem('acm.plan.pending.U1'); });
  const r = await page.evaluate(async () => [await Plan.allow('scans', 'x-1')]);
  assert.deepEqual(r, [true]);
  const p = page.evaluate(() => Plan.allow('scans', 'x-2'));
  await page.waitForSelector('.modal.plan-ask', { timeout: 5000 });
  await page.click('.modal.plan-ask .actions .btn:last-child');
  assert.equal(await p, false);
});
await check('no script errors', async () => assert.deepEqual(errors, []));
await browser.close(); server.close();
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
