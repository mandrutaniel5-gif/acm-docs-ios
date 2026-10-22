// Once per deploy, harmless to repeat: every account gets its cloud counter { used, limit } (the
// security rules need it before any new encrypted data is accepted). Measures what is already stored.
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { PLANS } from '../plans.js';
initializeApp({ projectId: 'acm-docs-52280' });
const db = getFirestore();
const bucket = getStorage().bucket('acm-docs-52280.firebasestorage.app');
let made = 0, seen = 0;
for (const acc of await db.collection('accounts').listDocuments()) {
  seen++;
  const ref = acc.collection('meta').doc('cloud');
  if ((await ref.get()).exists) continue;
  let used = 0;
  try { const [files] = await bucket.getFiles({ prefix: `accounts/${acc.id}/blobs/` }); for (const f of files) used += Number(f.metadata.size || 0); } catch (e) { console.warn(e.message); }
  (await acc.collection('vault').get()).forEach((d) => { used += String(d.data().b || '').length; });
  // the plan is worked out by the server on the next planStatus; until then, at least Basic
  const plan = (await acc.collection('meta').doc('plan').get()).data();
  const limit = plan && PLANS[plan.plan] ? PLANS[plan.plan].cloud : PLANS.basic.cloud;
  await ref.create({ used, limit }).catch(() => {});
  made++;
  console.log(`cloud counter: account …${acc.id.slice(-4)} used ${(used / 1048576).toFixed(1)} MB of ${(limit / 1048576).toFixed(0)} MB`);
}
console.log(`cloud counters: ${made} made, ${seen} accounts`);
