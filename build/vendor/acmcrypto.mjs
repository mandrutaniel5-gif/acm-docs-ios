// ACM Docs — end-to-end encryption core (.acm files and account keys).
// Pure functions, no I/O: the same code runs on Windows (Electron), Android and iOS.
//
// Building blocks (audited libraries, nothing home-made):
//   - 24 recovery words: BIP-39 (256 bits)          @scure/bip39
//   - key derivation: HKDF-SHA256                    @noble/hashes
//   - key agreement: X25519 + ML-KEM-768 (hybrid, post-quantum, NIST FIPS 203)   @noble/curves, @noble/post-quantum
//   - signatures: Ed25519 + ML-DSA-65 (hybrid, post-quantum, NIST FIPS 204)   @noble/curves, @noble/post-quantum
//   - encryption: XChaCha20-Poly1305                 @noble/ciphers
//   - document password: Argon2id                    @noble/hashes
//
// Picture: the document goes in a box locked with a fresh key (DEK); the DEK goes in one
// envelope per recipient, locked with that recipient's public keys (and the password, if any).

import { x25519, ed25519 } from '@noble/curves/ed25519.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { argon2id } from '@noble/hashes/argon2.js';
import { randomBytes, concatBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { ml_kem768 } from '@noble/post-quantum/ml-kem.js';
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js';
import { generateMnemonic as bipGenerate, validateMnemonic as bipValidate, mnemonicToSeedSync } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';

export const VERSION = 1;
const MAGIC = utf8ToBytes('ACM1');      // .acm file
const KEY_MAGIC = utf8ToBytes('ACMK');  // public key bundle
const PW_DEFAULTS = { t: 2, m: 32768, p: 1 }; // Argon2id: 32 MiB, 2 passes (~1 s on a phone)

export class AcmError extends Error {
  constructor(code, message) { super(message || code); this.code = code; }
}

// ------------------------------------------------------------------ small helpers
const te = new TextEncoder();
const td = new TextDecoder();
const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s) => { const bin = atob(String(s || '')); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; };
const u32 = (n) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n, true); return b; };
const readU32 = (u8, off) => new DataView(u8.buffer, u8.byteOffset + off, 4).getUint32(0, true);
const hex = (u8) => Array.from(u8, (x) => x.toString(16).padStart(2, '0')).join('');
const equal = (a, b) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i]; return d === 0; };
const kdf = (ikm, salt, info, len) => hkdf(sha256, ikm, salt, utf8ToBytes(info), len);
const toBytes = (x) => (x instanceof Uint8Array ? x : new Uint8Array(x));

/** Padmé: hides the exact size of the document, leaks at most ~12% (log log of the size). */
export function padme(len) {
  if (len < 2) return len;
  const e = Math.floor(Math.log2(len));
  const s = Math.floor(Math.log2(e)) + 1;
  const lastBits = e - s;
  const mask = 2 ** lastBits - 1;
  return Math.ceil(len / (mask + 1)) * (mask + 1);
}

// ------------------------------------------------------------------ 24 words
export function generateMnemonic() { return bipGenerate(wordlist, 256); }
export function normalizeMnemonic(m) { return String(m || '').normalize('NFKD').trim().toLowerCase().split(/\s+/).join(' '); }
export function validateMnemonic(m) { const n = normalizeMnemonic(m); return n.split(' ').length === 24 && bipValidate(n, wordlist); }
export const WORDLIST = wordlist;

// ------------------------------------------------------------------ identity (account keys)
/**
 * The same 24 words always give the same keys: nothing secret is ever stored on a server.
 * Returns the private parts (keep on the device, locked by Face ID) and the public bundle.
 */
export function deriveIdentity(mnemonic) {
  if (!validateMnemonic(mnemonic)) throw new AcmError('BAD_MNEMONIC', 'Cele 24 de cuvinte nu sunt corecte.');
  const seed = mnemonicToSeedSync(normalizeMnemonic(mnemonic), '');
  const master = kdf(seed, utf8ToBytes('ACM Docs identity v1'), '', 32);
  const xSk = kdf(master, undefined, 'acm/x25519', 32);
  const edSk = kdf(master, undefined, 'acm/ed25519', 32);
  const kemSeed = kdf(master, undefined, 'acm/mlkem768', 64);
  const kem = ml_kem768.keygen(kemSeed);
  const dsa = ml_dsa65.keygen(kdf(master, undefined, 'acm/mldsa65', 32));
  return identityFromSecrets({ xSk, edSk, kemSk: kem.secretKey, kemPk: kem.publicKey, dsaSk: dsa.secretKey, dsaPk: dsa.publicKey });
}

function identityFromSecrets({ xSk, edSk, kemSk, kemPk, dsaSk, dsaPk }) {
  const pub = { x: x25519.getPublicKey(xSk), ed: ed25519.getPublicKey(edSk), kem: kemPk, dsa: dsaPk };
  const bundle = encodePublicKey(pub);
  return { secret: { xSk, edSk, kemSk, dsaSk }, public: pub, bundle, fingerprint: fingerprint(bundle) };
}

/** Private keys as one blob (what the device keeps, wrapped by the Secure Enclave / Keystore). */
export function exportSecrets(id) {
  return concatBytes(utf8ToBytes('ACMS'), new Uint8Array([VERSION]), id.secret.xSk, id.secret.edSk, id.public.kem, id.secret.kemSk, id.public.dsa, id.secret.dsaSk);
}
export function importSecrets(blob) {
  const b = toBytes(blob);
  if (td.decode(b.subarray(0, 4)) !== 'ACMS' || b[4] !== VERSION) throw new AcmError('BAD_SECRETS');
  let o = 5;
  const take = (n) => { const r = b.slice(o, o + n); o += n; return r; };
  const xSk = take(32), edSk = take(32), kemPk = take(1184), kemSk = take(2400), dsaPk = take(1952), dsaSk = take(4032);
  return identityFromSecrets({ xSk, edSk, kemSk, kemPk, dsaSk, dsaPk });
}

export function encodePublicKey(pub) {
  return concatBytes(KEY_MAGIC, new Uint8Array([VERSION]), pub.x, pub.ed, pub.kem, pub.dsa);
}
export function decodePublicKey(bundle) {
  const b = toBytes(bundle);
  if (b.length !== 5 + 32 + 32 + 1184 + 1952 || !equal(b.subarray(0, 4), KEY_MAGIC) || b[4] !== VERSION) throw new AcmError('BAD_PUBLIC_KEY');
  return { x: b.slice(5, 37), ed: b.slice(37, 69), kem: b.slice(69, 69 + 1184), dsa: b.slice(69 + 1184) };
}
export function fingerprint(bundle) { return hex(sha256(toBytes(bundle))); }

/** Safety code to compare face to face or by QR (60 digits, the same on both phones). */
export function safetyCode(bundleA, bundleB) {
  const part = (bundle) => {
    const h = sha256(concatBytes(utf8ToBytes('ACM safety v1'), toBytes(bundle)));
    let s = '';
    for (let i = 0; i < 6; i++) {
      let n = 0;
      for (let j = 0; j < 5; j++) n = n * 256 + h[i * 5 + j];
      s += String(n % 100000).padStart(5, '0');
    }
    return s;
  };
  const [a, b] = [part(bundleA), part(bundleB)].sort();
  return (a + b).match(/.{5}/g).join(' ');
}

// ------------------------------------------------------------------ password
function passwordKey(password, salt, p) {
  return argon2id(utf8ToBytes(String(password).normalize('NFKC')), salt, { t: p.t, m: p.m, p: p.p, dkLen: 32 });
}

// ------------------------------------------------------------------ .acm files
function wrapKey(recipientPub, dek, pwKey) {
  const eph = x25519.utils.randomSecretKey();
  const ephPub = x25519.getPublicKey(eph);
  const ss1 = x25519.getSharedSecret(eph, recipientPub.x);
  const { cipherText, sharedSecret: ss2 } = ml_kem768.encapsulate(recipientPub.kem);
  const salt = sha256(concatBytes(ephPub, cipherText));
  const info = 'ACM1 wrap ' + hex(sha256(encodePublicKey(recipientPub)));
  let kek = kdf(concatBytes(ss1, ss2), salt, info, 32);
  if (pwKey) kek = kdf(concatBytes(kek, pwKey), salt, 'ACM1 wrap+password', 32);
  const nonce = randomBytes(24);
  const wrapped = xchacha20poly1305(kek, nonce, utf8ToBytes('ACM1 dek')).encrypt(dek);
  return { e: b64(ephPub), k: b64(cipherText), n: b64(nonce), w: b64(wrapped) };
}

function unwrapKey(entry, id, pwKey) {
  // any damaged envelope (bad base64, wrong lengths) simply does not open: never an internal error
  try { return unwrapKeyInner(entry, id, pwKey); } catch (e) { return null; }
}

function unwrapKeyInner(entry, id, pwKey) {
  const ephPub = unb64(entry.e), ct = unb64(entry.k);
  const ss1 = x25519.getSharedSecret(id.secret.xSk, ephPub);
  const ss2 = ml_kem768.decapsulate(ct, id.secret.kemSk);
  const salt = sha256(concatBytes(ephPub, ct));
  const info = 'ACM1 wrap ' + id.fingerprint;
  let kek = kdf(concatBytes(ss1, ss2), salt, info, 32);
  if (pwKey) kek = kdf(concatBytes(kek, pwKey), salt, 'ACM1 wrap+password', 32);
  try { return xchacha20poly1305(kek, unb64(entry.n), utf8ToBytes('ACM1 dek')).decrypt(unb64(entry.w)); } catch (e) { return null; }
}

/**
 * Locks a document for one or more recipients.
 * @param {{bytes:Uint8Array, name:string, mime?:string}} doc
 * @param sender identity (from deriveIdentity / importSecrets) — signs the document
 * @param {Uint8Array[]} recipients public key bundles (add the sender's own to keep access)
 * @param {{password?:string, argon?:{t,m,p}}} opts
 */
export function seal(doc, sender, recipients, opts = {}) {
  if (!recipients || !recipients.length) throw new AcmError('NO_RECIPIENTS', 'Alege cel puțin o persoană.');
  const dek = randomBytes(32);
  const nonce = randomBytes(24);
  let pw = null, pwKey = null;
  if (opts.password) {
    const p = { ...PW_DEFAULTS, ...(opts.argon || {}) };
    const s = randomBytes(16);
    pw = { s: b64(s), t: p.t, m: p.m, p: p.p };
    pwKey = passwordKey(opts.password, s, p);
  }
  // envelopes, in random order (the order says nothing about who is who)
  const r = recipients.map((bundle) => wrapKey(decodePublicKey(bundle), dek, pwKey));
  for (let i = r.length - 1; i > 0; i--) { const j = randomBytes(1)[0] % (i + 1); [r[i], r[j]] = [r[j], r[i]]; }
  const header = te.encode(JSON.stringify({ v: VERSION, alg: 'x25519+mlkem768/xchacha20poly1305/ed25519+mldsa65', n: b64(nonce), pw, r }));
  const prefix = concatBytes(MAGIC, new Uint8Array([VERSION]), u32(header.length), header);

  // inside the box: who sent it (signed), the name and type, the document, padding
  const bytes = toBytes(doc.bytes);
  const meta = te.encode(JSON.stringify({ name: String(doc.name || 'document'), mime: String(doc.mime || 'application/octet-stream'), size: bytes.length, created: Date.now(), from: { b: b64(sender.bundle) } }));
  const toSign = concatBytes(utf8ToBytes('ACM1 sig'), sha256(prefix), sha256(meta), sha256(bytes));
  // two signatures: both must hold (a quantum computer would have to break both)
  const sig = concatBytes(ed25519.sign(toSign, sender.secret.edSk), ml_dsa65.sign(toSign, sender.secret.dsaSk));
  const body = concatBytes(u32(meta.length), meta, sig, bytes);
  const padded = new Uint8Array(Math.max(body.length, padme(body.length)));
  padded.set(body);
  const ct = xchacha20poly1305(dek, nonce, prefix).encrypt(padded);
  return concatBytes(prefix, ct);
}

/** What can be read without keys: version, number of envelopes, whether a password is needed. */
export function inspect(file) {
  const { header } = parse(file);
  return { version: header.v, recipients: header.r.length, password: !!header.pw };
}

function parse(file) {
  const f = toBytes(file);
  if (f.length < 9 || !equal(f.subarray(0, 4), MAGIC)) throw new AcmError('NOT_ACM', 'Nu este un fișier .acm.');
  if (f[4] !== VERSION) throw new AcmError('NEWER_VERSION', 'Fișierul a fost creat cu o versiune mai nouă a aplicației.');
  const hl = readU32(f, 5);
  if (9 + hl > f.length) throw new AcmError('TAMPERED', 'Fișierul este deteriorat.');
  let header;
  try { header = JSON.parse(td.decode(f.subarray(9, 9 + hl))); } catch (e) { throw new AcmError('TAMPERED', 'Fișierul este deteriorat.'); }
  if (!header || !Array.isArray(header.r)) throw new AcmError('TAMPERED', 'Fișierul este deteriorat.');
  return { f, header, prefix: f.subarray(0, 9 + hl), ct: f.subarray(9 + hl) };
}

/**
 * Opens a document with the recipient's keys (and the password, if it has one).
 * Errors (AcmError.code): NOT_ACM, NOT_FOR_YOU, PASSWORD_REQUIRED, BAD_PASSWORD_OR_NOT_FOR_YOU, TAMPERED, BAD_SIGNATURE
 */
export function open(file, id, opts = {}) {
  const { header, prefix, ct } = parse(file);
  let pwKey = null;
  if (header.pw) {
    if (!opts.password) throw new AcmError('PASSWORD_REQUIRED', 'Documentul cere o parolă.');
    try { pwKey = passwordKey(opts.password, unb64(header.pw.s), header.pw); } catch (e) { throw new AcmError('TAMPERED', 'Fișierul este deteriorat.'); }
  }
  let dek = null;
  for (const entry of header.r) { dek = unwrapKey(entry, id, pwKey); if (dek) break; }
  if (!dek) throw new AcmError(header.pw ? 'BAD_PASSWORD_OR_NOT_FOR_YOU' : 'NOT_FOR_YOU', header.pw ? 'Parola este greșită sau documentul nu îți este adresat.' : 'Documentul nu îți este adresat.');
  let body;
  try { body = xchacha20poly1305(dek, unb64(header.n), prefix).decrypt(ct); } catch (e) { throw new AcmError('TAMPERED', 'Fișierul a fost modificat.'); }
  const ml = readU32(body, 0);
  const metaBytes = body.subarray(4, 4 + ml);
  const meta = JSON.parse(td.decode(metaBytes));
  const SIG = 64 + 3309;
  const sig = body.subarray(4 + ml, 4 + ml + SIG);
  const bytes = body.slice(4 + ml + SIG, 4 + ml + SIG + meta.size);
  const senderBundle = unb64(meta.from.b);
  const senderPub = decodePublicKey(senderBundle);
  const toSign = concatBytes(utf8ToBytes('ACM1 sig'), sha256(prefix), sha256(metaBytes), sha256(bytes));
  const okEd = ed25519.verify(sig.subarray(0, 64), toSign, senderPub.ed);
  let okDsa = false;
  try { okDsa = ml_dsa65.verify(sig.subarray(64), toSign, senderPub.dsa); } catch (e) { okDsa = false; }
  if (!okEd || !okDsa) throw new AcmError('BAD_SIGNATURE', 'Semnătura expeditorului nu este validă.');
  return { bytes, name: meta.name, mime: meta.mime, created: meta.created, sender: { bundle: senderBundle, fingerprint: fingerprint(senderBundle) } };
}
