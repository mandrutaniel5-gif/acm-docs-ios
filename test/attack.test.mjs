// Attack campaign against the server side (Firestore rules + Cloud Functions), on the emulators.
// Each attack is tried for real; the result is recorded, not asserted, so every attack runs.
//   firebase emulators:exec --only auth,firestore,functions "node test/attack.test.mjs"
// Output: attack-log.json + a readable summary on stdout.
import fs from 'node:fs';
import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword, signInWithEmailAndPassword, signInWithCustomToken, signOut } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, doc, getDoc, setDoc, deleteDoc, getDocs, collection, writeBatch, serverTimestamp, updateDoc, query, where, limit } from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';
import * as A from '../build/vendor/acmcrypto.mjs';

const PROJECT = 'acm-docs-52280';
const b64 = A.toB64;
let n = 0;
function client() {
  const app = initializeApp({ apiKey: 'test', projectId: PROJECT, authDomain: 'x' }, 'c' + (++n));
  const auth = getAuth(app); connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const db = getFirestore(app); connectFirestoreEmulator(db, '127.0.0.1', 8080);
  const fn = getFunctions(app, 'europe-west1'); connectFunctionsEmulator(fn, '127.0.0.1', 5001);
  const call = async (name, data) => (await httpsCallable(fn, name)(data)).data;
  return { app, auth, db, call };
}
async function verify(uid) {
  await fetch(`http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:update`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' }, body: JSON.stringify({ localId: uid, emailVerified: true }),
  });
}
const ok = async (p) => { try { await p; return true; } catch (e) { return false; } };

/** Plans (2.3.0): the test accounts get a paid plan (as the console would grant it), so they may add devices. */
async function grant(uid, plan = 'pro') {
  const r = await fetch(`http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents/billing/${uid}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({ fields: { plan: { stringValue: plan }, until: { integerValue: String(Date.now() + 30 * 864e5) }, source: { stringValue: 'manual' } } }),
  });
  if (!r.ok) throw new Error('grant ' + r.status);
}

/** A full honest account: profile + @name + primary device with a device session. */
async function makeAccount(tag) {
  const c = client();
  const email = `${tag}-${Date.now()}@example.com`;
  const password = 'Parola-' + tag + '-1';
  const cred = await createUserWithEmailAndPassword(c.auth, email, password);
  const uid = cred.user.uid;
  await verify(uid); await cred.user.getIdToken(true); await grant(uid);
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

const log = [];
async function attack(code, severity, title, run) {
  let succeeded, detail = '';
  try { const r = await run(); succeeded = !!(r && r.ok !== undefined ? r.ok : r); detail = (r && r.detail) || ''; } catch (e) { succeeded = false; detail = 'error: ' + (e.message || e); }
  log.push({ code, severity, title, result: succeeded ? 'VULNERABIL' : 'BLOCAT', detail });
  console.log(`${succeeded ? '✗ VULNERABIL' : '✓ blocat    '}  [${severity}] ${code} ${title}${detail ? '  — ' + detail : ''}`);
}

const victim = await makeAccount('victim');
const other = await makeAccount('other');

// ------------------------------------------------------------ attacker with the victim's password only
const thief = client();
await signInWithEmailAndPassword(thief.auth, victim.email, victim.password);
const evil = A.deriveIdentity(A.generateMnemonic());

await attack('S01', 'CRITIC', 'Cu parola furată: înlocuiește cheia publică a victimei (atac man-in-the-middle pentru contactele noi)', async () => {
  const cur = (await getDoc(doc(thief.db, 'users', victim.uid))).data();
  const r = await ok(setDoc(doc(thief.db, 'users', victim.uid), { ...cur, key: b64(evil.bundle), fp: evil.fingerprint }));
  if (r) await setDoc(doc(thief.db, 'users', victim.uid), cur); // put it back for the next attacks
  return r;
});

await attack('S02', 'CRITIC', 'Cu parola furată: șterge profilul și îl recreează cu cheia atacatorului', async () => {
  const cur = (await getDoc(doc(thief.db, 'users', victim.uid))).data();
  const del = await ok(deleteDoc(doc(thief.db, 'users', victim.uid)));
  if (!del) return false;
  const b = writeBatch(thief.db);
  b.set(doc(thief.db, 'users', victim.uid), { ...cur, key: b64(evil.bundle), fp: evil.fingerprint, created: serverTimestamp() });
  const re = await ok(b.commit());
  // restore
  await ok(setDoc(doc(thief.db, 'users', victim.uid), cur));
  return { ok: del, detail: re ? 'profil șters și recreat cu altă cheie' : 'profil șters (recrearea a eșuat)' };
});

await attack('S03', 'CRITIC', 'Cu parola furată: înregistrează un dispozitiv al atacatorului în contul victimei (după S01)', async () => {
  const cur = (await getDoc(doc(thief.db, 'users', victim.uid))).data();
  const swapped = await ok(setDoc(doc(thief.db, 'users', victim.uid), { ...cur, key: b64(evil.bundle), fp: evil.fingerprint }));
  if (!swapped) return { ok: false, detail: 'cheia nu a putut fi înlocuită' };
  const dk = A.deriveIdentity(A.generateMnemonic());
  const ts = Date.now();
  let reg = false;
  try { const r = await thief.call('registerDevice', { bundle: b64(dk.bundle), ts, proof: b64(A.signEd(evil, `acm-register\n${victim.uid}\n${dk.fingerprint}\n${ts}`)) }); reg = !!r.token; thief.dev = r.dev; thief.devToken = r.token; } catch (e) { reg = false; }
  await setDoc(doc(thief.db, 'users', victim.uid), cur);
  return { ok: reg, detail: reg ? 'dispozitiv înregistrat: vede lista de dispozitive și poate bloca dispozitivele membre' : '' };
});

await attack('S04', 'MARE', 'Cu parola furată, fără dispozitiv: citește dispozitivele / evenimentele / seiful victimei', async () => {
  const t = client(); await signInWithEmailAndPassword(t.auth, victim.email, victim.password);
  const a = await ok(getDocs(collection(t.db, 'accounts', victim.uid, 'devices')));
  const b = await ok(getDocs(collection(t.db, 'accounts', victim.uid, 'events')));
  const c = await ok(getDoc(doc(t.db, 'accounts', victim.uid, 'vault', 'x')));
  return { ok: a || b || c, detail: `devices:${a} events:${b} vault:${c}` };
});

await attack('S05', 'MARE', 'Cu parola furată: înregistrare dispozitiv cu o semnătură falsă (fără cheile contului)', async () => {
  const dk = A.deriveIdentity(A.generateMnemonic());
  const ts = Date.now();
  return ok(thief.call('registerDevice', { bundle: b64(dk.bundle), ts, proof: b64(A.signEd(dk, `acm-register\n${victim.uid}\n${dk.fingerprint}\n${ts}`)) }));
});

// ------------------------------------------------------------ another legitimate user attacking the victim
const o = other.c;
await attack('S10', 'CRITIC', 'Alt utilizator citește dispozitivele / evenimentele / seiful victimei', async () => {
  const a = await ok(getDocs(collection(o.db, 'accounts', victim.uid, 'devices')));
  const b = await ok(getDocs(collection(o.db, 'accounts', victim.uid, 'events')));
  const c = await ok(getDoc(doc(o.db, 'accounts', victim.uid, 'vault', 'settings')));
  return { ok: a || b || c, detail: `devices:${a} events:${b} vault:${c}` };
});
await attack('S11', 'CRITIC', 'Alt utilizator scrie în seiful victimei', () => ok(setDoc(doc(o.db, 'accounts', victim.uid, 'vault', 'settings'), { x: 1 })));
await attack('S12', 'CRITIC', 'Alt utilizator modifică profilul / cheia victimei', () => ok(updateDoc(doc(o.db, 'users', victim.uid), { key: b64(evil.bundle) })));
await attack('S13', 'MARE', 'Alt utilizator fură @numele victimei (suprascrie usernames/{handle})', () => ok(setDoc(doc(o.db, 'usernames', victim.handle), { uid: other.uid })));
await attack('S14', 'MARE', 'Alt utilizator șterge @numele victimei', () => ok(deleteDoc(doc(o.db, 'usernames', victim.handle))));
await attack('S15', 'MEDIU', 'Enumerare: listează toți utilizatorii (colecția users)', () => ok(getDocs(query(collection(o.db, 'users'), limit(50)))));
await attack('S16', 'MEDIU', 'Enumerare: listează toate @numele (colecția usernames)', () => ok(getDocs(query(collection(o.db, 'usernames'), limit(50)))));
await attack('S17', 'MEDIU', 'Căutare după email (users where emailLower == ...)', () => ok(getDocs(query(collection(o.db, 'users'), where('emailLower', '==', victim.email.toLowerCase())))));
await attack('S18', 'MARE', 'Alt utilizator blochează un dispozitiv al victimei', () => ok(o.call('blockDevice', { target: victim.dev })));
await attack('S19', 'MARE', 'Alt utilizator cere o sesiune pentru dispozitivul victimei (fără cheia dispozitivului)', async () => {
  const ts = Date.now();
  return ok(o.call('deviceSession', { uid: victim.uid, dev: victim.dev, ts, sig: b64(A.signEd(other.dk, `acm-session\n${victim.uid}\n${victim.dev}\n${ts}`)) }));
});
await attack('S20', 'MARE', 'Alt utilizator scrie evenimente false („conectare nouă”) în contul victimei', () => ok(setDoc(doc(o.db, 'accounts', victim.uid, 'events', 'fake'), { type: 'signin' })));
await attack('S21', 'MEDIU', 'Clientul scrie direct un eveniment fals în propriul cont', () => ok(setDoc(doc(o.db, 'accounts', other.uid, 'events', 'fake'), { type: 'signin', dev: 'x' })));
await attack('S22', 'MARE', 'Dispozitivul își ridică singur rolul la „primary”', () => ok(updateDoc(doc(o.db, 'accounts', other.uid, 'devices', other.dev), { role: 'primary', status: 'active' })));
await attack('S23', 'MARE', 'Dispozitivul își adaugă singur un dispozitiv nou (scriere directă în devices)', () => ok(setDoc(doc(o.db, 'accounts', other.uid, 'devices', 'fake'), { role: 'primary', status: 'active', pub: 'x' })));
await attack('S24', 'MEDIU', 'Pairing: citește direct colecția pairings', () => ok(getDocs(collection(o.db, 'pairings'))));

// ------------------------------------------------------------ profile / @name abuse
await attack('S30', 'MARE', 'Rezervă un @nume interzis (admin)', async () => {
  const b = writeBatch(o.db);
  b.set(doc(o.db, 'usernames', 'admin'), { uid: other.uid });
  const cur = (await getDoc(doc(o.db, 'users', other.uid))).data();
  b.set(doc(o.db, 'users', other.uid), { ...cur, handle: 'admin' });
  b.delete(doc(o.db, 'usernames', other.handle));
  return ok(b.commit());
});
await attack('S31', 'MEDIU', 'Rezervă mai multe @nume deodată (squatting)', () => ok(setDoc(doc(o.db, 'usernames', 'squat' + Date.now().toString(36)), { uid: other.uid })));
await attack('S32', 'MEDIU', 'Pune HTML/script în numele afișat (stored XSS)', async () => {
  const cur = (await getDoc(doc(o.db, 'users', other.uid))).data();
  const r = await ok(setDoc(doc(o.db, 'users', other.uid), { ...cur, name: '<img src=x onerror=alert(1)>' }));
  if (r) await setDoc(doc(o.db, 'users', other.uid), cur);
  return { ok: r, detail: r ? 'serverul acceptă; clientul trebuie să-l afișeze doar ca text' : '' };
});
await attack('S33', 'MEDIU', 'Profil cu cheie publică invalidă / amprentă care nu corespunde', async () => {
  const cur = (await getDoc(doc(o.db, 'users', other.uid))).data();
  const r = await ok(setDoc(doc(o.db, 'users', other.uid), { ...cur, key: 'AAAA', fp: 'ab'.repeat(32) }));
  if (r) await setDoc(doc(o.db, 'users', other.uid), cur);
  return { ok: r, detail: r ? 'acceptat de server; clientul verifică amprenta la citire' : '' };
});
await attack('S34', 'MEDIU', 'Cont cu email neconfirmat își creează profil', async () => {
  const c = client();
  const cr = await createUserWithEmailAndPassword(c.auth, `unv-${Date.now()}@example.com`, 'Parola-unv-1');
  const id = A.deriveIdentity(A.generateMnemonic());
  const h = 'unv' + Date.now().toString(36);
  const b = writeBatch(c.db);
  b.set(doc(c.db, 'usernames', h), { uid: cr.user.uid });
  b.set(doc(c.db, 'users', cr.user.uid), { name: 'x', handle: h, key: b64(id.bundle), fp: id.fingerprint });
  return ok(b.commit());
});
await attack('S35', 'MIC', 'Neautentificat: citește un profil', async () => {
  const c = client();
  return ok(getDoc(doc(c.db, 'users', victim.uid)));
});

// ------------------------------------------------------------ device levels, pairing, sessions
const laptopKey = A.deriveIdentity(A.generateMnemonic());
const vc = victim.c;
const { pid } = await client().call('pairStart', { bundle: b64(laptopKey.bundle) });
await attack('S40', 'MARE', 'Pairing: alt cont aprobă codul QR al victimei (victima ar intra în contul atacatorului)', async () => {
  const got = await o.call('pairGet', { pid });
  return { ok: !!got, detail: 'pid-ul (128 biți) trebuie văzut fizic pe ecranul victimei; riscul e de phishing' };
});
await attack('S41', 'MARE', 'Pairing: preia cheile cu altă cheie decât cea din QR (poll cu semnătură falsă)', () => ok(client().call('pairPoll', { pid, sig: b64(A.signEd(evil, `acm-pair\n${pid}`)) })));
await attack('S43', 'MIC', 'Replay: aceeași semnătură de sesiune folosită de două ori în 5 minute', async () => {
  const ts = Date.now();
  const sig = b64(A.signEd(victim.dk, `acm-session\n${victim.uid}\n${victim.dev}\n${ts}`));
  const a = await ok(client().call('deviceSession', { uid: victim.uid, dev: victim.dev, ts, sig }));
  const b = await ok(client().call('deviceSession', { uid: victim.uid, dev: victim.dev, ts, sig }));
  return { ok: a && b, detail: 'o semnătură interceptată (în afara TLS) ar fi refolosibilă 5 minute' };
});
await attack('S44', 'MIC', 'Replay: semnătură de sesiune veche (10 minute)', async () => {
  const ts = Date.now() - 10 * 60 * 1000;
  return ok(client().call('deviceSession', { uid: victim.uid, dev: victim.dev, ts, sig: b64(A.signEd(victim.dk, `acm-session\n${victim.uid}\n${victim.dev}\n${ts}`)) }));
});

// a member device of the victim (joins with QR)
const memberKey = A.deriveIdentity(A.generateMnemonic());
const mc = client();
const p2 = await mc.call('pairStart', { bundle: b64(memberKey.bundle) });
await vc.call('pairApprove', { pid: p2.pid, fp: memberKey.fingerprint, sealed: b64(A.seal({ bytes: new Uint8Array([1]), name: 'k' }, victim.id, [memberKey.bundle])) });
const pm = await mc.call('pairPoll', { pid: p2.pid, sig: b64(A.signEd(memberKey, `acm-pair\n${p2.pid}`)) });
await signInWithCustomToken(mc.auth, pm.token);

await attack('S50', 'MARE', 'Dispozitiv membru blochează dispozitivul principal', () => ok(mc.call('blockDevice', { target: victim.dev })));
await attack('S51', 'MARE', 'Dispozitiv membru își dă singur rolul de principal (claimPrimary fără cheile contului)', async () => {
  const ts = Date.now();
  return ok(mc.call('claimPrimary', { ts, sig: b64(A.signEd(memberKey, `acm-primary\n${victim.uid}\n${pm.dev}\n${ts}`)) }));
});
await attack('S52', 'MARE', 'Dispozitiv membru șterge contul (wipeAccount) fără semnătura cheilor contului', async () => {
  // run on a throwaway copy: a fresh account with a member
  const acc = await makeAccount('wipe');
  const k = A.deriveIdentity(A.generateMnemonic());
  const c = client();
  const p = await c.call('pairStart', { bundle: b64(k.bundle) });
  await acc.c.call('pairApprove', { pid: p.pid, fp: k.fingerprint, sealed: b64(A.seal({ bytes: new Uint8Array([1]), name: 'k' }, acc.id, [k.bundle])) });
  const r = await c.call('pairPoll', { pid: p.pid, sig: b64(A.signEd(k, `acm-pair\n${p.pid}`)) });
  await signInWithCustomToken(c.auth, r.token);
  return ok(c.call('wipeAccount', {}));
});
await attack('S54', 'CRITIC', 'Sesiune de dispozitiv furată: șterge contul semnând cu cheia dispozitivului (nu a contului)', async () => {
  const ts = Date.now();
  return ok(vc.call('wipeAccount', { ts, sig: b64(A.signEd(victim.dk, `acm-wipe\n${victim.uid}\n${victim.dev}\n${ts}`)) }));
});
await attack('S53', 'MEDIU', 'Seif: un dispozitiv scrie 900 KB într-un singur document (abuz de spațiu / cost)', () => ok(setDoc(doc(vc.db, 'accounts', victim.uid, 'vault', 'big'), { b: 'x'.repeat(900000) })));

// blocked device keeps trying
await vc.call('blockDevice', { target: pm.dev });
await attack('S60', 'CRITIC', 'Dispozitiv blocat: citește în continuare datele contului cu sesiunea pe care o avea', async () => {
  const a = await ok(getDocs(collection(mc.db, 'accounts', victim.uid, 'devices')));
  const b = await ok(getDoc(doc(mc.db, 'accounts', victim.uid, 'vault', 'big')));
  return { ok: a || b, detail: `devices:${a} vault:${b}` };
});
await attack('S61', 'CRITIC', 'Dispozitiv blocat: cere o sesiune nouă', async () => {
  const ts = Date.now();
  return ok(mc.call('deviceSession', { uid: victim.uid, dev: pm.dev, ts, sig: b64(A.signEd(memberKey, `acm-session\n${victim.uid}\n${pm.dev}\n${ts}`)) }));
});
await attack('S62', 'MARE', 'Dispozitiv blocat: se reînregistrează cu parola (fără cheile contului)', async () => {
  const t = client(); await signInWithEmailAndPassword(t.auth, victim.email, victim.password);
  const k = A.deriveIdentity(A.generateMnemonic()); const ts = Date.now();
  return ok(t.call('registerDevice', { bundle: b64(k.bundle), ts, proof: b64(A.signEd(memberKey, `acm-register\n${victim.uid}\n${k.fingerprint}\n${ts}`)) }));
});
await attack('S63', 'MARE', 'Dispozitiv blocat: își schimbă singur statusul înapoi în „active”', () => ok(updateDoc(doc(mc.db, 'accounts', victim.uid, 'devices', pm.dev), { status: 'active' })));
await attack('S64', 'MEDIU', 'Dispozitiv blocat: citește în continuare profilurile publice și @numele (sesiunea Firebase rămâne validă)', () => ok(getDoc(doc(mc.db, 'users', victim.uid))));

// ------------------------------------------------------------ inputs the functions must refuse
await attack('S70', 'MEDIU', 'Funcții: cheie publică uriașă / malformată în registerDevice', () => ok(thief.call('registerDevice', { bundle: 'A'.repeat(500000), ts: Date.now(), proof: 'x' })));
await attack('S71', 'MEDIU', 'Funcții: info de dispozitiv de 4 MB', async () => {
  const dk = A.deriveIdentity(A.generateMnemonic()); const ts = Date.now();
  return ok(thief.call('registerDevice', { bundle: b64(dk.bundle), ts, proof: b64(A.signEd(victim.id, `acm-register\n${victim.uid}\n${dk.fingerprint}\n${ts}`)), info: 'x'.repeat(4000000) }));
});
await attack('S72', 'MIC', 'Funcții: pairApprove cu „sealed” de 10 MB', async () => {
  const k = A.deriveIdentity(A.generateMnemonic());
  const p = await client().call('pairStart', { bundle: b64(k.bundle) });
  return ok(vc.call('pairApprove', { pid: p.pid, fp: k.fingerprint, sealed: 'x'.repeat(10 * 1024 * 1024) }));
});

// last: it trips the per-address limit for everything after it
await attack('S42', 'MEDIU', 'Pairing: flood de coduri QR fără cont (200 cereri)', async () => {
  const c = client();
  let made = 0;
  await Promise.all(Array.from({ length: 200 }, async () => { if (await ok(c.call('pairStart', { bundle: b64(laptopKey.bundle) }))) made++; }));
  return { ok: made > 50, detail: `${made}/200 create` };
});
for (const c of [victim.c, other.c, thief, mc]) { try { await signOut(c.auth); } catch (e) {} }
fs.writeFileSync('attack-log.json', JSON.stringify(log, null, 2));
const bad = log.filter((x) => x.result === 'VULNERABIL');
console.log(`\nTOTAL ${log.length} atacuri · blocate ${log.length - bad.length} · reușite ${bad.length}`);
process.exit(0);
