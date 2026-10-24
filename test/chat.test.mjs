// Encrypted chat, against the Firebase emulators: who can read and write what, groups, blocking,
// the kill switch and documents sent in a chat.
//   firebase emulators:exec --only auth,firestore,functions,storage "node test/chat.test.mjs"
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, doc, getDoc, getDocs, setDoc, addDoc, deleteDoc, updateDoc, collection, query, where, orderBy, writeBatch, serverTimestamp } from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';
import * as A from '../build/vendor/acmcrypto.mjs';

const PROJECT = 'acm-docs-52280';
const BUCKET = 'acm-docs-52280.firebasestorage.app';
const AUTH = 'http://127.0.0.1:9099';
const FS = `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents`;
const ST = 'http://127.0.0.1:9199';
const b64 = A.toB64;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let n = 0, failed = 0;

function client() {
  const app = initializeApp({ apiKey: 'test', projectId: PROJECT, authDomain: 'x', storageBucket: BUCKET }, 'c' + (++n));
  const auth = getAuth(app); connectAuthEmulator(auth, AUTH, { disableWarnings: true });
  const db = getFirestore(app); connectFirestoreEmulator(db, '127.0.0.1', 8080);
  const fn = getFunctions(app, 'europe-west1'); connectFunctionsEmulator(fn, '127.0.0.1', 5001);
  const call = async (name, data) => (await httpsCallable(fn, name)(data)).data;
  return { app, auth, db, call, tok: () => auth.currentUser.getIdToken() };
}
async function verifyEmail(uid) {
  await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:update`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' }, body: JSON.stringify({ localId: uid, emailVerified: true }) });
}
async function adminSetSwitches(off) {
  const fields = { off: { mapValue: { fields: Object.fromEntries(Object.keys(off).map((k) => [k, { booleanValue: true }])) } } };
  await fetch(`${FS}/server/switches`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' }, body: JSON.stringify({ fields }) });
}
const code = async (p) => { try { await p; return 'ok'; } catch (e) { return String(e.message || e.code || e); } };
const rid = () => Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('hex');

async function makeAccount(tag) {
  const c = client();
  const cred = await createUserWithEmailAndPassword(c.auth, `${tag}-${Date.now()}@example.com`, 'Parola-' + tag + '-1');
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
  return { c, uid, id, handle };
}
const seal = (from, to, obj) => b64(A.seal({ bytes: new TextEncoder().encode(JSON.stringify(obj)), name: 'm', mime: 'application/x-acm-chat' }, from.id, to.map((x) => x.id.bundle), { hint: to.length > 2 }));
const post = (acc, cid, box, extra = {}) => addDoc(collection(acc.c.db, 'chats', cid, 'msgs'), { from: acc.uid, at: serverTimestamp(), kind: 'text', box, ...extra });
async function check(name, fn) {
  try { await fn(); console.log('✓', name); } catch (e) { failed++; console.log('✗', name, '—', e.message || e); }
}

// ------------------------------------------------------------------------------------------
const a = await makeAccount('ana');
const b = await makeAccount('bob');
const c = await makeAccount('cris');
let direct = null, group = null;

await check('Direct chat: the same conversation for both, visible only to its two members', async () => {
  direct = (await a.c.call('chatDirect', { uid: b.uid })).id;
  assert.equal((await b.c.call('chatDirect', { uid: a.uid })).id, direct);
  assert.equal((await getDoc(doc(b.c.db, 'chats', direct))).data().members.length, 2);
  assert.notEqual(await code(getDoc(doc(c.c.db, 'chats', direct))), 'ok');
  assert.match(await code(a.c.call('chatDirect', { uid: a.uid })), /uid/);
  assert.match(await code(a.c.call('chatDirect', { uid: 'nobody1234567890' })), /no such account/);
});

await check('Messages: sealed on the device, opened only by the members, signed by the sender', async () => {
  await post(a, direct, seal(a, [a, b], { t: 'text', text: 'Salut, Bob' }));
  const snap = await getDocs(query(collection(b.c.db, 'chats', direct, 'msgs'), orderBy('at')));
  const m = snap.docs[snap.size - 1].data();
  const r = A.open(A.fromB64(m.box), b.id);
  assert.equal(JSON.parse(new TextDecoder().decode(r.bytes)).text, 'Salut, Bob');
  assert.equal(r.sender.fingerprint, a.id.fingerprint);
  assert.throws(() => A.open(A.fromB64(m.box), c.id));
  assert.notEqual(await code(getDocs(collection(c.c.db, 'chats', direct, 'msgs'))), 'ok');
});

await check('Messages: no writing as someone else, into others\' chats, or with extra fields', async () => {
  const box = seal(a, [a, b], { t: 'text', text: 'x' });
  assert.notEqual(await code(addDoc(collection(a.c.db, 'chats', direct, 'msgs'), { from: b.uid, at: serverTimestamp(), kind: 'text', box })), 'ok');
  assert.notEqual(await code(post(c, direct, box)), 'ok');
  assert.notEqual(await code(post(a, direct, box, { kind: 'sys' })), 'ok');
  assert.notEqual(await code(post(a, direct, box, { admin: true })), 'ok');
  assert.notEqual(await code(post(a, direct, box, { at: new Date(0) })), 'ok');
  assert.notEqual(await code(post(a, direct, box, { kind: 'file' })), 'ok'); // a file message needs its file id
  // a member may only mark the activity, nothing else
  assert.notEqual(await code(updateDoc(doc(a.c.db, 'chats', direct), { members: [a.uid, c.uid] })), 'ok');
  await updateDoc(doc(a.c.db, 'chats', direct), { lastAt: serverTimestamp(), lastFrom: a.uid });
});

await check('Messages: only the sender deletes its own message', async () => {
  const ref = await post(a, direct, seal(a, [a, b], { t: 'text', text: 'șterge-mă' }));
  assert.notEqual(await code(deleteDoc(doc(b.c.db, 'chats', direct, 'msgs', ref.id))), 'ok');
  await deleteDoc(doc(a.c.db, 'chats', direct, 'msgs', ref.id));
});

await check('Conversation list: each account sees only its own conversations', async () => {
  const mine = await getDocs(query(collection(b.c.db, 'chats'), where('members', 'array-contains', b.uid)));
  assert.ok(mine.docs.some((d) => d.id === direct));
  assert.notEqual(await code(getDocs(query(collection(c.c.db, 'chats'), where('members', 'array-contains', a.uid)))), 'ok');
});

await check('Groups: created with a sealed name; only admins add or remove; a removed member reads nothing new', async () => {
  group = (await a.c.call('chatGroup', { op: 'create', uids: [b.uid, c.uid], title: seal(a, [a, b, c], { title: 'Familia' }) })).id;
  const g = (await getDoc(doc(c.c.db, 'chats', group))).data();
  assert.equal(JSON.parse(new TextDecoder().decode(A.open(A.fromB64(g.title), c.id).bytes)).title, 'Familia');
  assert.match(await code(c.c.call('chatGroup', { op: 'remove', cid: group, uids: [b.uid], title: seal(c, [a, c], { title: 'x' }) })), /admins only/);
  await post(c, group, seal(c, [a, b, c], { t: 'text', text: 'Bună tuturor' }));
  await a.c.call('chatGroup', { op: 'remove', cid: group, uids: [c.uid], title: seal(a, [a, b], { title: 'Familia' }) });
  assert.notEqual(await code(getDoc(doc(c.c.db, 'chats', group))), 'ok');
  assert.notEqual(await code(getDocs(collection(c.c.db, 'chats', group, 'msgs'))), 'ok');
  assert.notEqual(await code(post(c, group, seal(c, [a, b, c], { t: 'text', text: 'încă aici?' }))), 'ok');
  const msgs = await getDocs(query(collection(b.c.db, 'chats', group, 'msgs'), orderBy('at')));
  assert.ok(msgs.docs.some((d) => d.data().kind === 'sys' && d.data().sys.type === 'removed'));
});

await check('Groups: leaving; the last admin hands over to a remaining member', async () => {
  await a.c.call('chatGroup', { op: 'leave', cid: group, title: seal(a, [b], { title: 'Familia' }) });
  const g = (await getDoc(doc(b.c.db, 'chats', group))).data();
  assert.deepEqual(g.members, [b.uid]);
  assert.deepEqual(g.admins, [b.uid]);
});

await check('Groups: whoever left cannot be added back; the last one out deletes the conversation', async () => {
  const g2 = (await a.c.call('chatGroup', { op: 'create', uids: [b.uid], title: seal(a, [a, b], { title: 'Proiect' }) })).id;
  await b.c.call('chatGroup', { op: 'leave', cid: g2, title: seal(b, [a], { title: 'Altceva' }) });
  // the name was not changed by the one who left
  const g = (await getDoc(doc(a.c.db, 'chats', g2))).data();
  assert.equal(JSON.parse(new TextDecoder().decode(A.open(A.fromB64(g.title), a.id).bytes)).title, 'Proiect');
  assert.match(await code(a.c.call('chatGroup', { op: 'add', cid: g2, uids: [b.uid], title: seal(a, [a, b], { title: 'Proiect' }) })), /left the group/);
  await post(a, g2, seal(a, [a], { t: 'text', text: 'ultimul' }));
  await a.c.call('chatGroup', { op: 'leave', cid: g2 });
  const left = await fetch(`${FS}/chats/${g2}/msgs`, { headers: { Authorization: 'Bearer owner' } });
  const j = await left.json();
  assert.ok(!j.documents || !j.documents.length, 'messages deleted with the conversation');
});

await check('Blocking: a blocked direct conversation takes no new messages either way', async () => {
  await b.c.call('chatBlock', { cid: direct, on: true });
  assert.notEqual(await code(post(a, direct, seal(a, [a, b], { t: 'text', text: 'mai ești?' }))), 'ok');
  await b.c.call('chatBlock', { cid: direct, on: false });
  await post(a, direct, seal(a, [a, b], { t: 'text', text: 'iar aici' }));
  assert.match(await code(c.c.call('chatBlock', { cid: direct, on: true })), /no such chat/);
});

await check('Documents: stored only by members and only after the plan counted them', async () => {
  const sealedDoc = A.seal({ bytes: new TextEncoder().encode('%PDF-1.4 test'), name: 'contract.pdf' }, a.id, [a.id.bundle, b.id.bundle]);
  const upload = async (acc, fid) => {
    const boundary = 'acm' + fid;
    const meta = JSON.stringify({ name: `chats/${direct}/files/${fid}`, contentType: 'application/octet-stream', metadata: { uploader: acc.uid } });
    const body = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=utf-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`), Buffer.from(sealedDoc), Buffer.from(`\r\n--${boundary}--`)]);
    const r = await fetch(`${ST}/v0/b/${BUCKET}/o?name=${encodeURIComponent(`chats/${direct}/files/${fid}`)}`, { method: 'POST', headers: { Authorization: 'Firebase ' + (await acc.c.tok()), 'X-Goog-Upload-Protocol': 'multipart', 'Content-Type': `multipart/related; boundary=${boundary}` }, body });
    return r.ok;
  };
  const get = async (acc, fid) => (await fetch(`${ST}/v0/b/${BUCKET}/o/${encodeURIComponent(`chats/${direct}/files/${fid}`)}?alt=media`, { headers: { Authorization: 'Firebase ' + (await acc.c.tok()) } })).status;
  // not a member: refused by the rules
  assert.equal(await upload(c, rid()), false);
  // a member, but the plan did not count it (a script going around the app): removed by the server
  const sneaky = rid();
  assert.equal(await upload(a, sneaky), true);
  await sleep(5000);
  assert.equal(await get(a, sneaky), 404);
  // the app's way: counted first (hash of "acmSend|" + file id), then stored
  const fid = rid();
  const ref = createHash('sha256').update('acmSend|' + fid).digest('hex').slice(0, 32);
  await a.c.call('useQuota', { action: 'acmSend', ref });
  assert.equal(await upload(a, fid), true);
  await sleep(5000);
  assert.equal(await get(b, fid), 200);
  assert.equal(await get(c, fid), 403);
  const msg = await post(a, direct, seal(a, [a, b], { t: 'file', name: 'contract.pdf', size: 13 }), { kind: 'file', fid });
  // the sender deletes the message: the document goes with it
  await deleteDoc(msg);
  await sleep(5000);
  assert.equal(await get(b, fid), 404);
});

await check('Kill switch: chat paused from the control panel stops new conversations and messages', async () => {
  await adminSetSwitches({ chat: true });
  await sleep(16000);
  assert.notEqual(await code(post(a, direct, seal(a, [a, b], { t: 'text', text: 'pauză' }))), 'ok');
  assert.match(await code(a.c.call('chatDirect', { uid: c.uid })), /paused:chat/);
  await adminSetSwitches({});
  await sleep(16000);
  await post(a, direct, seal(a, [a, b], { t: 'text', text: 'iar merge' }));
});

console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
