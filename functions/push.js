// Notifications for new chat messages. Only "a new message from <name>": the message itself is sealed on the
// devices and the server cannot read it. Android goes through Firebase Cloud Messaging; iPhone through Apple (APNs),
// with Apple's key in server/apns (key: the .p8 text, keyId, team), a document only the server can read.
import { getMessaging } from 'firebase-admin/messaging';
import { connect } from 'node:http2';
import { sign } from 'node:crypto';

const TOPIC = 'ro.acmcode.docs';
const GONE = /registration-token-not-registered|invalid-registration-token|invalid-argument|BadDeviceToken|Unregistered|DeviceTokenNotForTopic/;

export function makePush({ db, FieldValue }) {
  let apnsJwt = null, apnsAt = 0;
  async function apnsConf() {
    const s = (await db.collection('server').doc('apns').get()).data() || {};
    return s.key && s.keyId && s.team ? { key: s.key, kid: s.keyId, team: s.team } : null;
  }
  /** Apple's sign-in for this server: a token signed with the .p8 key, renewed every 50 minutes. */
  function jwt(c) {
    if (apnsJwt && Date.now() - apnsAt < 50 * 60000) return apnsJwt;
    const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const head = b({ alg: 'ES256', kid: c.kid }) + '.' + b({ iss: c.team, iat: Math.floor(Date.now() / 1000) });
    apnsJwt = head + '.' + sign('sha256', Buffer.from(head), { key: c.key, dsaEncoding: 'ieee-p1363' }).toString('base64url');
    apnsAt = Date.now();
    return apnsJwt;
  }
  function sendApns(c, token, sandbox, alert, cid) {
    // an Apple address is hex only: nothing else ever reaches the request's path
    if (!/^[0-9a-f]{64,200}$/.test(token)) return Promise.reject(Object.assign(new Error('BadDeviceToken'), { code: 400 }));
    return new Promise((resolve, reject) => {
      const s = connect(sandbox ? 'https://api.sandbox.push.apple.com' : 'https://api.push.apple.com');
      s.on('error', reject);
      const req = s.request({
        ':method': 'POST', ':path': '/3/device/' + token, authorization: 'bearer ' + jwt(c),
        'apns-topic': TOPIC, 'apns-push-type': 'alert', 'apns-priority': '10', 'apns-collapse-id': cid.slice(0, 64),
      });
      let status = 0, body = '';
      req.on('response', (h) => { status = h[':status']; });
      req.on('data', (x) => { body += x; });
      req.on('end', () => { s.close(); if (status === 200) resolve(); else reject(Object.assign(new Error((body && JSON.parse(body).reason) || String(status)), { code: status })); });
      req.on('error', (e) => { s.close(); reject(e); });
      req.end(JSON.stringify({ aps: { alert, sound: 'default', 'thread-id': cid }, cid }));
    });
  }

  /** Tells the other members' devices that a message arrived in this conversation. */
  async function notifyChat(cid, from) {
    const chat = (await db.collection('chats').doc(cid).get()).data();
    if (!chat || (chat.blocked || []).length) return;
    const p = (await db.collection('users').doc(from).get()).data() || {};
    const who = p.name || (p.handle ? '@' + p.handle : '');
    let apns;
    for (const m of chat.members || []) {
      if (m === from) continue;
      const devs = await db.collection('accounts').doc(m).collection('devices').where('status', '==', 'active').get();
      for (const d of devs.docs) {
        const push = d.data().push;
        if (!push || typeof push.token !== 'string') continue;
        const en = push.lang && push.lang !== 'ro';
        const title = chat.kind === 'group' ? (en ? 'New message in a group' : 'Mesaj nou într-un grup') : (en ? 'New message' : 'Mesaj nou');
        const body = who ? (en ? `From ${who}` : `De la ${who}`) : '';
        try {
          if (push.kind === 'fcm') {
            await getMessaging().send({ token: push.token, notification: { title, body }, data: { cid }, android: { priority: 'high', notification: { channelId: 'chat', tag: cid } } });
          } else if (push.kind === 'apns') {
            if (apns === undefined) apns = await apnsConf();
            if (apns) await sendApns(apns, push.token, push.env === 'dev', { title, body }, cid);
          }
        } catch (e) {
          // a device that uninstalled the app (or a token that changed): forgotten
          if (GONE.test(String(e.code || '') + ' ' + String(e.message || '')) || e.code === 410) await d.ref.update({ push: FieldValue.delete() }).catch(() => {});
          else console.warn('push', push.kind, e.code || '', e.message);
        }
      }
    }
  }
  return { notifyChat };
}
