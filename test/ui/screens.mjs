// Automatic visual check of ACM Docs on many screens: the real app page, in Chromium, with the phone
// bridge simulated (test/ui/mock-bridge.js). For every device × language × screen it saves a
// screenshot and looks for layout problems: text cut off or outside the screen, overlapping text,
// horizontal scrolling of the page, text too small, buttons too small to tap.
//
//   node test/ui/screens.mjs [--quick] [--out dir] [--devices a,b] [--langs ro,en] [--steps home,files]
// Output: <out>/report.json, <out>/report.html and the screenshots.
import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../app');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const QUICK = process.argv.includes('--quick');
const OUT = path.resolve(arg('out', path.join(HERE, 'out')));
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';

// ---------------------------------------------------------------- devices (CSS pixels)
const DEVICES = [
  { id: 'iphone-se', label: 'iPhone SE', w: 375, h: 667, dpr: 2, platform: 'ios', glass: false, touch: true },
  { id: 'iphone-17', label: 'iPhone 17 (iOS 26)', w: 402, h: 874, dpr: 3, platform: 'ios', glass: true, touch: true },
  { id: 'iphone-17-pro-max', label: 'iPhone 17 Pro Max (iOS 26)', w: 440, h: 956, dpr: 3, platform: 'ios', glass: true, touch: true },
  { id: 'android-small', label: 'Android mic', w: 360, h: 780, dpr: 3, platform: 'android', glass: false, touch: true },
  { id: 'android-large', label: 'Android mare', w: 412, h: 915, dpr: 2.625, platform: 'android', glass: false, touch: true },
  { id: 'ipad-mini', label: 'iPad mini', w: 744, h: 1133, dpr: 2, platform: 'ios', glass: true, touch: true },
  { id: 'ipad-landscape', label: 'iPad 11" orizontal', w: 1194, h: 834, dpr: 2, platform: 'ios', glass: true, touch: true },
];
const LANGS = ['ro', 'en', 'de', 'ja'];

// ---------------------------------------------------------------- what to show on each screen
const signedIn = `(() => {
  const A = window.__lib.acmcrypto;
  const meId = A.deriveIdentity(A.generateMnemonic()), bob = A.deriveIdentity(A.generateMnemonic());
  const u = { uid: 'ME', displayName: 'Ana Popescu', email: 'ana.popescu@gmail.com', emailVerified: true, providerData: [{ providerId: 'password' }] };
  Account.current = () => u; Account.needsVerification = () => false; Account.unlock = async () => meId; Account.handle = () => 'ana'; Account.fingerprint = () => meId.fingerprint;
  Account.wordsSaved = () => true; Account.twoStep = () => false;
  Account.profileOf = async (uid) => ({ uid, handle: uid === 'BOB' ? 'bob' : 'ana', name: uid === 'BOB' ? 'Bogdan Ionescu' : 'Ana Popescu', key: (uid === 'BOB' ? bob : meId).bundle, fp: (uid === 'BOB' ? bob : meId).fingerprint });
  Devices.myDevice = () => 'd1'; Devices.ensure = async () => 'ok';
  AcmShare.ensureAccount = async () => true;
  const GB = 2 ** 30, MB = 2 ** 20;
  const st = { plan: 'personal', until: Date.now() + 200 * 864e5, source: 'stripe', period: 'year', devices: { used: 1, limit: 2 }, cloud: { used: 1.2 * GB, limit: 5 * GB }, month: '2026-10',
    usage: { docs: { used: 12, limit: 60 }, scans: { used: 4, limit: 60 }, invoices: { used: 9, limit: 30 }, acmSend: { used: 2, limit: 30 }, acmOpen: { used: 7, limit: 100 } },
    payments: true, manage: true, token: null,
    promos: [{ id: 'p1', kind: 'discount', title: 'Black Friday', percent: 30, months: 3, plans: ['pro'], periods: ['year'], end: Date.now() + 9 * 864e5 }] };
  Account.call = async (n) => { if (n === 'planStatus') return st; throw new Error('offline (UI test)'); };
  const now = Date.now(), ts = (m) => ({ toMillis: () => now - m });
  const seal = (from, obj) => Host.toB64(A.seal({ bytes: new TextEncoder().encode(JSON.stringify(obj)), name: 'm' }, from, [meId.bundle, bob.bundle]));
  const chats = [{ id: 'c1', kind: 'direct', members: ['BOB', 'ME'], lastAt: ts(60e3), lastFrom: 'BOB', blocked: [] }];
  const msgs = [
    { id: 'm1', from: 'BOB', kind: 'text', at: ts(600e3), box: seal(bob, { t: 'text', text: 'Bună! Ți-am trimis contractul semnat, verifică te rog pagina 2.' }) },
    { id: 'm2', from: 'BOB', kind: 'file', fid: 'a'.repeat(32), at: ts(590e3), box: seal(bob, { t: 'file', name: 'Contract-prestari-servicii-2026-final.pdf', size: 482113 }) },
    { id: 'm3', from: 'ME', kind: 'text', at: ts(300e3), box: seal(meId, { t: 'text', text: 'Mulțumesc, îl verific acum și revin.' }) },
  ];
  const snap = (arr) => ({ docs: arr.map((d) => ({ id: d.id, ref: d, data: () => d })), size: arr.length, docChanges: () => [], metadata: { hasPendingWrites: false } });
  const fsm = { collection: (db, ...p) => ({ p }), doc: (db, ...p) => ({ p }), query: (c) => ({ p: c.p }), where: () => 0, orderBy: () => 0, limit: () => 0,
    onSnapshot: (q, cb) => { setTimeout(() => cb(q.p.length === 1 ? snap(q.p[0] === 'chats' ? chats : []) : snap(msgs.slice().reverse())), 20); return () => {}; },
    getDoc: async () => ({ exists: () => false, data: () => ({}) }), getDocs: async () => snap([]), setDoc: async () => {}, updateDoc: async () => {}, deleteDoc: async () => {}, serverTimestamp: () => 0 };
  Account.internals = () => ({ F: { firestore: fsm }, db: {}, auth: {} });
  Contacts.list = () => [{ uid: 'BOB', handle: 'bob', name: 'Bogdan Ionescu', fp: bob.fingerprint, key: Host.toB64(bob.bundle), verified: true }];
  Contacts.get = (uid) => (uid === 'BOB' ? Contacts.list()[0] : null);
  AcmShare.renderHome();
})()`;
const fresh = `(() => { const u = { uid: 'NEW', email: 'ana.popescu@gmail.com', emailVerified: false, providerData: [{ providerId: 'password' }] };
  Account.current = () => u; Account.needsVerification = () => true; Account.verifySentAt = () => Date.now() - 20000; Account.sendVerification = async () => {}; Account.verifyMethod = () => 'code'; })()`;

const STEPS = [
  { id: 'home', label: 'Acasă', run: async () => {} },
  { id: 'files', label: 'Fișiere', run: async (p) => p.evaluate(() => App.showView('files')) },
  { id: 'invoices', label: 'Facturi (listă)', run: async (p) => p.evaluate(() => App.showView('invoices')) },
  { id: 'settings', label: 'Setări', run: async (p) => p.evaluate(() => App.showView('settings')) },
  { id: 'new-menu', label: 'Meniul „+”', run: async (p) => p.click((await p.isVisible('#tab-new')) ? '#tab-new' : '#side-new') },
  { id: 'invoice-editor', label: 'Factură nouă', run: async (p) => p.click('#act-invoice') },
  { id: 'pdf-editor', label: 'Editor PDF', run: async (p) => p.evaluate(() => App.openPath('/docs/Contract.pdf')), wait: 2500 },
  { id: 'doc-editor', label: 'Document nou (.docx)', run: async (p) => p.click('#act-doc'), wait: 1800 },
  { id: 'sheet-editor', label: 'Tabel nou (.xlsx)', run: async (p) => p.click('#act-sheet'), wait: 1800 },
  { id: 'slides-editor', label: 'Prezentare nouă (.pptx)', run: async (p) => p.click('#act-slides'), wait: 1800 },
  { id: 'signin', label: 'Intră în cont', run: async (p) => p.evaluate(() => AccountUI.show('signin')) },
  { id: 'signup', label: 'Cont nou', run: async (p) => p.evaluate(() => AccountUI.show('signup')) },
  { id: 'verify', label: 'Confirmă emailul', run: async (p) => { await p.evaluate(fresh); await p.evaluate(() => AccountUI.show('verify')); } },
  { id: 'home-signed', label: 'Acasă (cu cont)', run: async (p) => p.evaluate(signedIn) },
  { id: 'settings-signed', label: 'Setări (cu cont)', run: async (p) => { await p.evaluate(signedIn); await p.evaluate(() => App.showView('settings')); } },
  { id: 'plans', label: 'Abonament', run: async (p) => { await p.evaluate(signedIn); await p.evaluate(() => { Plan.show(); }); }, wait: 1200 },
  { id: 'security', label: 'Securitate', run: async (p) => { await p.evaluate(signedIn); await p.evaluate(() => { Security.show(); }); } },
  { id: 'chat-list', label: 'Mesaje', run: async (p) => { await p.evaluate(signedIn); await p.evaluate(() => { Chat.show(); }); }, wait: 1200 },
  { id: 'chat-conv', label: 'Conversație', run: async (p) => { await p.evaluate(signedIn); await p.evaluate(() => { Chat.show(); }); await p.waitForTimeout(700); await p.evaluate(() => { Chat.openChat('c1'); }); }, wait: 1800 },
];

// ---------------------------------------------------------------- the layout audit (runs in the page)
function audit() {
  const vw = innerWidth, vh = innerHeight, out = [];
  const de = document.documentElement;
  if (de.scrollWidth > vw + 1) out.push({ type: 'page-scroll-x', sev: 2, text: `pagina are ${de.scrollWidth - vw}px în plus pe orizontală` });
  const shown = (el) => {
    for (let e = el; e && e !== document.body; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) < 0.05) return false;
      if (e.hidden || e.classList.contains('hidden')) return false;
    }
    return true;
  };
  // only what is on top: the open dialog / page if there is one
  const layers = [...document.querySelectorAll('#modal-root .backdrop, .chat-page, .auth, #busy:not(.hidden), .applock')].filter((x) => shown(x));
  const scope = layers.length ? layers[layers.length - 1] : document.body;
  const name = (el) => { const t = (el.innerText || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' '); return t.slice(0, 70); };
  const where = (el) => { const p = []; for (let e = el; e && e !== document.body && p.length < 4; e = e.parentElement) p.unshift(e.id ? '#' + e.id : e.tagName.toLowerCase() + (e.classList[0] ? '.' + e.classList[0] : '')); return p.join(' > '); };
  const scrollableX = (el) => { for (let e = el.parentElement; e; e = e.parentElement) { const s = getComputedStyle(e); if ((s.overflowX === 'auto' || s.overflowX === 'scroll') && e.scrollWidth > e.clientWidth + 1) return true; } return false; };
  const texts = [];
  for (const el of scope.querySelectorAll('*')) {
    if (el.closest('svg, canvas, .pdf-page, .pg, #pages, .sheet-grid, .xgrid, [contenteditable="true"], textarea, input, select, option')) continue;
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 0);
    if (!own) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1 || r.bottom <= 0 || r.top >= vh) continue;
    if (!shown(el)) continue;
    const s = getComputedStyle(el);
    texts.push({ el, r });
    if ((r.right > vw + 1 || r.left < -1) && !scrollableX(el)) out.push({ type: 'text-offscreen', sev: 3, text: name(el), where: where(el), px: Math.round(Math.max(r.right - vw, -r.left)) });
    if (el.scrollWidth > el.clientWidth + 2 && s.overflowX !== 'visible' && s.textOverflow !== 'ellipsis' && !/auto|scroll/.test(s.overflowX)) out.push({ type: 'text-clipped', sev: 3, text: name(el), where: where(el), px: el.scrollWidth - el.clientWidth });
    if (el.scrollWidth > el.clientWidth + 2 && s.textOverflow === 'ellipsis') out.push({ type: 'text-ellipsis', sev: 1, text: name(el), where: where(el) });
    // cut by a container that hides overflow
    for (let a = el.parentElement; a && a !== scope; a = a.parentElement) {
      const as = getComputedStyle(a);
      if (as.overflow === 'visible' && as.overflowX === 'visible' && as.overflowY === 'visible') continue;
      if (/auto|scroll/.test(as.overflowY) || /auto|scroll/.test(as.overflowX)) break;
      const ar = a.getBoundingClientRect();
      if (r.right > ar.right + 2 || r.left < ar.left - 2 || r.bottom > ar.bottom + 2 || r.top < ar.top - 2) { out.push({ type: 'text-cut', sev: 3, text: name(el), where: where(el) }); }
      break;
    }
    const fsz = parseFloat(s.fontSize);
    if (fsz < 10.5) out.push({ type: 'tiny-text', sev: 1, text: name(el), where: where(el), px: fsz });
  }
  // overlapping text (neither inside the other)
  // measured on the actual lines of text (not the element box), only between texts of the same
  // layer: content scrolling under a floating bar or a sheet is intended, not a defect
  const layer = (el) => { for (let e = el; e; e = e.parentElement) { const cs = getComputedStyle(e), p = cs.position; if (p === 'fixed' || p === 'sticky' || (p === 'absolute' && (cs.backdropFilter !== 'none' || Number(cs.zIndex) >= 10))) return e; } return null; };
  const lines = (el) => { const rs = []; for (const n of el.childNodes) if (n.nodeType === 3 && n.textContent.trim()) { const g = document.createRange(); g.selectNodeContents(n); rs.push(...[...g.getClientRects()].filter((q) => q.width > 1 && q.height > 1)); } return rs; };
  for (const t of texts) { t.lines = lines(t.el); t.layer = layer(t.el); }
  const visibleAt = (x, y, a, b) => { const top = document.elementFromPoint(x, y); return top && (a.contains(top) || b.contains(top) || top.contains(a) || top.contains(b)); };
  for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) {
    const a = texts[i], b = texts[j];
    if (a.el.contains(b.el) || b.el.contains(a.el) || a.layer !== b.layer) continue;
    let hit = false;
    for (const p of a.lines) { for (const q of b.lines) {
      const x = Math.min(p.right, q.right) - Math.max(p.left, q.left), y = Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top);
      if (x <= 2 || y <= 3) continue;
      if (x * y > 0.2 * Math.min(p.width * p.height, q.width * q.height) && visibleAt((Math.max(p.left, q.left) + Math.min(p.right, q.right)) / 2, (Math.max(p.top, q.top) + Math.min(p.bottom, q.bottom)) / 2, a.el, b.el)) hit = true;
    } if (hit) break; }
    if (hit) out.push({ type: 'text-overlap', sev: 3, text: name(a.el) + '  ⟷  ' + name(b.el), where: where(a.el) });
  }
  // tap targets
  if (matchMedia('(pointer: coarse)').matches) {
    for (const el of scope.querySelectorAll('button, a[href], [role="button"], input[type="checkbox"], select')) {
      if (!shown(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.bottom <= 0 || r.top >= vh) continue;
      if (r.width < 32 || r.height < 32) out.push({ type: 'small-target', sev: 1, text: name(el) || el.className, where: where(el), px: Math.round(Math.min(r.width, r.height)) });
    }
  }
  // the same problem reported once
  const seen = new Set();
  return out.filter((x) => { const k = x.type + '|' + x.text + '|' + x.where; if (seen.has(k)) return false; seen.add(k); return true; });
}

// ---------------------------------------------------------------- runner
const MIME = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.wasm': 'application/wasm', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.json': 'application/json' };
const server = http.createServer((q, r) => {
  const p = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  if (!p.startsWith(ROOT)) { r.writeHead(403); return r.end(); }
  fs.readFile(p, (e, b) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); r.end(b); });
}).listen(0);
const PORT = server.address().port;
const bridge = fs.readFileSync(path.join(HERE, 'mock-bridge.js'), 'utf8');
const pdf = fs.readFileSync(path.join(HERE, 'fixtures', 'Contract.pdf')).toString('base64');

const pick = (list, key) => { const v = arg(key); return v ? list.filter((x) => v.split(',').includes(x.id || x)) : list; };
let devices = pick(DEVICES, 'devices'), langs = pick(LANGS, 'langs'), steps = pick(STEPS, 'steps');
if (QUICK) { devices = devices.filter((d) => d.id === 'iphone-17'); langs = ['ro']; }
// other languages: on two phones (long German words, Japanese)
const jobs = [];
for (const lang of langs) for (const d of devices) {
  if (lang !== 'ro' && !['iphone-se', 'iphone-17'].includes(d.id)) continue;
  for (const s of steps) jobs.push({ lang, d, s });
}
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROME });
const results = [];
async function runJob({ lang, d, s }) {
  const ctx = await browser.newContext({ viewport: { width: d.w, height: d.h }, deviceScaleFactor: d.dpr, isMobile: d.w < 700, hasTouch: d.touch, colorScheme: 'light', bypassCSP: true });
  const pg = await ctx.newPage();
  const errors = [];
  pg.on('pageerror', (e) => errors.push(String(e.message || e)));
  await pg.addInitScript(({ lang, platform, glass, pdf }) => {
    window.__ACM_TEST = { platform, files: { '/docs/Contract.pdf': pdf }, openPick: '/docs/Contract.pdf' };
    try { localStorage.setItem('acm.lang', lang); localStorage.setItem('acm.lang.chosen', '1'); } catch (e) {}
    if (glass) document.addEventListener('DOMContentLoaded', () => document.documentElement.classList.add('ios-glass'));
  }, { lang, platform: d.platform, glass: d.glass, pdf });
  await pg.addInitScript(bridge);
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => { const s = document.getElementById('splash'); return !s || s.classList.contains('hidden') || getComputedStyle(s).opacity === '0' || s.style.display === 'none'; }, null, { timeout: 15000 }).catch(() => {});
  await pg.waitForTimeout(900);
  // the language chooser of the very first start, if it shows
  await pg.evaluate(() => { const a = document.getElementById('auth'); if (a && window.I18n && I18n.chosen) a.remove(); }).catch(() => {});
  let failed = null;
  try { await s.run(pg); } catch (e) { failed = String(e.message || e).split('\n')[0]; }
  await pg.waitForTimeout(s.wait || 900);
  const issues = failed ? [] : await pg.evaluate(audit).catch((e) => [{ type: 'audit-error', sev: 2, text: String(e) }]);
  const file = path.join(lang, d.id, s.id + '.png');
  fs.mkdirSync(path.join(OUT, lang, d.id), { recursive: true });
  await pg.screenshot({ path: path.join(OUT, file) });
  results.push({ lang, device: d.id, deviceLabel: d.label, step: s.id, stepLabel: s.label, shot: file, failed, errors, issues });
  await ctx.close();
}
const CONC = 4;
let next = 0;
await Promise.all(Array.from({ length: CONC }, async () => { while (next < jobs.length) { const j = jobs[next++]; await runJob(j); process.stdout.write('.'); } }));
await browser.close(); server.close();
console.log('');

// ---------------------------------------------------------------- report
results.sort((a, b) => (a.lang + a.device + a.step).localeCompare(b.lang + b.device + b.step));
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(results, null, 1));
const T = { 'page-scroll-x': 'Pagina se mișcă pe orizontală', 'text-offscreen': 'Text în afara ecranului', 'text-clipped': 'Text tăiat', 'text-cut': 'Text tăiat de chenar', 'text-overlap': 'Texte suprapuse', 'tiny-text': 'Text foarte mic', 'small-target': 'Buton prea mic pentru deget', 'text-ellipsis': 'Text scurtat cu „…”', 'audit-error': 'Eroare de verificare' };
const esc = (x) => String(x == null ? '' : x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const serious = results.reduce((n, r) => n + r.issues.filter((i) => i.sev >= 2).length, 0);
let html = `<!doctype html><meta charset="utf-8"><title>ACM Docs · verificare ecrane</title><style>body{font:14px system-ui,sans-serif;margin:24px;color:#1b1d22}h2{margin-top:30px}.row{display:flex;gap:16px;align-items:flex-start;border-top:1px solid #ddd;padding:12px 0}img{width:220px;border:1px solid #ccc;border-radius:8px}.i{font-size:12.5px;margin:2px 0}.s3{color:#b42323}.s2{color:#c2410c}.s1{color:#777}.err{color:#b42323;font-weight:600}</style>
<h1>ACM Docs · verificare automată pe ecrane</h1><p>${results.length} capturi · ${serious} probleme serioase · ${results.filter((r) => r.failed || r.errors.length).length} ecrane cu erori</p>`;
let cur = '';
for (const r of results) {
  const g = `${r.lang.toUpperCase()} · ${r.deviceLabel}`;
  if (g !== cur) { html += `<h2>${esc(g)}</h2>`; cur = g; }
  html += `<div class="row"><a href="${esc(r.shot)}"><img src="${esc(r.shot)}"></a><div><b>${esc(r.stepLabel)}</b>`;
  if (r.failed) html += `<div class="err">Nu s-a putut deschide: ${esc(r.failed)}</div>`;
  for (const e of r.errors) html += `<div class="err">Eroare în pagină: ${esc(e)}</div>`;
  for (const i of r.issues.filter((x) => x.sev >= 2).concat(r.issues.filter((x) => x.sev < 2).slice(0, 6))) html += `<div class="i s${i.sev}">${esc(T[i.type] || i.type)}${i.px ? ` (${i.px}px)` : ''}: „${esc(i.text)}” <small>${esc(i.where || '')}</small></div>`;
  html += '</div></div>';
}
fs.writeFileSync(path.join(OUT, 'report.html'), html);
console.log(`${results.length} capturi, ${serious} probleme serioase → ${path.join(OUT, 'report.html')}`);
