// Deploy check: sends one sign-in style email to the sender's own address (MAIL_FROM),
// to confirm the mail server accepts the account. Prints only OK / the error code, never secrets.
import { mailReady, sendSignInCode } from '../mail.js';
if (!mailReady()) { console.log('mail: off (no SMTP_URL secret)'); process.exit(0); }
const to = (process.env.MAIL_FROM || '').match(/[^<\s]+@[^>\s]+/)?.[0];
if (!to) { console.log('mail: MAIL_FROM has no address'); process.exit(0); }
try {
  await sendSignInCode(to, '000000', 'test de configurare / setup check');
  console.log('mail: OK, test sent to ' + to.replace(/^(.).*(@.*)$/, '$1***$2'));
} catch (e) {
  console.log('mail: FAILED', e.code || '', e.responseCode || '', String(e.response || e.message).replace(/smtps?:\/\/[^\s]+/g, '[url]').slice(0, 200));
}
