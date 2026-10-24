// Service emails (sign-in codes). The mail server comes from SMTP_URL (e.g. smtps://user:pass@host:465)
// and the sender from MAIL_FROM, set at deploy from GitHub secrets (later also from the control panel).
import nodemailer from 'nodemailer';

let transport = null;
export const mailReady = () => !!process.env.SMTP_URL;
function tx() {
  if (!transport) transport = nodemailer.createTransport(process.env.SMTP_URL);
  return transport;
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** The 6-digit sign-in code, in Romanian and English. */
export async function sendSignInCode(to, code, agent) {
  const from = process.env.MAIL_FROM || 'ACM Docs <no-reply@acmandrut.com>';
  const where = agent ? ` (${agent})` : '';
  const text = `Codul tău de conectare ACM Docs: ${code}\n\nCodul este valabil 10 minute și se folosește o singură dată. Dacă nu încerci tu să te conectezi${where}, schimbă parola contului din aplicație.\n\n—\n\nYour ACM Docs sign-in code: ${code}\n\nThe code is valid for 10 minutes and works once. If you are not the one signing in${where}, change your account password in the app.\n\nACM Code S.R.L. · acmdocs.acmandrut.com`;
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:460px;margin:0 auto;padding:24px;color:#1c1c1e">
  <div style="font-weight:700;font-size:16px">ACM Docs</div>
  <p style="color:#55555c;margin:18px 0 6px">Codul tău de conectare · Your sign-in code</p>
  <div style="font-size:34px;font-weight:800;letter-spacing:8px;margin:6px 0 18px">${esc(code)}</div>
  <p style="font-size:14px;line-height:1.5;color:#3a3a40">Codul este valabil 10 minute și se folosește o singură dată. Dacă nu încerci tu să te conectezi${esc(where)}, schimbă parola contului din aplicație.</p>
  <p style="font-size:13px;line-height:1.5;color:#77777f">The code is valid for 10 minutes and works once. If you are not the one signing in${esc(where)}, change your account password in the app.</p>
  <p style="font-size:12px;color:#9a9aa2;margin-top:24px">ACM Code S.R.L. · acmdocs.acmandrut.com</p></div>`;
  await tx().sendMail({ from, to, subject: `${code} · cod de conectare ACM Docs`, text, html });
}

/** Control panel: every sign-in to the admin account is mailed to that account. */
export async function sendAdminAlert(to, ip, agent) {
  if (!to) return;
  const from = process.env.MAIL_FROM || 'ACM Docs <no-reply@acmandrut.com>';
  const when = new Date().toLocaleString('ro-RO', { timeZone: 'Europe/Bucharest' });
  const text = `Conectare în panoul de control ACM Docs\n\nOra: ${when}\nAdresa IP: ${ip || '-'}\nDispozitiv: ${agent || '-'}\n\nDacă nu ai fost tu, schimbă imediat parola contului de administrator și scoate-i drepturile din GitHub (workflow Admin → remove-admin).\n\nACM Code S.R.L.`;
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:460px;margin:0 auto;padding:24px;color:#1c1c1e">
  <div style="font-weight:700;font-size:16px">ACM Docs · Panou de control</div>
  <p style="margin:18px 0 10px">A avut loc o conectare în panoul de control.</p>
  <table style="font-size:14px;line-height:1.7;color:#3a3a40"><tr><td style="padding-right:14px;color:#77777f">Ora</td><td>${esc(when)}</td></tr>
  <tr><td style="padding-right:14px;color:#77777f">Adresa IP</td><td>${esc(ip || '-')}</td></tr><tr><td style="padding-right:14px;color:#77777f">Dispozitiv</td><td>${esc(agent || '-')}</td></tr></table>
  <p style="font-size:13px;line-height:1.5;color:#77777f;margin-top:18px">Dacă nu ai fost tu, schimbă imediat parola contului de administrator și scoate-i drepturile din GitHub (workflow Admin → remove-admin).</p></div>`;
  await tx().sendMail({ from, to, subject: 'Conectare în panoul de control ACM Docs', text, html });
}

/** The 6-digit code that confirms a new account's email, in Romanian and English. */
export async function sendVerifyCode(to, code) {
  const from = process.env.MAIL_FROM || 'ACM Docs <no-reply@acmandrut.com>';
  const text = `Codul de confirmare ACM Docs: ${code}\n\nScrie-l în aplicație ca să confirmi adresa de email. Codul este valabil 15 minute. Dacă nu ai creat tu un cont ACM Docs, ignoră acest email.\n\n—\n\nYour ACM Docs confirmation code: ${code}\n\nEnter it in the app to confirm your email address. The code is valid for 15 minutes. If you did not create an ACM Docs account, ignore this email.\n\nACM Code S.R.L. · acmdocs.acmandrut.com`;
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:460px;margin:0 auto;padding:24px;color:#1c1c1e">
  <div style="font-weight:700;font-size:16px">ACM Docs</div>
  <p style="color:#55555c;margin:18px 0 6px">Codul de confirmare · Confirmation code</p>
  <div style="font-size:34px;font-weight:800;letter-spacing:8px;margin:6px 0 18px">${esc(code)}</div>
  <p style="font-size:14px;line-height:1.5;color:#3a3a40">Scrie-l în aplicație ca să confirmi adresa de email. Codul este valabil 15 minute. Dacă nu ai creat tu un cont ACM Docs, ignoră acest email.</p>
  <p style="font-size:13px;line-height:1.5;color:#77777f">Enter it in the app to confirm your email address. The code is valid for 15 minutes. If you did not create an ACM Docs account, ignore this email.</p>
  <p style="font-size:12px;color:#9a9aa2;margin-top:24px">ACM Code S.R.L. · acmdocs.acmandrut.com</p></div>`;
  await tx().sendMail({ from, to, subject: `${code} · confirmă emailul ACM Docs`, text, html });
}
