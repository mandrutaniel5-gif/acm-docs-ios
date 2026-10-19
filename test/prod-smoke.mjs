// After a deploy: one real round trip against the live project with a throwaway account
// (created and deleted here). Checks that the functions can issue device sessions and that the
// rules let that device in. Needs GOOGLE_APPLICATION_CREDENTIALS (the deploy key).
import { createRequire } from 'node:module';
import { initializeApp as clientApp } from 'firebase/app';
import { getAuth as clientAuth, signInWithCustomToken, signInWithEmailAndPassword, signOut } from 'firebase/auth';
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
  res = await fetch(`${base}/${encodeURIComponent(name)}`, { method: 'DELETE', headers: { Authorization: 'Firebase ' + tok } });
  if (!res.ok) throw new Error('storage delete ' + res.status);
  ok = true;
  console.log('LIVE OK: cloud sync record + encrypted block (upload, download, delete), other folders closed');
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
