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
  const before = (await client.request({ url })).data;
  console.log('auth config before:', show(before));
  const after = (await client.request({
    url: url + '?updateMask=client.permissions.disabledUserDeletion,emailPrivacyConfig.enableImprovedEmailPrivacy',
    method: 'PATCH',
    data: { client: { permissions: { disabledUserDeletion: true } }, emailPrivacyConfig: { enableImprovedEmailPrivacy: true } },
  })).data;
  console.log('AUTH OK:', show(after));
} catch (e) {
  console.log('AUTH CONFIG FAILED:', e.response ? e.response.status + ' ' + JSON.stringify(e.response.data).slice(0, 400) : e.message);
  process.exitCode = 1;
}
