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
import { createECDH, createDecipheriv, hkdfSync } from 'node:crypto';
const a = await makeAccount('ana');
const b = await makeAccount('bob');
const boss = await makeAdmin();
const open = (priv, sealed) => {
  const e = createECDH('prime256v1'); e.setPrivateKey(priv);
  const key = Buffer.from(hkdfSync('sha256', e.computeSecret(Buffer.from(sealed.epk, 'base64')), Buffer.alloc(0), Buffer.from('acm-anaf-v1'), 32));
  const all = Buffer.from(sealed.ct, 'base64');
  const d = createDecipheriv('aes-256-gcm', key, Buffer.from(sealed.iv, 'base64'));
  d.setAuthTag(all.subarray(all.length - 16));
  return JSON.parse(Buffer.concat([d.update(all.subarray(0, all.length - 16)), d.final()]).toString());
};

await check('Panel: ANAF client set, environment switched, secret never shown; apps cannot read it', async () => {
  assert.equal((await a.c.call('anafInfo', {})).ready, false);
  assert.match(await code(a.c.call('admin', { op: 'anafSet', clientId: 'abcdef123456', clientSecret: 'secret-1234567890' })), /not allowed/);
  const st = await boss.op('anafSet', { clientId: 'abcdef1234567890', clientSecret: 'secret-1234567890abc', env: 'test' });
  assert.equal(st.active, true); assert.equal(st.env, 'test');
  assert.ok(!JSON.stringify(st).includes('secret-1234567890abc'), 'the secret is not sent back');
  assert.equal((await boss.op('anafEnv', { env: 'prod' })).env, 'prod');
  await boss.op('anafEnv', { env: 'test' });
  assert.notEqual(await code(getDoc(doc(a.c.db, 'server', 'anaf'))), 'ok');
  assert.deepEqual(await a.c.call('anafInfo', {}), { ready: true, env: 'test' });
});

await check('Connecting: ANAF page, callback, keys sealed for the asking device only, picked up once', async () => {
  const e = createECDH('prime256v1'); const pub = e.generateKeys().toString('base64');
  const s = await a.c.call('anafStart', { pub });
  assert.match(s.url, /^https:\/\/logincert\.anaf\.ro\/anaf-oauth2\/v1\/authorize\?/);
  assert.match(s.url, /client_id=abcdef1234567890/); assert.match(s.url, /redirect_uri=https%3A%2F%2Facm-docs-52280\.web\.app%2Fanaf%2Fcallback/);
  assert.deepEqual(await a.c.call('anafClaim', { state: s.state }), { ready: false });
  const cb = (q) => fetch(`http://127.0.0.1:5001/${PROJECT}/europe-west1/anafCallback?${q}`);
  assert.equal((await cb('state=' + 'f'.repeat(48) + '&code=emulator-code')).status, 400, 'unknown state');
  const r = await cb(`state=${s.state}&code=emulator-code`);
  assert.equal(r.status, 200); assert.match(await r.text(), /Firma este conectată/);
  assert.match(await code(b.c.call('anafClaim', { state: s.state })), /no such connection/, 'not by another account');
  const got = await a.c.call('anafClaim', { state: s.state });
  assert.equal(got.ready, true);
  assert.ok(!JSON.stringify(got).includes('emulator-access'), 'sealed, not readable on the way');
  assert.equal(open(e.getPrivateKey(), got.sealed).access, 'emulator-access');
  assert.match(await code(a.c.call('anafClaim', { state: s.state })), /no such connection/, 'only once');
  assert.equal((await cb(`state=${s.state}&code=emulator-code`)).status, 400, 'a used link does not work again');
});

await check('Renewing keys: through the server (needs the secret), sealed for the device, nothing kept', async () => {
  const e = createECDH('prime256v1'); const pub = e.generateKeys().toString('base64');
  const r = await a.c.call('anafRefresh', { refresh: 'emulator-refresh', pub });
  assert.equal(open(e.getPrivateKey(), r.sealed).refresh, 'emulator-refresh');
  assert.match(await code(a.c.call('anafRefresh', { refresh: 'x', pub })), /refresh/);
});

await check('Without a device session nothing starts; panel can clear the client', async () => {
  const c = client();
  assert.notEqual(await code(c.call('anafStart', { pub: 'x' })), 'ok');
  await boss.op('anafClear');
  assert.equal((await a.c.call('anafInfo', {})).ready, false);
  assert.match(await code(a.c.call('anafStart', { pub: Buffer.alloc(65, 4).toString('base64') })), /not configured/);
});

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
