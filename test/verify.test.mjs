// Confirming a new account's email with our own 6-digit code (emulators; MAIL_TEST keeps the code readable).
import assert from 'node:assert/strict';
import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';

const PROJECT = 'acm-docs-52280';
const FS = `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents`;
let failed = 0;
const code = async (p) => { try { await p; return 'ok'; } catch (e) { return String(e.message || e.code || e); } };
async function check(name, fn) { try { await fn(); console.log('✓', name); } catch (e) { failed++; console.log('✗', name, '—', e.message || e); } }
const app = initializeApp({ apiKey: 'test', projectId: PROJECT, authDomain: 'x' }, 'v1');
const auth = getAuth(app); connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
const fn = getFunctions(app, 'europe-west1'); connectFunctionsEmulator(fn, '127.0.0.1', 5001);
const call = async (n, d) => (await httpsCallable(fn, n)(d)).data;
const testCode = async (uid) => { const r = await fetch(`${FS}/challenges/v${uid}`, { headers: { Authorization: 'Bearer owner' } }); return r.ok ? (await r.json()).fields.test.stringValue : null; };

const cred = await createUserWithEmailAndPassword(auth, `nou-${Date.now()}@example.com`, 'Parola-noua-12');
const uid = cred.user.uid;

await check('Email code: sent by the server, wrong codes refused, the right one confirms the account', async () => {
  assert.equal((await call('emailVerifySend', {})).sent, true);
  const c = await testCode(uid);
  assert.match(c, /^\d{6}$/);
  const wrong = c === '000000' ? '111111' : '000000';
  assert.match(await code(call('emailVerifyCheck', { code: wrong })), /bad code/);
  assert.match(await code(call('emailVerifyCheck', { code: 'abc' })), /bad code/);
  assert.equal((await call('emailVerifyCheck', { code: c })).verified, true);
  await cred.user.reload(); await cred.user.getIdToken(true);
  assert.equal(auth.currentUser.emailVerified, true);
  // used once
  assert.match(await code(call('emailVerifyCheck', { code: c })), /code expired/);
});

await check('Email code: five wrong tries end the code', async () => {
  const c2 = await createUserWithEmailAndPassword(auth, `nou2-${Date.now()}@example.com`, 'Parola-noua-12');
  await call('emailVerifySend', {});
  const c = await testCode(c2.user.uid);
  const wrong = c === '000000' ? '111111' : '000000';
  for (let i = 0; i < 5; i++) await code(call('emailVerifyCheck', { code: wrong }));
  assert.match(await code(call('emailVerifyCheck', { code: c })), /code expired/);
});

console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
