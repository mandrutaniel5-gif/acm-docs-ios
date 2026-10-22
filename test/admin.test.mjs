// Control panel, kill switches, reports, promotions, sign-in log: against the Firebase emulators.
//   firebase emulators:exec --only auth,firestore,functions,storage "node test/admin.test.mjs"
// (In the emulator the panel's second factor is not checked: the emulator cannot sign in with an
// authenticator app. On the real server it is required for every panel request.)
import assert from 'node:assert/strict';
import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword, signInWithCustomToken, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, doc, getDoc, setDoc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';
import * as A from '../build/vendor/acmcrypto.mjs';

const PROJECT = 'acm-docs-52280';
const AUTH = 'http://127.0.0.1:9099';
const FS = `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents`;
const b64 = A.toB64;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let n = 0, failed = 0;

function client() {
  const app = initializeApp({ apiKey: 'test', projectId: PROJECT, authDomain: 'x' }, 'a' + (++n));
  const auth = getAuth(app); connectAuthEmulator(auth, AUTH, { disableWarnings: true });
  const db = getFirestore(app); connectFirestoreEmulator(db, '127.0.0.1', 8080);
  const fn = getFunctions(app, 'europe-west1'); connectFunctionsEmulator(fn, '127.0.0.1', 5001);
  const call = async (name, data) => (await httpsCallable(fn, name)(data)).data;
  return { app, auth, db, call };
}
async function authUpdate(body) {
  const r = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:update`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error('auth update ' + r.status + ' ' + (await r.text()));
}
async function adminGet(path) {
  const r = await fetch(`${FS}/${path}`, { headers: { Authorization: 'Bearer owner' } });
  return r.ok ? r.json() : null;
}
const code = async (p) => { try { await p; return 'ok'; } catch (e) { return String(e.message || e.code || e); } };
const rid = () => Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('hex');

async function makeAccount(tag) {
  const c = client();
  const email = `${tag}-${Date.now()}@example.com`;
  const password = 'Parola-' + tag + '-1';
  const cred = await createUserWithEmailAndPassword(c.auth, email, password);
  const uid = cred.user.uid;
  await authUpdate({ localId: uid, emailVerified: true }); await cred.user.getIdToken(true);
  const id = A.deriveIdentity(A.generateMnemonic());
  const handle = (tag + Date.now().toString(36)).slice(0, 20);
  const b = writeBatch(c.db);
  b.set(doc(c.db, 'usernames', handle), { uid });
  b.set(doc(c.db, 'users', uid), { name: tag, handle, key: b64(id.bundle), fp: id.fingerprint, created: serverTimestamp() });
  await b.commit();
  const dk = A.deriveIdentity(A.generateMnemonic());
  const ts = Date.now();
  const r = await c.call('registerDevice', { bundle: b64(dk.bundle), ts, proof: b64(A.signEd(id, `acm-register\n${uid}\n${dk.fingerprint}\n${ts}`)) });
  await signInWithCustomToken(c.auth, r.token);
  return { c, uid, email, password, handle, dev: r.dev };
}
async function makeAdmin() {
  const c = client();
  const email = `boss-${Date.now()}@example.com`;
  const cred = await createUserWithEmailAndPassword(c.auth, email, 'Admin-Parola-Lunga-1');
  await authUpdate({ localId: cred.user.uid, emailVerified: true, customAttributes: JSON.stringify({ admin: true }) });
  await signInWithEmailAndPassword(c.auth, email, 'Admin-Parola-Lunga-1');
  await c.auth.currentUser.getIdToken(true);
  const op = (o, data) => c.call('admin', { op: o, ...(data || {}) });
  return { c, uid: cred.user.uid, email, op };
}
async function check(name, fn) {
  try { await fn(); console.log('✓', name); } catch (e) { failed++; console.log('✗', name, '—', e.message || e); }
}

// ------------------------------------------------------------------------------------------
const a = await makeAccount('ana');
const b = await makeAccount('bob');
const boss = await makeAdmin();
const SW = 16000; // switches are cached for 15 s by each server instance

await check('Panel: an app account (even with a device session) is refused', async () => {
  assert.match(await code(a.c.call('admin', { op: 'overview' })), /not allowed/);
  assert.match(await code(a.c.call('admin', { op: 'setPlan', uid: a.uid, plan: 'pro', days: 365 })), /not allowed/);
});

await check('Panel: an account cannot give itself the admin right', async () => {
  // custom claims are set only with the service account; a profile write cannot carry them
  assert.equal(await code(setDoc(doc(a.c.db, 'server', 'switches'), { all: true })) === 'ok', false);
  assert.match(await code(a.c.call('admin', { op: 'whoami' })), /not allowed/);
});

await check('Panel: overview, search by email and by @name', async () => {
  const o = await boss.op('overview');
  assert.ok(o.accounts >= 2);
  assert.ok(o.byPlan.basic >= 2);
  const s1 = await boss.op('search', { q: a.email });
  assert.equal(s1[0].uid, a.uid);
  const s2 = await boss.op('search', { q: '@' + b.handle });
  assert.equal(s2[0].uid, b.uid);
});

await check('Sign-ins are logged with the address; devices carry their last address', async () => {
  const acc = await boss.op('account', { uid: a.uid });
  assert.ok(acc.signins.some((s) => s.kind === 'device-first' && s.ip), 'first device sign-in logged');
  assert.ok(acc.devices[0].ip, 'device address');
  assert.equal(acc.devices[0].id, a.dev);
});

await check('Sign-in addresses, reports, promotions, secrets and the panel log are closed to devices', async () => {
  for (const p of [['accounts', a.uid, 'signins', 'x'], ['accounts', a.uid, 'private', 'devices'], ['reports', 'x'], ['promos', 'x'], ['server', 'secrets'], ['adminLog', 'x'], ['server', 'keys']]) {
    assert.notEqual(await code(getDoc(doc(a.c.db, ...p))), 'ok', p.join('/'));
  }
});

await check('Panel: manual plan for family / friends (and back to Basic)', async () => {
  await boss.op('setPlan', { uid: a.uid, plan: 'pro', days: 30, note: 'familie' });
  assert.equal((await a.c.call('planStatus')).plan, 'pro');
  await boss.op('setPlan', { uid: a.uid, plan: 'basic' });
  assert.equal((await a.c.call('planStatus')).plan, 'basic');
  assert.match(await code(boss.op('setPlan', { uid: a.uid, plan: 'business', days: 30 })), /plan/);
});

await check('Reports: an account reports another by @name; the panel sees and closes it', async () => {
  assert.match(await code(a.c.call('reportAccount', { handle: a.handle, reason: 'spam' })), /self/);
  assert.match(await code(a.c.call('reportAccount', { handle: b.handle, reason: 'nonsense' })), /reason/);
  await a.c.call('reportAccount', { handle: '@' + b.handle, reason: 'fraud', details: 'test' });
  const open = await boss.op('reports', { status: 'open' });
  const r = open.find((x) => x.target === b.uid);
  assert.ok(r, 'report listed');
  assert.equal(r.fromHandle, a.handle);
  await boss.op('resolveReport', { id: r.id, status: 'dismissed', note: 'ok' });
  assert.ok(!(await boss.op('reports', { status: 'open' })).some((x) => x.id === r.id));
});

await check('Promotions: saved in the panel, shown to the app, bad ones refused', async () => {
  assert.match(await code(boss.op('savePromo', { promo: { kind: 'discount', title: 'X', percent: 150, plans: ['pro'], periods: ['year'], active: true } })), /percent/);
  assert.match(await code(boss.op('savePromo', { promo: { kind: 'trial', title: 'Y', trialDays: 14, plans: [], periods: ['year'], active: true } })), /plans/);
  await boss.op('savePromo', { promo: { kind: 'trial', title: 'Probă', trialDays: 14, plans: ['personal', 'pro'], periods: ['month', 'year'], active: true, newOnly: true } });
  await boss.op('savePromo', { promo: { kind: 'discount', title: 'Toamna', percent: 30, months: 3, plans: ['pro'], periods: ['year'], active: false } });
  await sleep(61000); // promotions are cached for a minute by each server instance
  const s = await b.c.call('planStatus');
  assert.ok(s.promos.some((p) => p.kind === 'trial' && p.trialDays === 14 && p.title === 'Probă'));
  assert.ok(!s.promos.some((p) => p.title === 'Toamna'), 'inactive promotion hidden');
  assert.ok(!('used' in s.promos[0]) && !('maxUses' in s.promos[0]), 'no internal counters');
});

await check('Kill switches: readable by anyone, written only by the panel', async () => {
  const anon = client();
  assert.equal(await code(getDoc(doc(anon.db, 'server', 'switches'))), 'ok');
  assert.notEqual(await code(setDoc(doc(b.c.db, 'server', 'switches'), { off: {} })), 'ok');
});

await check('Kill switches: a paused action and the paused cloud sync are refused on the server', async () => {
  await b.c.call('useQuota', { action: 'docs', ref: rid() });
  await boss.op('switches.set', { off: { docs: true, sync: true }, msg: 'Mentenanță' });
  await sleep(SW);
  assert.match(await code(b.c.call('useQuota', { action: 'docs', ref: rid() })), /paused:docs/);
  await b.c.call('useQuota', { action: 'scans', ref: rid() }); // the rest keeps working
  assert.notEqual(await code(setDoc(doc(b.c.db, 'accounts', b.uid, 'vault', rid()), { b: 'eA==', v: 1, at: serverTimestamp() })), 'ok');
  const s = await b.c.call('planStatus');
  assert.equal(s.switches.off.docs, true);
  assert.equal(s.switches.msg, 'Mentenanță');
  await boss.op('switches.set', { off: {} });
  await sleep(SW);
  await b.c.call('useQuota', { action: 'docs', ref: rid() });
  await setDoc(doc(b.c.db, 'accounts', b.uid, 'vault', rid()), { b: 'eA==', v: 1, at: serverTimestamp() });
});

await check('Kill switches: new accounts and password sign-ins can be paused', async () => {
  await boss.op('switches.set', { off: { signup: true, signin: true } });
  await sleep(SW);
  const c = client();
  assert.notEqual(await code(createUserWithEmailAndPassword(c.auth, `new-${Date.now()}@example.com`, 'Parola-noua-1')), 'ok');
  assert.notEqual(await code(signInWithEmailAndPassword(client().auth, b.email, b.password)), 'ok');
  // the panel itself still works (its account is not an app account)
  await boss.op('overview');
  await boss.op('switches.set', { off: {} });
  await sleep(SW);
  await signInWithEmailAndPassword(client().auth, b.email, b.password);
});

await check('Suspension: the account can no longer sign in or use its plan; lifting it restores everything', async () => {
  await boss.op('suspend', { uid: b.uid, on: true, reason: 'test' });
  assert.notEqual(await code(signInWithEmailAndPassword(client().auth, b.email, b.password)), 'ok');
  assert.match(await code(b.c.call('useQuota', { action: 'scans', ref: rid() })), /suspended|disabled|unauthenticated/i);
  await boss.op('suspend', { uid: b.uid, on: false });
  await signInWithEmailAndPassword(client().auth, b.email, b.password);
  assert.match(await code(boss.op('suspend', { uid: boss.uid, on: true })), /admin account/);
});

await check('Stripe: status without secrets; malformed keys refused', async () => {
  const s = await boss.op('stripe');
  assert.equal(s.source, 'deploy'); // the emulator's test key
  assert.ok(!JSON.stringify(s).includes('sk_test_emulator'), 'the key is never sent back whole');
  assert.match(await code(boss.op('stripeSet', { key: 'not-a-key' })), /stripe key/);
});

await check('Panel log: every change is written, without keys', async () => {
  const log = await boss.op('log');
  for (const op of ['setPlan', 'resolveReport', 'savePromo', 'switches.set', 'suspend']) assert.ok(log.some((l) => l.op === op), op);
  assert.ok(log.every((l) => l.email === boss.email));
});

console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
