// Round 3 attack campaign (server side), on the emulators: sessions opened with the password only,
// cloud sync (Firestore vault + Storage blocks), functions abuse. Every attack is tried for real
// and recorded (not asserted), so all of them run.
//   firebase emulators:exec --only auth,firestore,functions,storage "node test/attack3.test.mjs"
import fs from 'node:fs';
import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword, signInWithEmailAndPassword, signInWithCustomToken, signOut } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, doc, getDoc, setDoc, deleteDoc, getDocs, collection, writeBatch, serverTimestamp, updateDoc } from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';
import * as A from '../build/vendor/acmcrypto.mjs';

const PROJECT = 'acm-docs-52280';
const BUCKET = 'acm-docs-52280.firebasestorage.app';
const AUTH = 'http://127.0.0.1:9099';
const ST = 'http://127.0.0.1:9199';
const FN = `http://127.0.0.1:5001/${PROJECT}/europe-west1`;
const b64 = A.toB64;
let n = 0;
function client() {
  const app = initializeApp({ apiKey: 'test', projectId: PROJECT, authDomain: 'x', storageBucket: BUCKET }, 'c' + (++n));
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
const ok = async (p) => { try { await p; return true; } catch (e) { return false; } };
const idt = (path, body) => fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/${path}?key=test`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

// Storage REST, the same calls the app makes
const objUrl = (path) => `${ST}/v0/b/${BUCKET}/o/${encodeURIComponent(path)}`;
async function stPut(c, path, bytes, type = 'application/octet-stream') {
  const t = c && (await c.tok());
  const r = await fetch(`${ST}/v0/b/${BUCKET}/o?uploadType=media&name=${encodeURIComponent(path)}`, { method: 'POST', headers: Object.assign({ 'Content-Type': type }, t ? { Authorization: 'Firebase ' + t } : {}), body: bytes });
  return r.ok;
}
async function stGet(c, path) {
  const t = c && (await c.tok());
  const r = await fetch(objUrl(path) + '?alt=media', { headers: t ? { Authorization: 'Firebase ' + t } : {} });
  return r.ok;
}
async function stDel(c, path) {
  const t = c && (await c.tok());
  const r = await fetch(objUrl(path), { method: 'DELETE', headers: t ? { Authorization: 'Firebase ' + t } : {} });
  return r.ok;
}
async function stList(c, prefix) {
  const t = c && (await c.tok());
  const r = await fetch(`${ST}/v0/b/${BUCKET}/o?prefix=${encodeURIComponent(prefix)}`, { headers: t ? { Authorization: 'Firebase ' + t } : {} });
  return r.ok;
}
const rid = () => A.toHex ? A.toHex(crypto.getRandomValues(new Uint8Array(16))) : Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('hex');

/** A full honest account: profile + @name + primary device with a device session. */
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
  return { c, uid, email, password, id, handle, dev: r.dev, dk };
}
/** A second device of an account, joined with QR. */
async function addMember(acc) {
  const k = A.deriveIdentity(A.generateMnemonic());
  const c = client();
  const p = await c.call('pairStart', { bundle: b64(k.bundle) });
  await acc.c.call('pairApprove', { pid: p.pid, fp: k.fingerprint, sealed: b64(A.seal({ bytes: new Uint8Array([1]), name: 'k' }, acc.id, [k.bundle])) });
  const r = await c.call('pairPoll', { pid: p.pid, sig: b64(A.signEd(k, `acm-pair\n${p.pid}`)) });
  await signInWithCustomToken(c.auth, r.token);
  return { c, dev: r.dev, key: k };
}

const log = [];
async function attack(code, severity, title, run) {
  let succeeded, detail = '';
  try { const r = await run(); succeeded = !!(r && r.ok !== undefined ? r.ok : r); detail = (r && r.detail) || ''; } catch (e) { succeeded = false; detail = 'error: ' + (e.message || e); }
  log.push({ code, severity, title, result: succeeded ? 'VULNERABIL' : 'BLOCAT', detail });
  console.log(`${succeeded ? '✗ VULNERABIL' : '✓ blocat    '}  [${severity}] ${code} ${title}${detail ? '  — ' + detail : ''}`);
}

const victim = await makeAccount('victim');
const other = await makeAccount('other');
const vblob = `accounts/${victim.uid}/blobs/${rid()}`;
const putOk = await stPut(victim.c, vblob, new Uint8Array(1000));
console.log('setup: the victim device uploads an encrypted block:', putOk ? 'ok' : 'FAILED (storage emulator/rules)');
await setDoc(doc(victim.c.db, 'accounts', victim.uid, 'vault', 'r1'), { b: 'AAAA', v: 1, at: serverTimestamp() });

// ============================================================ P: someone who knows only the email + password
const thief = client();
await signInWithEmailAndPassword(thief.auth, victim.email, victim.password);

await attack('P01', 'MARE', 'Doar cu parola: schimbă numele afișat al victimei (văzut de toți contactele noi)', async () => {
  const cur = (await getDoc(doc(thief.db, 'users', victim.uid))).data();
  const r = await ok(updateDoc(doc(thief.db, 'users', victim.uid), { name: 'Cont compromis' }));
  if (r) await updateDoc(doc(victim.c.db, 'users', victim.uid), { name: cur.name });
  return r;
});

await attack('P02', 'MARE', 'Doar cu parola: eliberează @numele victimei, apoi alt cont îl preia (impersonare pentru contactele noi)', async () => {
  const cur = (await getDoc(doc(thief.db, 'users', victim.uid))).data();
  const tmp = 'tmp' + Date.now().toString(36);
  const b = writeBatch(thief.db);
  b.set(doc(thief.db, 'usernames', tmp), { uid: victim.uid });
  b.update(doc(thief.db, 'users', victim.uid), { handle: tmp });
  b.delete(doc(thief.db, 'usernames', cur.handle));
  if (!(await ok(b.commit()))) return { ok: false, detail: 'redenumirea refuzată' };
  // the attacker's own account (with a real device) now takes the victim's old @name
  const mine = (await getDoc(doc(other.c.db, 'users', other.uid))).data();
  const b2 = writeBatch(other.c.db);
  b2.set(doc(other.c.db, 'usernames', cur.handle), { uid: other.uid });
  b2.update(doc(other.c.db, 'users', other.uid), { handle: cur.handle });
  b2.delete(doc(other.c.db, 'usernames', mine.handle));
  const took = await ok(b2.commit());
  // put everything back
  if (took) { const b3 = writeBatch(other.c.db); b3.set(doc(other.c.db, 'usernames', mine.handle), { uid: other.uid }); b3.update(doc(other.c.db, 'users', other.uid), { handle: mine.handle }); b3.delete(doc(other.c.db, 'usernames', cur.handle)); await b3.commit(); }
  const b4 = writeBatch(victim.c.db); b4.set(doc(victim.c.db, 'usernames', cur.handle), { uid: victim.uid }); b4.update(doc(victim.c.db, 'users', victim.uid), { handle: cur.handle }); b4.delete(doc(victim.c.db, 'usernames', tmp));
  await ok(b4.commit());
  return { ok: true, detail: took ? `@${cur.handle} a ajuns la contul atacatorului` : 'numele a fost eliberat (preluarea a eșuat)' };
});

await attack('P03', 'MARE', 'Doar cu parola: șterge contul de conectare (Firebase Auth) direct prin API', async () => {
  // on a copy, so the next attacks still have a victim
  const acc = await makeAccount('del');
  const t = client(); await signInWithEmailAndPassword(t.auth, acc.email, acc.password);
  const r = await idt('accounts:delete', { idToken: await t.tok() });
  return { ok: r.ok, detail: r.ok ? 'emulatorul nu aplică setarea „fără ștergere din client”; verificat live în prod-smoke' : '' };
});

await attack('P04', 'MEDIU', 'Doar cu parola: schimbă parola (proprietarul nu se mai poate conecta cu parola lui)', async () => {
  const acc = await makeAccount('pw');
  const t = client(); await signInWithEmailAndPassword(t.auth, acc.email, acc.password);
  const r = await idt('accounts:update', { idToken: await t.tok(), password: 'Parola-atacator-9', returnSecureToken: true });
  return { ok: r.ok, detail: r.ok ? 'proprietarul își recuperează accesul doar prin „Ai uitat parola?”' : '' };
});

await attack('P05', 'MARE', 'Doar cu parola: schimbă emailul contului direct (fără confirmare pe emailul vechi)', async () => {
  const acc = await makeAccount('mail');
  const t = client(); await signInWithEmailAndPassword(t.auth, acc.email, acc.password);
  const r = await idt('accounts:update', { idToken: await t.tok(), email: `attacker-${Date.now()}@example.com`, returnSecureToken: true });
  return { ok: r.ok, detail: r.ok ? 'în emulator merge; în producție o blochează „email enumeration protection” dacă e activă — de verificat' : '' };
});

await attack('P06', 'MARE', 'Doar cu parola: funcțiile de dispozitiv (aprobare QR, blocare, ieșire, principal)', async () => {
  const k = A.deriveIdentity(A.generateMnemonic());
  const p = await client().call('pairStart', { bundle: b64(k.bundle) });
  const a = await ok(thief.call('pairGet', { pid: p.pid }));
  const b = await ok(thief.call('pairApprove', { pid: p.pid, fp: k.fingerprint, sealed: 'x' }));
  const c = await ok(thief.call('blockDevice', { target: victim.dev }));
  const d = await ok(thief.call('leaveDevice', {}));
  const ts = Date.now();
  const e = await ok(thief.call('claimPrimary', { ts, sig: 'x' }));
  return { ok: a || b || c || d || e, detail: `pairGet:${a} pairApprove:${b} block:${c} leave:${d} primary:${e}` };
});

await attack('P07', 'CRITIC', 'Doar cu parola: citește / scrie / șterge blocurile criptate din cloud (Storage)', async () => {
  const a = await stGet(thief, vblob);
  const b = await stPut(thief, `accounts/${victim.uid}/blobs/${rid()}`, new Uint8Array(10));
  const c = await stDel(thief, vblob);
  return { ok: a || b || c, detail: `citire:${a} scriere:${b} ștergere:${c}` };
});

await attack('P08', 'MARE', 'Doar cu parola: scrie / șterge înregistrări din seiful cloud (Firestore)', async () => {
  const a = await ok(setDoc(doc(thief.db, 'accounts', victim.uid, 'vault', 'evil'), { b: 'AAAA', v: 1, at: 1 }));
  const b = await ok(deleteDoc(doc(thief.db, 'accounts', victim.uid, 'vault', 'r1')));
  return { ok: a || b, detail: `scriere:${a} ștergere:${b}` };
});

await attack('P09', 'MEDIU', 'Doar cu parola: proprietarul nu află că cineva a intrat cu parola lui (nicio alertă)', async () => {
  const ev = await getDocs(collection(victim.c.db, 'accounts', victim.uid, 'events'));
  const pw = ev.docs.filter((d) => d.data().type === 'password').length;
  return { ok: pw === 0, detail: `alerte „cineva a intrat cu parola”: ${pw}` };
});

await attack('P10', 'MIC', 'Doar cu parola: citește profilurile publice și caută @nume', async () => {
  const a = await ok(getDoc(doc(thief.db, 'users', other.uid)));
  const b = await ok(getDoc(doc(thief.db, 'usernames', other.handle)));
  return { ok: a || b, detail: 'date publice prin natura lor (cheie publică + @nume); de închis odată cu P01' };
});

// ============================================================ V: cloud sync (vault + Storage)
const o = other.c;
await attack('V01', 'CRITIC', 'Alt cont: citește blocul criptat al victimei (știind calea)', () => stGet(o, vblob));
await attack('V02', 'CRITIC', 'Alt cont: scrie un bloc în folderul victimei', () => stPut(o, `accounts/${victim.uid}/blobs/${rid()}`, new Uint8Array(10)));
await attack('V03', 'CRITIC', 'Alt cont: șterge blocul victimei', () => stDel(o, vblob));
await attack('V04', 'MEDIU', 'Alt cont / propriul dispozitiv: listează blocurile (enumerare)', async () => {
  const a = await stList(o, `accounts/${victim.uid}/`);
  const b = await stList(victim.c, `accounts/${victim.uid}/blobs/`);
  return { ok: a || b, detail: `alt cont:${a} propriul:${b}` };
});
await attack('V05', 'MARE', 'Dispozitivul victimei: rescrie un bloc existent (înlocuire de fișier sincronizat)', async () => {
  // a re-upload over the same name is an update
  return stPut(victim.c, vblob, new Uint8Array(20));
});
await attack('V06', 'MEDIU', 'Nume de bloc ne-hex / cu ../ (ieșire din folder)', async () => {
  const a = await stPut(victim.c, `accounts/${victim.uid}/blobs/../../${other.uid}/blobs/${rid()}`, new Uint8Array(5));
  const b = await stPut(victim.c, `accounts/${victim.uid}/blobs/evil.html`, new Uint8Array(5), 'application/octet-stream');
  const c = await stPut(victim.c, `accounts/${victim.uid}/other/${rid()}`, new Uint8Array(5));
  return { ok: a || b || c, detail: `traversare:${a} nume liber:${b} alt folder:${c}` };
});
await attack('V07', 'MEDIU', 'Bloc cu tip HTML (servit ca pagină web de pe domeniul Firebase)', () => stPut(victim.c, `accounts/${victim.uid}/blobs/${rid()}`, new TextEncoder().encode('<script>alert(1)</script>'), 'text/html'));
await attack('V08', 'MEDIU', 'Bloc peste limita de 110 MB', () => stPut(victim.c, `accounts/${victim.uid}/blobs/${rid()}`, new Uint8Array(111 * 1024 * 1024)));
await attack('V09', 'CRITIC', 'Neautentificat: citește / listează blocuri', async () => {
  const a = await stGet(null, vblob);
  const b = await stList(null, 'accounts/');
  return { ok: a || b, detail: `citire:${a} listare:${b}` };
});
await attack('V10', 'MEDIU', 'Seif: înregistrare cu câmpuri în plus (date necriptate strecurate lângă cele criptate)', () => ok(setDoc(doc(victim.c.db, 'accounts', victim.uid, 'vault', 'x2'), { b: 'AAAA', v: 1, at: 1, plain: 'secret' })));
await attack('V11', 'MEDIU', 'Cost: un singur dispozitiv scrie 300 de înregistrări în seif într-un minut (fără cotă)', async () => {
  let made = 0;
  await Promise.all(Array.from({ length: 300 }, async (_, i) => { if (await ok(setDoc(doc(victim.c.db, 'accounts', victim.uid, 'vault', 'flood' + i), { b: 'A'.repeat(1000), v: 1, at: 1 }))) made++; }));
  return { ok: made > 200, detail: `${made}/300 acceptate — abuz de cost posibil doar din contul propriu` };
});

// devices that left / were blocked
const m1 = await addMember(victim);
const m2 = await addMember(victim);
await victim.c.call('blockDevice', { target: m1.dev });
await m2.c.call('leaveDevice', {});
await attack('V12', 'CRITIC', 'Dispozitiv blocat: citește / scrie blocurile din cloud', async () => {
  const a = await stGet(m1.c, vblob);
  const b = await stPut(m1.c, `accounts/${victim.uid}/blobs/${rid()}`, new Uint8Array(10));
  return { ok: a || b, detail: `citire:${a} scriere:${b}` };
});
await attack('V13', 'CRITIC', 'Dispozitiv ieșit din cont (deconectat): citește seiful și blocurile cu sesiunea veche', async () => {
  const a = await stGet(m2.c, vblob);
  const b = await ok(getDoc(doc(m2.c.db, 'accounts', victim.uid, 'vault', 'r1')));
  return { ok: a || b, detail: `bloc:${a} seif:${b}` };
});
await attack('V14', 'MARE', 'Dispozitiv ieșit din cont: cere o sesiune nouă cu cheia lui', async () => {
  const ts = Date.now();
  return ok(client().call('deviceSession', { uid: victim.uid, dev: m2.dev, ts, sig: b64(A.signEd(m2.key, `acm-session\n${victim.uid}\n${m2.dev}\n${ts}`)) }));
});

// ============================================================ F: functions
await attack('F01', 'MEDIU', 'Limita de coduri QR ocolită cu antet X-Forwarded-For fals', async () => {
  const k = A.deriveIdentity(A.generateMnemonic());
  let made = 0;
  for (let i = 0; i < 30; i++) {
    // what Google's front end sends: the caller's made-up entries, then the address it really saw
    const r = await fetch(`${FN}/pairStart`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `10.9.${i}.${i}, 203.0.113.7` }, body: JSON.stringify({ data: { bundle: b64(k.bundle) } }) });
    if (r.ok) made++;
  }
  return { ok: made > 10, detail: `${made}/30 coduri create cu adrese inventate (limita: 10)` };
});
await attack('F02', 'MIC', 'pairPoll: cine nu are cheia de unică folosință nu află nici măcar starea', async () => {
  const k = A.deriveIdentity(A.generateMnemonic());
  const p = await client().call('pairStart', { bundle: b64(k.bundle) });
  return ok(client().call('pairPoll', { pid: p.pid, sig: 'AAAA' }));
});
await attack('F03', 'MARE', 'Cont cu email neconfirmat (doar parola): înregistrează un dispozitiv / creează profil', async () => {
  const c = client();
  const cr = await createUserWithEmailAndPassword(c.auth, `unv3-${Date.now()}@example.com`, 'Parola-unv-1');
  const id = A.deriveIdentity(A.generateMnemonic());
  const dk = A.deriveIdentity(A.generateMnemonic()); const ts = Date.now();
  const r = await ok(c.call('registerDevice', { bundle: b64(dk.bundle), ts, proof: b64(A.signEd(id, `acm-register\n${cr.user.uid}\n${dk.fingerprint}\n${ts}`)) }));
  return r;
});
await attack('F04', 'MEDIU', 'Sesiune de dispozitiv folosită pentru a schimba parola contului (fără parola veche)', async () => {
  const r = await idt('accounts:update', { idToken: await victim.c.tok(), password: 'Parola-noua-123', returnSecureToken: true });
  return { ok: r.ok, detail: r.ok ? 'o sesiune de dispozitiv (furată) poate schimba parola' : '' };
});

for (const c of [victim.c, other.c, thief, m1.c, m2.c]) { try { await signOut(c.auth); } catch (e) {} }
fs.writeFileSync('attack3-log.json', JSON.stringify(log, null, 2));
const bad = log.filter((x) => x.result === 'VULNERABIL');
console.log(`\nTOTAL ${log.length} atacuri · blocate ${log.length - bad.length} · reușite ${bad.length}`);
process.exit(0);
