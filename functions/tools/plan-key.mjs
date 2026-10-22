// Makes sure the server's plan-signing key exists and prints its PUBLIC half (the app checks plan
// tokens with it). The private half never leaves Firestore (closed to every device by the rules).
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { ed25519 } from '@noble/curves/ed25519.js';
import { randomBytes } from 'node:crypto';
initializeApp({ projectId: 'acm-docs-52280' });
const db = getFirestore();
const ref = db.collection('server').doc('keys');
const pk = await db.runTransaction(async (tx) => {
  const s = await tx.get(ref);
  if (s.exists && s.data().planPk) return s.data().planPk;
  const sk = randomBytes(32);
  const pub = Buffer.from(ed25519.getPublicKey(sk)).toString('base64');
  tx.set(ref, { planSk: Buffer.from(sk).toString('base64'), planPk: pub, created: FieldValue.serverTimestamp() }, { merge: true });
  return pub;
});
console.log('PLAN_PUBLIC_KEY=' + pk);
