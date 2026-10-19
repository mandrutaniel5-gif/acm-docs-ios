// After a deploy: one real round trip against the live project with a throwaway account
// (created and deleted here). Checks that the functions can issue device sessions and that the
// rules let that device in. Needs GOOGLE_APPLICATION_CREDENTIALS (the deploy key).
import { createRequire } from 'node:module';
import { initializeApp as clientApp } from 'firebase/app';
import { getAuth as clientAuth, signInWithCustomToken, signOut } from 'firebase/auth';
import { getFirestore, doc, writeBatch, getDocs, collection, serverTimestamp } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import * as A from '../build/vendor/acmcrypto.mjs';

const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { initializeApp, cert } = require('firebase-admin/app');
const { readFileSync } = require('node:fs');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore: adminDb } = require('firebase-admin/firestore');

const PROJECT = 'acm-docs-52280';
initializeApp({ credential: cert(JSON.parse(readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8'))), projectId: PROJECT });
const admin = getAuth();
const app = clientApp({ apiKey: 'AIzaSyDsXxKCjxhOeGTZYyYIsm_S6SO6zADe25w', authDomain: `${PROJECT}.firebaseapp.com`, projectId: PROJECT });
const auth = clientAuth(app), db = getFirestore(app), fn = getFunctions(app, 'europe-west1');
const call = async (n, d) => (await httpsCallable(fn, n)(d)).data;

const handle = 'ci_' + Date.now().toString(36);
const user = await admin.createUser({ email: `${handle}@example.invalid`, emailVerified: true, password: 'Ci-' + Math.random().toString(36).slice(2) + 'X9!' });
let ok = false;
try {
  await signInWithCustomToken(auth, await admin.createCustomToken(user.uid));
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
  const ts2 = Date.now();
  const s = await call('deviceSession', { uid: user.uid, dev: r.dev, ts: ts2, sig: A.toB64(A.signEd(dev, `acm-session\n${user.uid}\n${r.dev}\n${ts2}`)) });
  if (!s.token) throw new Error('deviceSession');
  ok = true;
  console.log('LIVE OK: device registered, session issued, rules let the device in');
} finally {
  try { await signOut(auth); } catch (e) {}
  const store = adminDb();
  await store.recursiveDelete(store.collection('accounts').doc(user.uid)).catch(() => {});
  await store.collection('users').doc(user.uid).delete().catch(() => {});
  await store.collection('usernames').doc(handle).delete().catch(() => {});
  await admin.deleteUser(user.uid).catch(() => {});
  if (!ok) process.exitCode = 1;
}
process.exit(process.exitCode || 0);
