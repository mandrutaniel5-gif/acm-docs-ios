// Plans and limits, against the Firebase emulators (auth, firestore, functions, storage):
//   firebase emulators:exec --only auth,firestore,functions,storage "node test/plans.test.mjs"
// Every limit is tried the way a script would try to get around it. Exit code 1 if anything is wrong.
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword, signInWithCustomToken, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, doc, getDoc, setDoc, writeBatch, serverTimestamp, updateDoc, deleteDoc } from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';
import { ed25519 } from '@noble/curves/ed25519.js';
import * as A from '../build/vendor/acmcrypto.mjs';

const PROJECT = 'acm-docs-52280';
const BUCKET = 'acm-docs-52280.firebasestorage.app';
const AUTH = 'http://127.0.0.1:9099';
const FS = `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents`;
const ST = 'http://127.0.0.1:9199';
const FN = `http://127.0.0.1:5001/${PROJECT}/europe-west1`;
const WHSEC = 'whsec_test_acmdocs';
const b64 = A.toB64;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let n = 0, failed = 0;

function client() {
  const app = initializeApp({ apiKey: 'test', projectId: PROJECT, authDomain: 'x', storageBucket: BUCKET }, 'p' + (++n));
  const auth = getAuth(app); connectAuthEmulator(auth, AUTH, { disableWarnings: true });
  const db = getFirestore(app); connectFirestoreEmulator(db, '127.0.0.1', 8080);
  const fn = getFunctions(app, 'europe-west1'); connectFunctionsEmulator(fn, '127.0.0.1', 5001);
  const call = async (name, data) => (await httpsCallable(fn, name)(data)).data;
  const tok = async () => (auth.currentUser ? auth.currentUser.getIdToken() : null);
  return { app, auth, db, call, tok };
}
async function verifyEmail(uid) {
  await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:update`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' }, body: JSON.stringify({ localId: uid, emailVerified: true }),
  });
}
/** Admin write / read in the Firestore emulator (what the console or the server can do). */
const val = (v) => (typeof v === 'number' ? { integerValue: String(v) } : typeof v === 'string' ? { stringValue: v } : { booleanValue: v });
async function adminSet(path, obj) {
  const fields = Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, val(v)]));
  const mask = Object.keys(obj).map((k) => 'updateMask.fieldPaths=' + k).join('&');
  const r = await fetch(`${FS}/${path}?${mask}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' }, body: JSON.stringify({ fields }) });
  if (!r.ok) throw new Error('adminSet ' + r.status + ' ' + (await r.text()));
}
async function adminGet(path) {
  const r = await fetch(`${FS}/${path}`, { headers: { Authorization: 'Bearer owner' } });
  if (!r.ok) return null;
  const j = await r.json();
  const out = {};
  for (const [k, v] of Object.entries(j.fields || {})) out[k] = v.integerValue != null ? Number(v.integerValue) : v.stringValue != null ? v.stringValue : v.booleanValue != null ? v.booleanValue : v;
  return out;
}
const grant = (uid, plan, days = 30) => adminSet(`billing/${uid}`, { plan, until: Date.now() + days * 864e5, source: 'manual' });
const ok = async (p) => { try { await p; return true; } catch (e) { return false; } };
const code = async (p) => { try { await p; return 'ok'; } catch (e) { return String(e.message || e.code || e); } };
async function stPut(c, path, bytes) {
  const t = await c.tok();
  const r = await fetch(`${ST}/v0/b/${BUCKET}/o?uploadType=media&name=${encodeURIComponent(path)}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', Authorization: 'Firebase ' + t }, body: bytes });
  return r.ok;
}
const rid = () => Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('hex');

async function makeAccount(tag) {
  const c = client();
  const email = `${tag}-${Date.now()}@example.com`;
  const password = 'Parola-' + tag + '-1';
  const cred = await createUserWithEmailAndPassword(c.auth, email, password);
  const uid = cred.user.uid;
  await verifyEmail(uid); await cred.user.getIdToken(true);
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
  return { c, uid, email, password, id, handle, dev: r.dev };
}
/** registerDevice for a device signed in with the password: asks for the emailed code (test mode keeps it readable). */
async function regEmail(c, uid, body) {
  try { return await c.call('registerDevice', body); } catch (e) {
    if (!/email code required/.test(e.message)) throw e;
  }
  await c.call('emailCodeSend', {});
  const ch = await adminGet(`challenges/${uid}`);
  return c.call('registerDevice', { ...body, emailCode: ch.test });
}
async function tryPair(acc) {
  const k = A.deriveIdentity(A.generateMnemonic());
  const c = client();
  const p = await c.call('pairStart', { bundle: b64(k.bundle) });
  return code(acc.c.call('pairApprove', { pid: p.pid, fp: k.fingerprint, sealed: b64(A.seal({ bytes: new Uint8Array([1]), name: 'k' }, acc.id, [k.bundle])) }));
}
/** A message as Stripe would sign it. */
async function hook(event, secret = WHSEC) {
  const payload = JSON.stringify(event);
  const t = Math.floor(Date.now() / 1000);
  const sig = createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex');
  return fetch(`${FN}/stripeWebhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Stripe-Signature': `t=${t},v1=${sig}` }, body: payload });
}
const subEvent = (id, uid, plan, { status = 'active', qty = 1, days = 30, type = 'customer.subscription.updated', created } = {}) => ({
  id: 'evt_' + rid(), type, created: created || Math.floor(Date.now() / 1000),
  data: { object: { id, object: 'subscription', status, customer: 'cus_test', metadata: { uid, plan, period: 'month' }, cancel_at_period_end: false, cancel_at: null,
    items: { data: [{ id: 'si_' + id, quantity: qty, current_period_end: Math.floor(Date.now() / 1000) + days * 86400, price: { recurring: { interval: 'month' } } }] } } },
});

async function check(name, fn) {
  try { await fn(); console.log('✓', name); } catch (e) { failed++; console.log('✗', name, '—', e.message || e); }
}

// ------------------------------------------------------------------------------------------
const a = await makeAccount('basic');
const b = await makeAccount('family');
const d = await makeAccount('biz');

await check('Basic: plan, 1 device, no offline token', async () => {
  const s = await a.c.call('planStatus');
  assert.equal(s.plan, 'basic');
  assert.equal(s.devices.limit, 1);
  assert.equal(s.token, null);
  assert.equal(s.usage.docs.limit, 3);
  assert.ok(s.cloud.limit > 0);
});

await check('Basic: 3 edited documents a month, the 4th is refused', async () => {
  for (let i = 0; i < 3; i++) await a.c.call('useQuota', { action: 'docs', ref: rid() });
  assert.match(await code(a.c.call('useQuota', { action: 'docs', ref: rid() })), /limit/);
  assert.match(await code(a.c.call('useQuota', { action: 'docs' })), /limit/);
});

await check('The same document twice in a month counts once', async () => {
  const r = rid();
  const x = await a.c.call('useQuota', { action: 'scans', ref: r });
  const y = await a.c.call('useQuota', { action: 'scans', ref: r });
  assert.equal(x.used, 1); assert.equal(y.used, 1);
});

await check('Scripts: unknown actions, odd refs, other accounts — refused', async () => {
  assert.notEqual(await code(a.c.call('useQuota', { action: 'free' })), 'ok');
  assert.notEqual(await code(a.c.call('useQuota', { action: 'docs', ref: '../x' })), 'ok');
  assert.notEqual(await code(a.c.call('useQuota', { action: '__proto__' })), 'ok');
  // password only (no device session): nothing
  const t = client();
  await signInWithEmailAndPassword(t.auth, a.email, a.password);
  assert.notEqual(await code(t.call('useQuota', { action: 'docs' })), 'ok');
  assert.notEqual(await code(t.call('planStatus')), 'ok');
});

await check('Rules: a device cannot touch its counters, plan, cloud limit, billing or groups', async () => {
  const month = new Date().toISOString().slice(0, 7);
  assert.equal(await ok(setDoc(doc(a.c.db, 'accounts', a.uid, 'usage', month), { docs: 0 })), false);
  assert.equal(await ok(deleteDoc(doc(a.c.db, 'accounts', a.uid, 'usage', month))), false);
  assert.equal(await ok(setDoc(doc(a.c.db, 'accounts', a.uid, 'meta', 'plan'), { plan: 'pro' })), false);
  assert.equal(await ok(updateDoc(doc(a.c.db, 'accounts', a.uid, 'meta', 'cloud'), { limit: 1e15 })), false);
  assert.equal(await ok(setDoc(doc(a.c.db, 'billing', a.uid), { plan: 'pro', until: 9e15 })), false);
  assert.equal(await ok(setDoc(doc(a.c.db, 'groups', 'gx'), { owner: a.uid })), false);
  assert.equal(await ok(getDoc(doc(a.c.db, 'billing', a.uid))), false);
  assert.equal(await ok(getDoc(doc(a.c.db, 'server', 'keys'))), false);
  // reading its own counters is fine; someone else's is not
  assert.equal(await ok(getDoc(doc(a.c.db, 'accounts', a.uid, 'meta', 'plan'))), true);
  assert.equal(await ok(getDoc(doc(b.c.db, 'accounts', a.uid, 'meta', 'plan'))), false);
  assert.equal(await ok(getDoc(doc(b.c.db, 'accounts', a.uid, 'usage', month))), false);
});

await check('Basic: a second device is refused (QR)', async () => {
  assert.match(await tryPair(a), /device limit/);
});

await check('Basic: password + 24 words on a new device: refused, unless it takes the old one\'s place', async () => {
  const c = client();
  await signInWithEmailAndPassword(c.auth, a.email, a.password);
  const dk = A.deriveIdentity(A.generateMnemonic());
  const ts = Date.now();
  const proof = b64(A.signEd(a.id, `acm-register\n${a.uid}\n${dk.fingerprint}\n${ts}`));
  assert.match(await code(regEmail(c, a.uid, { bundle: b64(dk.bundle), ts, proof })), /device limit/);
  assert.match(await code(regEmail(c, a.uid, { bundle: b64(dk.bundle), ts, proof, replace: rid() })), /device limit/);
  const r = await regEmail(c, a.uid, { bundle: b64(dk.bundle), ts, proof, replace: a.dev });
  assert.equal(r.role, 'primary');
  await signInWithCustomToken(c.auth, r.token);
  // the old device is out at once
  assert.notEqual(await code(a.c.call('planStatus')), 'ok');
  a.c = c; a.dev = r.dev;
  // "auto": the least recently used device makes room
  const c2 = client();
  await signInWithEmailAndPassword(c2.auth, a.email, a.password);
  const dk2 = A.deriveIdentity(A.generateMnemonic());
  const ts2 = Date.now();
  const r2 = await regEmail(c2, a.uid, { bundle: b64(dk2.bundle), ts: ts2, proof: b64(A.signEd(a.id, `acm-register\n${a.uid}\n${dk2.fingerprint}\n${ts2}`)), replace: 'auto' });
  await signInWithCustomToken(c2.auth, r2.token);
  assert.notEqual(await code(a.c.call('planStatus')), 'ok');
  a.c = c2; a.dev = r2.dev;
});

await check('Two-step by email: a new device needs the emailed code; wrong codes run out', async () => {
  const c = client();
  await signInWithEmailAndPassword(c.auth, a.email, a.password);
  const dk = A.deriveIdentity(A.generateMnemonic());
  const ts = Date.now();
  const body = { bundle: b64(dk.bundle), ts, proof: b64(A.signEd(a.id, `acm-register\n${a.uid}\n${dk.fingerprint}\n${ts}`)), replace: 'auto' };
  assert.match(await code(c.call('registerDevice', body)), /email code required/);
  const sent = await c.call('emailCodeSend', {});
  assert.equal(sent.needed, true);
  const ch = await adminGet(`challenges/${a.uid}`);
  const wrong = ch.test === '000000' ? '111111' : '000000';
  assert.match(await code(c.call('registerDevice', { ...body, emailCode: wrong })), /bad email code/);
  // a device cannot read the code
  assert.equal(await ok(getDoc(doc(a.c.db, 'challenges', a.uid))), false);
  for (let i = 0; i < 5; i++) await code(c.call('registerDevice', { ...body, emailCode: wrong }));
  assert.match(await code(c.call('registerDevice', { ...body, emailCode: ch.test })), /expired|required/);
  // turned off from a device of the account: no code needed
  await a.c.call('emailCodeSet', { on: false });
  const r = await c.call('registerDevice', body);
  await signInWithCustomToken(c.auth, r.token);
  a.c = c; a.dev = r.dev;
  await a.c.call('emailCodeSet', { on: true });
});

await check('Cloud: writes stop at the plan limit (Firestore and Storage)', async () => {
  assert.equal(await ok(setDoc(doc(a.c.db, 'accounts', a.uid, 'vault', 'r1'), { b: 'A'.repeat(1000), v: 1, at: serverTimestamp() })), true);
  assert.equal(await stPut(a.c, `accounts/${a.uid}/blobs/${rid()}`, new Uint8Array(2048)), true);
  const lim = (await adminGet(`accounts/${a.uid}/meta/cloud`)).limit;
  await adminSet(`accounts/${a.uid}/meta/cloud`, { used: lim - 500 });
  assert.equal(await ok(setDoc(doc(a.c.db, 'accounts', a.uid, 'vault', 'r2'), { b: 'A'.repeat(1000), v: 1, at: serverTimestamp() })), false);
  assert.equal(await stPut(a.c, `accounts/${a.uid}/blobs/${rid()}`, new Uint8Array(2048)), false);
  // shrinking is always allowed
  assert.equal(await ok(setDoc(doc(a.c.db, 'accounts', a.uid, 'vault', 'r1'), { b: 'A', v: 1, at: serverTimestamp() })), true);
  await adminSet(`accounts/${a.uid}/meta/cloud`, { used: 0 });
});

await check('Cloud: stored blocks are counted by the server', async () => {
  const before = (await adminGet(`accounts/${a.uid}/meta/cloud`)).used;
  assert.equal(await stPut(a.c, `accounts/${a.uid}/blobs/${rid()}`, new Uint8Array(5000)), true);
  let after = before;
  for (let i = 0; i < 40 && after < before + 5000; i++) { await sleep(250); after = (await adminGet(`accounts/${a.uid}/meta/cloud`)).used; }
  assert.ok(after >= before + 5000, `used ${before} → ${after}`);
});

await check('Pro (granted): limits up, signed offline token that cannot be edited', async () => {
  await grant(a.uid, 'pro');
  const s = await a.c.call('planStatus');
  assert.equal(s.plan, 'pro');
  assert.equal(s.devices.limit, 3);
  assert.ok(s.token);
  const pk = Buffer.from((await adminGet('server/keys')).planPk, 'base64');
  const [body, sig] = s.token.split('.');
  assert.equal(ed25519.verify(Buffer.from(sig, 'base64'), new TextEncoder().encode('acm-plan\n' + body), pk), true);
  const p = JSON.parse(Buffer.from(body, 'base64').toString());
  assert.equal(p.u, a.uid); assert.equal(p.p, 'pro'); assert.ok(p.e <= Date.now() + 7 * 864e5 + 5000);
  const forged = Buffer.from(JSON.stringify({ ...p, p: 'business', e: p.e + 365 * 864e5 })).toString('base64');
  assert.equal(ed25519.verify(Buffer.from(sig, 'base64'), new TextEncoder().encode('acm-plan\n' + forged), pk), false);
  // Pro allows a second device now
  assert.equal(await tryPair(a), 'ok');
});

await check('Expired grant: back to Basic', async () => {
  await adminSet(`billing/${a.uid}`, { until: Date.now() - 1000 });
  const s = await a.c.call('planStatus');
  assert.equal(s.plan, 'basic');
});

await check('Stripe: unsigned or wrongly signed messages are ignored', async () => {
  const ev = subEvent('sub_fake', a.uid, 'business', { qty: 500 });
  const r1 = await fetch(`${FN}/stripeWebhook`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ev) });
  assert.notEqual(r1.status, 200);
  const r2 = await hook(ev, 'whsec_wrong');
  assert.notEqual(r2.status, 200);
  const r3 = await fetch(`${FN}/stripeWebhook`, { method: 'GET' });
  assert.notEqual(r3.status, 200);
  assert.equal((await a.c.call('planStatus')).plan, 'basic');
});

const famSub = 'sub_fam' + rid().slice(0, 8);
await check('Stripe: a signed Family payment → Family for the owner', async () => {
  const r = await hook(subEvent(famSub, b.uid, 'family'));
  assert.equal(r.status, 200, await r.text());
  const s = await b.c.call('planStatus');
  assert.equal(s.plan, 'family');
  assert.equal(s.group.owner, true);
});

await check('Stripe: the same message twice / an older message arriving late change nothing', async () => {
  const ev = subEvent(famSub, b.uid, 'family', { status: 'canceled', created: Math.floor(Date.now() / 1000) - 3600 });
  assert.equal((await hook(ev)).status, 200);
  assert.equal((await b.c.call('planStatus')).plan, 'family');
});

await check('Family: the owner invites by @name; the member joins and gets the plan', async () => {
  await b.c.call('groupInvite', { handle: a.handle });
  const inv = await getDoc(doc(a.c.db, 'accounts', a.uid, 'invites', 'g' + famSub.replace(/[^A-Za-z0-9]/g, '')));
  assert.equal(inv.exists(), true);
  // a stranger cannot accept someone else's invitation, nor join without one
  assert.notEqual(await code(d.c.call('groupAnswer', { gid: inv.id, accept: true })), 'ok');
  await a.c.call('groupAnswer', { gid: inv.id, accept: true });
  const s = await a.c.call('planStatus');
  assert.equal(s.plan, 'family');
  assert.equal(s.group.owner, false);
  const info = await b.c.call('groupInfo');
  assert.equal(info.group.members.length, 1);
});

await check('Family: a member cannot invite, remove or change seats', async () => {
  assert.notEqual(await code(a.c.call('groupInvite', { handle: d.handle })), 'ok');
  assert.notEqual(await code(a.c.call('groupRemove', { uid: b.uid })), 'ok');
  assert.notEqual(await code(a.c.call('groupSeats', { seats: 50 })), 'ok');
});

await check('Family: removed member goes back to Basic', async () => {
  await b.c.call('groupRemove', { uid: a.uid });
  assert.equal((await a.c.call('planStatus')).plan, 'basic');
});

const bizSub = 'sub_biz' + rid().slice(0, 8);
await check('Business: seats are a hard limit (3 = owner + 2)', async () => {
  assert.equal((await hook(subEvent(bizSub, d.uid, 'business', { qty: 3 }))).status, 200);
  assert.equal((await d.c.call('planStatus')).plan, 'business');
  const x = await makeAccount('m1');
  const y = await makeAccount('m2');
  await d.c.call('groupInvite', { handle: x.handle });
  await d.c.call('groupInvite', { handle: y.handle });
  assert.match(await code(d.c.call('groupInvite', { handle: a.handle })), /seats/);
});

await check('Cancelled subscription: the owner and the group lose the plan', async () => {
  assert.equal((await hook(subEvent(famSub, b.uid, 'family', { status: 'canceled', days: -1, type: 'customer.subscription.deleted' }))).status, 200);
  assert.equal((await b.c.call('planStatus')).plan, 'basic');
});

await check('Checkout needs the consent for immediate start', async () => {
  assert.match(await code(a.c.call('billingCheckout', { plan: 'pro', period: 'month' })), /consent|plan/);
  assert.notEqual(await code(a.c.call('billingCheckout', { plan: 'gold', period: 'month', consent: true })), 'ok');
  assert.notEqual(await code(a.c.call('billingCheckout', { plan: 'business', period: 'month', seats: 1, consent: true })), 'ok');
});

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
