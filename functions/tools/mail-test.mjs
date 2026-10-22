// Deploy check: logs in to the mail server with SMTP_URL (no email is sent), to confirm the account is
// accepted. Prints only OK / the error code, never secrets.
import nodemailer from 'nodemailer';
if (!process.env.SMTP_URL) { console.log('mail: off (no SMTP_URL secret)'); process.exit(0); }
try {
  await nodemailer.createTransport(process.env.SMTP_URL).verify();
  console.log('mail: OK (the mail server accepts the account)');
} catch (e) {
  console.log('mail: FAILED', e.code || '', e.responseCode || '', String(e.response || e.message).replace(/smtps?:\/\/[^\s]+/g, '[url]').slice(0, 200));
}
