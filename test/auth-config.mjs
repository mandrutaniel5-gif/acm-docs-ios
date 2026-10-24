// Firebase Auth settings that the app relies on, applied from the deploy key (GitHub secret):
//  - the sign-in cannot be deleted from a client: account deletion goes only through the server
//    function, signed with the account keys (a stolen password must not be able to delete it)
//  - email enumeration protection: the email of an account cannot be changed directly with a
//    session (only through a confirmation link) and sign-in errors do not reveal which emails exist
import { createRequire } from 'node:module';
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { GoogleAuth } = require('google-auth-library');

const PROJECT = 'acm-docs-52280';
const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform', 'https://www.googleapis.com/auth/firebase'] });
const client = await auth.getClient();
const url = `https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT}/config`;
const show = (c) => JSON.stringify({ disabledUserDeletion: !!(c.client && c.client.permissions && c.client.permissions.disabledUserDeletion), improvedEmailPrivacy: !!(c.emailPrivacyConfig && c.emailPrivacyConfig.enableImprovedEmailPrivacy) });
try {
  let before = (await client.request({ url })).data;
  // Identity Platform (the owner agreed): needed for the sign-in alerts and the second factor
  if (before.subtype !== 'IDENTITY_PLATFORM') {
    await client.request({ url: `https://identitytoolkit.googleapis.com/v2/projects/${PROJECT}/identityPlatform:initializeAuth`, method: 'POST', data: {} });
    before = (await client.request({ url })).data;
    console.log('IDENTITY PLATFORM: enabled now →', before.subtype);
  } else console.log('IDENTITY PLATFORM: already on');
  console.log('auth config before:', show(before));
  // second factor: codes from an authenticator app (TOTP), chosen by each person in Settings
  const mfa = (await client.request({
    url: url + '?updateMask=mfa.providerConfigs', method: 'PATCH',
    data: { mfa: { providerConfigs: [{ state: 'ENABLED', totpProviderConfig: { adjacentIntervals: 1 } }] } },
  })).data;
  console.log('MFA OK:', JSON.stringify((mfa.mfa && mfa.mfa.providerConfigs) || []));
  const after = (await client.request({
    url: url + '?updateMask=client.permissions.disabledUserDeletion,emailPrivacyConfig.enableImprovedEmailPrivacy',
    method: 'PATCH',
    data: { client: { permissions: { disabledUserDeletion: true } }, emailPrivacyConfig: { enableImprovedEmailPrivacy: true } },
  })).data;
  console.log('AUTH OK:', show(after));
  // passwords: at least 8 characters, enforced by the server too (Firebase alone accepts 6 through its
  // API, so a script could create accounts with weaker passwords than the app allows)
  const pol = (await client.request({
    url: url + '?updateMask=passwordPolicyConfig', method: 'PATCH',
    data: { passwordPolicyConfig: { passwordPolicyEnforcementState: 'ENFORCE', forceUpgradeOnSignin: false, passwordPolicyVersions: [{ customStrengthOptions: { minPasswordLength: 8, maxPasswordLength: 4096 } }] } },
  })).data;
  console.log('PASSWORD POLICY:', JSON.stringify(pol.passwordPolicyConfig || {}).slice(0, 200));
  // live check: a 6-character password through the public API is refused
  const API_KEY = 'AIzaSyDsXxKCjxhOeGTZYyYIsm_S6SO6zADe25w';
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `policy-check-${Date.now()}@acmandrut.com`, password: 'abc123', returnSecureToken: true }),
  });
  const j = await r.json();
  if (r.ok) {
    console.log('LIVE FAIL: a 6-character password was accepted');
    await client.request({ url: `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:delete`, method: 'POST', data: { localId: j.localId } });
    process.exitCode = 1;
  } else console.log('LIVE OK: short passwords refused by the server (' + ((j.error && j.error.message) || r.status).toString().slice(0, 60) + ')');
} catch (e) {
  console.log('AUTH CONFIG FAILED:', e.response ? e.response.status + ' ' + JSON.stringify(e.response.data).slice(0, 400) : e.message);
  process.exitCode = 1;
}
