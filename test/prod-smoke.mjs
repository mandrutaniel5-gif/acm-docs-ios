// After a deploy: one real round trip against the live project with a throwaway account
// (created and deleted here). Checks that the functions can issue device sessions and that the
// rules let that device in. Needs GOOGLE_APPLICATION_CREDENTIALS (the deploy key).
import { createRequire } from 'node:module';
import { initializeApp as clientApp } from 'firebase/app';
import { getAuth as clientAuth, signInWithCustomToken, signInWithEmailAndPassword, signOut, multiFactor, getMultiFactorResolver, TotpMultiFactorGenerator } from 'firebase/auth';
import { createHmac } from 'node:crypto';
import { getFirestore, doc, getDoc, setDoc, writeBatch, getDocs, collection, serverTimestamp, query, orderBy } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import * as A from '../build/vendor/acmcrypto.mjs';

const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { initializeApp, cert } = require('firebase-admin/app');
const { readFileSync } = require('node:fs');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore: adminDb } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
const BUCKET = `${'acm-docs-52280'}.firebasestorage.app`;

const PROJECT = 'acm-docs-52280';
initializeApp({ credential: cert(JSON.parse(readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8'))), projectId: PROJECT });
const admin = getAuth();
const app = clientApp({ apiKey: 'AIzaSyDsXxKCjxhOeGTZYyYIsm_S6SO6zADe25w', authDomain: `${PROJECT}.firebaseapp.com`, projectId: PROJECT });
const auth = clientAuth(app), db = getFirestore(app), fn = getFunctions(app, 'europe-west1');
const call = async (n, d) => (await httpsCallable(fn, n)(d)).data;

const handle = 'ci_' + Date.now().toString(36);
const password = 'Ci-' + Math.random().toString(36).slice(2) + 'X9!';
const user = await admin.createUser({ email: `${handle}@example.invalid`, emailVerified: true, password });
let ok = false;
try {
  await signInWithEmailAndPassword(auth, `${handle}@example.invalid`, password);
  const acct = A.deriveIdentity(A.generateMnemonic());
  const b = writeBatch(db);
  b.set(doc(db, 'usernames', handle), { uid: user.uid });
  b.set(doc(db, 'users', user.uid), { name: 'CI', handle, key: A.toB64(acct.bundle), fp: acct.fingerprint, created: serverTimestamp() });
  await b.commit();
  const dev = A.deriveIdentity(A.generateMnemonic());
  const ts = Date.now();
  const r = await call('registerDevice', { bundle: A.toB64(dev.bundle), ts, proof: A.toB64(A.signEd(acct, `acm-register\n${user.uid}\n${dev.fingerprint}\n${ts}`)) });
  if (r.role !== 'primary' || !r.token) throw new Error('registerDevice: ' + JSON.stringify(r));
  await signInWithCustomToken(auth, r.token);
  const list = await getDocs(collection(db, 'accounts', user.uid, 'devices'));
  if (list.size !== 1) throw new Error('devices: ' + list.size);
  // a device session (custom token) still counts as a confirmed email for profiles / @names
  if (!(await getDoc(doc(db, 'users', user.uid))).exists()) throw new Error('profile not readable with a device session');
  if (!(await getDoc(doc(db, 'usernames', handle))).exists()) throw new Error('@name not readable with a device session');
  const ts2 = Date.now();
  const s = await call('deviceSession', { uid: user.uid, dev: r.dev, ts: ts2, sig: A.toB64(A.signEd(dev, `acm-session\n${user.uid}\n${r.dev}\n${ts2}`)) });
  if (!s.token) throw new Error('deviceSession');
  console.log('LIVE OK: device registered, session issued, rules let the device in');

  // cloud sync: one encrypted record in Firestore and one encrypted block in Storage
  const vk = A.vaultKey(acct);
  await setDoc(doc(db, 'accounts', user.uid, 'vault', 'r1'), { b: A.toB64(A.vaultSealText(vk, { kind: 'kv', k: 'x', v: 'y', t: 1 }, 'rec:r1')), v: 1, at: serverTimestamp() });
  const recs = await getDocs(query(collection(db, 'accounts', user.uid, 'vault'), orderBy('at')));
  if (recs.size !== 1 || A.vaultOpenText(vk, A.fromB64(recs.docs[0].data().b), 'rec:r1').v !== 'y') throw new Error('vault record');
  const tok = await auth.currentUser.getIdToken();
  const id = 'ab'.repeat(16), name = `accounts/${user.uid}/blobs/${id}`;
  const base = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o`;
  const sealed = A.vaultSeal(vk, new TextEncoder().encode('document'), 'blob:' + id);
  let res = await fetch(`${base}?uploadType=media&name=${encodeURIComponent(name)}`, { method: 'POST', headers: { Authorization: 'Firebase ' + tok, 'Content-Type': 'application/octet-stream' }, body: sealed });
  if (!res.ok) throw new Error('storage upload ' + res.status + ' ' + (await res.text()).slice(0, 300));
  res = await fetch(`${base}/${encodeURIComponent(name)}?alt=media`, { headers: { Authorization: 'Firebase ' + tok } });
  if (!res.ok) throw new Error('storage download ' + res.status);
  if (new TextDecoder().decode(A.vaultOpen(vk, new Uint8Array(await res.arrayBuffer()), 'blob:' + id)) !== 'document') throw new Error('storage content');
  // another account's folder stays closed, and so does an anonymous request
  res = await fetch(`${base}?uploadType=media&name=${encodeURIComponent(`accounts/someoneelse/blobs/${id}`)}`, { method: 'POST', headers: { Authorization: 'Firebase ' + tok, 'Content-Type': 'application/octet-stream' }, body: sealed });
  if (res.ok) throw new Error('storage: wrote into another account');
  res = await fetch(`${base}/${encodeURIComponent(name)}?alt=media`);
  if (res.ok) throw new Error('storage: anonymous read');
  // a block is never rewritten, and only as unreadable bytes (never a web page)
  res = await fetch(`${base}?uploadType=media&name=${encodeURIComponent(name)}`, { method: 'POST', headers: { Authorization: 'Firebase ' + tok, 'Content-Type': 'application/octet-stream' }, body: sealed });
  if (res.ok) throw new Error('storage: an existing block was rewritten');
  const html = `accounts/${user.uid}/blobs/${'cd'.repeat(16)}`;
  res = await fetch(`${base}?uploadType=media&name=${encodeURIComponent(html)}`, { method: 'POST', headers: { Authorization: 'Firebase ' + tok, 'Content-Type': 'text/html' }, body: '<b>x</b>' });
  if (res.ok) throw new Error('storage: accepted a text/html block');
  res = await fetch(`${base}/${encodeURIComponent(name)}`, { method: 'DELETE', headers: { Authorization: 'Firebase ' + tok } });
  if (!res.ok) throw new Error('storage delete ' + res.status);
  console.log('LIVE OK: cloud sync record + encrypted block (upload, download, delete), other folders closed, no rewrite, no HTML');

  // email + password only (no device): the profile cannot be changed, the sign-in cannot be deleted
  const app2 = clientApp({ apiKey: 'AIzaSyDsXxKCjxhOeGTZYyYIsm_S6SO6zADe25w', authDomain: `${PROJECT}.firebaseapp.com`, projectId: PROJECT }, 'pw');
  const auth2 = clientAuth(app2), db2 = getFirestore(app2);
  await signInWithEmailAndPassword(auth2, `${handle}@example.invalid`, password);
  const cur = (await getDoc(doc(db2, 'users', user.uid))).data();
  let renamed = true;
  try { await setDoc(doc(db2, 'users', user.uid), { ...cur, name: 'Renamed' }); } catch (e) { renamed = false; }
  if (renamed) throw new Error('rules: profile changed with the password only');
  const del = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=AIzaSyDsXxKCjxhOeGTZYyYIsm_S6SO6zADe25w`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: await auth2.currentUser.getIdToken() }) });
  if (del.ok) throw new Error('auth: the sign-in was deleted with the password only');
  await signOut(auth2);
  console.log('LIVE OK: with the password only, the profile cannot be changed and the sign-in cannot be deleted');
  // that password sign-in was reported to the account's devices (beforeSignIn → event "password")
  let seen = false;
  for (let i = 0; i < 6 && !seen; i++) {
    const evs = await getDocs(collection(db, 'accounts', user.uid, 'events'));
    seen = evs.docs.some((d) => d.data().type === 'password');
    if (!seen) await new Promise((r) => setTimeout(r, 1500));
  }
  if (!seen) throw new Error('no "password" sign-in event for the devices');
  console.log('LIVE OK: a sign-in with the password is reported to the devices');

  // two-step verification: with it on, the password alone does not sign in anywhere
  let algo = 'sha1', digits = 6, period = 30;
  const totp = (b32, shift = 0) => {
    const alph = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let bits = '';
    for (const ch of b32.replace(/=+$/, '').toUpperCase()) bits += alph.indexOf(ch).toString(2).padStart(5, '0');
    const key = Buffer.from(bits.match(/.{8}/g).map((x) => parseInt(x, 2)));
    const ctr = Buffer.alloc(8); ctr.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 1000 / period) + shift));
    const h = createHmac(algo, key).update(ctr).digest(); const o = h[h.length - 1] & 15;
    return String(((h.readUInt32BE(o) & 0x7fffffff) % 10 ** digits)).padStart(digits, '0');
  };
  const app3 = clientApp({ apiKey: 'AIzaSyDsXxKCjxhOeGTZYyYIsm_S6SO6zADe25w', authDomain: `${PROJECT}.firebaseapp.com`, projectId: PROJECT }, 'mfa');
  const auth3 = clientAuth(app3);
  await signInWithEmailAndPassword(auth3, `${handle}@example.invalid`, password);
  const secret = await TotpMultiFactorGenerator.generateSecret(await multiFactor(auth3.currentUser).getSession());
  algo = String(secret.hashingAlgorithm || 'SHA1').toLowerCase().replace(/[^a-z0-9]/g, '').replace(/^sha(\d)/, 'sha$1');
  digits = secret.codeLength || 6; period = secret.codeIntervalSeconds || 30;
  console.log('totp parameters:', secret.hashingAlgorithm, digits, period);
  console.log('totp key length:', String(secret.secretKey).length, /^[A-Z2-7]+=*$/.test(secret.secretKey) ? 'base32' : 'NOT base32');
  let enrolled = false, lastErr = null;
  for (const shift of [0, -1, 1, -2, 2]) {
    try { await multiFactor(auth3.currentUser).enroll(TotpMultiFactorGenerator.assertionForEnrollment(secret, totp(secret.secretKey, shift)), 'CI'); enrolled = true; console.log('totp enrolled with time step shift', shift); break; }
    catch (e) { lastErr = e; console.log('totp enroll, shift', shift, e.code); if (e.code !== 'auth/invalid-verification-code') break; }
  }
  if (!enrolled) throw lastErr;
  await signOut(auth3);
  // a code is good once: wait for the next one before signing in
  await new Promise((r) => setTimeout(r, (period - (Math.floor(Date.now() / 1000) % period) + 1) * 1000));
  let needs = false, resolver = null;
  try { await signInWithEmailAndPassword(auth3, `${handle}@example.invalid`, password); } catch (e) { needs = e.code === 'auth/multi-factor-auth-required'; if (needs) resolver = getMultiFactorResolver(auth3, e); }
  if (!needs) throw new Error('two-step: the password alone still signed in');
  const hint = resolver.hints.find((x) => x.factorId === 'totp');
  let wrong = true;
  try { await resolver.resolveSignIn(TotpMultiFactorGenerator.assertionForSignIn(hint.uid, '000000')); } catch (e) { wrong = false; }
  if (wrong && totp(secret.secretKey) !== '000000') throw new Error('two-step: a wrong code was accepted');
  const done = await resolver.resolveSignIn(TotpMultiFactorGenerator.assertionForSignIn(hint.uid, totp(secret.secretKey)));
  if (!done.user) throw new Error('two-step: the right code did not sign in');
  await signOut(auth3);
  // the account's device is not affected: its device session still works
  const ts3 = Date.now();
  const s3 = await call('deviceSession', { uid: user.uid, dev: r.dev, ts: ts3, sig: A.toB64(A.signEd(dev, `acm-session\n${user.uid}\n${r.dev}\n${ts3}`)) });
  await signInWithCustomToken(auth, s3.token);
  if (!(await getDocs(collection(db, 'accounts', user.uid, 'devices'))).size) throw new Error('device session after two-step');
  console.log('LIVE OK: two-step verification — password alone refused, wrong code refused, right code accepted, devices unaffected');

  // pairing limit: made-up addresses in X-Forwarded-For do not get around it
  const pk = A.deriveIdentity(A.generateMnemonic());
  let made = 0;
  for (let i = 0; i < 14; i++) {
    const r2 = await fetch(`https://europe-west1-${PROJECT}.cloudfunctions.net/pairStart`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `10.77.${i}.${i + 1}` }, body: JSON.stringify({ data: { bundle: A.toB64(pk.bundle) } }) });
    if (r2.ok) made++;
  }
  if (made > 10) throw new Error(`pairing limit bypassed with a fake X-Forwarded-For: ${made}/14`);
  console.log(`LIVE OK: pairing limit holds with fake addresses (${made}/14 accepted)`);
  ok = true;
} finally {
  try { await signOut(auth); } catch (e) {}
  const store = adminDb();
  await store.recursiveDelete(store.collection('accounts').doc(user.uid)).catch(() => {});
  await store.collection('users').doc(user.uid).delete().catch(() => {});
  await store.collection('usernames').doc(handle).delete().catch(() => {});
  await getStorage().bucket(BUCKET).deleteFiles({ prefix: `accounts/${user.uid}/` }).catch(() => {});
  await admin.deleteUser(user.uid).catch(() => {});
  if (!ok) process.exitCode = 1;
}
process.exit(process.exitCode || 0);
