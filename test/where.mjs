// Prints where the Firestore database and the Storage bucket live (for trigger regions).
import { GoogleAuth } from 'google-auth-library';
const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
const c = await auth.getClient();
for (const u of ['https://firestore.googleapis.com/v1/projects/acm-docs-52280/databases/(default)', 'https://storage.googleapis.com/storage/v1/b/acm-docs-52280.firebasestorage.app']) {
  try { const r = await c.request({ url: u }); console.log(u, '→', r.data.locationId || r.data.location, r.data.locationType || r.data.type || ''); } catch (e) { console.log(u, 'ERR', e.message); }
}
