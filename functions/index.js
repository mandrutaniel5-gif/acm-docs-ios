// ACM Docs server functions (Firebase, region europe-west1).
//
// What they do: decide WHICH DEVICE may talk to the account's cloud data. They never see any
// document, setting, name or key in readable form: device names, files and settings are encrypted
// on the devices with the account's key, which the server does not have.
//
//  - every device has its own key pair (made on the device); a session token is given only to a
//    device that proves it holds its private key and is not blocked
//  - the device that created the account is the "primary": it can block any device; the others
//    can block only devices of the same level
//  - a new device can join by scanning-free QR pairing: an already signed-in device approves it
//    (after Face ID / fingerprint) and hands over the account keys, encrypted for the new device
//  - every sign-in is written as an event, so all devices can show "new sign-in" alerts
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { setGlobalOptions } from 'firebase-functions/v2';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { ed25519 } from '@noble/curves/ed25519.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { randomBytes } from 'node:crypto';

setGlobalOptions({ region: 'europe-west1', maxInstances: 10, memory: '256MiB' });
initializeApp();
const db = getFirestore();

const MAX_DEVICES = 20;
const SESSION_SKEW_MS = 5 * 60 * 1000;
const PAIR_TTL_MS = 5 * 60 * 1000;
const KEY_MAGIC = [0x41, 0x43, 0x4d, 0x4b]; // "ACMK"
const BUNDLE_LEN = 5 + 32 + 32 + 1184 + 1952;

// ------------------------------------------------------------------ helpers
const fail = (code, msg) => { throw new HttpsError(code, msg); };
const unb64 = (s) => new Uint8Array(Buffer.from(String(s || ''), 'base64'));
const hex = (u8) => Buffer.from(u8).toString('hex');
const devicesOf = (uid) => db.collection('accounts').doc(uid).collection('devices');
const eventsOf = (uid) => db.collection('accounts').doc(uid).collection('events');
const newId = () => randomBytes(16).toString('hex');

/** A public key bundle (ACMK v1); returns its Ed25519 key and fingerprint. */
function parseBundle(b64) {
  const b = unb64(b64);
  if (b.length !== BUNDLE_LEN || KEY_MAGIC.some((x, i) => b[i] !== x) || b[4] !== 1) fail('invalid-argument', 'bad key');
  return { ed: b.slice(37, 69), fp: hex(sha256(b)) };
}
function verify(pub, message, sigB64) {
  try { return ed25519.verify(unb64(sigB64), new TextEncoder().encode(message), pub); } catch (e) { return false; }
}
function needUser(req) {
  if (!req.auth) fail('unauthenticated', 'sign in first');
  if (req.auth.token.email_verified !== true && req.auth.token.firebase.sign_in_provider === 'password') fail('failed-precondition', 'email not verified');
  return req.auth.uid;
}
/** The calling device: signed in with a device session and still active. */
async function needDevice(req) {
  const uid = needUser(req);
  const dev = req.auth.token.dev;
  if (!dev) fail('permission-denied', 'no device session');
  const snap = await devicesOf(uid).doc(dev).get();
  if (!snap.exists || snap.data().status !== 'active') fail('permission-denied', 'device blocked');
  return { uid, dev, me: snap.data() };
}
const event = (uid, data) => eventsOf(uid).add({ ...data, at: FieldValue.serverTimestamp() });
const token = (uid, dev) => getAuth().createCustomToken(uid, { dev });

// ------------------------------------------------------------------ first device / sign-in with password
/**
 * A device signed in with email + password (or Google), that also holds the account keys,
 * registers its own key.
 * The first device of the account becomes the primary; any later one is a member, and every
 * other device gets a "new sign-in" alert.
 */
export const registerDevice = onCall(async (req) => {
  const uid = needUser(req);
  const { bundle, info, ts, proof } = req.data || {};
  const { ed, fp } = parseBundle(bundle);
  // the password alone is not enough: the device must also hold the account keys (24 words)
  if (typeof ts !== 'number' || Math.abs(Date.now() - ts) > SESSION_SKEW_MS) fail('deadline-exceeded', 'clock');
  const profile = await db.collection('users').doc(uid).get();
  if (!profile.exists) fail('failed-precondition', 'no profile');
  if (!verify(parseBundle(profile.data().key).ed, `acm-register\n${uid}\n${fp}\n${ts}`, proof)) fail('permission-denied', 'no account keys');
  if (info != null && (typeof info !== 'string' || info.length > 4000)) fail('invalid-argument', 'info');
  const col = devicesOf(uid);
  const id = newId();
  const result = await db.runTransaction(async (tx) => {
    const all = await tx.get(col);
    const active = all.docs.filter((d) => d.data().status === 'active');
    if (active.length >= MAX_DEVICES) fail('resource-exhausted', 'too many devices');
    const role = all.empty ? 'primary' : 'member';
    tx.set(col.doc(id), { pub: Buffer.from(ed).toString('base64'), fp, role, status: 'active', via: all.empty ? 'create' : 'password', info: info || null, created: FieldValue.serverTimestamp(), lastSeen: FieldValue.serverTimestamp(), addedBy: null });
    return role;
  });
  await event(uid, { type: 'signin', dev: id, via: result === 'primary' ? 'create' : 'password' });
  return { dev: id, role: result, token: await token(uid, id) };
});

// ------------------------------------------------------------------ session for a registered device
/** Signed proof of the device key → a session token that carries the device id. */
export const deviceSession = onCall(async (req) => {
  const { uid, dev, ts, sig } = req.data || {};
  if (typeof uid !== 'string' || typeof dev !== 'string' || typeof ts !== 'number') fail('invalid-argument', 'args');
  if (Math.abs(Date.now() - ts) > SESSION_SKEW_MS) fail('deadline-exceeded', 'clock');
  const ref = devicesOf(uid).doc(dev);
  const snap = await ref.get();
  if (!snap.exists) fail('not-found', 'unknown device');
  const d = snap.data();
  if (d.status !== 'active') fail('permission-denied', 'device blocked');
  if (!verify(unb64(d.pub), `acm-session\n${uid}\n${dev}\n${ts}`, sig)) fail('permission-denied', 'bad signature');
  // a signature is good once: the next one must carry a later time (no replay)
  const fresh = await db.runTransaction(async (tx) => {
    const cur = await tx.get(ref);
    if ((cur.data().lastTs || 0) >= ts) return false;
    tx.update(ref, { lastTs: ts, lastSeen: FieldValue.serverTimestamp() });
    return true;
  });
  if (!fresh) fail('permission-denied', 'replayed signature');
  return { token: await token(uid, dev) };
});

// ------------------------------------------------------------------ QR pairing
/** New device: publishes a one-time key and gets a pairing id to show as a QR code. */
const PAIR_LIMIT = 10;              // QR codes per address…
const PAIR_WINDOW_MS = 10 * 60 * 1000; // …per 10 minutes
const PAIR_GLOBAL_LIMIT = 600;      // all addresses together, per 10 minutes
/**
 * The caller's address. The first entries of X-Forwarded-For are whatever the caller wrote; Google's
 * front end appends the address it really saw, so only the LAST entry can be trusted.
 */
function clientAddress(req) {
  const h = req.rawRequest && req.rawRequest.headers ? req.rawRequest.headers['x-forwarded-for'] : null;
  const list = String(h || '').split(',').map((x) => x.trim()).filter(Boolean);
  return list.length ? list[list.length - 1] : String((req.rawRequest && req.rawRequest.ip) || 'unknown');
}
async function rateLimit(req, bucket, max, windowMs, global) {
  const who = global ? '*' : clientAddress(req);
  const key = hex(sha256(new TextEncoder().encode(bucket + '|' + who))).slice(0, 40); // no raw IPs stored
  const ref = db.collection('limits').doc(key);
  const ok = await db.runTransaction(async (tx) => {
    const s = await tx.get(ref);
    const now = Date.now();
    const d = s.exists ? s.data() : null;
    if (!d || d.start + windowMs < now) { tx.set(ref, { start: now, n: 1, expires: Timestamp.fromMillis(now + windowMs) }); return true; }
    if (d.n >= max) return false;
    tx.update(ref, { n: d.n + 1 });
    return true;
  });
  if (!ok) fail('resource-exhausted', 'too many requests, try again later');
}

export const pairStart = onCall(async (req) => {
  await rateLimit(req, 'pair', PAIR_LIMIT, PAIR_WINDOW_MS);
  // a ceiling for everyone together, whatever addresses the requests claim
  await rateLimit(req, 'pair-all', PAIR_GLOBAL_LIMIT, PAIR_WINDOW_MS, true);
  const { bundle } = req.data || {};
  const { fp } = parseBundle(bundle);
  const pid = newId();
  await db.collection('pairings').doc(pid).set({ bundle, fp, status: 'waiting', expires: Timestamp.fromMillis(Date.now() + PAIR_TTL_MS), created: FieldValue.serverTimestamp() });
  return { pid, ttl: PAIR_TTL_MS };
});

/** Signed-in device that scanned the QR: reads the new device's key (to check it against the QR). */
export const pairGet = onCall(async (req) => {
  await needDevice(req);
  const { pid } = req.data || {};
  const snap = await db.collection('pairings').doc(String(pid || '-')).get();
  if (!snap.exists || snap.data().expires.toMillis() < Date.now() || snap.data().status !== 'waiting') fail('not-found', 'expired');
  return { bundle: snap.data().bundle, fp: snap.data().fp };
});

/**
 * Signed-in device approves: the new device becomes a member of the same level,
 * receives the account keys (encrypted for it, signed by the account) and a session token.
 */
export const pairApprove = onCall(async (req) => {
  const { uid, dev } = await needDevice(req);
  const { pid, fp, sealed } = req.data || {};
  if (typeof sealed !== 'string' || sealed.length > 200000) fail('invalid-argument', 'sealed');
  const pref = db.collection('pairings').doc(String(pid || '-'));
  const id = newId();
  await db.runTransaction(async (tx) => {
    const p = await tx.get(pref);
    if (!p.exists || p.data().status !== 'waiting' || p.data().expires.toMillis() < Date.now()) fail('not-found', 'expired');
    if (p.data().fp !== fp) fail('permission-denied', 'key mismatch');
    const all = await tx.get(devicesOf(uid));
    if (all.docs.filter((d) => d.data().status === 'active').length >= MAX_DEVICES) fail('resource-exhausted', 'too many devices');
    const { ed } = parseBundle(p.data().bundle);
    tx.set(devicesOf(uid).doc(id), { pub: Buffer.from(ed).toString('base64'), fp, role: 'member', status: 'active', via: 'qr', info: null, created: FieldValue.serverTimestamp(), lastSeen: FieldValue.serverTimestamp(), addedBy: dev });
    tx.update(pref, { status: 'approved', uid, dev: id, sealed, approvedBy: dev });
  });
  await event(uid, { type: 'signin', dev: id, via: 'qr', by: dev });
  return { dev: id };
});

/** New device: waits for the approval; proves it holds the one-time key, then gets keys + session once. */
export const pairPoll = onCall(async (req) => {
  const { pid, sig } = req.data || {};
  const pref = db.collection('pairings').doc(String(pid || '-'));
  const snap = await pref.get();
  if (!snap.exists || snap.data().expires.toMillis() < Date.now() - 60000) fail('not-found', 'expired');
  const p = snap.data();
  const { ed } = parseBundle(p.bundle);
  if (!verify(ed, `acm-pair\n${pid}`, sig)) fail('permission-denied', 'bad signature');
  if (p.status !== 'approved') return { status: p.status };
  await pref.delete(); // handed over once
  return { status: 'approved', uid: p.uid, dev: p.dev, sealed: p.sealed, token: await token(p.uid, p.dev) };
});

// ------------------------------------------------------------------ blocking
/**
 * Blocks a device for good: its session stops working at once (the rules check the status on
 * every request). The primary device can block any other device; a member can block members.
 */
export const blockDevice = onCall(async (req) => {
  const { uid, dev, me } = await needDevice(req);
  const { target } = req.data || {};
  if (typeof target !== 'string' || target === dev) fail('invalid-argument', 'target');
  const ref = devicesOf(uid).doc(target);
  const snap = await ref.get();
  if (!snap.exists) fail('not-found', 'unknown device');
  if (snap.data().role === 'primary' && me.role !== 'primary') fail('permission-denied', 'only the primary device can block the primary');
  if (snap.data().status === 'blocked') return { ok: true };
  await ref.update({ status: 'blocked', blockedBy: dev, blockedAt: FieldValue.serverTimestamp() });
  await event(uid, { type: 'blocked', dev: target, by: dev });
  // no refresh-token revocation: that would sign out every device of the account. The rules and the
  // functions check the device status on every request, so the blocked device is out at once.
  return { ok: true };
});

/** A device leaving by itself (sign out on that device). */
export const leaveDevice = onCall(async (req) => {
  const { uid, dev } = await needDevice(req);
  await devicesOf(uid).doc(dev).update({ status: 'removed', removedAt: FieldValue.serverTimestamp() });
  await event(uid, { type: 'signout', dev });
  return { ok: true };
});

/**
 * The primary device is lost or blocked: a device that proves it holds the account keys
 * (the 24 words) becomes the primary.
 */
export const claimPrimary = onCall(async (req) => {
  const { uid, dev } = await needDevice(req);
  const { ts, sig } = req.data || {};
  if (typeof ts !== 'number' || Math.abs(Date.now() - ts) > SESSION_SKEW_MS) fail('deadline-exceeded', 'clock');
  const profile = await db.collection('users').doc(uid).get();
  if (!profile.exists) fail('failed-precondition', 'no profile');
  const { ed } = parseBundle(profile.data().key);
  if (!verify(ed, `acm-primary\n${uid}\n${dev}\n${ts}`, sig)) fail('permission-denied', 'bad signature');
  const all = await devicesOf(uid).get();
  const primary = all.docs.find((d) => d.data().role === 'primary' && d.data().status === 'active');
  if (primary && primary.id !== dev) {
    const seen = primary.data().lastSeen ? primary.data().lastSeen.toMillis() : 0;
    if (Date.now() - seen < 30 * 24 * 3600 * 1000) fail('failed-precondition', 'primary still active');
  }
  const batch = db.batch();
  all.docs.forEach((d) => { if (d.data().role === 'primary' && d.id !== dev) batch.update(d.ref, { role: 'member' }); });
  batch.update(devicesOf(uid).doc(dev), { role: 'primary' });
  await batch.commit();
  await event(uid, { type: 'primary', dev });
  return { ok: true };
});

/**
 * Account deletion. Needs a device session AND a signature with the account keys (24 words),
 * so neither a stolen password nor a stolen session alone can destroy an account.
 * Removes the public profile, the @name, devices, events, cloud data and the sign-in itself.
 */
export const wipeAccount = onCall(async (req) => {
  const { uid, dev } = await needDevice(req);
  const { ts, sig } = req.data || {};
  if (typeof ts !== 'number' || Math.abs(Date.now() - ts) > SESSION_SKEW_MS) fail('deadline-exceeded', 'clock');
  const pref = db.collection('users').doc(uid);
  const profile = await pref.get();
  if (!profile.exists) fail('failed-precondition', 'no profile');
  if (!verify(parseBundle(profile.data().key).ed, `acm-wipe\n${uid}\n${dev}\n${ts}`, sig)) fail('permission-denied', 'bad signature');
  const handle = profile.data().handle;
  const batch = db.batch();
  if (handle) batch.delete(db.collection('usernames').doc(handle));
  batch.delete(pref);
  await batch.commit();
  await db.recursiveDelete(db.collection('accounts').doc(uid));
  // the encrypted blocks of the cloud sync
  try { await getStorage().bucket('acm-docs-52280.firebasestorage.app').deleteFiles({ prefix: `accounts/${uid}/` }); }
  catch (e) { console.warn('storage cleanup', e.message); }
  await getAuth().deleteUser(uid);
  return { ok: true };
});
