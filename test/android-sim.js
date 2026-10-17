// Runs the app like on an Android phone: Chromium with a phone screen and touch,
// and a pretend window.AndroidBridge (files in memory, PDF made by Chromium).
// usage: node test/android-sim.js <steps.js>   (steps get (page, OUT, sim))
const { chromium } = require('playwright-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = process.env.OUT || '/tmp/claude-0/-home-claude/2da56d3d-6bc5-54d2-b358-3833c82145b9/scratchpad/sim';
fs.mkdirSync(OUT, { recursive: true });
const HS = fs.readdirSync('/opt/pw-browsers').find((d) => d.startsWith('chromium_headless_shell'));
const EXE = path.join('/opt/pw-browsers', HS, fs.readdirSync(path.join('/opt/pw-browsers', HS)).find((d) => d.startsWith('chrome')), 'headless_shell');

const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.png': 'image/png', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.gz': 'application/gzip', '.jpg': 'image/jpeg' };
const www = process.env.WWW || path.join(ROOT, 'dist/android/work/assets/www');

const server = http.createServer((req, res) => {
  const p = path.join(www, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(p, (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
    res.end(data);
  });
});

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'ro-RO', colorScheme: process.env.DARK ? 'dark' : 'light' });
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.stack || e}`));

  // files given to the phone before start: name -> base64
  const preload = {};
  for (const f of (process.env.FILES || '').split(',').filter(Boolean)) preload['/sdcard/Download/' + path.basename(f)] = fs.readFileSync(f).toString('base64');
  for (const f of ['LiberationSans-Regular.ttf', 'LiberationSans-Bold.ttf', 'LiberationSerif-Regular.ttf']) preload['/system/fonts/' + f] = fs.readFileSync('/usr/share/fonts/truetype/liberation/' + f).toString('base64');

  const pending = { open: [], camera: [] };
  await page.exposeFunction('__simPdf', async (html, setup) => {
    const p2 = await ctx.newPage();
    await p2.setContent(html, { waitUntil: 'load' });
    const pdf = await p2.pdf({ width: setup.width / 1000 + 'in', height: setup.height / 1000 + 'in', printBackground: true,
      margin: { top: setup.top / 1000 + 'in', right: setup.right / 1000 + 'in', bottom: setup.bottom / 1000 + 'in', left: setup.left / 1000 + 'in' } });
    await p2.close();
    return pdf.toString('base64');
  });
  await page.exposeFunction('__simLog', (s) => logs.push('[sim] ' + s));
  await page.addInitScript((pre) => {
    const files = Object.assign({}, pre); // path -> base64
    const mt = {};
    const DOCS = '/sdcard/Documents/ACM Docs';
    window.__sim = { files, opened: [], shared: [], viewed: [], exported: [], nextOpen: null, nextCamera: null };
    const cb = (id, err, res) => setTimeout(() => window.__bridgeCb(id, err, res), 10);
    window.AndroidBridge = {
      info: () => JSON.stringify({ docs: DOCS, version: '2.0.0', sdk: 34, model: 'Sim', density: 2 }),
      readB64: (p) => { if (!(p in files)) throw new Error('Java exception: FileNotFound ' + p); return files[p]; },
      readAsset: (p) => { const x = new XMLHttpRequest(); x.open('GET', '/' + p, false); x.overrideMimeType('text/plain; charset=x-user-defined'); x.send(); let s = ''; for (let i = 0; i < x.responseText.length; i++) s += String.fromCharCode(x.responseText.charCodeAt(i) & 255); return btoa(s); },
      writeB64: (p, b) => { files[p] = b; mt[p] = Date.now(); return true; },
      isFile: (p) => p in files,
      listDir: (d) => JSON.stringify(Object.keys(files).filter((p) => p.startsWith(d + '/') && !p.slice(d.length + 1).includes('/')).map((p) => p.slice(d.length + 1))),
      mkdirs: () => true,
      mtime: (p) => mt[p] || (p in files ? 1700000000000 : 0),
      remove: (p) => delete files[p],
      fonts: () => JSON.stringify(Object.keys(files).filter((p) => p.startsWith('/system/fonts/')).map((p) => ({ name: p.split('/').pop().replace(/\.ttf$/, '').replace(/-/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2'), path: p }))),
      request: (id, op, args) => {
        const a = JSON.parse(args);
        if (op === 'startup') return cb(id, null, null);
        if (op === 'open') { const p = window.__sim.nextOpen; window.__sim.nextOpen = null; if (p) { const t = DOCS + '/Importate/' + p.split('/').pop(); files[t] = files[p]; return cb(id, null, t); } return cb(id, null, null); }
        if (op === 'camera') { const p = window.__sim.nextCamera; window.__sim.nextCamera = null; if (p) { const t = DOCS + '/Scanări/Scan.jpg'; files[t] = files[p]; return cb(id, null, t); } return cb(id, null, null); }
        if (op === 'images') { const list = (window.__sim.nextImages || []).map((p) => { const t = DOCS + '/cache/' + p.split('/').pop(); files[t] = files[p]; return t; }); window.__sim.nextImages = null; return cb(id, null, JSON.stringify(list)); }
        if (op === 'pdf') { window.__simPdf(a.html, a).then((b) => cb(id, null, b), (e) => cb(id, String(e), null)); window.__simLog('pdf ' + JSON.stringify({ ...a, html: a.html.length })); return; }
        if (op === 'share') { window.__sim.shared.push(a.path); return cb(id, null, 'true'); }
        if (op === 'view') { window.__sim.viewed.push(a.path); return cb(id, null, 'true'); }
        if (op === 'export') { window.__sim.exported.push(a.path); return cb(id, null, 'true'); }
        if (op === 'capture') return cb(id, null, null);
        if (op === 'fetch') return cb(id, null, '<Cube date="2026-10-16"><Rate currency="EUR">4.9765</Rate><Rate currency="HUF" multiplier="100">1.2500</Rate><Rate currency="USD">4.2810</Rate></Cube>');
        if (op === 'external') return cb(id, null, 'true');
        cb(id, 'op ' + op, null);
      },
      setTheme: (d, c) => { window.__sim.theme = [d, c]; },
      exit: () => { window.__sim.exited = true; },
    };
  }, preload);
  await page.goto(`http://127.0.0.1:${port}/index.html`);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/start.png` });
  const steps = process.argv[2];
  try {
    if (steps) await require(path.resolve(steps))(page, OUT);
  } catch (e) {
    logs.push('[STEP FAIL] ' + (e.stack || e));
    await page.screenshot({ path: `${OUT}/fail.png` }).catch(() => {});
  }
  console.log(logs.filter((l) => !/Download the React|DevTools/.test(l)).join('\n'));
  await browser.close();
  server.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
