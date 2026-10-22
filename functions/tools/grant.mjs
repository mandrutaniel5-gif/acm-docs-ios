// Gives an account a plan by hand (without payment), e.g. for the owner, testers or partners:
//   node tools/grant.mjs <@name> <personal|pro|basic> <days>
// "basic" (or 0 days) takes a manual plan away. Subscriptions paid through Stripe are not touched.
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { PLANS } from '../plans.js';
initializeApp({ projectId: 'acm-docs-52280' });
const db = getFirestore();
const [handle, plan, days] = [String(process.argv[2] || '').replace(/^@/, '').toLowerCase(), process.argv[3], Number(process.argv[4] || 0)];
if (!/^[a-z0-9_]{3,20}$/.test(handle) || !PLANS[plan] || ['family', 'business'].includes(plan)) { console.error('usage: grant.mjs <@name> <personal|pro|basic> <days>'); process.exit(2); }
const u = await db.collection('usernames').doc(handle).get();
if (!u.exists) { console.error('no such @name'); process.exit(1); }
const uid = u.data().uid;
const ref = db.collection('billing').doc(uid);
const cur = (await ref.get()).data() || {};
if (cur.source === 'stripe' && (cur.until || 0) > Date.now()) { console.error('this account pays through Stripe: change it there'); process.exit(1); }
if (plan === 'basic' || days <= 0) await ref.set({ plan: FieldValue.delete(), until: FieldValue.delete(), source: FieldValue.delete() }, { merge: true });
else await ref.set({ plan, until: Date.now() + days * 864e5, source: 'manual' }, { merge: true });
// the plan in effect is written again on the device's next check (planStatus); the cloud limit now
const P = PLANS[plan === 'basic' || days <= 0 ? 'basic' : plan];
await db.collection('accounts').doc(uid).collection('meta').doc('cloud').set({ limit: P.cloud }, { merge: true });
console.log(`@${handle}: ${plan === 'basic' || days <= 0 ? 'Basic' : plan + ' for ' + days + ' days'}`);
