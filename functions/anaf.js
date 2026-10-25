// RO e-Factura: connecting a company's SPV to ACM Docs (OAuth with ANAF).
//
// What the server does, and what it does not:
//  - it holds ACM Docs' own OAuth client (Client ID + Client Secret, set from the control panel);
//  - when someone connects, ANAF sends the browser back to /anaf/callback; the server exchanges the
//    one-time code for the company's access keys and immediately encrypts them for the device that
//    asked (a one-time key the device made for this: X25519 + ChaCha20-Poly1305). It keeps only that sealed copy, for at
//    most 10 minutes, until the device picks it up; then it is deleted. The server cannot read it back.
//  - renewing the keys needs the Client Secret, so the device asks the server once in a while;
//    the keys pass through and are not stored.
//  - invoices never pass through the server: the devices send them to ANAF directly.
import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { randomBytes, createCipheriv, hkdfSync } from 'node:crypto';
import { x25519 } from '@noble/curves/ed25519.js';

const fail = (code, msg) => { throw new HttpsError(code, msg); };
const AUTHORIZE = 'https://logincert.anaf.ro/anaf-oauth2/v1/authorize';
const TOKEN = 'https://logincert.anaf.ro/anaf-oauth2/v1/token';
export const CALLBACK = 'https://acm-docs-52280.web.app/anaf/callback';
const STATE_TTL = 10 * 60 * 1000;

export function makeAnaf({ db, needDevice, emulator }) {
  const conf = async () => (await db.collection('server').doc('anaf').get()).data() || {};
  const states = () => db.collection('anafStates');

  /** The device's one-time public key (X25519, base64): the sealed keys can only be opened by it. */
  function sealFor(pubB64, obj) {
    const pub = Buffer.from(String(pubB64 || ''), 'base64');
    if (pub.length !== 32) fail('invalid-argument', 'device key');
    const sk = randomBytes(32);
    const epk = Buffer.from(x25519.getPublicKey(sk));
    const shared = Buffer.from(x25519.getSharedSecret(sk, pub));
    const key = Buffer.from(hkdfSync('sha256', shared, Buffer.alloc(0), Buffer.from('acm-anaf-v1'), 32));
    const iv = randomBytes(12);
    const c = createCipheriv('chacha20-poly1305', key, iv, { authTagLength: 16 });
    const ct = Buffer.concat([c.update(Buffer.from(JSON.stringify(obj))), c.final(), c.getAuthTag()]);
    return { epk: epk.toString('base64'), iv: iv.toString('base64'), ct: ct.toString('base64') };
  }

  async function tokenCall(params) {
    // emulator only: a made-up code stands in for ANAF, so the whole connection can be tested
    if (emulator && (params.code === 'emulator-code' || params.refresh_token === 'emulator-refresh')) return { access: 'emulator-access', refresh: 'emulator-refresh', expiresIn: 7776000, at: Date.now() };
    const c = await conf();
    if (!c.clientId || !c.clientSecret) fail('failed-precondition', 'anaf not configured');
    const r = await fetch(TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: 'Basic ' + Buffer.from(`${c.clientId}:${c.clientSecret}`).toString('base64') },
      body: new URLSearchParams({ ...params, token_content_type: 'jwt' }).toString(),
    });
    const text = await r.text();
    let j = null;
    try { j = JSON.parse(text); } catch (e) { /* not JSON */ }
    if (!r.ok || !j || !j.access_token) fail('unavailable', 'anaf token: ' + ((j && (j.error_description || j.error)) || r.status));
    return { access: j.access_token, refresh: j.refresh_token || null, expiresIn: Number(j.expires_in) || 0, at: Date.now() };
  }

  /** Starts a connection: returns the ANAF page where the company's certificate is chosen. */
  const anafStart = onCall(async (req) => {
    const { uid } = await needDevice(req);
    const c = await conf();
    if (!c.clientId || !c.clientSecret) fail('failed-precondition', 'anaf not configured');
    const v = req.data || {};
    if (typeof v.pub !== 'string' || v.pub.length > 200) fail('invalid-argument', 'device key');
    // a few connections an hour at most
    const recent = await states().where('uid', '==', uid).where('created', '>', Timestamp.fromMillis(Date.now() - 3600000)).count().get();
    if (recent.data().count >= 10) fail('resource-exhausted', 'too many');
    const state = randomBytes(24).toString('hex');
    await states().doc(state).set({ uid, pub: v.pub, created: FieldValue.serverTimestamp(), expires: Timestamp.fromMillis(Date.now() + STATE_TTL) });
    const u = new URL(AUTHORIZE);
    u.search = new URLSearchParams({ response_type: 'code', client_id: c.clientId, redirect_uri: CALLBACK, token_content_type: 'jwt', state }).toString();
    return { url: u.toString(), state, env: c.env === 'prod' ? 'prod' : 'test' };
  });

  /** ANAF sends the browser here with a one-time code: exchanged at once, sealed for the device. */
  const anafCallback = onRequest({ cors: false }, async (req, res) => {
    const page = (ok, title, text) => {
      res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
      res.set('Cache-Control', 'no-store');
      res.status(ok ? 200 : 400).send(`<!doctype html><html lang="ro"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ACM Docs · e-Factura</title>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#f2f2f7;font:16px -apple-system,system-ui,Segoe UI,Roboto,sans-serif;color:#1d1d1f">
<div style="max-width:420px;margin:24px;padding:32px 28px;border-radius:28px;background:#fff;box-shadow:0 20px 50px -24px rgba(15,23,42,.35);text-align:center">
<div style="width:64px;height:64px;margin:0 auto 18px;border-radius:50%;display:grid;place-items:center;background:${ok ? '#34c759' : '#ff3b30'};color:#fff;font-size:34px;font-weight:700">${ok ? '✓' : '!'}</div>
<h1 style="margin:0 0 10px;font-size:22px">${title}</h1><p style="margin:0;color:#6e6e73;line-height:1.5">${text}</p></div></body></html>`);
    };
    try {
      const state = String(req.query.state || '');
      const code = String(req.query.code || '');
      if (!/^[0-9a-f]{48}$/.test(state)) return page(false, 'Legătura nu este validă', 'Pornește din nou conectarea din aplicația ACM Docs.');
      const ref = states().doc(state);
      const s = await ref.get();
      if (!s.exists || s.data().expires.toMillis() < Date.now() || s.data().sealed) return page(false, 'Legătura a expirat', 'Pornește din nou conectarea din aplicația ACM Docs.');
      if (req.query.error || !code) { await ref.delete(); return page(false, 'Conectarea a fost anulată', 'Nu s-a conectat nimic. Poți încerca din nou din aplicație.'); }
      const t = await tokenCall({ grant_type: 'authorization_code', code, redirect_uri: CALLBACK });
      await ref.update({ sealed: sealFor(s.data().pub, t), pub: FieldValue.delete() });
      return page(true, 'Firma este conectată', 'Întoarce-te în aplicația ACM Docs: facturile se vor trimite automat în SPV.');
    } catch (e) {
      console.warn('anaf callback', e && e.message);
      return page(false, 'Conectarea nu a reușit', 'ANAF nu a confirmat conectarea. Încearcă din nou peste câteva minute.');
    }
  });

  /** The device picks up its sealed keys (once); the copy on the server is deleted. */
  const anafClaim = onCall(async (req) => {
    const { uid } = await needDevice(req);
    const state = String((req.data || {}).state || '');
    if (!/^[0-9a-f]{48}$/.test(state)) fail('invalid-argument', 'state');
    const ref = states().doc(state);
    const s = await ref.get();
    if (!s.exists || s.data().uid !== uid) fail('not-found', 'no such connection');
    if (s.data().expires.toMillis() < Date.now()) { await ref.delete(); fail('deadline-exceeded', 'expired'); }
    if (!s.data().sealed) return { ready: false };
    await ref.delete();
    return { ready: true, sealed: s.data().sealed };
  });

  /** Renews the company's access keys (ANAF wants the Client Secret for this); nothing is stored. */
  const anafRefresh = onCall(async (req) => {
    await needDevice(req);
    const v = req.data || {};
    if (typeof v.refresh !== 'string' || v.refresh.length < 8 || v.refresh.length > 8000) fail('invalid-argument', 'refresh');
    if (typeof v.pub !== 'string') fail('invalid-argument', 'device key');
    const t = await tokenCall({ grant_type: 'refresh_token', refresh_token: v.refresh });
    return { sealed: sealFor(v.pub, t) };
  });

  /** Is e-Factura available (set up in the control panel), and in which environment. */
  const anafInfo = onCall(async (req) => {
    await needDevice(req);
    const c = await conf();
    return { ready: !!(c.clientId && c.clientSecret), env: c.env === 'prod' ? 'prod' : 'test' };
  });

  return { anafStart, anafCallback, anafClaim, anafRefresh, anafInfo, conf };
}
