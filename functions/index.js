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
import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { setGlobalOptions } from 'firebase-functions/v2';
import { beforeUserSignedIn, beforeUserCreated } from 'firebase-functions/v2/identity';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onObjectFinalized, onObjectDeleted } from 'firebase-functions/v2/storage';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import Stripe from 'stripe';
import { PLANS, PRICES, ACTIONS, PAID, GROUP_PLANS, monthOf } from './plans.js';
import { mailReady, sendSignInCode } from './mail.js';
import { timingSafeEqual } from 'node:crypto';
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
  const { replace, emailCode } = req.data || {};
  // two-step verification by email: a new device signed in with the password also needs the code
  // that was just emailed to the account (devices joined by QR are approved by a device instead)
  if (!(await emailFirstDevice(uid)) && (await emailCodeRequired(uid))) await checkEmailCode(uid, emailCode);
  if (replace != null && (typeof replace !== 'string' || !/^([0-9a-f]{32}|auto)$/.test(replace))) fail('invalid-argument', 'replace');
  const col = devicesOf(uid);
  const id = newId();
  const cap = Math.min(MAX_DEVICES, (await effective(uid)).devices);
  let replaced = null, first = false;
  const result = await db.runTransaction(async (tx) => {
    const all = await tx.get(col);
    const active = all.docs.filter((d) => d.data().status === 'active');
    // the plan's number of devices: holding the account keys (24 words) lets this device take the
    // place of an old one (it is signed out at once), never add one more
    if (!all.empty && active.length >= cap) {
      // "auto": the device that was used least recently makes room
      const byAge = active.slice().sort((x, y) => ((x.data().lastSeen && x.data().lastSeen.toMillis()) || 0) - ((y.data().lastSeen && y.data().lastSeen.toMillis()) || 0));
      const old = replace === 'auto' ? byAge[0] : replace && active.find((d) => d.id === replace);
      if (!old || active.length > cap) fail('resource-exhausted', 'device limit');
      tx.update(old.ref, { status: 'removed', removedAt: FieldValue.serverTimestamp(), replacedBy: id });
      replaced = old.id;
    }
    let role = all.empty ? 'primary' : 'member';
    if (replaced && active.find((d) => d.id === replaced).data().role === 'primary') role = 'primary';
    tx.set(col.doc(id), { pub: Buffer.from(ed).toString('base64'), fp, role, status: 'active', via: all.empty ? 'create' : 'password', info: info || null, created: FieldValue.serverTimestamp(), lastSeen: FieldValue.serverTimestamp(), addedBy: null });
    first = all.empty;
    return role;
  });
  if (replaced) await event(uid, { type: 'replaced', dev: replaced, by: id });
  await event(uid, { type: 'signin', dev: id, via: first ? 'create' : 'password' });
  await ensureCloud(uid);
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
  if (d.status !== 'active') fail('permission-denied', d.status === 'removed' ? 'device removed' : 'device blocked');
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
  const cap = Math.min(MAX_DEVICES, (await effective(uid)).devices);
  const pref = db.collection('pairings').doc(String(pid || '-'));
  const id = newId();
  await db.runTransaction(async (tx) => {
    const p = await tx.get(pref);
    if (!p.exists || p.data().status !== 'waiting' || p.data().expires.toMillis() < Date.now()) fail('not-found', 'expired');
    if (p.data().fp !== fp) fail('permission-denied', 'key mismatch');
    const all = await tx.get(devicesOf(uid));
    if (all.docs.filter((d) => d.data().status === 'active').length >= cap) fail('resource-exhausted', 'device limit');
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

// ------------------------------------------------------------------ contact requests
/**
 * "I added you": the other person sees a request and can add this account back (or ignore it).
 * Nothing but the two account ids and a time is stored; the name and public key are read from the
 * public profile. One request per pair; an ignored one is never shown again.
 */
const CREQ_LIMIT = 40;                  // requests per account…
const CREQ_WINDOW_MS = 60 * 60 * 1000;  // …per hour
export const contactRequest = onCall(async (req) => {
  const { uid } = await needDevice(req);
  const { to } = req.data || {};
  if (typeof to !== 'string' || !/^[A-Za-z0-9]{10,64}$/.test(to) || to === uid) fail('invalid-argument', 'to');
  await rateLimit(req, 'creq|' + uid, CREQ_LIMIT, CREQ_WINDOW_MS, true);
  if (!(await db.collection('users').doc(to).get()).exists) fail('not-found', 'no such account');
  const ref = db.collection('accounts').doc(to).collection('requests').doc(uid);
  await db.runTransaction(async (tx) => {
    const cur = await tx.get(ref);
    if (cur.exists && cur.data().status !== 'done') return; // already waiting, or ignored for good
    tx.set(ref, { status: 'pending', at: FieldValue.serverTimestamp() });
  });
  return { ok: true };
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
  // subscriptions end with the account (nothing is charged again), and it leaves any group
  const bill = (await billingOf(uid).get()).data() || {};
  for (const sid of [bill.sub, bill.groupSub].filter(Boolean)) {
    try { await stripe().subscriptions.cancel(sid); } catch (e) { console.warn('cancel on wipe', e.message); }
  }
  if (bill.group) {
    const g = (await groupOf(bill.group).get()).data();
    if (g && g.owner === uid) {
      await groupOf(bill.group).update({ until: Date.now(), status: 'canceled' });
      for (const m of g.members || []) { try { await billingOf(m).update({ group: FieldValue.delete() }); await refresh(m); } catch (e) {} }
    } else await leaveGroup(uid, bill.group);
  }
  await billingOf(uid).delete();
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

// ------------------------------------------------------------------ sign-ins with the password
/** "Chrome · Windows": a rough description of where a sign-in came from (no address is stored). */
function agentOf(ua) {
  ua = String(ua || '');
  const os = /iPhone|iPad|iOS/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS X|Macintosh/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
  const app = /Electron|ACMDocs|; wv\)/.test(ua) ? 'ACM Docs' : /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : /node|curl|python|okhttp|Go-http/i.test(ua) ? 'program / script' : '';
  return [app, os].filter(Boolean).join(' · ').slice(0, 60) || null;
}

/**
 * Every sign-in with the account's email + password is written as an event, so all the account's
 * devices show "someone signed in with your password" (the password alone opens nothing, but the
 * owner should know it is out). Device sessions (custom tokens) are not password sign-ins.
 */
export const beforeSignIn = beforeUserSignedIn(async (ev) => {
  const info = ev.additionalUserInfo || {};
  const provider = info.providerId || (ev.credential && ev.credential.providerId) || '';
  if (provider !== 'password' || info.isNewUser || !ev.data) return;
  const uid = ev.data.uid;
  try {
    const active = await devicesOf(uid).where('status', '==', 'active').limit(1).get();
    if (active.empty) return; // no device yet: nobody to warn
    await event(uid, { type: 'password', agent: agentOf(ev.userAgent) });
  } catch (e) { console.warn('sign-in event', e.message); }
});

// ================================================================== plans, limits and subscriptions
//
// Where things live (only these functions write them; the rules let the owner's devices read some):
//   billing/{uid}                  the account's own subscription (Stripe) or a manual grant · server only
//   groups/{gid}                   a Family / Business subscription: owner, seats, members  · server only
//   accounts/{uid}/meta/plan       the plan in effect, its limits                           · owner reads
//   accounts/{uid}/meta/cloud      { used, limit } bytes of encrypted cloud data            · owner + rules read
//   accounts/{uid}/usage/{month}   how much of each monthly action was used                 · owner reads
//   accounts/{uid}/invites/{gid}   invitations into a Family / Business group               · owner reads
//   server/keys, server/stripe     the server's signing key, Stripe ids                      · server only
//
// Nothing here can be raised from a device: counters move only inside these functions, the cloud limit
// is checked by the security rules on every write, and the plan comes from Stripe's signed messages.
const BUCKET = 'acm-docs-52280.firebasestorage.app';
const DAY = 24 * 3600 * 1000;
const OFFLINE_MS = 7 * DAY;           // a paid plan works offline for up to a week
const GRACE_MS = 3 * DAY;             // a failed renewal keeps the plan for 3 more days
const SITE = 'https://acmdocs.acmandrut.com';
const metaOf = (uid, m) => db.collection('accounts').doc(uid).collection('meta').doc(m);
const billingOf = (uid) => db.collection('billing').doc(uid);
const groupOf = (gid) => db.collection('groups').doc(gid);

// ---------------------------------------------------------------- the server's signing key
/** Ed25519 key for plan tokens (made once, kept where only these functions can read it). */
let serverKey = null;
async function signingKey() {
  if (serverKey) return serverKey;
  const ref = db.collection('server').doc('keys');
  serverKey = await db.runTransaction(async (tx) => {
    const s = await tx.get(ref);
    if (s.exists && s.data().planSk) return unb64(s.data().planSk);
    const sk = randomBytes(32);
    tx.set(ref, { planSk: Buffer.from(sk).toString('base64'), planPk: Buffer.from(ed25519.getPublicKey(sk)).toString('base64'), created: FieldValue.serverTimestamp() }, { merge: true });
    return new Uint8Array(sk);
  });
  return serverKey;
}
/** A plan token for one device: "this device of this account has this plan until exp". */
async function planToken(uid, dev, plan, until) {
  const exp = Math.min(until || 0, Date.now() + OFFLINE_MS);
  const body = Buffer.from(JSON.stringify({ v: 1, u: uid, d: dev, p: plan, e: exp, i: Date.now() })).toString('base64');
  const sig = Buffer.from(ed25519.sign(new TextEncoder().encode('acm-plan\n' + body), await signingKey())).toString('base64');
  return body + '.' + sig;
}

// ---------------------------------------------------------------- the plan in effect
/** The best plan the account has right now: its own subscription, a group it belongs to, or Basic. */
async function effective(uid) {
  const now = Date.now();
  const b = (await billingOf(uid).get()).data() || {};
  let plan = 'basic', until = 0, source = null, group = null;
  if (PAID.includes(b.plan) && !GROUP_PLANS.includes(b.plan) && (b.until || 0) > now) { plan = b.plan; until = b.until; source = b.source || 'stripe'; }
  if (b.group) {
    const g = (await groupOf(b.group).get()).data();
    if (g && (g.until || 0) > now && (g.owner === uid || (g.members || []).includes(uid)) && PLANS[g.plan].rank > PLANS[plan].rank) {
      plan = g.plan; until = g.until; source = 'group';
      group = { id: b.group, plan: g.plan, owner: g.owner === uid, seats: g.seats, used: 1 + (g.members || []).length };
    } else if (g && (g.owner === uid || (g.members || []).includes(uid))) {
      group = { id: b.group, plan: g.plan, owner: g.owner === uid, seats: g.seats, used: 1 + (g.members || []).length, inactive: (g.until || 0) <= now };
    }
  }
  const P = PLANS[plan];
  return { plan, until, source, group, devices: P.devices, cloud: P.cloud, month: P.month, cancelAt: b.cancelAt || null, period: b.period || null, hasStripe: !!b.customer };
}

/** Writes the plan in effect where the devices (and the cloud limit rules) can read it. */
async function refresh(uid) {
  const e = await effective(uid);
  await metaOf(uid, 'plan').set({ plan: e.plan, until: e.until, source: e.source, group: e.group, devices: e.devices, cloud: e.cloud, month: e.month, cancelAt: e.cancelAt, period: e.period, at: FieldValue.serverTimestamp() });
  await ensureCloud(uid, e.cloud);
  return e;
}

/** { used, limit } of the encrypted cloud: made (and measured once) for older accounts. */
async function ensureCloud(uid, limit) {
  const ref = metaOf(uid, 'cloud');
  const snap = await ref.get();
  if (limit == null) limit = (await effective(uid)).cloud;
  if (snap.exists) { if (snap.data().limit !== limit) await ref.update({ limit }); return; }
  // first time: measure what the account already keeps
  let used = 0;
  try {
    const [files] = await getStorage().bucket(BUCKET).getFiles({ prefix: `accounts/${uid}/blobs/` });
    for (const f of files) used += Number(f.metadata.size || 0);
  } catch (e) { console.warn('measure storage', e.message); }
  try {
    const vs = await db.collection('accounts').doc(uid).collection('vault').get();
    vs.forEach((d) => { used += String(d.data().b || '').length; });
  } catch (e) { console.warn('measure vault', e.message); }
  await db.runTransaction(async (tx) => {
    const s = await tx.get(ref);
    if (!s.exists) tx.set(ref, { used, limit });
  });
}

/** Moves the cloud counter; never creates the document (a deleted account stays deleted). */
async function addUsed(uid, delta) {
  if (!delta) return null;
  const ref = metaOf(uid, 'cloud');
  return db.runTransaction(async (tx) => {
    const s = await tx.get(ref);
    if (!s.exists) return null;
    const used = Math.max(0, (s.data().used || 0) + delta);
    tx.update(ref, { used });
    return { used, limit: s.data().limit };
  });
}

// ---------------------------------------------------------------- the cloud counters
/** Encrypted records: the size difference of every write. */
export const vaultSize = onDocumentWritten({ document: 'accounts/{uid}/vault/{rid}' }, async (ev) => {
  const size = (snap) => (snap && snap.exists ? String(snap.data().b || '').length : 0);
  await addUsed(ev.params.uid, size(ev.data && ev.data.after) - size(ev.data && ev.data.before));
});
/** Encrypted blocks: counted when stored; one that goes over the limit is removed again. */
export const blobStored = onObjectFinalized({ bucket: BUCKET }, async (ev) => {
  const m = /^accounts\/([A-Za-z0-9]{10,64})\/blobs\/[0-9a-f]{32}$/.exec(ev.data.name || '');
  if (!m) return;
  const r = await addUsed(m[1], Number(ev.data.size || 0));
  if (!r || r.used > r.limit) {
    try { await getStorage().bucket(BUCKET).file(ev.data.name).delete(); } catch (e) { console.warn('over limit', e.message); }
  }
});
export const blobRemoved = onObjectDeleted({ bucket: BUCKET }, async (ev) => {
  const m = /^accounts\/([A-Za-z0-9]{10,64})\/blobs\/[0-9a-f]{32}$/.exec(ev.data.name || '');
  if (m) await addUsed(m[1], -Number(ev.data.size || 0));
});

// ---------------------------------------------------------------- monthly actions
/**
 * One editing / scanning / invoicing / encrypted-document action. Counted on the server, once per
 * document (ref) per month; past the plan's number, the action is refused. Returns a plan token the
 * device keeps for working offline (paid plans only).
 */
// one instance stays warm: saving a document never waits for a cold start
export const useQuota = onCall({ minInstances: 1 }, async (req) => {
  const { uid, dev } = await needDevice(req);
  const { action, ref } = req.data || {};
  if (!ACTIONS.includes(action)) fail('invalid-argument', 'action');
  if (ref != null && (typeof ref !== 'string' || !/^[0-9a-f]{16,64}$/.test(ref))) fail('invalid-argument', 'ref');
  const e = await effective(uid);
  const limit = e.month[action];
  const month = monthOf();
  const uref = db.collection('accounts').doc(uid).collection('usage').doc(month);
  const rref = ref ? uref.collection('refs').doc(action + '-' + ref) : null;
  const used = await db.runTransaction(async (tx) => {
    const u = await tx.get(uref);
    const seen = rref ? (await tx.get(rref)).exists : false; // (all reads before any write)
    const d = u.exists ? u.data() : {};
    const n = d[action] || 0;
    // scripted bursts: at most 120 calls per 10 minutes per account (kept in the same document)
    const now = Date.now();
    const win = d.win && d.win + 600000 > now ? d.win : now;
    const calls = win === d.win ? (d.calls || 0) + 1 : 1;
    if (calls > 120) fail('resource-exhausted', 'too many requests, try again later');
    tx.set(uref, { win, calls }, { merge: true });
    if (seen) return n; // same document again this month: free
    if (n >= limit) fail('resource-exhausted', 'limit:' + action);
    // counters and document marks delete themselves after about 13 months (Firestore TTL on "expires")
    const expires = Timestamp.fromMillis(Date.now() + 400 * DAY);
    tx.set(uref, { [action]: n + 1, month, expires }, { merge: true });
    if (rref) tx.set(rref, { at: FieldValue.serverTimestamp(), expires });
    return n + 1;
  });
  return { ok: true, plan: e.plan, used, limit, token: e.plan !== 'basic' ? await planToken(uid, dev, e.plan, e.until) : null };
});

/** Everything the "Subscription" screen shows, fresh from the server. */
export const planStatus = onCall(async (req) => {
  const { uid, dev } = await needDevice(req);
  const e = await refresh(uid);
  const usage = (await db.collection('accounts').doc(uid).collection('usage').doc(monthOf()).get()).data() || {};
  const cloud = (await metaOf(uid, 'cloud').get()).data() || { used: 0, limit: e.cloud };
  const active = (await devicesOf(uid).where('status', '==', 'active').get()).size;
  return {
    plan: e.plan, until: e.until, source: e.source, group: e.group, cancelAt: e.cancelAt, period: e.period,
    devices: { used: active, limit: e.devices }, cloud: { used: cloud.used, limit: cloud.limit },
    month: monthOf(), usage: Object.fromEntries(ACTIONS.map((a) => [a, { used: usage[a] || 0, limit: e.month[a] }])),
    plans: PLANS, prices: PRICES, payments: !!process.env.STRIPE_SECRET_KEY, manage: e.hasStripe, mail: mailReady(),
    token: e.plan !== 'basic' ? await planToken(uid, dev, e.plan, e.until) : null,
  };
});

// ---------------------------------------------------------------- Stripe
let stripeClient = null;
function stripe() {
  if (!process.env.STRIPE_SECRET_KEY) fail('unavailable', 'payments not active');
  if (!stripeClient) stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY);
  return stripeClient;
}
const NAMES = { personal: 'ACM Docs Personal', pro: 'ACM Docs Pro', family: 'ACM Docs Family', business: 'ACM Docs Business' };
/** The Stripe product of a plan (made once, remembered). */
async function productOf(plan) {
  const ref = db.collection('server').doc('stripe');
  const s = (await ref.get()).data() || {};
  if (s.products && s.products[plan]) return s.products[plan];
  const p = await stripe().products.create({ name: NAMES[plan], metadata: { plan }, tax_code: 'txcd_10103001' });
  await ref.set({ products: { [plan]: p.id } }, { merge: true });
  return p.id;
}
async function customerOf(uid) {
  const ref = billingOf(uid);
  const b = (await ref.get()).data() || {};
  if (b.customer) return b.customer;
  const u = await getAuth().getUser(uid);
  const c = await stripe().customers.create({ email: u.email, metadata: { uid } });
  await ref.set({ customer: c.id }, { merge: true });
  return c.id;
}
const priceData = async (plan, period) => ({
  currency: 'eur', unit_amount: PRICES[plan][period], product: await productOf(plan), tax_behavior: 'inclusive',
  recurring: { interval: period === 'year' ? 'year' : 'month' },
});

/** A Stripe payment page for a plan; the app opens it in the browser. */
export const billingCheckout = onCall(async (req) => {
  const { uid } = await needDevice(req);
  const { plan, period, seats, consent } = req.data || {};
  if (!PAID.includes(plan) || !['month', 'year'].includes(period)) fail('invalid-argument', 'plan');
  if (consent !== true) fail('failed-precondition', 'consent');
  await rateLimit(req, 'checkout|' + uid, 10, 60 * 60 * 1000, true);
  let qty = 1;
  if (plan === 'business') {
    qty = Number(seats);
    if (!Number.isInteger(qty) || qty < PLANS.business.minSeats || qty > PLANS.business.maxSeats) fail('invalid-argument', 'seats');
  }
  const e = await effective(uid);
  const b = (await billingOf(uid).get()).data() || {};
  // one subscription of each kind: a change of plan goes through billingChange / the portal
  if (!GROUP_PLANS.includes(plan) && b.sub && (b.until || 0) > Date.now()) fail('already-exists', 'subscription exists');
  if (GROUP_PLANS.includes(plan) && e.group && e.group.owner && !e.group.inactive) fail('already-exists', 'group exists');
  const session = await stripe().checkout.sessions.create({
    mode: 'subscription',
    customer: await customerOf(uid),
    client_reference_id: uid,
    line_items: [{ price_data: await priceData(plan, period), quantity: qty }],
    subscription_data: { metadata: { uid, plan, period } },
    metadata: { uid, plan, period, consent: String(Date.now()) },
    automatic_tax: { enabled: process.env.STRIPE_TAX === '1' },
    customer_update: process.env.STRIPE_TAX === '1' ? { address: 'auto' } : undefined,
    allow_promotion_codes: true,
    billing_address_collection: 'auto',
    custom_text: { submit: { message: 'Abonamentul se reînnoiește automat și îl poți anula oricând din aplicație. / The subscription renews automatically; cancel any time in the app.' } },
    success_url: SITE + '/plata?ok=1',
    cancel_url: SITE + '/plata?ok=0',
  });
  return { url: session.url };
});

/** Personal ⇄ Pro, monthly ⇄ yearly: the subscription is changed (Stripe settles the difference). */
export const billingChange = onCall(async (req) => {
  const { uid } = await needDevice(req);
  const { plan, period } = req.data || {};
  if (!['personal', 'pro'].includes(plan) || !['month', 'year'].includes(period)) fail('invalid-argument', 'plan');
  const b = (await billingOf(uid).get()).data() || {};
  if (!b.sub) fail('failed-precondition', 'no subscription');
  const sub = await stripe().subscriptions.retrieve(b.sub);
  await stripe().subscriptions.update(b.sub, {
    items: [{ id: sub.items.data[0].id, price_data: await priceData(plan, period), quantity: 1 }],
    metadata: { uid, plan, period }, proration_behavior: 'create_prorations', cancel_at_period_end: false,
  });
  await applySubscription(await stripe().subscriptions.retrieve(b.sub));
  return { ok: true };
});

/** Number of accounts of a Business subscription (owner only). */
export const groupSeats = onCall(async (req) => {
  const { uid } = await needDevice(req);
  const n = Number((req.data || {}).seats);
  const e = await effective(uid);
  if (!e.group || !e.group.owner || e.group.plan !== 'business') fail('permission-denied', 'not a business owner');
  if (!Number.isInteger(n) || n < PLANS.business.minSeats || n > PLANS.business.maxSeats) fail('invalid-argument', 'seats');
  if (n < e.group.used) fail('failed-precondition', 'remove accounts first');
  const g = (await groupOf(e.group.id).get()).data();
  const sub = await stripe().subscriptions.retrieve(g.sub);
  await stripe().subscriptions.update(g.sub, { items: [{ id: sub.items.data[0].id, quantity: n }], proration_behavior: 'create_prorations' });
  await applySubscription(await stripe().subscriptions.retrieve(g.sub));
  return { ok: true };
});

/** Stripe's own page for card, invoices and cancelling. */
export const billingPortal = onCall(async (req) => {
  const { uid } = await needDevice(req);
  const b = (await billingOf(uid).get()).data() || {};
  if (!b.customer) fail('failed-precondition', 'no customer');
  const ref = db.collection('server').doc('stripe');
  let conf = ((await ref.get()).data() || {}).portal;
  if (!conf) {
    const c = await stripe().billingPortal.configurations.create({
      business_profile: { headline: 'ACM Docs', privacy_policy_url: SITE + '/confidentialitate', terms_of_service_url: SITE + '/termeni' },
      features: {
        payment_method_update: { enabled: true }, invoice_history: { enabled: true },
        customer_update: { enabled: true, allowed_updates: ['email', 'address', 'tax_id', 'name'] },
        subscription_cancel: { enabled: true, mode: 'at_period_end', cancellation_reason: { enabled: true, options: ['too_expensive', 'unused', 'missing_features', 'switched_service', 'other'] } },
      },
    });
    conf = c.id;
    await ref.set({ portal: conf }, { merge: true });
  }
  const s = await stripe().billingPortal.sessions.create({ customer: b.customer, configuration: conf, return_url: SITE + '/plata?ok=portal' });
  return { url: s.url };
});

/** Until when a Stripe subscription gives its plan (newer API versions keep the period on the item). */
function periodEnd(sub) {
  const it = sub.items && sub.items.data && sub.items.data[0];
  return 1000 * ((it && it.current_period_end) || sub.current_period_end || 0);
}
/** A subscription as Stripe reports it → billing / group documents → plan in effect. */
async function applySubscription(sub, at = Date.now()) {
  const uid = sub.metadata && sub.metadata.uid;
  const plan = sub.metadata && sub.metadata.plan;
  if (!uid || !PAID.includes(plan)) { console.warn('subscription without uid/plan', sub.id); return; }
  const end = periodEnd(sub);
  const live = ['active', 'trialing'].includes(sub.status);
  const until = live ? end : sub.status === 'past_due' ? end + GRACE_MS : Math.min(end, Date.now());
  const it = sub.items.data[0];
  const period = it && it.price && it.price.recurring && it.price.recurring.interval === 'year' ? 'year' : 'month';
  const cancelAt = sub.cancel_at_period_end || sub.cancel_at ? (sub.cancel_at ? sub.cancel_at * 1000 : end) : null;
  if (GROUP_PLANS.includes(plan)) {
    const gid = 'g' + String(sub.id).replace(/[^A-Za-z0-9]/g, '');
    const seats = plan === 'family' ? PLANS.family.seats : Math.max(PLANS.business.minSeats, it.quantity || 1);
    const members = await db.runTransaction(async (tx) => {
      const g = await tx.get(groupOf(gid));
      if (g.exists && (g.data().subAt || 0) > at) return null; // an older message arriving late
      const d = g.exists ? g.data() : {};
      tx.set(groupOf(gid), { owner: uid, plan, seats, sub: sub.id, status: sub.status, until, cancelAt, subAt: at, members: d.members || [], pending: d.pending || [], created: d.created || FieldValue.serverTimestamp() });
      return d.members || [];
    });
    if (!members) return;
    await billingOf(uid).set({ group: gid, groupSub: sub.id }, { merge: true });
    for (const m of [uid, ...members]) await refresh(m);
    return;
  }
  const late = await db.runTransaction(async (tx) => {
    const b = await tx.get(billingOf(uid));
    if (b.exists && b.data().sub === sub.id && (b.data().subAt || 0) > at) return true;
    tx.set(billingOf(uid), { plan, until, source: 'stripe', sub: sub.id, status: sub.status, period, cancelAt, customer: sub.customer, subAt: at }, { merge: true });
    return false;
  });
  if (!late) await refresh(uid);
}

/** Stripe → server: payments, renewals, cancellations. Only messages signed by Stripe are believed. */
export const stripeWebhook = onRequest({ cors: false }, async (req, res) => {
  if (req.method !== 'POST' || !process.env.STRIPE_WEBHOOK_SECRET) { res.status(404).end(); return; }
  let ev;
  try { ev = stripe().webhooks.constructEvent(req.rawBody, req.get('stripe-signature'), process.env.STRIPE_WEBHOOK_SECRET); }
  catch (e) { res.status(400).send('bad signature'); return; }
  try {
    const seen = db.collection('server').doc('stripe').collection('hooks').doc(ev.id);
    if ((await seen.get()).exists) { res.json({ ok: true, again: true }); return; }
    const o = ev.data.object;
    if (ev.type === 'checkout.session.completed' && o.mode === 'subscription' && o.subscription) {
      await applySubscription(await stripe().subscriptions.retrieve(o.subscription), ev.created * 1000);
    } else if (/^customer\.subscription\.(created|updated|deleted|paused|resumed)$/.test(ev.type)) {
      // the signed message carries the whole subscription as it is now
      await applySubscription(ev.type.endsWith('deleted') ? { ...o, status: 'canceled' } : o, ev.created * 1000);
    } else if ((ev.type === 'invoice.paid' || ev.type === 'invoice.payment_failed') && (o.subscription || (o.parent && o.parent.subscription_details))) {
      const sid = o.subscription || o.parent.subscription_details.subscription;
      await applySubscription(await stripe().subscriptions.retrieve(sid), ev.created * 1000);
    }
    await seen.set({ type: ev.type, at: FieldValue.serverTimestamp(), expires: Timestamp.fromMillis(Date.now() + 30 * DAY) });
    res.json({ ok: true });
  } catch (e) {
    console.error('webhook', ev.type, e);
    res.status(500).send('retry');
  }
});

// ---------------------------------------------------------------- Family / Business groups
/** Owner: invites an account by @name into the group (it must accept). */
export const groupInvite = onCall(async (req) => {
  const { uid } = await needDevice(req);
  const h = String((req.data || {}).handle || '').toLowerCase().replace(/^@/, '');
  if (!/^[a-z0-9_]{3,20}$/.test(h)) fail('invalid-argument', 'handle');
  await rateLimit(req, 'ginv|' + uid, 60, 60 * 60 * 1000, true);
  const e = await effective(uid);
  if (!e.group || !e.group.owner || e.group.inactive) fail('permission-denied', 'not a group owner');
  const owned = await db.collection('usernames').doc(h).get();
  if (!owned.exists) fail('not-found', 'no such account');
  const to = owned.data().uid;
  if (to === uid) fail('invalid-argument', 'self');
  const me = (await db.collection('users').doc(uid).get()).data() || {};
  await db.runTransaction(async (tx) => {
    const g = await tx.get(groupOf(e.group.id));
    const d = g.data();
    if ((d.members || []).includes(to)) fail('already-exists', 'already a member');
    const pending = (d.pending || []).filter((x) => x !== to);
    if (1 + (d.members || []).length + pending.length >= d.seats) fail('resource-exhausted', 'no free seats');
    tx.update(groupOf(e.group.id), { pending: [...pending, to] });
    tx.set(db.collection('accounts').doc(to).collection('invites').doc(e.group.id), { plan: d.plan, from: me.handle || '', name: me.name || '', at: FieldValue.serverTimestamp() });
  });
  return { ok: true };
});

/** Invited account: joins (accept) or refuses. */
export const groupAnswer = onCall(async (req) => {
  const { uid } = await needDevice(req);
  const { gid, accept } = req.data || {};
  if (typeof gid !== 'string' || !/^g[A-Za-z0-9]{6,80}$/.test(gid)) fail('invalid-argument', 'gid');
  const inv = db.collection('accounts').doc(uid).collection('invites').doc(gid);
  if (!(await inv.get()).exists) fail('not-found', 'no invitation');
  let before = null;
  if (accept === true) {
    const mine = (await billingOf(uid).get()).data() || {};
    if (mine.group && mine.group !== gid) {
      const old = (await groupOf(mine.group).get()).data();
      if (old && old.owner === uid && (old.until || 0) > Date.now()) fail('failed-precondition', 'owner of another group');
      before = mine.group;
    }
    await db.runTransaction(async (tx) => {
      const g = await tx.get(groupOf(gid));
      if (!g.exists || (g.data().until || 0) <= Date.now()) fail('failed-precondition', 'group inactive');
      const d = g.data();
      if (!(d.pending || []).includes(uid)) fail('not-found', 'no invitation');
      const members = [...new Set([...(d.members || []), uid])];
      if (1 + members.length > d.seats) fail('resource-exhausted', 'no free seats');
      tx.update(groupOf(gid), { members, pending: (d.pending || []).filter((x) => x !== uid) });
      tx.set(billingOf(uid), { group: gid }, { merge: true });
      tx.delete(inv);
    });
    if (before) await leaveGroup(uid, before);
  } else {
    await groupOf(gid).update({ pending: FieldValue.arrayRemove(uid) }).catch(() => {});
    await inv.delete();
  }
  await refresh(uid);
  return { ok: true };
});

async function leaveGroup(uid, gid) {
  await groupOf(gid).update({ members: FieldValue.arrayRemove(uid) }).catch(() => {});
}
/** Owner: removes an account (or cancels an invitation). */
export const groupRemove = onCall(async (req) => {
  const { uid } = await needDevice(req);
  const who = String((req.data || {}).uid || '');
  if (!/^[A-Za-z0-9]{10,64}$/.test(who) || who === uid) fail('invalid-argument', 'uid');
  const e = await effective(uid);
  if (!e.group || !e.group.owner) fail('permission-denied', 'not a group owner');
  await groupOf(e.group.id).update({ members: FieldValue.arrayRemove(who), pending: FieldValue.arrayRemove(who) });
  await db.collection('accounts').doc(who).collection('invites').doc(e.group.id).delete().catch(() => {});
  const b = (await billingOf(who).get()).data() || {};
  if (b.group === e.group.id) await billingOf(who).update({ group: FieldValue.delete() });
  await refresh(who);
  return { ok: true };
});
/** Member: leaves the group. */
export const groupLeave = onCall(async (req) => {
  const { uid } = await needDevice(req);
  const b = (await billingOf(uid).get()).data() || {};
  if (!b.group) return { ok: true };
  const g = (await groupOf(b.group).get()).data();
  if (g && g.owner === uid) fail('failed-precondition', 'owner cannot leave');
  await leaveGroup(uid, b.group);
  await billingOf(uid).update({ group: FieldValue.delete() });
  await refresh(uid);
  return { ok: true };
});
/** Owner: who is in the group (by @name). Member: who pays. */
export const groupInfo = onCall(async (req) => {
  const { uid } = await needDevice(req);
  const b = (await billingOf(uid).get()).data() || {};
  if (!b.group) return { group: null };
  const g = (await groupOf(b.group).get()).data();
  if (!g) return { group: null };
  const who = async (u) => { const p = (await db.collection('users').doc(u).get()).data() || {}; return { uid: u, handle: p.handle || '', name: p.name || '' }; };
  if (g.owner !== uid) return { group: { id: b.group, plan: g.plan, owner: false, by: await who(g.owner), until: g.until } };
  return { group: { id: b.group, plan: g.plan, owner: true, seats: g.seats, until: g.until, cancelAt: g.cancelAt || null, members: await Promise.all((g.members || []).map(who)), pending: await Promise.all((g.pending || []).map(who)) } };
});

// ---------------------------------------------------------------- housekeeping
/** Once a day: plans that ran out (no message from Stripe needed) go back to Basic everywhere. */
export const expirePlans = onSchedule({ schedule: 'every day 03:17', timeZone: 'Europe/Bucharest' }, async () => {
  const now = Date.now();
  const metas = await db.collectionGroup('meta').where('until', '<', now).where('until', '>', 0).limit(1000).get();
  for (const d of metas.docs) {
    const uid = d.ref.parent.parent.id;
    try { await refresh(uid); } catch (e) { console.warn('expire', uid, e.message); }
  }
});

/** New accounts: a few per address and hour, and no throwaway mailboxes. */
const THROWAWAY = ['mailinator.com', 'guerrillamail.com', 'guerrillamail.net', 'sharklasers.com', '10minutemail.com', 'temp-mail.org', 'tempmail.com', 'yopmail.com', 'trashmail.com', 'getnada.com', 'dispostable.com', 'maildrop.cc', 'throwawaymail.com', 'fakeinbox.com', 'mailnesia.com', 'mintemail.com', 'emailondeck.com', 'tempail.com', 'moakt.com', 'mohmal.com', 'burnermail.io', 'spamgourmet.com', 'mytemp.email', 'tempmailo.com', 'temp-mail.io', 'minuteinbox.com', 'luxusmail.org', 'cock.li', 'grr.la', 'spam4.me'];
export const beforeCreate = beforeUserCreated(async (ev) => {
  const email = String((ev.data && ev.data.email) || '').toLowerCase();
  const domain = email.split('@')[1] || '';
  if (THROWAWAY.some((d) => domain === d || domain.endsWith('.' + d))) throw new HttpsError('invalid-argument', 'disposable email');
  const ip = String(ev.ipAddress || 'unknown');
  const limited = async (bucket, max, windowMs) => {
    const key = hex(sha256(new TextEncoder().encode(bucket))).slice(0, 40);
    const ref = db.collection('limits').doc(key);
    return db.runTransaction(async (tx) => {
      const s = await tx.get(ref);
      const now = Date.now();
      const d = s.exists ? s.data() : null;
      if (!d || d.start + windowMs < now) { tx.set(ref, { start: now, n: 1, expires: Timestamp.fromMillis(now + windowMs) }); return false; }
      if (d.n >= max) return true;
      tx.update(ref, { n: d.n + 1 });
      return false;
    });
  };
  if (process.env.FUNCTIONS_EMULATOR === 'true') return; // the test accounts all come from one address
  if (await limited('signup|' + ip, 5, 3600 * 1000)) throw new HttpsError('resource-exhausted', 'too many accounts from this network');
  if (await limited('signup-all', 300, 3600 * 1000)) throw new HttpsError('resource-exhausted', 'too many new accounts, try later');
});

// ================================================================== two-step verification by email
const challengeOf = (uid) => db.collection('challenges').doc(uid); // closed to every device by the rules
const codeHash = (uid, code) => Buffer.from(sha256(new TextEncoder().encode(`acm-email-code\n${uid}\n${code}`)));
/** The very first device of a new account needs no code (the email was just confirmed). */
async function emailFirstDevice(uid) { return (await devicesOf(uid).limit(1).get()).empty; }
/** On for every account (it can be turned off from a device of the account), once mail is set up. */
async function emailCodeRequired(uid) {
  if (!mailReady() && process.env.MAIL_TEST !== '1') return false;
  const sec = (await metaOf(uid, 'security').get()).data() || {};
  return sec.emailCode !== false;
}
async function checkEmailCode(uid, code) {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) fail('failed-precondition', 'email code required');
  const ref = challengeOf(uid);
  const ok = await db.runTransaction(async (tx) => {
    const s = await tx.get(ref);
    if (!s.exists) return 'none';
    const d = s.data();
    if (d.expires.toMillis() < Date.now() || d.tries >= 5) { tx.delete(ref); return 'expired'; }
    const good = timingSafeEqual(Buffer.from(d.h, 'base64'), codeHash(uid, code));
    if (good) tx.delete(ref); else tx.update(ref, { tries: d.tries + 1 });
    return good ? 'ok' : 'bad';
  });
  if (ok === 'ok') return;
  fail('permission-denied', ok === 'bad' ? 'bad email code' : 'email code expired');
}

/** Sends the 6-digit code to the account's email (signed in with the password, not yet a device). */
export const emailCodeSend = onCall(async (req) => {
  const uid = needUser(req);
  if (!(await emailCodeRequired(uid))) return { needed: false };
  await rateLimit(req, 'mailcode|' + uid, 5, 60 * 60 * 1000, true);
  const code = String(randomBytes(4).readUInt32BE(0) % 1000000).padStart(6, '0');
  const user = await getAuth().getUser(uid);
  await challengeOf(uid).set({ h: codeHash(uid, code).toString('base64'), tries: 0, expires: Timestamp.fromMillis(Date.now() + 10 * 60 * 1000), ...(process.env.MAIL_TEST === '1' ? { test: code } : {}) });
  if (mailReady()) await sendSignInCode(user.email, code, agentOf(req.rawRequest && req.rawRequest.headers['user-agent']));
  const [name, dom] = String(user.email || '').split('@');
  return { needed: true, to: name ? name.slice(0, 2) + '•••@' + dom : '' };
});

/** Turns the email code on or off (only from a device of the account). */
export const emailCodeSet = onCall(async (req) => {
  const { uid } = await needDevice(req);
  const on = (req.data || {}).on !== false;
  await metaOf(uid, 'security').set({ emailCode: on, at: FieldValue.serverTimestamp() }, { merge: true });
  await event(uid, { type: on ? 'twostep-on' : 'twostep-off', method: 'email' });
  return { on, ready: mailReady() };
});
