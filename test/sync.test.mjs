// Cloud sync between devices: two "devices" (the real app/js/sync.js, each in its own context) share a
// cloud in memory, so what happens when they work at the same time or without internet can be checked.
//   node --test test/sync.test.mjs     (SYNC_SRC=<file> runs the same checks on another version of sync.js)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = fs.readFileSync(process.env.SYNC_SRC || path.join(ROOT, 'app/js/sync.js'), 'utf8');
const enc = (x) => new TextEncoder().encode(x), dec = (b) => new TextDecoder().decode(b);

function makeCloud() {
  let clock = 1000;
  const records = new Map(), blobs = new Map();
  const c = { records, blobs, failDownloads: 0 };
  c.firestore = {
    collection: () => ({ col: true }),
    doc: (_db, ...p) => ({ id: p[p.length - 1], p }),
    query: (_c, ...f) => ({ after: (f.find((x) => x && x.after !== undefined) || {}).after }),
    where: (_k, _op, d) => ({ after: +d }),
    orderBy: () => ({}),
    serverTimestamp: () => 'now',
    setDoc: async (ref, d) => { const at = ++clock; records.set(ref.id, { ...d, at: { toMillis: () => at } }); },
    deleteDoc: async (ref) => { records.delete(ref.id); },
    getDoc: async () => ({ exists: () => false, data: () => ({}) }),
    getDocs: async (q) => {
      const list = [...records.entries()].filter(([, r]) => q.after === undefined || r.at.toMillis() > q.after).sort((a, b) => a[1].at.toMillis() - b[1].at.toMillis());
      return { docs: list.map(([id, r]) => ({ id, ref: { id }, data: () => r })) };
    },
  };
  c.fetch = async (url, init = {}) => {
    const u = String(url);
    if (init.method === 'POST') {
      const name = decodeURIComponent(/name=([^&]+)/.exec(u)[1]);
      blobs.set(name, init.body);
      return { ok: true, status: 200 };
    }
    const name = decodeURIComponent(/\/o\/([^?]+)/.exec(u)[1]);
    if (init.method === 'DELETE') { blobs.delete(name); return { ok: true, status: 200 }; }
    if (c.failDownloads > 0) { c.failDownloads--; throw new Error('connection lost'); }
    if (!blobs.has(name)) return { ok: false, status: 404 };
    const b = blobs.get(name);
    return { ok: true, status: 200, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) };
  };
  return c;
}

function makeDevice(cloud) {
  class Storage {
    constructor() { this.m = new Map(); }
    getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
    setItem(k, v) { this.m.set(k, String(v)); }
    removeItem(k) { this.m.delete(k); }
  }
  const ls = new Storage();
  const disk = new Map(); // path -> bytes
  const recent = [];
  const mac = (_k, label, v) => { let h = 7; for (const c of label + v) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h.toString(16).padStart(8, '0').repeat(8); };
  const A = {
    macText: mac, vaultKey: () => new Uint8Array(32),
    vaultSealText: (_k, p) => enc(JSON.stringify(p)), vaultOpenText: (_k, b) => JSON.parse(dec(b)),
    vaultSeal: (_k, b) => b, vaultOpen: (_k, b) => b,
  };
  const user = { uid: 'U1', getIdToken: async () => 't' };
  const device = {
    Storage, localStorage: ls, console: { warn() {}, log() {}, error() {} }, JSON, Date, Math, Object, Array, Map, Set, String, Number, RegExp, Promise, Uint8Array, TextEncoder, TextDecoder, encodeURIComponent, decodeURIComponent, crypto: globalThis.crypto,
    setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
    fetch: cloud.fetch,
    document: { hidden: false, addEventListener() {}, removeEventListener() {} },
    Host: {
      toB64: (b) => Buffer.from(b).toString('base64'), fromB64: (s) => new Uint8Array(Buffer.from(s, 'base64')),
      secureGet: async () => null, secureSet: async () => {}, secureDelete: async () => {},
      exists: (p) => disk.has(p), mtime: (p) => (disk.has(p) ? 1 : 0), readFileAsync: async (p) => disk.get(p),
      writeFile: (p, b) => disk.set(p, b), mkdirp: () => true, baseName: (p) => p.split('/').pop(), dirName: (p) => p.split('/').slice(0, -1).join('/'), join: (...x) => x.join('/'),
      specialDir: async () => '/docs',
    },
    Account: { current: () => user, unlock: async () => ({}), internals: () => ({ F: { firestore: cloud.firestore }, db: {}, auth: { currentUser: user } }) },
    App: { recentFiles: () => recent, rememberFile: (p, kind) => recent.push({ path: p, kind }), renderView() {}, forgetPath() {} },
    I18n: { t: (s) => s, locale: () => 'ro-RO' },
  };
  device.window = { __lib: { acmcrypto: A, firebase: { firestore: cloud.firestore } }, localStorage: ls };
  vm.createContext(device);
  vm.runInContext(SRC.replace('const Sync =', 'var Sync ='), device);
  const list = (k) => JSON.parse(ls.getItem(k) || '[]');
  return { sync: device.Sync, ls, disk, recent, list, set: (k, v) => ls.setItem(k, JSON.stringify(v)), run: (w = 'all') => device.Sync.run(w) };
}

/** Two devices that have already synced once. */
async function pair() {
  const cloud = makeCloud();
  const a = makeDevice(cloud), b = makeDevice(cloud);
  a.set('acm.docs', []);
  await a.run(); await b.run(); await a.run();
  return { cloud, a, b };
}
const inv = (id, number, extra = {}) => ({ id, bizId: 'b', type: 'invoice', series: 'F', number, time: number, at: number, ...extra });
const ids = (d) => d.list('acm.docs').map((x) => x.id).sort();

test('invoices made on two devices without internet: both stay on both', async () => {
  const { a, b } = await pair();
  a.set('acm.docs', [inv('a1', 1)]);
  b.set('acm.docs', [inv('b1', 2)]);
  await a.run(); await b.run(); await a.run();
  assert.deepEqual(ids(a), ['a1', 'b1']);
  assert.deepEqual(ids(b), ['a1', 'b1']);
});

test('the same, whichever device comes back first', async () => {
  const { a, b } = await pair();
  b.set('acm.docs', [inv('b1', 2)]);
  a.set('acm.docs', [inv('a1', 1)]);
  await b.run(); await a.run(); await b.run();
  assert.deepEqual(ids(a), ['a1', 'b1']);
  assert.deepEqual(ids(b), ['a1', 'b1']);
});

test('a device that overwrites the cloud without having seen the other one loses nothing', async () => {
  const { a, b } = await pair();
  b.set('acm.docs', [inv('b1', 2)]);
  await b.run('push');
  a.set('acm.docs', [inv('a1', 1)]);
  await a.run('push'); // never looked at the cloud: its list has no b1
  await b.run(); await a.run();
  assert.deepEqual(ids(a), ['a1', 'b1']);
  assert.deepEqual(ids(b), ['a1', 'b1']);
});

test('a document removed on one device leaves the other and does not come back', async () => {
  const { a, b } = await pair();
  a.set('acm.docs', [inv('a1', 1), inv('a2', 2)]);
  await a.run(); await b.run();
  assert.deepEqual(ids(b), ['a1', 'a2']);
  a.set('acm.docs', [inv('a2', 2)]);
  await a.run(); await b.run(); await a.run();
  assert.deepEqual(ids(a), ['a2']);
  assert.deepEqual(ids(b), ['a2']);
});

test('the same document changed on both devices: the newer change wins, the others stay', async () => {
  const { a, b } = await pair();
  a.set('acm.docs', [inv('x', 1)]);
  await a.run(); await b.run();
  a.set('acm.docs', [inv('x', 1, { paid: true, at: 50 })]);
  b.set('acm.docs', [inv('x', 1, { paid: false, at: 90 }), inv('b1', 2)]);
  await a.run(); await b.run(); await a.run();
  for (const d of [a, b]) {
    assert.deepEqual(ids(d), ['b1', 'x']);
    assert.equal(d.list('acm.docs').find((x) => x.id === 'x').paid, false);
  }
});

test('a company changed on both devices keeps the higher document numbers', async () => {
  const { a, b } = await pair();
  const co = (next, at) => ({ id: 'c', name: 'Firma', at, next: { invoice: next, proforma: 1 } });
  a.set('acm.businesses', [co(1, 1)]);
  await a.run(); await b.run();
  a.set('acm.businesses', [co(7, 5)]);
  b.set('acm.businesses', [co(4, 9)]);
  await a.run(); await b.run(); await a.run();
  for (const d of [a, b]) assert.equal(d.list('acm.businesses')[0].next.invoice, 7);
});

test('a table of saved items is joined too', async () => {
  const { a, b } = await pair();
  a.set('acm.invoiceItems', { unu: { desc: 'Unu', n: 1 } });
  b.set('acm.invoiceItems', { doi: { desc: 'Doi', n: 1 } });
  await a.run(); await b.run(); await a.run();
  for (const d of [a, b]) assert.deepEqual(Object.keys(JSON.parse(d.ls.getItem('acm.invoiceItems'))).sort(), ['doi', 'unu']);
});

test('a document that could not be downloaded is fetched again the next time', async () => {
  const { cloud, a, b } = await pair();
  a.disk.set('/docs/F-1.pdf', enc('pdf bytes'));
  a.recent.push({ path: '/docs/F-1.pdf', kind: 'invoice' });
  await a.run();
  cloud.failDownloads = 1;
  await b.run();
  assert.equal(b.disk.has('/docs/F-1.pdf'), false, 'first try failed');
  await b.run();
  assert.equal(dec(b.disk.get('/docs/F-1.pdf')), 'pdf bytes');
});

test('a setting (not a list) still follows the newest change', async () => {
  const { a, b } = await pair();
  a.ls.setItem('acm.theme', 'dark');
  await a.run(); await b.run();
  assert.equal(b.ls.getItem('acm.theme'), 'dark');
});

test('a first sync joins what the device had before signing in', async () => {
  const cloud = makeCloud();
  const a = makeDevice(cloud), b = makeDevice(cloud);
  a.set('acm.docs', [inv('a1', 1)]);
  b.set('acm.docs', [inv('b1', 2)]);
  await a.run(); await b.run(); await a.run();
  assert.deepEqual(ids(a), ['a1', 'b1']);
  assert.deepEqual(ids(b), ['a1', 'b1']);
});
