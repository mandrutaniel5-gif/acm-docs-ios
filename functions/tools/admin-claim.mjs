// Makes an account the control panel's administrator (or takes it back). Runs only from GitHub
// (workflow Admin), with the service account: nothing in the apps or the panel can do this.
//   node tools/admin-claim.mjs <email> <on|off>
// The administrator account must be separate from any ACM Docs app account (no @name, no profile),
// so it cannot be found or reached from the app.
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
initializeApp({ projectId: 'acm-docs-52280' });
const [email, mode] = [String(process.argv[2] || '').trim().toLowerCase(), process.argv[3]];
if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(email) || !['on', 'off'].includes(mode)) { console.error('usage: admin-claim.mjs <email> <on|off>'); process.exit(2); }
let u;
try { u = await getAuth().getUserByEmail(email); } catch (e) {
  console.error('No account with this email yet. Open the control panel, choose "Creează contul de administrator", then run this again.');
  process.exit(1);
}
if (mode === 'on') {
  const prof = await getFirestore().collection('users').doc(u.uid).get();
  if (prof.exists) { console.error('This email is an ACM Docs app account. Use a separate email for the administrator.'); process.exit(1); }
  await getAuth().setCustomUserClaims(u.uid, { ...(u.customClaims || {}), admin: true });
  await getAuth().updateUser(u.uid, { emailVerified: true });
  await getAuth().revokeRefreshTokens(u.uid); // signs in again, with the new right
  console.log('admin: on. Sign in to the control panel; it will ask you to add the authenticator app.');
} else {
  const c = { ...(u.customClaims || {}) }; delete c.admin;
  await getAuth().setCustomUserClaims(u.uid, c);
  await getAuth().revokeRefreshTokens(u.uid);
  console.log('admin: off (every panel session ends within the hour).');
}
