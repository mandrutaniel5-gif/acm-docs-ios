// Tests for the .acm encryption core:  node --test test/acmcrypto.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mnemonicToEntropy, entropyToMnemonic } from '@scure/bip39';
import * as A from '../build/vendor/acmcrypto.mjs';

const FAST = { t: 1, m: 1024, p: 1 }; // tiny Argon2 in tests only (the app uses 32 MiB)
const doc = (s = 'Contract confidențial ăîșț — 1.000.000 lei') => ({ bytes: new TextEncoder().encode(s), name: 'Contract.pdf', mime: 'application/pdf' });
const ana = A.deriveIdentity(A.generateMnemonic());
const mihai = A.deriveIdentity(A.generateMnemonic());
const ion = A.deriveIdentity(A.generateMnemonic());
const eve = A.deriveIdentity(A.generateMnemonic());

test('24 words: valid, 256 bits, checksum enforced', () => {
  const m = A.generateMnemonic();
  assert.equal(m.split(' ').length, 24);
  assert.ok(A.validateMnemonic(m));
  assert.equal(mnemonicToEntropy(m, A.WORDLIST).length, 32);
  const words = m.split(' ');
  words[23] = words[23] === 'abandon' ? 'zoo' : 'abandon';
  assert.equal(A.validateMnemonic(words.join(' ')), false, 'a wrong last word must be caught');
  assert.ok(A.validateMnemonic('  ' + m.toUpperCase().replace(/ /g, '   ') + '\n'), 'spaces and capitals are forgiven');
});

test('BIP-39 official test vector (entropy 0x7f…)', () => {
  const m = entropyToMnemonic(new Uint8Array(32).fill(0x7f), A.WORDLIST);
  assert.equal(m, 'legal winner thank year wave sausage worth useful legal winner thank year wave sausage worth useful legal winner thank year wave sausage worth title');
});

test('same words → same keys (a new phone gets the same identity)', () => {
  const m = A.generateMnemonic();
  const a = A.deriveIdentity(m), b = A.deriveIdentity(m.toUpperCase());
  assert.equal(a.fingerprint, b.fingerprint);
  assert.deepEqual(a.bundle, b.bundle);
  assert.notEqual(a.fingerprint, A.deriveIdentity(A.generateMnemonic()).fingerprint);
});

test('device secrets round-trip', () => {
  const back = A.importSecrets(A.exportSecrets(ana));
  assert.equal(back.fingerprint, ana.fingerprint);
});

test('one recipient: opens, sender verified, name and type kept', () => {
  const file = A.seal(doc(), ana, [mihai.bundle]);
  const out = A.open(file, mihai);
  assert.equal(new TextDecoder().decode(out.bytes), 'Contract confidențial ăîșț — 1.000.000 lei');
  assert.equal(out.name, 'Contract.pdf');
  assert.equal(out.mime, 'application/pdf');
  assert.equal(out.sender.fingerprint, ana.fingerprint);
});

test('the name and contents are not visible in the file', () => {
  const file = A.seal(doc(), ana, [mihai.bundle]);
  const raw = Buffer.from(file).toString('latin1');
  assert.ok(!raw.includes('Contract'), 'file name must be hidden');
  assert.ok(!raw.includes('1.000.000'), 'contents must be hidden');
  assert.ok(!raw.includes(Buffer.from(ana.bundle).toString('base64').slice(0, 40)), 'sender must be hidden');
});

test('three recipients each open it; someone else cannot', () => {
  const file = A.seal(doc(), ana, [mihai.bundle, ion.bundle, ana.bundle]);
  for (const who of [mihai, ion, ana]) assert.equal(A.open(file, who).name, 'Contract.pdf');
  assert.throws(() => A.open(file, eve), { code: 'NOT_FOR_YOU' });
  assert.equal(A.inspect(file).recipients, 3);
});

test('password: needed, wrong one refused, right one opens', () => {
  const file = A.seal(doc(), ana, [mihai.bundle], { password: 'Pădure-Albastră-42', argon: FAST });
  assert.equal(A.inspect(file).password, true);
  assert.throws(() => A.open(file, mihai), { code: 'PASSWORD_REQUIRED' });
  assert.throws(() => A.open(file, mihai, { password: 'gresita' }), { code: 'BAD_PASSWORD_OR_NOT_FOR_YOU' });
  assert.equal(A.open(file, mihai, { password: 'Pădure-Albastră-42' }).name, 'Contract.pdf');
  // the password alone is not enough: the phone's keys are needed too
  assert.throws(() => A.open(file, eve, { password: 'Pădure-Albastră-42' }), { code: 'BAD_PASSWORD_OR_NOT_FOR_YOU' });
});

test('any changed byte is detected (header, envelopes, contents)', () => {
  const file = A.seal(doc('x'.repeat(5000)), ana, [mihai.bundle]);
  const positions = [9, 20, 60, 200, 1500, file.length - 200, file.length - 1];
  for (const p of positions) {
    const bad = file.slice();
    bad[p] ^= 0x01;
    assert.throws(() => A.open(bad, mihai), (e) => ['TAMPERED', 'NOT_FOR_YOU', 'BAD_SIGNATURE'].includes(e.code), `byte ${p}`);
  }
  assert.throws(() => A.open(file.slice(0, file.length - 10), mihai), { code: 'TAMPERED' });
});

test('an envelope cannot be moved to another file', () => {
  const f1 = A.seal(doc('unu'), ana, [mihai.bundle]);
  const f2 = A.seal(doc('doi'), ana, [ion.bundle]);
  // put Mihai's envelope from f1 into f2's header
  const hdr = (f) => JSON.parse(new TextDecoder().decode(f.subarray(9, 9 + new DataView(f.buffer, f.byteOffset + 5, 4).getUint32(0, true))));
  const h2 = hdr(f2); h2.r.push(hdr(f1).r[0]);
  const hb = new TextEncoder().encode(JSON.stringify(h2));
  const len = new Uint8Array(4); new DataView(len.buffer).setUint32(0, hb.length, true);
  const oldLen = new DataView(f2.buffer, f2.byteOffset + 5, 4).getUint32(0, true);
  const forged = new Uint8Array([...f2.subarray(0, 5), ...len, ...hb, ...f2.subarray(9 + oldLen)]);
  assert.throws(() => A.open(forged, mihai), (e) => ['TAMPERED', 'NOT_FOR_YOU'].includes(e.code));
});

test('a signature cannot be forged by another sender', () => {
  // Eve seals with Ana's public key as "from" is impossible: the signature uses Eve's secret key
  const fake = { ...eve, bundle: ana.bundle };
  const file = A.seal(doc(), fake, [mihai.bundle]);
  assert.throws(() => A.open(file, mihai), { code: 'BAD_SIGNATURE' });
});

test('safety code is the same on both phones and differs for another person', () => {
  const a = A.safetyCode(ana.bundle, mihai.bundle), b = A.safetyCode(mihai.bundle, ana.bundle);
  assert.equal(a, b);
  assert.match(a, /^(\d{5} ){11}\d{5}$/);
  assert.notEqual(a, A.safetyCode(ana.bundle, eve.bundle));
});

test('size is padded (Padmé) and big files work', () => {
  const big = new Uint8Array(3 * 1024 * 1024 + 123).map((_, i) => i % 251);
  const file = A.seal({ bytes: big, name: 'mare.bin' }, ana, [mihai.bundle]);
  assert.deepEqual(A.open(file, mihai).bytes, big);
  assert.equal(A.padme(1000), 1024);
  assert.ok(A.padme(3145851) >= 3145851 && A.padme(3145851) < 3145851 * 1.13);
});

test('not an .acm file / newer version', () => {
  assert.throws(() => A.open(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), mihai), { code: 'NOT_ACM' });
  const f = A.seal(doc(), ana, [mihai.bundle]); f[4] = 9;
  assert.throws(() => A.open(f, mihai), { code: 'NEWER_VERSION' });
});

test('real Argon2 parameters (32 MiB) work and take a sensible time', () => {
  const t = performance.now();
  const file = A.seal(doc(), ana, [mihai.bundle], { password: 'parola-lunga-si-buna' });
  assert.equal(A.open(file, mihai, { password: 'parola-lunga-si-buna' }).name, 'Contract.pdf');
  const ms = performance.now() - t;
  console.log(`  seal + open with real Argon2id: ${Math.round(ms)} ms`);
  assert.ok(ms < 15000);
});
