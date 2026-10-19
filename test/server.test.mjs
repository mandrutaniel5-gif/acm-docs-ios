// Server functions + Firestore rules, against the Firebase emulators (run by the "server" workflow):
//   firebase emulators:exec --only auth,firestore,functions "node --test test/server.test.mjs"
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword, signInWithCustomToken, signOut } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, doc, getDoc, setDoc, getDocs, collection, writeBatch, serverTimestamp, updateDoc } from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';
import * as A from '../build/vendor/acmcrypto.mjs';

const PROJECT = 'acm-docs-52280';
let n = 0;
/** A separate "phone": its own Firebase app instance. */
function device() {
  const app = initializeApp({ apiKey: 'test', projectId: PROJECT, authDomain: 'x' }, 'd' + (++n));
  const auth = getAuth(app); connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const db = getFirestore(app); connectFirestoreEmulator(db, '127.0.0.1', 8080);
  const fn = getFunctions(app, 'europe-west1'); connectFunctionsEmulator(fn, '127.0.0.1', 5001);
  const call = async (name, data) => (await httpsCallable(fn, name)(data)).data;
  return { app, auth, db, call };
}
const b64 = A.toB64;
async function verifyEmail(email) {
  // emulator: mark the email as verified
  const r = await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${PROJECT}/oobCodes`);
  void r;
}

const words = A.generateMnemonic();
const account = A.deriveIdentity(words);
const email = `t${Date.now()}@example.com`;
let uid;
const phone = device();     // primary
const laptop = device();    // joins with QR
const thief = device();     // has the password only

async function makeAccount() {
  const cred = await createUserWithEmailAndPassword(phone.auth, email, 'Parola-test-1');
  uid = cred.user.uid;
  // verify the email in the emulator (admin REST) and refresh the token
  await fetch(`http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:update`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' }, body: JSON.stringify({ localId: uid, emailVerified: true }),
  });
  await cred.user.getIdToken(true);
  const b = writeBatch(phone.db);
  b.set(doc(phone.db, 'usernames', 'tester_' + n), { uid });
  b.set(doc(phone.db, 'users', uid), { name: 'T', handle: 'tester_' + n, key: b64(account.bundle), fp: account.fingerprint, created: serverTimestamp() });
  await b.commit();
}

const devPhone = A.deriveIdentity(A.generateMnemonic());
let phoneDev;

test('setup: account with profile', async () => { await makeAccount(); });

test('register needs the account keys, not just the password', async () => {
  const ts = Date.now();
  await assert.rejects(phone.call('registerDevice', { bundle: b64(devPhone.bundle), ts, proof: b64(A.signEd(devPhone, `acm-register\n${uid}\n${devPhone.fingerprint}\n${ts}`)) }), /no account keys/);
  const r = await phone.call('registerDevice', { bundle: b64(devPhone.bundle), ts, proof: b64(A.signEd(account, `acm-register\n${uid}\n${devPhone.fingerprint}\n${ts}`)) });
  assert.equal(r.role, 'primary');
  phoneDev = r.dev;
  await signInWithCustomToken(phone.auth, r.token);
});

test('rules: the device session reads devices and events; a plain password session does not', async () => {
  const list = await getDocs(collection(phone.db, 'accounts', uid, 'devices'));
  assert.equal(list.size, 1);
  const ev = await getDocs(collection(phone.db, 'accounts', uid, 'events'));
  assert.ok(ev.size >= 1);
  // the thief signs in with the password: no device session → nothing
  const { signInWithEmailAndPassword } = await import('firebase/auth');
  await signInWithEmailAndPassword(thief.auth, email, 'Parola-test-1');
  await assert.rejects(getDocs(collection(thief.db, 'accounts', uid, 'devices')));
  await assert.rejects(setDoc(doc(thief.db, 'accounts', uid, 'vault', 'x'), { a: 1 }));
});

test('device updates only its own encrypted description', async () => {
  const vk = A.vaultKey(account);
  const info = b64(A.vaultSealText(vk, { name: 'iPhone', platform: 'ios' }, 'device:' + phoneDev));
  await updateDoc(doc(phone.db, 'accounts', uid, 'devices', phoneDev), { info });
  await assert.rejects(updateDoc(doc(phone.db, 'accounts', uid, 'devices', phoneDev), { role: 'member' }));
  await assert.rejects(updateDoc(doc(phone.db, 'accounts', uid, 'devices', phoneDev), { status: 'blocked' }));
  const d = (await getDoc(doc(phone.db, 'accounts', uid, 'devices', phoneDev))).data();
  assert.deepEqual(A.vaultOpenText(vk, A.fromB64(d.info), 'device:' + phoneDev), { name: 'iPhone', platform: 'ios' });
});

let laptopDev, laptopId;
test('QR pairing: the laptop gets the account keys and a session', async () => {
  laptopId = A.deriveIdentity(A.generateMnemonic());
  const { pid } = await laptop.call('pairStart', { bundle: b64(laptopId.bundle) });
  const poll = () => laptop.call('pairPoll', { pid, sig: b64(A.signEd(laptopId, `acm-pair\n${pid}`)) });
  assert.equal((await poll()).status, 'waiting');
  // someone else cannot poll it
  await assert.rejects(laptop.call('pairPoll', { pid, sig: b64(A.signEd(devPhone, `acm-pair\n${pid}`)) }), /bad signature/);
  // the phone scans: QR has pid + fingerprint; it checks the key it gets from the server
  const got = await phone.call('pairGet', { pid });
  assert.equal(got.fp, laptopId.fingerprint);
  const sealed = A.seal({ bytes: new TextEncoder().encode(JSON.stringify({ words })), name: 'keys' }, account, [A.fromB64(got.bundle)]);
  await assert.rejects(phone.call('pairApprove', { pid, fp: 'ab'.repeat(32), sealed: b64(sealed) }), /key mismatch/);
  const ok = await phone.call('pairApprove', { pid, fp: got.fp, sealed: b64(sealed) });
  laptopDev = ok.dev;
  const r = await poll();
  assert.equal(r.status, 'approved');
  assert.equal(r.uid, uid);
  const opened = A.open(A.fromB64(r.sealed), laptopId);
  assert.equal(opened.sender.fingerprint, account.fingerprint);
  assert.equal(JSON.parse(new TextDecoder().decode(opened.bytes)).words, words);
  await signInWithCustomToken(laptop.auth, r.token);
  assert.equal((await getDocs(collection(laptop.db, 'accounts', uid, 'devices'))).size, 2);
  // handed over once
  await assert.rejects(poll());
});

test('session for a registered device needs its key', async () => {
  const ts = Date.now();
  await assert.rejects(thief.call('deviceSession', { uid, dev: laptopDev, ts, sig: b64(A.signEd(devPhone, `acm-session\n${uid}\n${laptopDev}\n${ts}`)) }), /bad signature/);
  const r = await thief.call('deviceSession', { uid, dev: laptopDev, ts, sig: b64(A.signEd(laptopId, `acm-session\n${uid}\n${laptopDev}\n${ts}`)) });
  assert.ok(r.token);
});

test('levels: a member cannot block the primary; the primary blocks the member for good', async () => {
  await assert.rejects(laptop.call('blockDevice', { target: phoneDev }), /only the primary/);
  await phone.call('blockDevice', { target: laptopDev });
  // the blocked laptop: no data, no new session
  await assert.rejects(getDocs(collection(laptop.db, 'accounts', uid, 'devices')));
  const ts = Date.now();
  await assert.rejects(laptop.call('deviceSession', { uid, dev: laptopDev, ts, sig: b64(A.signEd(laptopId, `acm-session\n${uid}\n${laptopDev}\n${ts}`)) }), /blocked/);
  // the phone renews its session (refresh tokens were revoked) and still works
  const ts2 = Date.now();
  const r = await phone.call('deviceSession', { uid, dev: phoneDev, ts: ts2, sig: b64(A.signEd(devPhone, `acm-session\n${uid}\n${phoneDev}\n${ts2}`)) });
  await signInWithCustomToken(phone.auth, r.token);
  const ev = (await getDocs(collection(phone.db, 'accounts', uid, 'events'))).docs.map((d) => d.data().type);
  assert.ok(ev.includes('blocked'));
});

test('cleanup', async () => {
  for (const d of [phone, laptop, thief]) { try { await signOut(d.auth); } catch (e) {} await deleteApp(d.app); }
});
void verifyEmail;
